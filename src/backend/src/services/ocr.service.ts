import { createWorker } from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const MAX_OCR_IMAGE_SIDE = 2_400;
const MAX_UPSCALE = 2;

let workerPromise: ReturnType<typeof createWorker> | undefined;

async function prepareImageForOcr(image: Buffer): Promise<Buffer> {
  const raster = await loadImage(image);
  const longestSide = Math.max(raster.width, raster.height);
  const scale = Math.min(MAX_UPSCALE, MAX_OCR_IMAGE_SIDE / longestSide);
  if (scale === 1) return image;

  const width = Math.round(raster.width * scale);
  const height = Math.round(raster.height * scale);
  const canvas = createCanvas(width, height);
  canvas.getContext("2d").drawImage(raster, 0, 0, width, height);
  return canvas.toBuffer("image/png");
}

type OcrBlock = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

function orderOcrBlocks(blocks: OcrBlock[] | null | undefined): string {
  const validBlocks = (blocks ?? []).filter((block) => block.text.trim()
    && Number.isFinite(block.bbox?.x0) && Number.isFinite(block.bbox?.y0)
    && Number.isFinite(block.bbox?.x1) && Number.isFinite(block.bbox?.y1))
    .map((block) => ({ text: block.text.trim(), ...block.bbox }))
    .sort((left, right) => left.y0 - right.y0 || left.x0 - right.x0);

  if (validBlocks.length === 0) return "";
  const pageWidth = Math.max(...validBlocks.map((block) => block.x1));
  const narrowBlocks = validBlocks.filter((block) => block.x1 - block.x0 < pageWidth * 0.72);
  const centers = narrowBlocks.map((block) => (block.x0 + block.x1) / 2).sort((left, right) => left - right);
  let split: number | undefined;
  let largestGap = pageWidth * 0.1;
  for (let index = 1; index < centers.length; index += 1) {
    const gap = centers[index]! - centers[index - 1]!;
    const candidate = (centers[index]! + centers[index - 1]!) / 2;
    const leftCount = narrowBlocks.filter((block) => block.x1 <= candidate).length;
    const rightCount = narrowBlocks.filter((block) => block.x0 >= candidate).length;
    const crossingCount = narrowBlocks.filter((block) => block.x0 < candidate && block.x1 > candidate).length;
    if (gap > largestGap && leftCount >= 2 && rightCount >= 2 && crossingCount <= 1) {
      split = candidate;
      largestGap = gap;
    }
  }

  if (split === undefined) return validBlocks.map((block) => block.text).join("\n");

  const spanningBlocks = validBlocks.filter((block) => block.x0 < split && block.x1 > split);
  const leftBlocks = validBlocks.filter((block) => block.x1 <= split);
  const rightBlocks = validBlocks.filter((block) => block.x0 >= split);
  const ordered: string[] = [];
  let upperY = Number.NEGATIVE_INFINITY;
  const appendBand = (lowerY: number): void => {
    ordered.push(...leftBlocks.filter((block) => block.y0 >= upperY && block.y0 < lowerY).sort((a, b) => a.y0 - b.y0).map((block) => block.text));
    ordered.push(...rightBlocks.filter((block) => block.y0 >= upperY && block.y0 < lowerY).sort((a, b) => a.y0 - b.y0).map((block) => block.text));
  };
  for (const block of spanningBlocks.sort((left, right) => left.y0 - right.y0)) {
    appendBand(block.y0);
    ordered.push(block.text);
    upperY = block.y1;
  }
  appendBand(Number.POSITIVE_INFINITY);
  return ordered.join("\n");
}

async function recognizeImage(image: Buffer): Promise<string> {
  workerPromise ??= createWorker("por");
  const worker = await workerPromise;
  const preparedImage = await prepareImageForOcr(image);
  const result = await worker.recognize(preparedImage, {}, { text: true, blocks: true });
  return orderOcrBlocks(result.data.blocks) || result.data.text.trim();
}

export { orderOcrBlocks, prepareImageForOcr, recognizeImage };
