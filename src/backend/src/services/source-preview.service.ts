import { createCanvas, loadImage } from "@napi-rs/canvas";
import { assertRenderSize } from "./canvas-limits.service.js";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { standardFontDataUrl } from "./pdf-config.js";
import { DocumentValidationError } from "./document-validation.service.js";
export type Region = { x: number; y: number; width: number; height: number };
export function validateRegion(region: Region): void {
  if (!region || [region.x,region.y,region.width,region.height].some(n => typeof n !== "number" || !Number.isFinite(n)) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 || region.x + region.width > 1.000001 || region.y + region.height > 1.000001) throw new DocumentValidationError("O recorte deve ficar dentro da página.");
}
export async function renderSourcePreview(content: Buffer, mimeType: string, page: number, region: Region): Promise<Buffer> {
  validateRegion(region);
  if (!Number.isInteger(page) || page < 1) throw new DocumentValidationError("Página inválida.");
  if (mimeType !== "application/pdf") {
    if (page !== 1) throw new DocumentValidationError("Imagens possuem uma página.");
    const image = await loadImage(content);
    const sourceWidth = image.width * region.width, sourceHeight = image.height * region.height;
    const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    const canvas = createCanvas(Math.max(1, Math.ceil(sourceWidth * scale)), Math.max(1, Math.ceil(sourceHeight * scale)));
    canvas.getContext("2d").drawImage(image, image.width * region.x, image.height * region.y, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    return canvas.toBuffer("image/png");
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(content), standardFontDataUrl });
  try {
    const document = await task.promise;
    if (page > document.numPages) throw new DocumentValidationError("Página fora do documento.");
    const source = await document.getPage(page);
    const unit = source.getViewport({ scale: 1 });
    const viewport = source.getViewport({ scale: Math.min(2, 1600 / Math.max(unit.width * region.width, unit.height * region.height)) });
    assertRenderSize(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const full = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await source.render({ canvas: full as never, canvasContext: full.getContext("2d") as never, viewport }).promise;
    const cropped = createCanvas(Math.max(1, Math.ceil(full.width * region.width)), Math.max(1, Math.ceil(full.height * region.height)));
    cropped.getContext("2d").drawImage(full, full.width * region.x, full.height * region.y, full.width * region.width, full.height * region.height, 0, 0, cropped.width, cropped.height);
    return cropped.toBuffer("image/png");
  } finally { await task.destroy(); }
}
