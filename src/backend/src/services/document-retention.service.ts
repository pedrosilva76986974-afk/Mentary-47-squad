import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { removeDocumentOrigin, type DocumentOrigin } from "./document-origin.service.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const documentIdPattern = /^[\da-f-]{36}$/i;

function getRetentionDays(): number {
  const configuredDays = process.env.MENTARY_RETENTION_DAYS;
  const days = configuredDays === undefined ? 30 : Number(configuredDays);
  if (!Number.isInteger(days) || days < 0) {
    throw new Error("MENTARY_RETENTION_DAYS deve ser um inteiro maior ou igual a zero.");
  }
  return days;
}

async function cleanupExpiredDocuments(now = Date.now()): Promise<number> {
  const retentionDays = getRetentionDays();
  if (retentionDays === 0) return 0;

  const registryPath = process.env.MENTARY_UPLOAD_REGISTRY ?? resolve(process.cwd(), "uploads", "manifest.json");
  const reviewDirectory = process.env.MENTARY_REVIEW_DIRECTORY ?? resolve(process.cwd(), "uploads", "reviews");
  let records: DocumentOrigin[];
  try {
    records = JSON.parse(await readFile(registryPath, "utf8")) as DocumentOrigin[];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return 0;
    throw error;
  }
  if (!Array.isArray(records)) throw new Error("Registro de documentos inválido.");

  const cutoff = now - retentionDays * DAY_IN_MS;
  const expiredIds = records
    .filter((record) => record && documentIdPattern.test(record.id)
      && Number.isFinite(Date.parse(record.uploadedAt))
      && Date.parse(record.uploadedAt) < cutoff)
    .map((record) => record.id);
  if (expiredIds.length === 0) return 0;

  await Promise.all(expiredIds.map((id) => rm(resolve(reviewDirectory, `${id}.json`), { force: true })));
  await Promise.all(expiredIds.map((id) => removeDocumentOrigin(id)));
  return expiredIds.length;
}

export { cleanupExpiredDocuments };
