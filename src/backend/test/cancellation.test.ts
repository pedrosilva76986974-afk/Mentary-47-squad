import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { extractDocument } from "../src/services/document-extraction.service.js";

test("cancellation stops OCR wait and prevents processing the next PDF page", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
  const cancellation = new AbortController();
  let calls = 0;
  const operation = extractDocument(Buffer.from(await pdf.save()), "application/pdf", async (_image, signal) => {
    calls++;
    assert.equal(signal, cancellation.signal);
    cancellation.abort();
    return new Promise<string>(() => {});
  }, cancellation.signal);
  await assert.rejects(operation, e => (e as Error).name === "AbortError");
  assert.equal(calls, 1);
});
test("already cancelled extraction does not start recognition", async () => {
  const cancellation = new AbortController(); cancellation.abort();
  let called = false;
  await assert.rejects(extractDocument(Buffer.alloc(0), "image/png", async () => { called = true; return "text"; }, cancellation.signal));
  assert.equal(called, false);
});
