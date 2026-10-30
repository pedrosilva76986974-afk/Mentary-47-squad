import assert from "node:assert/strict";
import { after, test } from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import request from "supertest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { app } from "../src/app.js";
import { extractDocument } from "../src/services/document-extraction.service.js";
import { prepareImageForOcr } from "../src/services/ocr.service.js";
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

test("GET / serves the built React frontend", { skip: !existsSync(new URL("../public/index.html", import.meta.url)) }, async () => {
  const response = await request(app).get("/");
  assert.equal(response.status, 200);
  assert.match(response.text, /id="root"/);
  assert.match(response.text, /type="module"/);
  assert.match(response.text, /Mentary/);

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
  assert.ok(["rules", "ollama", "ollama+rules"].includes(response.body.identification.method));
  assert.equal(typeof response.body.identification.durationMs, "number");
  assert.equal(typeof response.body.identification.extractionDurationMs, "number");
  assert.match(response.body.questions[0].text, /Quanto é 2 \+ 2\?/);
  assert.equal(response.body.questions[0].status, "pending_review");

  const sourceResponse = await request(app).get(`/documents/${response.body.origin.id}/source`);
  assert.equal(sourceResponse.status, 200);
  assert.match(sourceResponse.headers["content-type"] ?? "", /application\/pdf/);
  assert.match(sourceResponse.headers["content-disposition"] ?? "", /inline/);
  assert.equal(sourceResponse.body.subarray(0, 5).toString("ascii"), "%PDF-");

  const registry = JSON.parse(await readFile(registryPath, "utf8")) as Array<{ fileName: string }>;
  assert.equal(registry.length, 1);
  assert.equal(registry[0]?.fileName, "exam.pdf");

  const reviewResponse = await request(app).get(response.body.reviewUrl);
  assert.equal(reviewResponse.status, 200);
  assert.equal(reviewResponse.body.documentId, response.body.origin.id);
  assert.equal(reviewResponse.body.questions.length, 2);
  assert.match(reviewResponse.body.sourceText, /Questão 1/);
  assert.deepEqual(reviewResponse.body.identification, response.body.identification);
});

test("PATCH review question saves edits, answer key, and review status", async () => {
  const upload = await request(app)
    .post("/documents")
    .attach("document", await createPdf("Questão 1: Quanto é 2 + 2? A) 3 B) 4"), {
      filename: "editable-exam.pdf",
      contentType: "application/pdf",
    });
  const question = upload.body.questions[0] as { id: string };

  const update = await request(app)
    .patch(`/documents/${upload.body.origin.id}/review/questions/${question.id}`)
    .send({
      prompt: "Quanto é 2 + 2? (revisto)",
      alternatives: [{ label: "A", text: "3" }, { label: "B", text: "4" }],
      answerKey: "B",
      pedagogy: { discipline: "Matemática", grade: "8º ano", topic: "Adição", bnccSkills: ["EF08MA01"], descriptor: "D1", difficulty: "easy" },
      status: "approved",
      reviewedBy: "Professora Ana",
    });

  assert.equal(update.status, 200);
  assert.equal(update.body.questions[0].prompt, "Quanto é 2 + 2? (revisto)");
  assert.equal(update.body.questions[0].answerKey, "B");
  assert.equal(update.body.questions[0].status, "approved");
  assert.equal(update.body.questions[0].reviewedBy, "Professora Ana");
  assert.deepEqual(update.body.questions[0].pedagogy.bnccSkills, ["EF08MA01"]);

  const persisted = await request(app).get(upload.body.reviewUrl);
  assert.equal(persisted.body.questions[0].alternatives[1].text, "4");
  assert.equal(persisted.body.questions[0].answerKey, "B");
  assert.equal(persisted.body.questions[0].status, "approved");
  assert.equal(persisted.body.questions[0].pedagogy.discipline, "Matemática");
});

test("PATCH review question rejects approval of multiple choice without an answer key", async () => {
  const upload = await request(app)
    .post("/documents")
    .attach("document", await createPdf("Questão 1: Quanto é 2 + 2? A) 3 B) 4"), {
      filename: "missing-answer-key.pdf",
      contentType: "application/pdf",
    });
  const question = upload.body.questions[0] as { id: string };

  const update = await request(app)
    .patch(`/documents/${upload.body.origin.id}/review/questions/${question.id}`)
    .send({ status: "approved" });

  assert.equal(update.status, 400);
  assert.match(update.body.error, /Defina o gabarito/);
});

test("review requires a reviewer and a valid alternative before approval, and can reopen the question", async () => {
  const upload = await request(app)
    .post("/documents")
    .attach("document", await createPdf("Questão 1: Quanto é 2 + 2? A) 3 B) 4"), {
      filename: "approval-workflow.pdf",
      contentType: "application/pdf",
    });
  const { id: documentId } = upload.body.origin as { id: string };
  const { id: questionId } = upload.body.questions[0] as { id: string };
  const reviewUrl = `/documents/${documentId}/review/questions/${questionId}`;

  const missingReviewer = await request(app).patch(reviewUrl).send({ answerKey: "B", status: "approved" });
  assert.equal(missingReviewer.status, 400);
  assert.match(missingReviewer.body.error, /responsável/);

  const invalidKey = await request(app).patch(reviewUrl).send({
    answerKey: "Z",
    reviewedBy: "Professora Ana",
    status: "approved",
  });
  assert.equal(invalidKey.status, 400);
  assert.match(invalidKey.body.error, /alternativa existente/);

  const savedInvalidKey = await request(app).patch(reviewUrl).send({ answerKey: "Z" });
  assert.equal(savedInvalidKey.status, 200);
  assert.ok(savedInvalidKey.body.questions[0].missingComponents.includes("answer"));

  const approved = await request(app).patch(reviewUrl).send({
    answerKey: "B",
    reviewedBy: "Professora Ana",
    status: "approved",
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.questions[0].status, "approved");
  assert.equal(approved.body.questions[0].reviewedBy, "Professora Ana");
  assert.deepEqual(approved.body.questions[0].missingComponents, []);

  const reopened = await request(app).patch(reviewUrl).send({ status: "pending_review" });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.questions[0].status, "pending_review");
});

test("POST /documents rejects unsupported file types", async () => {
  const originCount = JSON.parse(await readFile(registryPath, "utf8")).length as number;
  const response = await request(app)
    .post("/documents")
    .attach("document", Buffer.from("not a supported document"), {
      filename: "notes.txt",
      contentType: "text/plain",
    });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /Formato inválido/);
  assert.equal(JSON.parse(await readFile(registryPath, "utf8")).length, originCount);
});

test("POST /documents rejects a PDF with an invalid body before recording its origin", async () => {
  const originCount = JSON.parse(await readFile(registryPath, "utf8")).length as number;
  const response = await request(app)
    .post("/documents")
    .attach("document", Buffer.from("%PDF-this is not a valid PDF"), {
      filename: "spoofed.pdf",
      contentType: "application/pdf",
    });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /corrompido/);
  assert.equal(JSON.parse(await readFile(registryPath, "utf8")).length, originCount);
});

test("POST /documents rolls back the origin if the review result cannot be saved", async () => {
  const originalReviewDirectory = process.env.MENTARY_REVIEW_DIRECTORY;
  process.env.MENTARY_REVIEW_DIRECTORY = registryPath;
  const originalRecordCount = JSON.parse(await readFile(registryPath, "utf8")).length as number;

  try {
    const response = await request(app)
      .post("/documents")
      .attach("document", await createPdf("Questão 1: Quanto é 2 + 2? Explique o seu raciocínio."), {
        filename: "review-save-failure.pdf",
        contentType: "application/pdf",
      });

    assert.equal(response.status, 500);
    assert.equal(JSON.parse(await readFile(registryPath, "utf8")).length, originalRecordCount);
  } finally {
    if (originalReviewDirectory === undefined) delete process.env.MENTARY_REVIEW_DIRECTORY;
    else process.env.MENTARY_REVIEW_DIRECTORY = originalReviewDirectory;
  }
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

test("image extraction records the original image as a visual reference", async () => {
  const canvas = createCanvas(80, 80);
  const result = await extractDocument(canvas.toBuffer("image/png"), "image/png", async () => "Questão 1: Texto reconhecido.");

  assert.deepEqual(result.visualPages, [{ page: 1, kind: "image" }]);
});

test("PDF extraction reads two-column pages from top to bottom in each column", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const [text, x, y] of [
    ["Questão 1: prompt da coluna esquerda", 50, 700],
    ["continuação da primeira questão", 50, 680],
    ["Alternativa A da questão 1", 50, 660],
    ["Questão 2: prompt da coluna direita", 330, 700],
    ["continuação da segunda questão", 330, 680],
    ["Alternativa A da questão 2", 330, 660],
  ] as Array<[string, number, number]>) {
    page.drawText(text, { x, y, size: 12, font });
  }

  const result = await extractDocument(Buffer.from(await pdf.save()), "application/pdf", async () => {
    assert.fail("Uma página com camada de texto válida não deve acionar OCR.");
  });

  assert.equal(result.method, "pdf-text");
  assert.ok(result.text.indexOf("Questão 1") < result.text.indexOf("Questão 2"));
  assert.ok(result.text.indexOf("Alternativa A da questão 1") < result.text.indexOf("Questão 2"));
  assert.ok(result.text.indexOf("Questão 2") < result.text.indexOf("Alternativa A da questão 2"));
});

test("PDF extraction removes repeated header artifacts while keeping page questions", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) {
    const page = pdf.addPage([612, 792]);
    page.drawText("MARCA D AGUA DO SIMULADO 2026", { x: 50, y: 770, size: 9, font });
    page.drawText(`Questão ${pageNumber}: este é um enunciado de teste válido e completo para esta página.`, {
      x: 50, y: 650, size: 12, font,
    });
  }

  const result = await extractDocument(Buffer.from(await pdf.save()), "application/pdf", async () => {
    assert.fail("Páginas com camada de texto válida não devem acionar OCR.");
  });

  assert.doesNotMatch(result.text, /MARCA D AGUA/);
  assert.match(result.pageTexts[0] ?? "", /Questão 1/);
  assert.match(result.pageTexts[1] ?? "", /Questão 2/);
  assert.match(result.pageTexts[2] ?? "", /Questão 3/);
});

test("PDF extraction uses OCR when the digital text layer is corrupted", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("undefinedundefinedundefined conteúdo corrompido suficiente para não parecer uma página escaneada", {
    x: 50, y: 700, size: 12, font,
  });
  let ocrCalls = 0;

  const result = await extractDocument(Buffer.from(await pdf.save()), "application/pdf", async () => {
    ocrCalls += 1;
    return "Texto recuperado por OCR.";
  });

  assert.equal(result.method, "ocr");
  assert.equal(ocrCalls, 1);
  assert.equal(result.pageTexts[0], "Texto recuperado por OCR.");
});

test("PDF extraction detects vector graphics for reviewer confirmation", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Questão 1: Analise o gráfico e responda à pergunta.", { x: 50, y: 700, size: 12, font });
  page.drawLine({ start: { x: 100, y: 400 }, end: { x: 300, y: 400 }, thickness: 2 });
  page.drawLine({ start: { x: 100, y: 400 }, end: { x: 100, y: 550 }, thickness: 2 });
  page.drawLine({ start: { x: 100, y: 450 }, end: { x: 300, y: 450 }, thickness: 1 });

  const result = await extractDocument(Buffer.from(await pdf.save()), "application/pdf", async () => {
    assert.fail("O texto digital válido não deve acionar OCR.");
  });

  assert.deepEqual(result.visualPages, [{ page: 1, kind: "graphic" }]);
});

test("extractDocument runs OCR only on scanned pages in a mixed PDF", async () => {
  const pdf = await PDFDocument.create();
  const textPage = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const digitalText = "Esta página possui texto digital suficiente para a extração direta.";
  textPage.drawText(digitalText, { x: 50, y: 700, size: 12, font });

  const scannedPage = pdf.addPage([612, 792]);
  const scanCanvas = createCanvas(100, 100);
  const scan = await pdf.embedPng(scanCanvas.toBuffer("image/png"));
  scannedPage.drawImage(scan, { x: 50, y: 500, width: 100, height: 100 });

  const calls: Buffer[] = [];
  const result = await extractDocument(Buffer.from(await pdf.save()), "application/pdf", async (image) => {
    calls.push(image);
    return "Questão reconhecida na página escaneada.";
  });

  assert.equal(result.method, "hybrid");
  assert.equal(result.pages, 2);
  assert.equal(result.pageTexts.length, 2);
  assert.match(result.pageTexts[0] ?? "", /texto digital suficiente/);
  assert.equal(result.pageTexts[1], "Questão reconhecida na página escaneada.");
  assert.match(result.text, /texto digital suficiente/);
  assert.match(result.text, /Questão reconhecida na página escaneada/);
  assert.equal(calls.length, 1);
  assert.deepEqual(result.visualPages, [{ page: 2, kind: "image" }]);
});

test("OCR preprocessing enlarges small images to improve text recognition", async () => {
  const canvas = createCanvas(400, 600);
  const prepared = await prepareImageForOcr(canvas.toBuffer("image/png"));
  const image = await loadImage(prepared);
  assert.equal(image.width, 800);
  assert.equal(image.height, 1200);
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

test("question parser handles noisy OCR across a worksheet and keeps subquestions together", () => {
  const questions = parseQuestions([
    [
      "DASAAAAAAAAAAAAAAAAAAAAARAAAAAAADARAAAAAAAANARARB",
      "3 Boicucanga ?",
      "* Lista de Exercícios — 8 ano- Matemática VC",
      "y 1) Resolva as equações à seguir:",
      "a) 18x - 43 = 65",
      "b) 23x - 16 = 14 - 17x",
      "2) Determine um número real a para que as expressões sejam iguais.",
      "3) Resolver as seguintes equações (na incógnita x):",
      "a) 5x - 2 = 1/4(x + 0)",
      "4) Determine o valor de x na equação a seguir aplicando técnicas resolutivas.",
      "5) Qual é a raiz da equação 7x - 2 = -4x + 5?",
      "6) Resolva as Equações em R",
      "a) 2x + 6 = x + 18",
      "b) 5x - 3 = 2x + 9",
      "c) 3(2x - 3) + 2(x + 1) = 3x + 18",
      "d) 2x + 3(x - 5) = 4x + 9",
      "e) (2x + 1) - 3(2x - 5) = 6x - 3",
      "f) 3x - 5 = x - 2",
      "g) 3x - 5 = 13",
      "h) 3x + 5 = 2",
      "i) x - (2x - 1) = 23",
      "j) 2x - (x - 1) = 5 - (x - 3)",
    ].join("\n"),
  ]);

  assert.deepEqual(questions.map((question) => question.number), [1, 2, 3, 4, 5, 6]);
  assert.doesNotMatch(questions[0]?.text ?? "", /Boicucanga|Lista de Exercícios/);
  assert.equal((questions[5]?.text.match(/(?:^|\n)[a-j]\)/gi) ?? []).length, 10);
});

test("question parser ignores numbered headings without a question prompt", () => {
  const questions = parseQuestions(["1. Objetivos da unidade\n2. Introdução ao conteúdo\nTexto informativo sem enunciados."]);
  assert.deepEqual(questions, []);
});

test("question parser ignores numbered exam instructions on the cover and resumes at actual question markers", () => {
  const questions = parseQuestions([
    "LEIA ATENTAMENTE AS INSTRUÇÕES SEGUINTES:\n1. Este caderno contém 90 questões.\n8. Quando terminar a prova, entregue o caderno.\n9. Você poderá deixar o local após duas horas.\nQUESTÃO 01\nQual ideia é apresentada no texto?\nA) Uma opção\nB) Outra opção\nQUESTÃO 02\nExplique a conclusão do autor.",
  ]);

  assert.deepEqual(questions.map((question) => question.number), [1, 2]);
  assert.doesNotMatch(questions[0]?.text ?? "", /entregue o caderno|deixar o local/);
});

test("question parser starts the next numbered question even when OCR drops its question verb", () => {
  const questions = parseQuestions([
    "02. Numa sala há 100 pessoas, das quais 97 são homens. Quantos devem sair?\na)2\nb)5\n03. Um comerciante resolve aumentar em 20% o preço dos produtos.",
  ]);
  assert.deepEqual(questions.map((question) => question.number), [2, 3]);
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

test("question parser keeps Java class names such as Questao1 inside the exercise code", () => {
  const questions = parseQuestions([
    "Questão 1: Analise a complexidade.\npublic class Questao1 {\npublic static void main(String[] args) {\n}\n}",
  ]);
  assert.equal(questions.length, 1);
  assert.match(questions[0]?.text ?? "", /public class Questao1/);
});

test("question parser keeps numbered code and inline question references inside the current question", () => {
  const questions = parseQuestions([
    "5) Qual é a complexidade deste código?\nfor (int i = 0; i < n; i += 2) { }\nO laço incrementa de 2 em 2.\n2). Como executa n/2 vezes, a complexidade é O(n).\n6) Analise a complexidade do seguinte algoritmo:\nfor (int i = 0; i < n; i++) { }\n7) Determine a complexidade do próximo algoritmo:\nfor (int i = 0; i < n; i++) { }\n8) Determine a complexidade do próximo algoritmo:\nfor (int i = 0; i < n; i++) { }\n9) Determine a complexidade do próximo algoritmo:\nfor (int i = 0; i < n; i++) { }\n10) Determine a complexidade do próximo algoritmo:\nfor (int i = 0; i < n; i++) { }\n11) Determine a complexidade do próximo algoritmo:\nfor (int i = 0; i < n; i++) { }\n12) Determine a complexidade do próximo algoritmo:\nfor (int i = 0; i < n; i++) { }\n13) Analise a complexidade deste código:\nO comportamento é similar ao da Questão 4, definindo O(n^2).\n14) Determine a complexidade do algoritmo recursivo:\nreturn n * fatorial(n - 1);",
  ]);

  assert.deepEqual(questions.map((question) => question.number), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.match(questions[0]?.text ?? "", /2\)\. Como executa n\/2 vezes/);
  assert.match(questions[8]?.text ?? "", /Questão 4, definindo O\(n\^2\)/);
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
