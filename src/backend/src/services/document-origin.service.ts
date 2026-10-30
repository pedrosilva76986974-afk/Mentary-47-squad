import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type OriginInput = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type DocumentOrigin = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  uploadedAt: string;
};

let pendingWrite: Promise<void> = Promise.resolve();

function registryPath(): string {
  return process.env.MENTARY_UPLOAD_REGISTRY ?? resolve(process.cwd(), "uploads", "manifest.json");
}

function documentDirectory(): string {
  return process.env.MENTARY_DOCUMENT_DIRECTORY ?? resolve(process.cwd(), "uploads", "documents");
}

function storedDocumentPath(origin: Pick<DocumentOrigin, "id" | "mimeType">): string {
  const extension = origin.mimeType === "application/pdf" ? ".pdf" : origin.mimeType === "image/png" ? ".png" : ".jpg";
  return resolve(documentDirectory(), `${origin.id}${extension}`);
}

async function recordDocumentOrigin(file: OriginInput): Promise<DocumentOrigin> {
  const origin: DocumentOrigin = {
    id: randomUUID(),
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    sha256: createHash("sha256").update(file.buffer).digest("hex"),
    uploadedAt: new Date().toISOString(),
  };
  const path = registryPath();
  const sourcePath = storedDocumentPath(origin);
  await mkdir(documentDirectory(), { recursive: true });
  await writeFile(sourcePath, file.buffer);

  const write = async (): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    let records: DocumentOrigin[] = [];
    try {
      records = JSON.parse(await readFile(path, "utf8")) as DocumentOrigin[];
      if (!Array.isArray(records)) throw new Error("Registro de documentos inválido.");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    records.push(origin);
    const temporaryPath = `${path}.${origin.id}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  };

  const currentWrite = pendingWrite.then(write);
  pendingWrite = currentWrite.catch(() => undefined);
  try {
    await currentWrite;
  } catch (error) {
    await rm(sourcePath, { force: true });
    throw error;
  }
  return origin;
}

async function getStoredDocument(documentId: string): Promise<{ origin: DocumentOrigin; content: Buffer } | undefined> {
  if (!/^[\da-f-]{36}$/i.test(documentId)) return undefined;
  let records: DocumentOrigin[];
  try {
    records = JSON.parse(await readFile(registryPath(), "utf8")) as DocumentOrigin[];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
  const origin = Array.isArray(records) ? records.find((record) => record.id === documentId) : undefined;
  if (!origin) return undefined;
  try {
    return { origin, content: await readFile(storedDocumentPath(origin)) };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function removeDocumentOrigin(documentId: string): Promise<void> {
  const path = registryPath();
  const remove = async (): Promise<void> => {
    let records: DocumentOrigin[];
    try {
      records = JSON.parse(await readFile(path, "utf8")) as DocumentOrigin[];
      if (!Array.isArray(records)) throw new Error("Registro de documentos inválido.");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }

    const removedRecord = records.find((record) => record.id === documentId);
    const remainingRecords = records.filter((record) => record.id !== documentId);
    if (remainingRecords.length === records.length) return;
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(remainingRecords, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
    if (removedRecord) await rm(storedDocumentPath(removedRecord), { force: true });
  };

  const currentWrite = pendingWrite.then(remove);
  pendingWrite = currentWrite.catch(() => undefined);
  await currentWrite;
}

export { getStoredDocument, recordDocumentOrigin, removeDocumentOrigin };
export type { DocumentOrigin };
