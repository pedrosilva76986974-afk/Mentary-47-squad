export async function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  signal.throwIfAborted();
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new DOMException("Cancelado", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([operation, cancelled]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
