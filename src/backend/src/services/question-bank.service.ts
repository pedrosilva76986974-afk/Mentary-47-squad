import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { ReviewQuestion, ReviewResult } from "./review-results.service.js";
import { getDatabasePool, initializeDatabase, isDatabaseConfigured } from "./database.service.js";
import { DocumentValidationError } from "./document-validation.service.js";

const normalize = (text: string) => text.normalize("NFC").trim().replace(/\s+/gu, " ");
export function questionFingerprint(
  question: Pick<ReviewQuestion, "prompt" | "text" | "alternatives" | "answerKey">,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        prompt: normalize(question.prompt ?? question.text),
        alternatives: (question.alternatives ?? []).map((a) => ({
          label: a.label.trim().toLocaleUpperCase("pt-BR"),
          text: normalize(a.text),
        })),
        answerKey: question.answerKey?.trim().toLocaleUpperCase("pt-BR"),
      }),
    )
    .digest("hex");
}
export function canPublish(question: ReviewQuestion): boolean {
  const alternatives = question.alternatives ?? [];
  const labels = alternatives.map((a) => a.label.trim().toLocaleUpperCase("pt-BR"));
  return (
    question.status === "approved" &&
    !!question.prompt?.trim() &&
    !!question.reviewedBy?.trim() &&
    alternatives.length >= 2 &&
    alternatives.every((a) => a.label.trim() && a.text.trim()) &&
    new Set(labels).size === labels.length &&
    labels.includes(question.answerKey?.trim().toLocaleUpperCase("pt-BR") ?? "")
  );
}
/** Runs in the same transaction as the saved review. Reopened/rejected sources disappear immediately. */
export async function syncQuestionBank(client: PoolClient, review: ReviewResult): Promise<void> {
  await client.query("UPDATE banco.question_sources SET active = false WHERE document_id = $1 AND active", [
    review.documentId,
  ]);
  const ready = review.questions
    .filter(canPublish)
    .map((question) => ({
      question,
      fingerprint: questionFingerprint(question),
    }))
    .sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  for (const { question, fingerprint } of ready) {
    const inserted = await client.query(
      `INSERT INTO banco.questions(id, fingerprint, prompt, alternatives, answer_key)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT(fingerprint) DO UPDATE SET fingerprint = EXCLUDED.fingerprint RETURNING id`,
      [
        randomUUID(),
        fingerprint,
        question.prompt,
        JSON.stringify(question.alternatives),
        question.answerKey!.trim().toLocaleUpperCase("pt-BR"),
      ],
    );
    await client.query(
      `INSERT INTO banco.question_sources(review_question_id,question_id,document_id,origin,page_start,page_end,pedagogy,visual_references,reviewed_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(review_question_id) DO UPDATE SET
      question_id=EXCLUDED.question_id, origin=EXCLUDED.origin, page_start=EXCLUDED.page_start,page_end=EXCLUDED.page_end,
      pedagogy=EXCLUDED.pedagogy,visual_references=EXCLUDED.visual_references,reviewed_by=EXCLUDED.reviewed_by,active=true,updated_at=now()`,
      [
        question.id,
        inserted.rows[0].id,
        review.documentId,
        JSON.stringify(review.origin),
        question.pageStart,
        question.pageEnd,
        JSON.stringify(question.pedagogy ?? {}),
        JSON.stringify(question.visualReferences ?? []),
        question.reviewedBy,
      ],
    );
  }
}
export async function publishExistingApprovedQuestions(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  const { getReviewResultFromDatabase } = await import("./postgres-review.service.js");
  const response =
    await getDatabasePool().query(`SELECT DISTINCT q.document_id FROM extrator.review_questions q
    LEFT JOIN banco.question_sources s ON s.review_question_id=q.question_id WHERE q.status='approved' AND s.review_question_id IS NULL`);
  let count = 0;
  for (const { document_id } of response.rows) {
    const review = await getReviewResultFromDatabase(document_id);
    if (!review) continue;
    const client = await getDatabasePool().connect();
    try {
      await client.query("BEGIN");
      await syncQuestionBank(client, review);
      await client.query("COMMIT");
      count += review.questions.filter(canPublish).length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return count;
}
export type BankFilters = {
  q?: string;
  discipline?: string;
  grade?: string;
  topic?: string;
  bncc?: string;
  descriptor?: string;
  difficulty?: string;
  page?: string;
  pageSize?: string;
};
export function parseBankFilters(input: Record<string, unknown>): {
  filters: BankFilters;
  page: number;
  pageSize: number;
} {
  const filters: BankFilters = {};
  for (const key of [
    "q",
    "discipline",
    "grade",
    "topic",
    "bncc",
    "descriptor",
    "difficulty",
    "page",
    "pageSize",
  ] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string" || input[key].length > 250)
      throw new DocumentValidationError("Filtros inválidos.");
    filters[key] = input[key].trim();
  }
  const page = Number(filters.page || 1),
    pageSize = Number(filters.pageSize || 20);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new DocumentValidationError("Paginação inválida.");
  if (filters.difficulty && !["easy", "medium", "hard", "unknown"].includes(filters.difficulty))
    throw new DocumentValidationError("Dificuldade inválida.");
  return { filters, page, pageSize };
}
const bankFrom = `FROM banco.questions q JOIN LATERAL (
  SELECT * FROM banco.question_sources s WHERE s.question_id=q.id AND s.active ORDER BY s.updated_at DESC,s.review_question_id LIMIT 1
) s ON true`;
const bankColumns = `q.id,q.prompt,q.alternatives,q.answer_key AS "answerKey",s.pedagogy,s.reviewed_by AS "reviewedBy",q.created_at AS "publishedAt",
 (SELECT jsonb_agg(jsonb_build_object('documentId',o.document_id,'questionId',o.review_question_id,'origin',o.origin,
 'pageStart',o.page_start,'pageEnd',o.page_end,'visualReferences',o.visual_references) ORDER BY o.published_at,o.review_question_id)
 FROM banco.question_sources o WHERE o.question_id=q.id AND o.active) AS sources`;
async function requireBank(): Promise<void> {
  if (!isDatabaseConfigured())
    throw new DocumentValidationError("Configure o PostgreSQL para consultar o banco de questões.");
  await initializeDatabase();
}
export async function searchQuestionBank(input: Record<string, unknown>) {
  const { filters, page, pageSize } = parseBankFilters(input);
  await requireBank();
  const values: unknown[] = [],
    clauses: string[] = [];
  for (const key of ["discipline", "grade", "topic", "descriptor", "difficulty"] as const) {
    if (filters[key]) {
      values.push(filters[key]);
      clauses.push(`lower(s.pedagogy->>'${key}') = lower($${values.length})`);
    }
  }
  if (filters.q) {
    values.push(`%${filters.q.replace(/[\\%_]/g, "\\$&")}%`);
    clauses.push(`q.prompt ILIKE $${values.length} ESCAPE '\\'`);
  }
  if (filters.bncc) {
    values.push(filters.bncc);
    clauses.push(
      `EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.pedagogy->'bnccSkills')='array' THEN s.pedagogy->'bnccSkills' ELSE '[]'::jsonb END) b WHERE lower(b)=lower($${values.length}))`,
    );
  }
  const from = clauses.length
    ? bankFrom.replace("AND s.active ORDER", `AND s.active AND ${clauses.join(" AND ")} ORDER`)
    : bankFrom;
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const total = Number((await client.query(`SELECT count(*) ${from}`, values)).rows[0].count);
    const rows = await client.query(
      `SELECT ${bankColumns} ${from} ORDER BY q.created_at DESC,q.id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    await client.query("COMMIT");
    return {
      questions: rows.rows,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function selectBankQuestions(ids: unknown) {
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 100 ||
    ids.some(
      (id) =>
        typeof id !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id),
    )
  )
    throw new DocumentValidationError("Selecione entre 1 e 100 questões válidas.");
  await requireBank();
  const unique = [...new Set(ids as string[])];
  const response = await getDatabasePool().query(
    `SELECT ${bankColumns} ${bankFrom} WHERE q.id=ANY($1::uuid[]) ORDER BY array_position($1::uuid[],q.id)`,
    [unique],
  );
  if (response.rows.length !== unique.length)
    throw new DocumentValidationError(
      "Uma questão selecionada deixou de estar disponível. Atualize a consulta.",
    );
  return response.rows;
}
