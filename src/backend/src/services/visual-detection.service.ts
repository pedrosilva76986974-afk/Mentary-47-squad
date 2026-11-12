import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { VisualPageReference } from "./document-extraction.service.js";

/** Visual inspection is optional: a broken image must not discard readable question text. */
export async function detectVisualReference(
  page: Pick<pdfjs.PDFPageProxy, "getOperatorList">,
  pageNumber: number,
  signal?: AbortSignal,
): Promise<VisualPageReference | undefined> {
  signal?.throwIfAborted();
  try {
    const { fnArray } = await page.getOperatorList();
    signal?.throwIfAborted();
    const imageOperators = new Set<number>([
      pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintImageXObjectRepeat,
      pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintInlineImageXObjectGroup,
      pdfjs.OPS.paintImageMaskXObject, pdfjs.OPS.paintImageMaskXObjectGroup,
    ]);
    if (fnArray.some(operation => imageOperators.has(operation))) return { page: pageNumber, kind: "image" };
    if (fnArray.includes(pdfjs.OPS.constructPath)) return { page: pageNumber, kind: "graphic" };
    return undefined;
  } catch {
    signal?.throwIfAborted();
    return {
      page: pageNumber,
      kind: "graphic",
      association: "unconfirmed",
      extractionWarning: "Não foi possível verificar os elementos visuais desta página. Confira o documento original.",
    };
  }
}

