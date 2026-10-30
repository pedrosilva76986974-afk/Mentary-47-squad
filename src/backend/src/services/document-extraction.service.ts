import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { MAX_PDF_PAGES, standardFontDataUrl } from "./pdf-config.js";
import { recognizeImage } from "./ocr.service.js";

const MIN_DIGITAL_TEXT_LENGTH = 40;

type ExtractionResult = {
  text: string;
  pageTexts: string[];
  pages: number;
  method: "pdf-text" | "ocr" | "hybrid";
  visualPages?: VisualPageReference[];
};

type VisualPageReference = { page: number; kind: "image" | "graphic" };

type ImageRecognizer = (image: Buffer) => Promise<string>;

type PdfTextItem = { str: string; hasEOL?: boolean; transform?: number[]; width?: number; height?: number };
type PositionedLine = { text: string; y: number; left: number; right: number };
type PageTextContent = { items: unknown[]; width: number; height: number; yMin: number };

function artifactKey(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR")
    .replace(/\d+/g, "#").replace(/[^\p{L}#]+/gu, " ").trim();
}

function findRepeatedPageArtifacts(pages: PageTextContent[]): Set<string> {
  if (pages.length < 3) return new Set();
  const pageCounts = new Map<string, number>();
  pages.forEach(({ items, height, yMin }) => {
    const keys = new Set<string>();
    for (const item of items) {
      if (typeof item !== "object" || item === null || !("str" in item)) continue;
      const textItem = item as PdfTextItem;
      const y = textItem.transform?.[5];
      const text = textItem.str.trim();
      if (!text || y === undefined || (y > yMin + height * 0.12 && y < yMin + height * 0.88)) continue;
      const key = artifactKey(text);
      if (key.length >= 12) keys.add(key);
    }
    for (const key of keys) pageCounts.set(key, (pageCounts.get(key) ?? 0) + 1);
  });
  const minimumPageCount = Math.min(3, pages.length);
  return new Set([...pageCounts].filter(([, count]) => count >= minimumPageCount).map(([key]) => key));
}

function isRepeatedWatermark(text: string, height: number): boolean {
  if (height > 3.5) return false;
  const compact = text.replace(/\s+/g, "");
  const repeated = /(.{4,})\1{2,}/u.exec(compact)?.[0];
  return Boolean(repeated && repeated.length >= 24);
}

function getPositionedLines(items: unknown[], pageWidth: number, repeatedArtifacts: Set<string>): PositionedLine[] {
  const positionedItems = items.flatMap((item): Array<{ text: string; x: number; y: number; width: number; height: number }> => {
    if (typeof item !== "object" || item === null || !("str" in item)) return [];
    const textItem = item as PdfTextItem;
    const text = textItem.str.trim();
    const x = textItem.transform?.[4];
    const y = textItem.transform?.[5];
    const height = Math.abs(textItem.height ?? textItem.transform?.[3] ?? 0);
    const width = Math.abs(textItem.width ?? 0);
    if (!text || x === undefined || y === undefined || isRepeatedWatermark(text, height)) return [];
    if (repeatedArtifacts.has(artifactKey(text))) return [];
    return [{ text, x, y, width, height }];
  }).sort((left, right) => right.y - left.y || left.x - right.x);

  const rows: Array<typeof positionedItems> = [];
  for (const item of positionedItems) {
    const row = rows.find((candidate) => Math.abs((candidate[0]?.y ?? item.y) - item.y) <= Math.max(2, item.height * 0.3));
    if (row) row.push(item);
    else rows.push([item]);
  }

  const lines: PositionedLine[] = [];
  for (const row of rows) {
    row.sort((left, right) => left.x - right.x);
    let parts: typeof row = [];
    const flushPart = (): void => {
      if (parts.length === 0) return;
      const text = parts.map((part) => part.text).join(" ").replace(/[ \t]+/g, " ").trim();
      if (text) lines.push({ text, y: parts.reduce((sum, part) => sum + part.y, 0) / parts.length,
        left: Math.min(...parts.map((part) => part.x)),
        right: Math.max(...parts.map((part) => part.x + part.width)) });
      parts = [];
    };
    for (const item of row) {
      const previous = parts.at(-1);
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      if (previous && gap > pageWidth * 0.08) flushPart();
      parts.push(item);
    }
    flushPart();
  }
  return lines.sort((left, right) => right.y - left.y || left.left - right.left);
}

function findColumnSplit(lines: PositionedLine[], pageWidth: number): number | undefined {
  const candidates = lines.filter((line) => line.right - line.left < pageWidth * 0.72)
    .map((line) => (line.left + line.right) / 2).sort((left, right) => left - right);
  let best: { split: number; gap: number } | undefined;
  for (let index = 1; index < candidates.length; index += 1) {
    const left = candidates[index - 1]!;
    const right = candidates[index]!;
    const gap = right - left;
    if (gap < pageWidth * 0.1) continue;
    const split = (left + right) / 2;
    const narrowLines = lines.filter((line) => line.right - line.left < pageWidth * 0.72);
    const leftCount = narrowLines.filter((line) => (line.left + line.right) / 2 < split).length;
    const rightCount = narrowLines.length - leftCount;
    const crossing = narrowLines.filter((line) => line.left < split && line.right > split).length;
    if (leftCount < 3 || rightCount < 3 || crossing > Math.max(1, Math.floor(narrowLines.length * 0.08))) continue;
    if (!best || gap > best.gap) best = { split, gap };
  }
  return best?.split;
}

function reconstructColumnOrder(lines: PositionedLine[], split: number, pageWidth: number): string[] {
  const dividers = lines.filter((line) => line.left < split && line.right > split);
  const leftLines = lines.filter((line) => line.right <= split);
  const rightLines = lines.filter((line) => line.left >= split);
  const ordered: string[] = [];
  let upperY = Number.POSITIVE_INFINITY;
  const appendBand = (lowerY: number): void => {
    ordered.push(...leftLines.filter((line) => line.y < upperY && line.y > lowerY).sort((a, b) => b.y - a.y).map((line) => line.text));
    ordered.push(...rightLines.filter((line) => line.y < upperY && line.y > lowerY).sort((a, b) => b.y - a.y).map((line) => line.text));
  };
  for (const divider of dividers.sort((left, right) => right.y - left.y)) {
    appendBand(divider.y);
    ordered.push(divider.text);
    upperY = divider.y;
  }
  appendBand(Number.NEGATIVE_INFINITY);
  if (ordered.length === 0 && pageWidth > 0) return lines.map((line) => line.text);
  return ordered;
}

function groupPageText(items: unknown[], pageWidth: number, repeatedArtifacts = new Set<string>()): string {
  const lines = getPositionedLines(items, pageWidth, repeatedArtifacts);
  const columnSplit = findColumnSplit(lines, pageWidth);
  const ordered = columnSplit === undefined
    ? lines.map((line) => line.text)
    : reconstructColumnOrder(lines, columnSplit, pageWidth);
  return ordered.join("\n");
}

function hasBrokenTextLayer(text: string): boolean {
  if (text.length < MIN_DIGITAL_TEXT_LENGTH) return true;
  const replacementCharacters = (text.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) ?? []).length;
  const suspiciousSequences = (text.match(/(?:\?{4,}|�{2,}|(?:undefined|NaN){2,})/giu) ?? []).length;
  return replacementCharacters >= 2 || suspiciousSequences >= 1;
}

async function detectPageVisuals(page: pdfjs.PDFPageProxy): Promise<VisualPageReference["kind"] | undefined> {
  const { fnArray } = await page.getOperatorList();
  const imageOperators = new Set<number>([
    pdfjs.OPS.paintImageXObject,
    pdfjs.OPS.paintImageXObjectRepeat,
    pdfjs.OPS.paintInlineImageXObject,
    pdfjs.OPS.paintInlineImageXObjectGroup,
    pdfjs.OPS.paintImageMaskXObject,
    pdfjs.OPS.paintImageMaskXObjectGroup,
  ]);
  if (fnArray.some((operation) => imageOperators.has(operation))) return "image";

  const pathCount = fnArray.filter((operation) => operation === pdfjs.OPS.constructPath).length;
  return pathCount >= 3 ? "graphic" : undefined;
}

async function extractPdf(buffer: Buffer, recognize: ImageRecognizer): Promise<ExtractionResult> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), standardFontDataUrl });
  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new Error(`O PDF pode ter no máximo ${MAX_PDF_PAGES} páginas neste MVP.`);
    }

    const pageContents: PageTextContent[] = [];
    const pages = [];
    const visualPages: VisualPageReference[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      pages.push(page);
      const content = await page.getTextContent();
      const [xMin, yMin, xMax, yMax] = page.view;
      pageContents.push({ items: content.items, width: xMax - xMin, height: yMax - yMin, yMin });
      const visualKind = await detectPageVisuals(page);
      if (visualKind) visualPages.push({ page: pageNumber, kind: visualKind });
    }
    const repeatedArtifacts = findRepeatedPageArtifacts(pageContents);
    const pageTexts: string[] = [];
    let digitalPageCount = 0;
    let ocrPageCount = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = pages[pageNumber - 1]!;
      const { items, width } = pageContents[pageNumber - 1]!;
      const digitalPageText = groupPageText(items, width, repeatedArtifacts);
      if (!hasBrokenTextLayer(digitalPageText)) {
        pageTexts.push(digitalPageText);
        digitalPageCount += 1;
        continue;
      }

      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      await page.render({ canvas: canvas as never, canvasContext: context as never, viewport }).promise;
      const imageText = (await recognize(canvas.toBuffer("image/png"))).trim();
      pageTexts.push(imageText || digitalPageText);
      ocrPageCount += 1;
    }

    const method = ocrPageCount === 0 ? "pdf-text" : digitalPageCount === 0 ? "ocr" : "hybrid";
    return { text: pageTexts.filter(Boolean).join("\n\n"), pageTexts, pages: pdf.numPages, method, visualPages };
  } finally {
    await loadingTask.destroy();
  }
}

async function extractDocument(
  buffer: Buffer,
  mimeType: string,
  recognize: ImageRecognizer = recognizeImage,
): Promise<ExtractionResult> {
  if (mimeType === "application/pdf") return extractPdf(buffer, recognize);
  const text = await recognize(buffer);
  return { text, pageTexts: [text], pages: 1, method: "ocr", visualPages: [{ page: 1, kind: "image" }] };
}

export { extractDocument };
export type { ExtractionResult, VisualPageReference };
