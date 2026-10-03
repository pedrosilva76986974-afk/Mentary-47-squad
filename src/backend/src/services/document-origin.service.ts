import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
  await currentWrite;
  return origin;
}

export { recordDocumentOrigin };
export type { DocumentOrigin };
