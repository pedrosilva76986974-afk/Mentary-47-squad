import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import request from "supertest";
import { createCanvas } from "@napi-rs/canvas";
import { app } from "../src/app.js";
import { extractDocument } from "../src/services/document-extraction.service.js";
import { validateDocument } from "../src/services/document-validation.service.js";
import { parseQuestions } from "../src/services/question-parser.service.js";
import { getReviewResult, saveReviewResult } from "../src/services/review-results.service.js";

const testDirectory = await mkdtemp(join(tmpdir(), "mentary-upload-tests-"));
const registryPath = join(testDirectory, "manifest.json");
process.env.MENTARY_UPLOAD_REGISTRY = registryPath;
process.env.MENTARY_REVIEW_DIRECTORY = join(testDirectory, "reviews");

after(async () => {
  delete process.env.MENTARY_UPLOAD_REGISTRY;
  delete process.env.MENTARY_REVIEW_DIRECTORY;
  await rm(testDirectory, { recursive: true, force: true });
});

async function createPdf(text?: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  if (text) {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText(text, { x: 50, y: 700, size: 12, font });
  }
  return Buffer.from(await pdf.save());
}

test("GET /health reports that the backend is available", async () => {
  const response = await request(app).get("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("GET / serves the document upload screen", async () => {
  const response = await request(app).get("/");
  assert.equal(response.status, 200);
  assert.match(response.text, /id="document-file"/);
  assert.match(response.text, /id="review-panel"/);
  assert.match(response.text, /PDF · PNG · JPG/);
  assert.match(response.text, /src="\/assets\/mentary-logo\.png"/);

  const logo = await request(app).get("/assets/mentary-logo.png");
  assert.equal(logo.status, 200);
  assert.match(logo.headers["content-type"] ?? "", /image\/png/);
});

test("POST /documents extracts text from a digital PDF", async () => {
  const expectedText = "Questão 1: Quanto é 2 + 2? Questão 2: Quanto é 3 + 3?";
  const response = await request(app)
    .post("/documents")
    .attach("document", await createPdf(expectedText), {
      filename: "exam.pdf",
      contentType: "application/pdf",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "pending_review");
  assert.equal(response.body.method, "pdf-text");
  assert.equal(response.body.pages, 1);
  assert.match(response.body.message, /2 questão/);
  assert.equal(response.body.origin.fileName, "exam.pdf");
  assert.match(response.body.origin.sha256, /^[a-f0-9]{64}$/);
  assert.equal(response.body.questionCount, 2);
  assert.match(response.body.questions[0].text, /Quanto é 2 \+ 2\?/);
  assert.equal(response.body.questions[0].status, "pending_review");

  const registry = JSON.parse(await readFile(registryPath, "utf8")) as Array<{ fileName: string }>;
  assert.equal(registry.length, 1);
  assert.equal(registry[0]?.fileName, "exam.pdf");

  const reviewResponse = await request(app).get(response.body.reviewUrl);
  assert.equal(reviewResponse.status, 200);
  assert.equal(reviewResponse.body.documentId, response.body.origin.id);
  assert.equal(reviewResponse.body.questions.length, 2);
  assert.match(reviewResponse.body.sourceText, /Questão 1/);
});

test("POST /documents rejects unsupported file types", async () => {
  const response = await request(app)
    .post("/documents")
    .attach("document", Buffer.from("not a supported document"), {
      filename: "notes.txt",
      contentType: "text/plain",
    });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /Formato inválido/);
  assert.equal(JSON.parse(await readFile(registryPath, "utf8")).length, 1);
});

test("POST /documents rejects a PDF with an invalid body before recording its origin", async () => {
  const response = await request(app)
    .post("/documents")
    .attach("document", Buffer.from("%PDF-this is not a valid PDF"), {
      filename: "spoofed.pdf",
      contentType: "application/pdf",
    });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /corrompido/);
  assert.equal(JSON.parse(await readFile(registryPath, "utf8")).length, 1);
});

test("POST /documents stores an empty review result when no questions are found", async () => {
  const response = await request(app)
    .post("/documents")
    .attach("document", await createPdf("This is explanatory prose with no numbered prompts or direct questions."), {
      filename: "reading.pdf",
      contentType: "application/pdf",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "no_questions");
  assert.equal(response.body.questionCount, 0);
  assert.deepEqual(response.body.questions, []);

  const review = await request(app).get(response.body.reviewUrl);
  assert.equal(review.status, 200);
  assert.equal(review.body.status, "no_questions");
  assert.deepEqual(review.body.questions, []);
});

test("document validation accepts real PNG and JPEG images", async () => {
  const canvas = createCanvas(16, 16);
  await validateDocument({
    originalname: "worksheet.png",
    mimetype: "image/png",
    buffer: canvas.toBuffer("image/png"),
  });
  await validateDocument({
    originalname: "worksheet.jpg",
    mimetype: "image/jpeg",
    buffer: canvas.toBuffer("image/jpeg"),
  });
});

test("POST /documents rejects a missing document", async () => {
  const response = await request(app).post("/documents");
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Envie um arquivo/);
});

test("extractDocument sends scanned PDF pages to OCR", async () => {
  const calls: Buffer[] = [];
  const recognizedText = "Texto reconhecido pelo OCR de teste.";
  const result = await extractDocument(
    await createPdf(),
    "application/pdf",
    async (image) => {
      calls.push(image);
      return recognizedText;
    },
  );

  assert.equal(result.method, "ocr");
  assert.equal(result.pages, 1);
  assert.equal(result.pageTexts.length, 1);
  assert.match(result.text, /Texto reconhecido pelo OCR/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]?.byteLength);
});

test("empty OCR output cannot be saved as a review result", async () => {
  const extraction = await extractDocument(await createPdf(), "application/pdf", async () => "  \n ");
  const origin = {
    id: "00000000-0000-4000-8000-000000000001",
    fileName: "empty-scan.pdf",
    mimeType: "application/pdf",
    size: 100,
    sha256: "a".repeat(64),
    uploadedAt: new Date().toISOString(),
  };

  assert.equal(extraction.text.trim(), "");
  await assert.rejects(saveReviewResult(origin, extraction, []), /Não foi possível reconhecer texto/);
  assert.equal(await getReviewResult(origin.id), undefined);
});

test("question parser separates labeled and numbered questions with page references", () => {
  const questions = parseQuestions([
    "Atividade de matemática\nQuestão 1: Quanto é 2 + 2?\nA) 3\nB) 4\n2. Calcule o dobro de 5.",
    "Continuação da segunda questão.",
  ]);

  assert.equal(questions.length, 2);
  assert.match(questions[0]?.text ?? "", /A\) 3\nB\) 4/);
  assert.equal(questions[0]?.pageStart, 1);
  assert.equal(questions[1]?.pageStart, 1);
  assert.equal(questions[1]?.pageEnd, 2);
});

test("question parser ignores numbered headings without a question prompt", () => {
  const questions = parseQuestions(["1. Objetivos da unidade\n2. Introdução ao conteúdo\nTexto informativo sem enunciados."]);
  assert.deepEqual(questions, []);
});

test("question parser recognizes an unnumbered direct question", () => {
  const questions = parseQuestions(["Qual é a capital do Brasil?"]);
  assert.equal(questions.length, 1);
  assert.equal(questions[0]?.number, null);
});

test("question parser separates consecutive unnumbered direct questions", () => {
  const questions = parseQuestions([
    "Qual é a capital do Brasil?\nQual é o maior rio brasileiro?",
  ]);
  assert.equal(questions.length, 2);
});

test("question parser joins adjacent fragments that repeat the same question number", () => {
  const questions = parseQuestions([
    "Questão 1: Considere o seguinte código. Qual é a complexidade?\nQuestão 1: public class Exemplo { for (int i = 0; i < n; i++) { } } A complexidade é O(n).\nQuestão 2: Qual é a complexidade do algoritmo?\nQuestão 2: public class Exemplo { for (int i = 0; i < n; i++) { for (int j = 0; j < n; j++) { } } } A complexidade é O(n^2).",
  ]);

  assert.equal(questions.length, 2);
  assert.equal(questions[0]?.number, 1);
  assert.match(questions[0]?.text ?? "", /Qual é a complexidade\?/);
  assert.match(questions[0]?.text ?? "", /public class Exemplo/);
  assert.match(questions[0]?.text ?? "", /A complexidade é O\(n\)/);
  assert.equal(questions[1]?.number, 2);
  assert.match(questions[1]?.text ?? "", /public class Exemplo/);
  assert.match(questions[1]?.text ?? "", /O\(n\^2\)/);
});

test("question parser keeps numbered code and inline question references inside the current question", () => {
  const questions = parseQuestions([
    "5) Qual é a complexidade deste código?\nfor (int i = 0; i < n; i += 2) { }\nO laço incrementa de 2 em 2.\n2). Como executa n/2 vezes, a complexidade é O(n).\n6) Analise a complexidade do seguinte algoritmo:\nfor (int i = 0; i < n; i++) { }\n7) Determine a complexidade do próximo algoritmo:\nfor (int i = 0; i < n; i++) { }\n13) Analise a complexidade deste código:\nO comportamento é similar ao da Questão 4, definindo O(n^2).\n14) Determine a complexidade do algoritmo recursivo:\nreturn n * fatorial(n - 1);",
  ]);

  assert.deepEqual(questions.map((question) => question.number), [5, 6, 7, 13, 14]);
  assert.match(questions[0]?.text ?? "", /2\)\. Como executa n\/2 vezes/);
  assert.match(questions[3]?.text ?? "", /Questão 4, definindo O\(n\^2\)/);
});

test("question parser supports a number label on a separate line from its prompt", () => {
  const questions = parseQuestions(["1.\nAssinale a alternativa correta sobre o tema."]);
  assert.equal(questions.length, 1);
  assert.equal(questions[0]?.number, 1);
});

test("question parser recognizes an implementation task and keeps numbered observations with it", () => {
  const questions = parseQuestions([
    "Disciplina: Estrutura de Dados\nLista Duplamente Encadeada\n1) De acordo com as coordenadas passadas em sala de aula, implemente uma estrutura de dados que represente uma Lista Duplamente Encadeada Genérica e que tenha as funcionalidades abaixo:\npublic ListaDuplamenteEncadeada()\nConstrutor padrão;\npublic void adiciona(T elemento, int posicao)\nAdiciona um elemento na posição indicada;",
    "Observações :\n1. Todas as iterações devem ser realizadas com o padrão Iterador existente no projeto;\n2. Tomar os cuidados necessários para inserir e remover corretamente;\n3. Faça tratamento de exceções para todos os métodos.",
  ]);

  assert.equal(questions.length, 1);
  assert.equal(questions[0]?.number, 1);
  assert.equal(questions[0]?.pageStart, 1);
  assert.equal(questions[0]?.pageEnd, 2);
  assert.match(questions[0]?.text ?? "", /implemente uma estrutura de dados/);
  assert.match(questions[0]?.text ?? "", /public void adiciona/);
  assert.match(questions[0]?.text ?? "", /Observações/);
});
