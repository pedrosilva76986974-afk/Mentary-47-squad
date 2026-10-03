const MAX_FILE_SIZE = 20 * 1024 * 1024;
const supported = {
  ".pdf": { mime: "application/pdf", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  ".png": { mime: "image/png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ".jpg": { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  ".jpeg": { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
};

const form = document.querySelector("#upload-form");
const input = document.querySelector("#document-file");
const details = document.querySelector("#file-details");
const submitButton = document.querySelector("#submit-button");
const feedback = document.querySelector("#feedback");
const reviewPanel = document.querySelector("#review-panel");
const reviewSummary = document.querySelector("#review-summary");
const reviewCount = document.querySelector("#review-count");
const questionsList = document.querySelector("#questions-list");
const sourcePreview = document.querySelector("#source-preview");
const sourceText = document.querySelector("#source-text");
const reviewRecordLink = document.querySelector("#review-record-link");

function showFeedback(message, kind) {
  feedback.textContent = message;
  feedback.className = `feedback ${kind}`;
  feedback.hidden = false;
}

function renderReview(result) {
  questionsList.replaceChildren();
  reviewCount.textContent = String(result.questionCount);
  reviewRecordLink.href = result.reviewUrl;
  sourceText.textContent = result.text;
  sourcePreview.hidden = !result.text;

  if (result.questionCount === 0) {
    reviewSummary.textContent = "O texto foi extraído, mas não encontramos enunciados com segurança suficiente.";
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "no-questions";
    emptyMessage.textContent = "Nenhuma questão foi enviada como válida. Confira o texto extraído ou envie uma versão mais nítida e com a numeração das questões visível.";
    questionsList.append(emptyMessage);
  } else {
    reviewSummary.textContent = `${result.questionCount} questão(ões) separadas · ${result.pages} página(s) · extração por ${result.method}`;
    result.questions.forEach((question, index) => {
      const article = document.createElement("article");
      article.className = "question-item";

      const metadata = document.createElement("div");
      metadata.className = "question-meta";
      const label = document.createElement("span");
      label.className = "question-label";
      label.textContent = `Questão ${question.number ?? index + 1}`;
      const page = document.createElement("span");
      page.className = "question-page";
      page.textContent = question.pageStart === question.pageEnd
        ? `Página ${question.pageStart}`
        : `Páginas ${question.pageStart}–${question.pageEnd}`;
      metadata.append(label, page);

      const prompt = document.createElement("p");
      prompt.className = "question-text";
      prompt.textContent = question.text;
      const status = document.createElement("span");
      status.className = "question-status";
      status.textContent = "Aguardando revisão";
      article.append(metadata, prompt, status);
      questionsList.append(article);
    });
  }

  reviewPanel.hidden = false;
  reviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function validateFile(file) {
  const extension = `.${file.name.split(".").pop().toLowerCase()}`;
  const format = supported[extension];
  if (!format || file.type !== format.mime) {
    throw new Error("Formato não suportado. Escolha um arquivo PDF, PNG, JPG ou JPEG.");
  }
  if (file.size > MAX_FILE_SIZE) throw new Error("O arquivo excede o limite de 20 MB.");

  const bytes = new Uint8Array(await file.slice(0, extension === ".pdf" ? 1024 : 8).arrayBuffer());
  const hasSignature = extension === ".pdf"
    ? bytes.some((_, index) => format.signature.every((byte, offset) => bytes[index + offset] === byte))
    : format.signature.every((byte, index) => bytes[index] === byte);
  if (!hasSignature) throw new Error("O conteúdo do arquivo não corresponde à extensão informada.");
}

input.addEventListener("change", async () => {
  feedback.hidden = true;
  reviewPanel.hidden = true;
  submitButton.disabled = true;
  const file = input.files?.[0];
  if (!file) {
    details.hidden = true;
    return;
  }

  details.textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  details.hidden = false;
  try {
    await validateFile(file);
    submitButton.disabled = false;
  } catch (error) {
    input.value = "";
    details.hidden = true;
    showFeedback(error.message, "error");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = input.files?.[0];
  if (!file || submitButton.disabled) return;

  submitButton.disabled = true;
  submitButton.textContent = "Enviando e processando…";
  feedback.hidden = true;
  try {
    const body = new FormData();
    body.append("document", file);
    const response = await fetch("/documents", { method: "POST", body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível enviar o documento.");

    const feedbackKind = result.questionCount > 0 ? "success" : "warning";
    showFeedback(`${result.message} Origem registrada: ${result.origin.fileName}.`, feedbackKind);
    renderReview(result);
    form.reset();
    details.hidden = true;
  } catch (error) {
    const message = error instanceof TypeError
      ? "Falha de conexão. Verifique se o servidor está ativo e tente novamente."
      : error.message || "Falha no envio. Tente novamente.";
    showFeedback(message, "error");
    submitButton.disabled = false;
  } finally {
    submitButton.textContent = "Enviar documento";
  }
});
