import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";

export const documentTransaction = new AsyncLocalStorage<{ documentId: string; client: PoolClient }>();
