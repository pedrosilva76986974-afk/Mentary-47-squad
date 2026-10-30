import assert from "node:assert/strict";
import { test } from "node:test";
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
