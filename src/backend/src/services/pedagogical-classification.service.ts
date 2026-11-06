import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { classifyPedagogy, type PedagogicalSuggestion } from "./ollama.service.js";
import { getReviewResult } from "./review-results.service.js";
import { DocumentValidationError } from "./document-validation.service.js";
export type ClassificationJob = { documentId: string; status: "queued" | "running" | "completed" | "failed"; model: string; updatedAt: string; sourceHash: string; suggestions: Array<PedagogicalSuggestion & { questionId: string }>; error?: string; owner: string };
const owner = randomUUID();
const active = new Map<string, ClassificationJob>();
let tail = Promise.resolve();
function path(id: string) { if (!/^[\da-f-]{36}$/i.test(id)) throw new DocumentValidationError("Documento inválido."); return resolve(process.env.MENTARY_CLASSIFICATION_DIRECTORY ?? resolve(process.cwd(), "uploads", "classifications"), `${id}.json`); }
function hash(questions: unknown) { return createHash("sha256").update(JSON.stringify(questions)).digest("hex"); }
function snapshot(questions: Array<{ id: string; prompt?: string; text: string; alternatives?: unknown; pedagogy?: { grade?: string; discipline?: string } }>) { return questions.map(q => ({ id: q.id, prompt: q.prompt ?? q.text, alternatives: q.alternatives, grade: q.pedagogy?.grade, discipline: q.pedagogy?.discipline })); }
async function save(job: ClassificationJob) { const file = path(job.documentId); await mkdir(resolve(file, ".."), { recursive: true }); const tmp = `${file}.${randomUUID()}.tmp`; await writeFile(tmp, JSON.stringify(job)); await rename(tmp, file); }
export async function getClassification(id: string): Promise<ClassificationJob | undefined> {
  if (active.has(id)) return structuredClone(active.get(id)!);
  try {
    const job = JSON.parse(await readFile(path(id), "utf8")) as ClassificationJob;
    if (["queued", "running"].includes(job.status) && job.owner !== owner) { job.status = "failed"; job.error = "Análise interrompida pelo reinício do servidor. Tente novamente."; await save(job); }
    return job;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw e; }
}
export async function startClassification(id: string): Promise<ClassificationJob | undefined> {
  path(id);
  const review = await getReviewResult(id);
  if (!review) return undefined;
  const sourceHash = hash(snapshot(review.questions));
  const existing = await getClassification(id);
  if (active.has(id) || (existing?.status === "completed" && existing.sourceHash === sourceHash && existing.model === process.env.OLLAMA_MODEL)) return existing;
  if (!process.env.OLLAMA_MODEL) throw new DocumentValidationError("Configure OLLAMA_MODEL para analisar as questões.");
  if (active.size >= 20) throw new DocumentValidationError("Fila de análise cheia. Tente novamente mais tarde.");
  // Check again after asynchronous reads to deduplicate simultaneous starts.
  if (active.has(id)) return structuredClone(active.get(id)!);
  const job: ClassificationJob = { documentId: id, status: "queued", model: process.env.OLLAMA_MODEL, updatedAt: new Date().toISOString(), sourceHash, suggestions: [], owner };
  active.set(id, job);
  try { await save(job); } catch (e) { active.delete(id); throw e; }
  const run = async () => {
    try {
      job.status = "running"; await save(job);
      for (let offset = 0; offset < review.questions.length; offset += 5) {
        const questions = review.questions.slice(offset, offset + 5);
        const suggestions = await classifyPedagogy(questions);
        job.suggestions.push(...suggestions.map(s => ({ ...s, questionIndex: s.questionIndex + offset, questionId: questions[s.questionIndex]!.id })));
      }
      job.status = "completed";
    } catch (e) { job.status = "failed"; job.error = e instanceof Error ? e.message : "Falha na análise pedagógica."; }
    finally { job.updatedAt = new Date().toISOString(); try { await save(job); } finally { active.delete(id); } }
  };
  tail = tail.then(run, run).catch(e => console.error("Falha ao persistir análise pedagógica.", e));
  return structuredClone(job);
}
export async function classificationIsStale(id: string, job: ClassificationJob) { const review = await getReviewResult(id); return !review || hash(snapshot(review.questions)) !== job.sourceHash; }
