import { extname } from "node:path";
import { loadImage } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const MAX_PDF_PAGES = 50;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_SIDE = 10_000;

class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentValidationError";
  }
}

type UploadCandidate = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

const formats = {
  ".pdf": { mimeType: "application/pdf", signature: Buffer.from("%PDF-") },
  ".png": { mimeType: "image/png", signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  ".jpg": { mimeType: "image/jpeg", signature: Buffer.from([0xff, 0xd8, 0xff]) },
  ".jpeg": { mimeType: "image/jpeg", signature: Buffer.from([0xff, 0xd8, 0xff]) },
} as const;

async function validateDocument(file: UploadCandidate): Promise<void> {
  const extension = extname(file.originalname).toLowerCase() as keyof typeof formats;
  const format = formats[extension];
  if (!format || file.mimetype !== format.mimeType) {
    throw new DocumentValidationError("Formato inválido. Envie um arquivo PDF, PNG, JPG ou JPEG válido.");
  }

  const header = extension === ".pdf" ? file.buffer.subarray(0, 1024) : file.buffer;
  if (!header.includes(format.signature)) {
    throw new DocumentValidationError("O conteúdo do arquivo não corresponde ao formato informado.");
  }

  try {
    if (format.mimeType === "application/pdf") {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(file.buffer) });
      const pdf = await loadingTask.promise;
      const pages = pdf.numPages;
      await loadingTask.destroy();
      if (pages === 0 || pages > MAX_PDF_PAGES) {
        throw new DocumentValidationError(`O PDF deve ter entre 1 e ${MAX_PDF_PAGES} páginas.`);
      }
    } else {
      const image = await loadImage(file.buffer);
      if (image.width > MAX_IMAGE_SIDE || image.height > MAX_IMAGE_SIDE || image.width * image.height > MAX_IMAGE_PIXELS) {
        throw new DocumentValidationError("A imagem excede as dimensões máximas permitidas.");
      }
    }
  } catch (error) {
    if (error instanceof DocumentValidationError) throw error;
    throw new DocumentValidationError("O arquivo está corrompido ou não pode ser aberto.");
  }
}

export { validateDocument };
export { DocumentValidationError };
