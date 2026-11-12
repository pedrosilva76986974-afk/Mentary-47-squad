import { getDatabasePool, isDatabaseConfigured } from "./database.service.js";
import { documentTransaction } from "./document-transaction.js";

const pendingOperations = new Map<string, Promise<unknown>>();

/** Serialize read/modify/write operations for a document in this backend process. */
export async function withDocumentLock<T>(documentId: string, operation: () => Promise<T>): Promise<T> {
  if (documentTransaction.getStore()?.documentId === documentId) return operation();
  const previous = pendingOperations.get(documentId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    if (!isDatabaseConfigured()) return operation();
    const client = await getDatabasePool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 471702))", [documentId]);
      const result = await documentTransaction.run({ documentId, client }, operation);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });
  pendingOperations.set(documentId, current);
  try {
    return await current;
  } finally {
    if (pendingOperations.get(documentId) === current) pendingOperations.delete(documentId);
  }
}
