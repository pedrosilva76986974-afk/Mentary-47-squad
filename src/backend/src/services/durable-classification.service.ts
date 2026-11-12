import { createHash, randomUUID } from "node:crypto";
import { getDatabasePool, isDatabaseConfigured } from "./database.service.js";
import { documentTransaction } from "./document-transaction.js";
import { getReviewResult } from "./review-results.service.js";
import { classifyPedagogy, classificationTargetMs } from "./ollama.service.js";
import { DocumentValidationError } from "./document-validation.service.js";
import type { ClassificationJob } from "./pedagogical-classification.service.js";
import { classificationIsStale } from "./pedagogical-classification.service.js";
import type { ParsedQuestion } from "./question-parser.service.js";

const workerOwner = randomUUID();
let working = false;
const database = () => documentTransaction.getStore()?.client ?? getDatabasePool();

export async function getDurableClassification(id: string): Promise<ClassificationJob | undefined> {
  const result = await database().query("SELECT job, attempts FROM extrator.classification_jobs WHERE document_id=$1", [id]);
  if (!result.rows[0]) return undefined;
  return { ...result.rows[0].job, attempts: result.rows[0].attempts };
}

export async function startDurableClassification(id: string): Promise<ClassificationJob | undefined> {
  const review = await getReviewResult(id);
  if (!review) return undefined;
  if (!review.questions.length) throw new DocumentValidationError("Nenhuma questão identificada para analisar.");
  const existing = await getDurableClassification(id);
  if (existing && ["queued", "running"].includes(existing.status)) return existing;
  const unchanged = existing && !(await classificationIsStale(id, existing));
  if (unchanged && existing.version === 6 && existing.status === "completed" && existing.model === process.env.OLLAMA_MODEL) return existing;
  if (!process.env.OLLAMA_MODEL) throw new DocumentValidationError("Configure OLLAMA_MODEL para analisar as questões.");
  await database().query("SELECT pg_advisory_xact_lock(471704)");
  const count = await database().query("SELECT count(*)::int AS total FROM extrator.classification_jobs WHERE state IN ('queued','running')");
  if (count.rows[0].total >= 20) throw new DocumentValidationError("Fila de análise cheia. Tente novamente mais tarde.");
  const source = unchanged && existing.source ? existing.source : review.questions.map(q => ({ id: q.id, prompt: q.prompt ?? q.text, alternatives: q.alternatives, grade: q.pedagogy?.grade, discipline: q.pedagogy?.discipline }));
  const sourceHash = createHash("sha256").update(JSON.stringify(source)).digest("hex");
  const job: ClassificationJob = { version: 6, documentId: id, source, sourceHash, model: process.env.OLLAMA_MODEL, status: "queued", updatedAt: new Date().toISOString(), owner: workerOwner,
    suggestions: unchanged && existing.version === 6 && existing.model === process.env.OLLAMA_MODEL ? existing.suggestions : [],
    nextIndex: unchanged && existing.version === 6 && existing.model === process.env.OLLAMA_MODEL ? existing.nextIndex ?? existing.suggestions.length : 0 };
  await database().query(`INSERT INTO extrator.classification_jobs(document_id,job,state) VALUES($1,$2,'queued')
    ON CONFLICT(document_id) DO UPDATE SET job=EXCLUDED.job,state='queued',cancel_requested=false,owner=NULL,lease_until=NULL,updated_at=now()`, [id, JSON.stringify(job)]);
  return job;
}

export async function cancelDurableClassification(id: string): Promise<ClassificationJob | undefined> {
  await database().query(`UPDATE extrator.classification_jobs SET cancel_requested=true,state='cancelled',updated_at=now(),
    job=job || jsonb_build_object('status','cancelled','error','Análise cancelada pelo usuário.','updatedAt',now())
    WHERE document_id=$1 AND state IN ('queued','running')`, [id]);
  return getDurableClassification(id);
}

export async function durableClassificationIsActive(id: string): Promise<boolean> {
  const result = await database().query("SELECT 1 FROM extrator.classification_jobs WHERE document_id=$1 AND (state IN ('queued','running') OR lease_until > now())", [id]);
  return Boolean(result.rowCount);
}

export async function removeDurableClassification(id: string): Promise<void> {
  await database().query("DELETE FROM extrator.classification_jobs WHERE document_id=$1 AND state NOT IN ('queued','running') AND (lease_until IS NULL OR lease_until <= now())", [id]);
}

/** One PostgreSQL session lock limits the entire cluster to one model request. */
export async function runDurableClassificationWorker(): Promise<void> {
  if (working || !isDatabaseConfigured()) return;
  working = true;
  const client = await getDatabasePool().connect().catch(error => { working = false; throw error; });
  let acquired = false;
  try {
    acquired = (await client.query("SELECT pg_try_advisory_lock(471703) AS acquired")).rows[0].acquired;
    if (!acquired) return;
    const claimed = await client.query(`UPDATE extrator.classification_jobs SET state='running', owner=$1,
      lease_until=now()+interval '60 seconds', attempts=attempts+1,updated_at=now(),
      job=job || jsonb_build_object('status','running','owner',$1::text,'updatedAt',now())
      WHERE document_id=(SELECT document_id FROM extrator.classification_jobs
        WHERE NOT cancel_requested AND (state='queued' OR (state='running' AND lease_until < now()))
        ORDER BY updated_at LIMIT 1) RETURNING job`, [workerOwner]);
    const job = claimed.rows[0]?.job as ClassificationJob | undefined;
    if (!job) return;
    const cancellation = new AbortController();
    let checking = false;
    const heartbeat = setInterval(() => {
      if (checking) return;
      checking = true;
      void client.query(`UPDATE extrator.classification_jobs SET lease_until=now()+interval '60 seconds'
        WHERE document_id=$1 AND owner=$2 AND NOT cancel_requested AND state='running' RETURNING document_id`, [job.documentId, workerOwner])
        .then(result => { if (!result.rowCount) cancellation.abort(); })
        .catch(() => cancellation.abort()).finally(() => { checking = false; });
    }, 1000);
    heartbeat.unref();
    const persist = async () => {
      job.updatedAt = new Date().toISOString();
      const updated = await client.query(`UPDATE extrator.classification_jobs SET job=$3,state=$4,updated_at=now()
        WHERE document_id=$1 AND owner=$2 AND NOT cancel_requested RETURNING document_id`, [job.documentId, workerOwner, JSON.stringify(job), job.status]);
      if (!updated.rowCount) cancellation.abort();
    };
    try {
      // Use the recorded input, preserving confirmed partial results after a crash.
      if (!job.source?.length) throw new Error("Entrada da classificação ausente. Inicie uma nova análise.");
      for (let offset = job.nextIndex ?? job.suggestions.length; offset < job.source.length; offset++) {
        cancellation.signal.throwIfAborted();
        const question = job.source[offset]!;
        const started = performance.now();
        const suggestions = await classifyPedagogy([{ ...question, alternatives: question.alternatives as ParsedQuestion["alternatives"], text: question.prompt, number: null, pageStart: null, pageEnd: null, confidence: "high", pedagogy: { grade: question.grade, discipline: question.discipline } }], cancellation.signal);
        cancellation.signal.throwIfAborted();
        const processingMs = Math.round(performance.now() - started);
        for (const suggestion of suggestions) job.suggestions.push({ ...suggestion, questionIndex: offset, questionId: question.id, processingMs, targetMs: classificationTargetMs(), targetMet: processingMs <= classificationTargetMs() });
        job.nextIndex = offset + 1;
        await persist();
        cancellation.signal.throwIfAborted();
      }
      job.status = "completed";
      delete job.error;
      await persist();
    } catch (error) {
      if (!cancellation.signal.aborted) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "Falha na classificação pedagógica.";
        await persist();
      }
    } finally {
      clearInterval(heartbeat);
      await client.query("UPDATE extrator.classification_jobs SET lease_until=NULL WHERE document_id=$1 AND owner=$2", [job.documentId, workerOwner]);
    }
  } finally {
    try { if (acquired) await client.query("SELECT pg_advisory_unlock(471703)"); }
    finally { client.release(); working = false; }
  }
}
