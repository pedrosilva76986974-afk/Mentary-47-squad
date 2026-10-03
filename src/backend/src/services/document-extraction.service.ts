import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { recognizeImage } from "./ocr.service.js";

const MAX_PDF_PAGES = 50;
const MIN_DIGITAL_TEXT_LENGTH = 40;

type ExtractionResult = {
  text: string;
  pageTexts: string[];
  pages: number;
  method: "pdf-text" | "ocr";
};

type ImageRecognizer = (image: Buffer) => Promise<string>;

function groupPageText(items: unknown[]): string {
  const lines: string[] = [];
  let line = "";
  let previousY: number | undefined;
  const flush = (): void => {
    if (line.trim()) lines.push(line.trim());
    line = "";
  };

  for (const item of items) {
    if (typeof item !== "object" || item === null || !("str" in item)) continue;
    const textItem = item as { str: string; hasEOL?: boolean; transform?: number[] };
    const y = textItem.transform?.[5];
    if (previousY !== undefined && y !== undefined && Math.abs(previousY - y) > 2) flush();
    if (line && !line.endsWith(" ")) line += " ";
    line += textItem.str;
    if (textItem.hasEOL) flush();
    previousY = y ?? previousY;
  }
  flush();
  return lines.join("\n");
}

async function extractPdf(buffer: Buffer, recognize: ImageRecognizer): Promise<ExtractionResult> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  if (pdf.numPages > MAX_PDF_PAGES) {
    await loadingTask.destroy();
    throw new Error(`O PDF pode ter no máximo ${MAX_PDF_PAGES} páginas neste MVP.`);
  }

  const textPages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    textPages.push(groupPageText(content.items));
  }

  const digitalText = textPages.filter(Boolean).join("\n\n");
  if (digitalText.length >= MIN_DIGITAL_TEXT_LENGTH) {
    await loadingTask.destroy();
    return { text: digitalText, pageTexts: textPages, pages: pdf.numPages, method: "pdf-text" };
  }

  const scannedPages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvas: canvas as never, canvasContext: context as never, viewport }).promise;
    const imageText = await recognize(canvas.toBuffer("image/png"));
    scannedPages.push(imageText);
  }
  const pages = pdf.numPages;
  await loadingTask.destroy();
  return { text: scannedPages.join("\n\n"), pageTexts: scannedPages, pages, method: "ocr" };
}

async function extractDocument(
  buffer: Buffer,
  mimeType: string,
  recognize: ImageRecognizer = recognizeImage,
): Promise<ExtractionResult> {
  if (mimeType === "application/pdf") return extractPdf(buffer, recognize);
  const text = await recognize(buffer);
  return { text, pageTexts: [text], pages: 1, method: "ocr" };
}

export { extractDocument };
export type { ExtractionResult };
