import type { PoolClient } from "pg";
import type { ReviewQuestion, ReviewResult } from "./review-results.service.js";
import { getDatabasePool } from "./database.service.js";

async function insertReviewQuestion(client: PoolClient, documentId: string, question: ReviewQuestion, position: number): Promise<void> {
  await client.query(
    `INSERT INTO extrator.review_questions (
      question_id, document_id, position, question_number, source_text, prompt, answer_key,
      response_type, missing_components, page_start, page_end, confidence, status,
      pedagogy, reviewed_by, visual_references
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'multiple_choice', $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      question.id, documentId, position, question.number, question.text, question.prompt ?? null,
      question.answerKey ?? null, question.missingComponents ?? [], question.pageStart, question.pageEnd,
      question.confidence, question.status, question.pedagogy ?? null, question.reviewedBy ?? null,
      JSON.stringify(question.visualReferences ?? []),
    ],
  );

  for (const [alternativePosition, alternative] of (question.alternatives ?? []).entries()) {
    await client.query(
      "INSERT INTO extrator.question_alternatives (question_id, position, label, choice_text) VALUES ($1, $2, $3, $4)",
      [question.id, alternativePosition, alternative.label, alternative.text],
    );
  }
}

async function writeReviewResult(result: ReviewResult, insertOnly: boolean): Promise<boolean> {
  const pool = getDatabasePool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO extrator.review_documents (
        document_id, status, message, origin, processed_at, page_count,
        extraction_method, source_text, identification
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (document_id) ${insertOnly ? "DO NOTHING" : `DO UPDATE SET
        status = EXCLUDED.status,
        message = EXCLUDED.message,
        origin = EXCLUDED.origin,
        processed_at = EXCLUDED.processed_at,
        page_count = EXCLUDED.page_count,
        extraction_method = EXCLUDED.extraction_method,
        source_text = EXCLUDED.source_text,
        identification = EXCLUDED.identification,
        updated_at = now()`}
      RETURNING document_id`,
      [
        result.documentId, result.status, result.message, JSON.stringify(result.origin), result.processedAt,
        result.pages, result.method, result.sourceText, JSON.stringify(result.identification ?? null),
      ],
    );
    if (insertOnly && !inserted.rowCount) {
      await client.query("COMMIT");
      return false;
    }

    await client.query("DELETE FROM extrator.review_questions WHERE document_id = $1", [result.documentId]);
    for (const [position, question] of result.questions.entries()) {
      await insertReviewQuestion(client, result.documentId, question, position);
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function saveReviewResultToDatabase(result: ReviewResult): Promise<void> {
  await writeReviewResult(result, false);
}

async function importLegacyReviewResult(result: ReviewResult): Promise<boolean> {
  return writeReviewResult(result, true);
}

async function getReviewResultFromDatabase(documentId: string): Promise<ReviewResult | undefined> {
  const pool = getDatabasePool();
  const documentResponse = await pool.query("SELECT * FROM extrator.review_documents WHERE document_id = $1", [documentId]);
  const document = documentResponse.rows[0] as Record<string, unknown> | undefined;
  if (!document) return undefined;

  const questionResponse = await pool.query(
    "SELECT * FROM extrator.review_questions WHERE document_id = $1 ORDER BY position",
    [documentId],
  );
  const questionRows = questionResponse.rows as Array<Record<string, unknown>>;
  const questionIds = questionRows.map((question) => String(question.question_id));
  const alternativeRows = questionIds.length
    ? (await pool.query(
        "SELECT question_id, label, choice_text FROM extrator.question_alternatives WHERE question_id = ANY($1::text[]) ORDER BY question_id, position",
      [questionIds],
    )).rows as Array<Record<string, unknown>>
    : [];
  const alternativesByQuestion = new Map<string, Array<{ label: string; text: string }>>();
  for (const alternative of alternativeRows) {
    const questionId = String(alternative.question_id);
    const alternatives = alternativesByQuestion.get(questionId) ?? [];
    alternatives.push({ label: String(alternative.label), text: String(alternative.choice_text) });
    alternativesByQuestion.set(questionId, alternatives);
  }

  const questions: ReviewQuestion[] = questionRows.map((row) => ({
    id: String(row.question_id),
    number: row.question_number === null ? null : Number(row.question_number),
    text: String(row.source_text),
    ...(typeof row.prompt === "string" ? { prompt: row.prompt } : {}),
    ...(typeof row.answer_key === "string" ? { answerKey: row.answer_key } : {}),
    responseType: "multiple_choice",
    alternatives: alternativesByQuestion.get(String(row.question_id)) ?? [],
    missingComponents: row.missing_components as ReviewQuestion["missingComponents"],
    pageStart: Number(row.page_start),
    pageEnd: Number(row.page_end),
    confidence: row.confidence as ReviewQuestion["confidence"],
    status: row.status as ReviewQuestion["status"],
    ...(row.pedagogy ? { pedagogy: row.pedagogy as ReviewQuestion["pedagogy"] } : {}),
    ...(typeof row.reviewed_by === "string" ? { reviewedBy: row.reviewed_by } : {}),
    visualReferences: row.visual_references as ReviewQuestion["visualReferences"],
  }));

  return {
    documentId: String(document.document_id),
    status: document.status as ReviewResult["status"],
    message: String(document.message),
    origin: document.origin as ReviewResult["origin"],
    processedAt: new Date(String(document.processed_at)).toISOString(),
    pages: Number(document.page_count),
    method: document.extraction_method as ReviewResult["method"],
    sourceText: String(document.source_text),
    ...(document.identification ? { identification: document.identification as ReviewResult["identification"] } : {}),
    questions,
  };
}

async function deleteReviewResultFromDatabase(documentId: string): Promise<void> {
  await getDatabasePool().query("DELETE FROM extrator.review_documents WHERE document_id = $1", [documentId]);
}

export {
  deleteReviewResultFromDatabase,
  getReviewResultFromDatabase,
  importLegacyReviewResult,
  saveReviewResultToDatabase,
};
