import type { Question } from "../types/review.js";

export type QuestionSource = Pick<Question, "pageStart" | "pageEnd" | "visualReferences">;
export type SourceRegion = NonNullable<NonNullable<Question["visualReferences"]>[number]["region"]>;

/** Replace the primary crop without keeping an obsolete primary reference ahead of it. */
export function applySourceCrop(
  content: QuestionSource,
  page: number,
  pages: number,
  region: SourceRegion,
): QuestionSource {
  const coordinates = [region.x, region.y, region.width, region.height];
  if (!Number.isInteger(page) || page < 1 || page > pages
    || coordinates.some(value => !Number.isFinite(value))
    || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > 1.000001 || region.y + region.height > 1.000001) {
    throw new Error("Informe uma página válida e um recorte dentro dos limites de 0% a 100%.");
  }
  const [primary, ...remaining] = content.visualReferences ?? [];
  return {
    pageStart: page,
    pageEnd: page,
    visualReferences: [
      { page, kind: primary?.kind ?? "graphic", region: { ...region }, association: "manual" },
      ...remaining.filter(reference => reference.page !== page),
    ],
  };
}

