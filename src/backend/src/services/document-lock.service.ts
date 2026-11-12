const pendingOperations = new Map<string, Promise<unknown>>();

/** Serialize read/modify/write operations for a document in this backend process. */
export async function withDocumentLock<T>(documentId: string, operation: () => Promise<T>): Promise<T> {
  const previous = pendingOperations.get(documentId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  pendingOperations.set(documentId, current);
  try {
    return await current;
  } finally {
    if (pendingOperations.get(documentId) === current) pendingOperations.delete(documentId);
  }
}
