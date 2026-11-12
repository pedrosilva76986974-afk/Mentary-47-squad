import { randomUUID, createHash } from "node:crypto";
import { getDatabasePool, isDatabaseConfigured } from "./database.service.js";
import { DocumentValidationError } from "./document-validation.service.js";

export type AssessmentInput = {
  externalId: string; schoolId: string; classId: string; title: string; appliedAt: string;
  questions: Array<{ id: string; prompt: string; alternatives: Array<{ label: string; text: string }>; answerKey: string; bnccSkills?: string[]; descriptor?: string }>;
  students: Array<{ id: string; answers: Record<string, { answer: string | null; durationMs?: number }> }>;
};
type Counts = { correct: number; incorrect: number; omitted: number; total: number; percentage: number; timedResponses: number; totalDurationMs: number; averageDurationMs: number | null };
type AssessmentResults = {
  summary: Counts;
  students: Array<Counts & { id: string }>;
  questions: Array<Counts & { id: string; prompt: string; distribution: Record<string, number> }>;
  skills: Array<Counts & { id: string }>;
  descriptors: Array<Counts & { id: string }>;
};
function invalid(message: string): never { throw new DocumentValidationError(message); }
function object(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function shortText(value: unknown, field: string, max = 200): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max) invalid(`Informe ${field}, com até ${max} caracteres.`);
}

export function validateAssessment(value: unknown): AssessmentInput {
  if (!object(value)) invalid("Envie uma aplicação em JSON.");
  for (const field of ["externalId", "schoolId", "classId", "title"] as const) shortText(value[field], field);
  if (typeof value.appliedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.appliedAt) || !Number.isFinite(Date.parse(value.appliedAt)) || new Date(value.appliedAt).toISOString().slice(0, 10) !== value.appliedAt) invalid("A data da aplicação deve ser uma data válida no formato AAAA-MM-DD.");
  if (!Array.isArray(value.questions) || !value.questions.length || value.questions.length > 200) invalid("Informe entre 1 e 200 questões.");
  if (!Array.isArray(value.students) || !value.students.length || value.students.length > 500) invalid("Informe entre 1 e 500 estudantes, usando identificadores do sistema principal.");
  const ids = new Set<string>();
  for (const question of value.questions) {
    if (!object(question)) invalid("Questão inválida.");
    shortText(question.id, "identificador da questão"); shortText(question.prompt, "enunciado", 20000);
    if (ids.has(question.id)) invalid("Identificadores de questões repetidos."); ids.add(question.id);
    if (!Array.isArray(question.alternatives) || question.alternatives.length < 2 || question.alternatives.length > 20) invalid("Cada questão precisa de 2 a 20 alternativas.");
    const labels = new Set<string>();
    for (const option of question.alternatives) {
      if (!object(option)) invalid("Alternativa inválida.");
      shortText(option.label, "rótulo", 10); shortText(option.text, "texto da alternativa", 10000);
      const label = option.label.trim().toLocaleUpperCase("pt-BR");
      if (labels.has(label)) invalid("Rótulos de alternativas repetidos."); labels.add(label);
    }
    if (typeof question.answerKey !== "string" || !labels.has(question.answerKey.trim().toLocaleUpperCase("pt-BR"))) invalid("O gabarito deve corresponder a uma alternativa.");
    if (question.bnccSkills !== undefined && (!Array.isArray(question.bnccSkills) || question.bnccSkills.length > 20 || question.bnccSkills.some(skill => typeof skill !== "string" || !skill.trim() || skill.length > 100) || new Set(question.bnccSkills).size !== question.bnccSkills.length)) invalid("Habilidades BNCC inválidas ou repetidas.");
    if (question.descriptor !== undefined) shortText(question.descriptor, "descritor", 250);
  }
  const students = new Set<string>();
  for (const student of value.students) {
    if (!object(student)) invalid("Estudante inválido.");
    shortText(student.id, "identificador do estudante");
    if (students.has(student.id)) invalid("Identificadores de estudantes repetidos."); students.add(student.id);
    if (!object(student.answers)) invalid("Respostas devem ser um objeto por questão.");
    for (const [id, answer] of Object.entries(student.answers)) {
      if (!ids.has(id)) invalid("Existe resposta para uma questão que não pertence à aplicação.");
      if (!object(answer)) invalid("Resposta inválida.");
      const question = (value.questions as AssessmentInput["questions"]).find(item => item.id === id)!;
      if (answer.answer !== null && (typeof answer.answer !== "string" || (answer.answer.trim() !== "" && !question.alternatives.some(option => option.label.trim().toLocaleUpperCase("pt-BR") === (answer.answer as string).trim().toLocaleUpperCase("pt-BR"))))) invalid("A resposta deve indicar uma alternativa existente ou ficar em branco.");
      if (answer.durationMs !== undefined && (!Number.isFinite(answer.durationMs) || Number(answer.durationMs) < 0 || Number(answer.durationMs) > 86400000)) invalid("Tempo de resposta inválido.");
    }
  }
  // Build an allowlisted snapshot: extra fields and names of students are not stored.
  const input = value as unknown as AssessmentInput;
  return {
    externalId: input.externalId.trim(), schoolId: input.schoolId.trim(), classId: input.classId.trim(), title: input.title.trim(), appliedAt: input.appliedAt,
    questions: input.questions.map(q => ({ id: q.id, prompt: q.prompt, answerKey: q.answerKey.trim().toLocaleUpperCase("pt-BR"), alternatives: q.alternatives.map(a => ({ label: a.label.trim().toLocaleUpperCase("pt-BR"), text: a.text })), ...(q.bnccSkills ? { bnccSkills: q.bnccSkills.map(s => s.trim()) } : {}), ...(q.descriptor ? { descriptor: q.descriptor.trim() } : {}) })),
    students: input.students.map(s => ({ id: s.id, answers: Object.fromEntries(Object.entries(s.answers).map(([id, a]) => [id, { answer: a.answer?.trim().toLocaleUpperCase("pt-BR") || null, ...(a.durationMs !== undefined ? { durationMs: a.durationMs } : {}) }])) })),
  };
}

const empty = (): Counts => ({ correct: 0, incorrect: 0, omitted: 0, total: 0, percentage: 0, timedResponses: 0, totalDurationMs: 0, averageDurationMs: null });
function add(counts: Counts, outcome: "correct" | "incorrect" | "omitted", durationMs?: number) {
  counts[outcome]++; counts.total++;
  counts.percentage = Math.round(counts.correct / counts.total * 10000) / 100;
  if (durationMs !== undefined) { counts.timedResponses++; counts.totalDurationMs += durationMs; counts.averageDurationMs = Math.round(counts.totalDurationMs / counts.timedResponses); }
}
export function processAssessment(input: AssessmentInput): AssessmentResults {
  const summary = empty();
  const students = input.students.map(s => ({ id: s.id, ...empty() }));
  const questions = input.questions.map(q => ({ id: q.id, prompt: q.prompt, ...empty(), distribution: Object.fromEntries(q.alternatives.map(a => [a.label, 0])) }));
  const skills = new Map<string, Counts>(); const descriptors = new Map<string, Counts>();
  for (const [studentIndex, student] of input.students.entries()) for (const [index, question] of input.questions.entries()) {
    const response = student.answers[question.id];
    const answer = response?.answer;
    const outcome = !answer ? "omitted" : answer === question.answerKey ? "correct" : "incorrect";
    for (const counts of [summary, students[studentIndex]!, questions[index]!]) add(counts, outcome, response?.durationMs);
    if (answer) questions[index]!.distribution[answer]!++;
    for (const skill of new Set(question.bnccSkills ?? [])) { const counts = skills.get(skill) ?? empty(); add(counts, outcome, response?.durationMs); skills.set(skill, counts); }
    if (question.descriptor) { const counts = descriptors.get(question.descriptor) ?? empty(); add(counts, outcome, response?.durationMs); descriptors.set(question.descriptor, counts); }
  }
  return { summary, students, questions, skills: [...skills].map(([id, counts]) => ({ id, ...counts })), descriptors: [...descriptors].map(([id, counts]) => ({ id, ...counts })) };
}
export class AssessmentConflictError extends Error {}
function requireDatabase() { if (!isDatabaseConfigured()) invalid("Configure o PostgreSQL para armazenar avaliações."); }
export async function receiveAssessment(value: unknown) {
  requireDatabase();
  const input = validateAssessment(value);
  const results = processAssessment(input);
  const id = randomUUID();
  const stored = await getDatabasePool().query(`INSERT INTO avaliacoes.aplicacoes(id,external_id,school_id,class_id,applied_at,title,payload,results)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(external_id) DO NOTHING RETURNING id`, [id, input.externalId, input.schoolId, input.classId, input.appliedAt, input.title, JSON.stringify(input), JSON.stringify(results)]);
  if (stored.rowCount) return { id, created: true, results };
  const existing = (await getDatabasePool().query("SELECT id,payload,results FROM avaliacoes.aplicacoes WHERE external_id=$1", [input.externalId])).rows[0];
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : object(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, canonical(value)])) : item;
  const hash = (item: unknown) => createHash("sha256").update(JSON.stringify(canonical(item))).digest("hex");
  if (hash(existing.payload) !== hash(input)) throw new AssessmentConflictError("Já existe uma aplicação com este externalId e dados diferentes. Use outro identificador para uma nova aplicação.");
  return { id: String(existing.id), created: false, results: existing.results as AssessmentResults };
}

export async function listAssessments(filters: { schoolId?: string; classId?: string; from?: string; to?: string; page?: string }) {
  requireDatabase();
  const page = filters.page === undefined ? 1 : Number(filters.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) invalid("Página inválida.");
  for (const date of [filters.from, filters.to]) if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) invalid("Período inválido.");
  if (filters.from && filters.to && filters.from > filters.to) invalid("O início do período deve anteceder o fim.");
  const clauses: string[] = []; const values: unknown[] = [];
  for (const [field, value, operator] of [["school_id", filters.schoolId, "="], ["class_id", filters.classId, "="], ["applied_at", filters.from, ">="], ["applied_at", filters.to, "<="]] as const) if (value) { values.push(value); clauses.push(`${field} ${operator} $${values.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (await getDatabasePool().query(`SELECT count(*)::int AS total FROM avaliacoes.aplicacoes ${where}`, values)).rows[0].total as number;
  values.push((page - 1) * 20);
  const rows = await getDatabasePool().query(`SELECT id,external_id AS "externalId",school_id AS "schoolId",class_id AS "classId",title,applied_at::text AS "appliedAt",results->'summary' AS summary FROM avaliacoes.aplicacoes ${where} ORDER BY applied_at DESC,id LIMIT 20 OFFSET $${values.length}`, values);
  return { applications: rows.rows, total, page, pageSize: 20 };
}
export async function getAssessment(id: string) {
  requireDatabase();
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) invalid("Aplicação inválida.");
  const result = await getDatabasePool().query(`SELECT id,external_id AS "externalId",school_id AS "schoolId",class_id AS "classId",title,applied_at::text AS "appliedAt",results FROM avaliacoes.aplicacoes WHERE id=$1`, [id]);
  return result.rows[0];
}
