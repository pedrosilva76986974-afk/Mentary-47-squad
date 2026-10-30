import assert from "node:assert/strict";
import { test } from "node:test";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { orderOcrBlocks, prepareImageForOcr } from "../src/services/ocr.service.js";

test("OCR block ordering reads a page header and then each column top to bottom", () => {
  const text = orderOcrBlocks([
    { text: "Questões de Ciências", bbox: { x0: 20, y0: 5, x1: 480, y1: 25 } },
    { text: "Questão 1, coluna esquerda", bbox: { x0: 20, y0: 40, x1: 210, y1: 60 } },
    { text: "continuação da questão 1", bbox: { x0: 20, y0: 70, x1: 220, y1: 90 } },
    { text: "Questão 2, coluna direita", bbox: { x0: 270, y0: 40, x1: 470, y1: 60 } },
    { text: "continuação da questão 2", bbox: { x0: 270, y0: 70, x1: 470, y1: 90 } },
  ]);

  assert.deepEqual(text.split("\n"), [
    "Questões de Ciências",
    "Questão 1, coluna esquerda",
    "continuação da questão 1",
    "Questão 2, coluna direita",
    "continuação da questão 2",
  ]);
});

test("OCR block ordering keeps single-column text in top-to-bottom order", () => {
  const text = orderOcrBlocks([
    { text: "Linha inferior mais longa", bbox: { x0: 10, y0: 100, x1: 300, y1: 120 } },
    { text: "Linha 3", bbox: { x0: 10, y0: 70, x1: 70, y1: 90 } },
    { text: "Linha 2 um pouco maior", bbox: { x0: 10, y0: 40, x1: 210, y1: 60 } },
    { text: "Linha superior", bbox: { x0: 10, y0: 10, x1: 100, y1: 30 } },
  ]);

  assert.equal(text, "Linha superior\nLinha 2 um pouco maior\nLinha 3\nLinha inferior mais longa");
});

test("OCR preprocessing enlarges small images and limits oversized images", async () => {
  const smallImage = createCanvas(400, 600);
  const enlarged = await loadImage(await prepareImageForOcr(smallImage.toBuffer("image/png")));
  assert.equal(enlarged.width, 800);
  assert.equal(enlarged.height, 1200);

  const largeImage = createCanvas(3000, 1500);
  const reduced = await loadImage(await prepareImageForOcr(largeImage.toBuffer("image/png")));
  assert.equal(reduced.width, 2400);
  assert.equal(reduced.height, 1200);
});
