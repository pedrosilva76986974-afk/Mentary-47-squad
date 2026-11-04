import assert from "node:assert/strict";
import { test } from "node:test";
import { groupPageText } from "../src/services/document-extraction.service.js";

test("joins adjacent PDF text fragments inside a word without losing actual spaces", () => {
  const items = [
    { str: "simpli", transform: [1, 0, 0, 10, 0, 100], width: 30, height: 10 },
    { str: "fi", transform: [1, 0, 0, 10, 30, 100], width: 6, height: 10 },
    { str: "cado", transform: [1, 0, 0, 10, 36, 100], width: 25, height: 10 },
    { str: " ", transform: [1, 0, 0, 10, 61, 100], width: 5, height: 10 },
    { str: "de", transform: [1, 0, 0, 10, 66, 100], width: 12, height: 10 },
  ];

  assert.equal(groupPageText(items, 500), "simplificado de");
});

test("filters small right-side category badges aligned with question headings", () => {
  const items = [
    { str: "Questão 2.", transform: [1, 0, 0, 9.5, 30, 100], width: 48, height: 9.5 },
    { str: "Múltipla Escolha - Padrão A-E", transform: [1, 0, 0, 7.5, 430, 101.5], width: 120, height: 7.5 },
  ];

  assert.equal(groupPageText(items, 600), "Questão 2.");
});

test("preserves table cells in row order instead of reading each column vertically", () => {
  const items = [
    { str: "Dispositivo", transform: [1, 0, 0, 9, 20, 100], width: 55, height: 9 },
    { str: "Quantidade", transform: [1, 0, 0, 9, 180, 100], width: 60, height: 9 },
    { str: "Consumo (W)", transform: [1, 0, 0, 9, 330, 100], width: 65, height: 9 },
    { str: "Switch", transform: [1, 0, 0, 9, 20, 80], width: 35, height: 9 },
    { str: "4", transform: [1, 0, 0, 9, 180, 80], width: 5, height: 9 },
    { str: "25", transform: [1, 0, 0, 9, 330, 80], width: 12, height: 9 },
    { str: "Router", transform: [1, 0, 0, 9, 20, 60], width: 35, height: 9 },
    { str: "2", transform: [1, 0, 0, 9, 180, 60], width: 5, height: 9 },
    { str: "60", transform: [1, 0, 0, 9, 330, 60], width: 12, height: 9 },
  ];

  assert.equal(groupPageText(items, 500), "Dispositivo | Quantidade | Consumo (W)\nSwitch | 4 | 25\nRouter | 2 | 60");
});
