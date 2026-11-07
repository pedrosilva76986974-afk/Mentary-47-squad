import assert from "node:assert/strict";
import { test } from "node:test";
import { fillEmptyPedagogy } from "../../frontend/src/utils/pedagogy-filling.js";
test("classification fills empty pedagogy fields without replacing human data", () => {
  const current = { area: "", discipline: "Física", questionType: "", bnccSkills: ["EM13CNT101"], grade: "Ensino Médio" };
  const next = fillEmptyPedagogy(current, { area: "Ciências da Natureza", discipline: "Matemática", questionType: "Múltipla escolha", bnccSkills: ["EF01MA08"] });
  assert.equal(next.area, "Ciências da Natureza");
  assert.equal(next.discipline, "Física");
  assert.equal(next.questionType, "Múltipla escolha");
  assert.deepEqual(next.bnccSkills, ["EM13CNT101"]);
  assert.equal(next.grade, "Ensino Médio");
  assert.equal(current.area, "");
  assert.deepEqual(fillEmptyPedagogy({ bnccSkills: [] }, { bnccSkills: ["EF01MA08"] }).bnccSkills, ["EF01MA08"]);
});
