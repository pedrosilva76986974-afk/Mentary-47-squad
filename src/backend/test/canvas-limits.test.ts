import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { assertRenderSize } from "../src/services/canvas-limits.service.js";
import { extractDocument } from "../src/services/document-extraction.service.js";
import { renderSourcePreview } from "../src/services/source-preview.service.js";

test("canvas limits reject pathological dimensions before native allocation", () => {
  assert.doesNotThrow(() => assertRenderSize(5_000, 8_000));
  for (const [width, height] of [
    [0, 1],
    [NaN, 1],
    [Infinity, 1],
    [1.5, 1],
    [10_001, 1],
    [8_000, 8_000],
  ]) {
    assert.throws(() => assertRenderSize(width!, height!), /limite de renderização/);
  }
});

test("oversized scanned PDF pages and tiny crops fail before OCR or full-page canvas allocation", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([20_000, 20_000]);
  const content = Buffer.from(await pdf.save());
  let recognized = false;
  await assert.rejects(
    extractDocument(content, "application/pdf", async () => {
      recognized = true;
      return "unexpected";
    }),
    /limite de renderização/,
  );
  assert.equal(recognized, false);
  await assert.rejects(
    renderSourcePreview(content, "application/pdf", 1, {
      x: 0,
      y: 0,
      width: 0.001,
      height: 0.001,
    }),
    /limite de renderização/,
  );
});
