import assert from "node:assert/strict";
import { hasAlternativeLabelGaps } from "../src/services/question-alternatives.service.js";
import { test } from "node:test";
import { structureQuestion } from "../src/services/question-structure.service.js";
import { parseQuestions } from "../src/services/question-parser.service.js";
import type { ParsedQuestion } from "../src/services/question-parser.service.js";

const questionBase: ParsedQuestion = {
  number: 3,
  text: "03. Sobre hardware? A texto ruidoso B fragmento de outra questão",
  prompt: "Sobre hardware?",
  responseType: "multiple_choice",
  alternatives: [
    { label: "A", text: "Software de sistemas." },
    { label: "B", text: "Software aplicativo." },
    { label: "C", text: "Hardware." },
  ],
  pageStart: 1,
  pageEnd: 1,
  confidence: "medium",
};

test("OCR gaps are flagged without inventing a missing alternative or rejecting reordered labels", () => {
  const alternatives = [{ label: "A", text: "3" }, { label: "C", text: "5" }];
  const result = structureQuestion({ ...questionBase, alternatives, text: "Quanto e 2 + 2? A) 3 C) 5", prompt: "Quanto e 2 + 2?" });
  assert.ok(result.missingComponents?.includes("alternatives"));
  assert.deepEqual(result.alternatives?.map(item => item.label), ["A", "C"]);
  assert.equal(hasAlternativeLabelGaps([{ label: "C" }, { label: "A" }, { label: "B" }]), false);
  assert.equal(hasAlternativeLabelGaps([{ label: "1" }, { label: "3" }]), true);
  assert.equal(hasAlternativeLabelGaps([{ label: "V" }, { label: "F" }]), false);
});

test("question structuring classifies a multiple-choice question and flags its missing answer", () => {
  const result = structureQuestion(questionBase);

  assert.equal(result.prompt, "Sobre hardware?");
  assert.equal(result.responseType, "multiple_choice");
  assert.deepEqual(result.alternatives, questionBase.alternatives);
  assert.deepEqual(result.missingComponents, ["answer"]);
});

test("repairs OCR option labels that look like question numbers without inventing a fourth question", () => {
  const ocrText = [
    "Exercícios de Humor em Diversos Gêneros — Português 9º ano",
    "1) De acordo com as características dos gêneros textuais, marque a alternativa incorreta:",
    "1) Ancdota não é o mesmo que piada.",
    "b) As charges podem conter texto verbal e não verbal.",
    "€) A ancdota serve para descontrair, possui humor e ambiguidade.",
    "d) Os cartuns e charges são gêneros textuais jornalísticos.",
    "2) O pai de Joãozinho fica apavorado quando este lhe mostra o boletim:",
    "-Na minha época, as notas baixas eram punidas com um boa surra - comenta contrafeito,",
    "Legal, pai! Que tal pegarmos o professor na saída amanhã?",
    "O que o pai de Joãozinho quis dizer ao comentar que, em sua época, as notas baixas eram punidas com surras?",
    "a) Quis dizer que o professor merecia uma surra",
    "b) Quis dizer que na sua época ele sempre levava uma surra",
    "€) Quis dizer que Joãozinho merecia uma surra",
    "4) Só quis contar a Joãozinho como era na sua época",
    "3) O garoto apanhou da vizinha, e a mãe furiosa foi tomar satisfação:",
    "-Por que a senhora bateu no meu filho?",
    "Ele foi Mal-educado, e me chamou de gorda.",
    "-E à senhora acha que vai emagrecer batendo nele?",
    "De acordo com as características do texto, a que gênero textual ele pertence?",
    "4) Reportagem, pelo registro impessoal de situações reais.",
    "b) Charge, pelo humor apresentado.",
    "€) Depoimento, pela apresentação de experiências pessoais.",
    "4d) Anedota, pelo enredo e humor característicos.",
    "https://azup.com.br/",
  ].join("\n");

  const questions = parseQuestions([ocrText]).map((question) => structureQuestion(question));

  assert.deepEqual(questions.map((question) => question.number), [1, 2, 3]);
  assert.deepEqual(questions.map((question) => question.alternatives?.map((alternative) => alternative.label)), [
    ["A", "B", "C", "D"],
    ["A", "B", "C", "D"],
    ["A", "B", "C", "D"],
  ]);
  assert.equal(questions[2]?.responseType, "multiple_choice");
  assert.match(questions[2]?.prompt ?? "", /a que gênero textual ele pertence/);
});

