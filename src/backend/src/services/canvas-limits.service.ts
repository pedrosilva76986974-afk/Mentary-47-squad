import { DocumentProcessingError } from "./document-processing-error.js";

/** Bound native canvas allocation before rendering a PDF page or its preview. */
export function assertRenderSize(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 10_000 ||
    height > 10_000 ||
    width * height > 40_000_000
  ) {
    throw new DocumentProcessingError(
      "A página excede o limite de renderização: 10.000 pixels por lado e 40 milhões de pixels.",
    );
  }
}
