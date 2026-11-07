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
  assert.deepEqual(fillEmptyPedagogy({ bnccSkills: [] }, { bnccSkills: ["EF01MA08"] }).bnccSkills, []);
});

test("classification fills the full form and never introduces BNCC", () => {
  const next = fillEmptyPedagogy({ area: "", difficulty: "unknown" as const }, { area: "Matemática", grade: "", topic: "Adição", descriptor: "Somar números", difficulty: "easy", bnccSkills: ["INVALID"] });
  assert.equal(next.topic, "Adição"); assert.equal(next.descriptor, "Somar números"); assert.equal(next.difficulty, "easy"); assert.equal(next.grade, ""); assert.equal(next.bnccSkills, undefined);
  assert.equal(fillEmptyPedagogy({ difficulty: "hard" }, { difficulty: "easy" }).difficulty, "hard");
});
