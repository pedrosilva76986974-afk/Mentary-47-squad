import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuestions } from "../src/services/question-parser.service.js";
import { QuestionParsingSession } from "../src/services/question-parser-session.service.js";

test("parser session keeps a question open across pages and finalizes its page range", () => {
  const session = new QuestionParsingSession();
  session.addLine("Questão 1: Qual é a ideia principal?", 1);
  session.addLine("Texto de apoio que continua na página seguinte.", 2);

  assert.deepEqual(session.finish(), [{
    number: 1,
    text: "Qual é a ideia principal?\nTexto de apoio que continua na página seguinte.",
    pageStart: 1,
    pageEnd: 2,
    confidence: "high",
  }]);
});

test("parser session ignores cover instructions until a real question marker appears", () => {
  const session = new QuestionParsingSession();
  session.addLine("LEIA ATENTAMENTE AS INSTRUÇÕES SEGUINTES:", 1);
  session.addLine("8. Entregue o caderno ao aplicador.", 1);
  session.addLine("9. Você poderá sair depois de duas horas.", 1);
  session.addLine("QUESTÃO 01", 1);
  session.addLine("Explique a ideia principal.", 1);

  const [question] = session.finish();
  assert.equal(question?.number, 1);
  assert.equal(question?.text, "Explique a ideia principal.");
});

test("parser session attaches a support passage to the following numbered question", () => {
  const session = new QuestionParsingSession();
  session.addLine("Questão 6: A sequência correta é:", 2);
  session.addLine("A) V - F - V - F B) F - V - V - V", 2);
  session.addLine("Texto para a questão 7:", 2);
  session.addLine("Leia o trecho e observe a ideia principal.", 2);
  session.addLine("Questão 7. No trecho, a que termo se refere?", 2);

  const questions = session.finish();
  assert.deepEqual(questions.map((question) => question.number), [6, 7]);
  assert.equal(questions[0]?.text, "A sequência correta é:\nA) V - F - V - F B) F - V - V - V");
  assert.match(questions[1]?.text ?? "", /Texto para a questão 7:[\s\S]*Leia o trecho/);
  assert.match(questions[1]?.text ?? "", /No trecho, a que termo se refere/);
});

test("page text does not split a support reference into the previous question", () => {
  const questions = parseQuestions([[
    "Questão 6. A sequência correta é:",
    "A) V - F - V - F B) F - V - V - V",
    "Texto para a questão 7:",
    "Leia o trecho e observe a ideia principal.",
    "Questão 7. No trecho, a que termo se refere?",
  ].join("\n")]);

  assert.deepEqual(questions.map((question) => question.number), [6, 7]);
  assert.doesNotMatch(questions[0]?.text ?? "", /Texto para a/);
  assert.match(questions[1]?.text ?? "", /Texto para a questão 7:[\s\S]*Leia o trecho/);
});
