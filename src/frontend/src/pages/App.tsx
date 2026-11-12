import { classificationProgress } from "../utils/classification-progress.js";
import type { Question, ReviewUpdate, UploadResult, Feedback, PedagogicalJob } from "../types/review.js";
import { clearSavedDraft, createQuestionDraft } from "../utils/review-draft.js";
import { PedagogyFields } from "../components/PedagogyFields.js";
import { SiteHeader } from "../components/SiteHeader.js";
import { VisualSourceEditor } from "../components/VisualSourceEditor.js";
import { fillEmptyPedagogy } from "../utils/pedagogy-filling.js";
import { QuestionContentEditor } from "../components/QuestionContentEditor.js";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { getMissingAnswerMessage, getResponseTypeLabel } from "../utils/question-presentation.js";
import { readApiResponse } from "../utils/api-response.js";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const supportedFormats = {
  ".pdf": {
    mime: "application/pdf",
    signature: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  ".png": {
    mime: "image/png",
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  ".jpg": { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  ".jpeg": { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
} as const;

/** Checks the file's extension, browser MIME type, size, and real file signature before upload. */
async function validateFile(file: File): Promise<void> {
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  const format = supportedFormats[extension as keyof typeof supportedFormats];
  if (!format || file.type !== format.mime) {
    throw new Error("Formato não suportado. Escolha um arquivo PDF, PNG, JPG ou JPEG.");
  }
  if (file.size > MAX_FILE_SIZE) throw new Error("O arquivo excede o limite de 20 MB.");

  const bytes = new Uint8Array(await file.slice(0, extension === ".pdf" ? 1024 : 8).arrayBuffer());
  const hasSignature =
    extension === ".pdf"
      ? bytes.some((_, index) => format.signature.every((byte, offset) => bytes[index + offset] === byte))
      : format.signature.every((byte, index) => bytes[index] === byte);
  if (!hasSignature) throw new Error("O conteúdo do arquivo não corresponde à extensão informada.");
}

function errorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return "Falha de conexão. Verifique se o servidor está ativo e tente novamente.";
  }
  return error instanceof Error ? error.message : "Falha no envio. Tente novamente.";
}

function extractionMethodLabel(method: UploadResult["method"]): string {
  if (method === "pdf-text") return "texto do PDF";
  if (method === "hybrid") return "texto do PDF + OCR";
  return "OCR";
}

function durationLabel(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = Math.round(durationMs / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`;
}

function identifierLabel(method: NonNullable<UploadResult["identification"]>["method"]): string {
  if (method === "ollama")
    return "Ollama classificou o tipo; texto e separação vieram do processamento local";
  if (method === "ollama+rules")
    return "Ollama classificou parte das questões; regras locais mantiveram as demais";
  return "Identificador local por regras (Ollama não foi usado)";
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadCancellation = useRef<AbortController | null>(null);
  useEffect(() => () => uploadCancellation.current?.abort(), []);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState(0);
  useEffect(() => setSelectedQuestion(0), [result?.origin.id]);
  const [showUpload, setShowUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showProcessingHint, setShowProcessingHint] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, ReviewUpdate>>({});
  const [savingQuestion, setSavingQuestion] = useState<string | null>(null);
  const [classification, setClassification] = useState<PedagogicalJob | null>(null);
  const [analysisAttempt, setAnalysisAttempt] = useState(0);
  const appliedClassifications = useRef(new Set<string>());
  useEffect(() => {
    if (!result || !classification || classification.stale || classification.version !== 6) return;
    const pending = classification.suggestions.filter(
      (s) =>
        !appliedClassifications.current.has(
          `${result.origin.id}:${classification.sourceHash}:${s.questionId}`,
        ),
    );
    if (!pending.length) return;
    pending.forEach((s) =>
      appliedClassifications.current.add(`${result.origin.id}:${classification.sourceHash}:${s.questionId}`),
    );
    setQuestionDrafts((current) => {
      const next = { ...current };
      for (const suggestion of pending) {
        const question = result.questions.find((q) => q.id === suggestion.questionId);
        if (!question) continue;
        const draft = current[question.id] ?? createQuestionDraft(question);
        if (
          draft.prompt !== (question.prompt ?? question.text) ||
          JSON.stringify(draft.alternatives) !== JSON.stringify(question.alternatives ?? []) ||
          draft.pedagogy.grade !== question.pedagogy?.grade ||
          draft.pedagogy.discipline !== question.pedagogy?.discipline
        )
          continue;
        next[question.id] = {
          ...draft,
          pedagogy: fillEmptyPedagogy(draft.pedagogy, suggestion),
        };
      }
      return next;
    });
  }, [classification, result]);

  useEffect(() => {
    const id = result?.origin.id;
    setClassification(null);
    if (!id || result?.questionCount === 0 || result?.questions.length === 0) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const url = `/documents/${encodeURIComponent(id)}/classification`;
    const poll = async (start = false): Promise<void> => {
      try {
        const response = await fetch(url, {
          method: start ? "POST" : "GET",
          signal: controller.signal,
        });
        if (!start && response.status === 404) {
          await poll(true);
          return;
        }
        const payload = await readApiResponse<PedagogicalJob>(response);
        if (!start && ["completed", "failed"].includes(payload.status) && payload.version !== 6) {
          await poll(true);
          return;
        }
        if (controller.signal.aborted) return;
        setClassification(payload);
        if (["queued", "running"].includes(payload.status)) timer = setTimeout(() => void poll(), 2000);
      } catch (e) {
        if (!controller.signal.aborted)
          setClassification({
            status: "failed",
            suggestions: [],
            error: errorMessage(e),
          });
      }
    };
    void poll(analysisAttempt > 0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [result?.origin.id, analysisAttempt]);

  useEffect(() => {
    const reviewId = new URLSearchParams(window.location.search).get("review");
    if (!reviewId) return;
    let cancelled = false;
    void fetch(`/documents/${encodeURIComponent(reviewId)}/review`)
      .then(async (response) => {
        const payload = await readApiResponse<UploadResult & { sourceText?: string }>(response);

        if (!cancelled) {
          setResult({
            ...payload,
            questionCount: payload.questions.length,
            text: payload.sourceText ?? "",
            reviewUrl: `/documents/${encodeURIComponent(reviewId)}/review`,
            sourceUrl: `/documents/${encodeURIComponent(reviewId)}/source`,
          });
          setFeedback(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setFeedback({ message: errorMessage(error), kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function chooseFile(file: File | undefined): Promise<void> {
    setFeedback(null);
    setResult(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    try {
      await validateFile(file);
      setSelectedFile(file);
    } catch (error) {
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setFeedback({ message: errorMessage(error), kind: "error" });
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    void chooseFile(event.currentTarget.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setDragging(false);
    void chooseFile(event.dataTransfer.files[0]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedFile || busy) return;

    setBusy(true);
    setShowProcessingHint(false);
    setFeedback(null);
    setResult(null);
    const processingHintTimer = window.setTimeout(() => setShowProcessingHint(true), 5000);
    const cancellation = new AbortController();
    uploadCancellation.current = cancellation;
    try {
      const body = new FormData();
      body.append("document", selectedFile);
      const response = await fetch("/documents", {
        method: "POST",
        body,
        signal: cancellation.signal,
      });
      const payload = await readApiResponse<UploadResult>(response);

      cancellation.signal.throwIfAborted();
      setResult(payload);
      setFeedback({
        message: `${payload.message} Origem registrada: ${payload.origin.fileName}.`,
        kind: payload.questionCount > 0 ? "success" : "warning",
      });
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) {
      setFeedback({
        message: cancellation.signal.aborted ? "Envio e processamento cancelados." : errorMessage(error),
        kind: cancellation.signal.aborted ? "warning" : "error",
      });
    } finally {
      uploadCancellation.current = null;
      window.clearTimeout(processingHintTimer);
      setBusy(false);
      setShowProcessingHint(false);
    }
  }

  function questionDraft(question: Question): ReviewUpdate {
    return questionDrafts[question.id] ?? createQuestionDraft(question);
  }

  async function saveQuestion(question: Question, status?: Question["status"]): Promise<void> {
    if (!result || savingQuestion) return;
    const draft = questionDraft(question);
    setSavingQuestion(question.id);
    try {
      const response = await fetch(`${result.reviewUrl}/questions/${encodeURIComponent(question.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          ...(status ? { status } : {}),
        }),
      });
      const payload = await readApiResponse<{
        questions?: Question[];
        publishedQuestionIds?: string[];
      }>(response);

      const classified = classification?.suggestions.find((s) => s.questionId === question.id);
      if (
        draft.prompt !== (question.prompt ?? question.text) ||
        JSON.stringify(draft.alternatives) !== JSON.stringify(question.alternatives ?? []) ||
        (draft.pedagogy.grade !== question.pedagogy?.grade && draft.pedagogy.grade !== classified?.grade) ||
        (draft.pedagogy.discipline !== question.pedagogy?.discipline &&
          draft.pedagogy.discipline !== classified?.discipline)
      ) {
        setClassification((current) => (current ? { ...current, stale: true } : current));
      }
      if (payload.questions)
        setResult((current) =>
          current
            ? {
                ...current,
                questions: payload.questions!,
                publishedQuestionIds: payload.publishedQuestionIds,
              }
            : current,
        );
      setQuestionDrafts((current) => clearSavedDraft(current, question.id, draft));
      setFeedback({
        message:
          status === "approved"
            ? payload.publishedQuestionIds?.includes(question.id)
              ? "Questão aprovada e publicada no banco."
              : "Questão aprovada e salva."
            : status === "rejected"
              ? "Questão rejeitada e salva."
              : status === "pending_review"
                ? "Questão mantida em revisão."
                : "Alterações da questão salvas.",
        kind: "success",
      });
    } catch (error) {
      setFeedback({ message: errorMessage(error), kind: "error" });
    } finally {
      setSavingQuestion(null);
    }
  }

  const progress = classificationProgress(classification, result?.questions.length ?? 0);

  return (
    <div className="page-shell">
      <SiteHeader />

      <main className={`hero-layout${result ? " has-review" : ""}`}>
        <section className="hero-copy" aria-labelledby="page-title">
          <div className="eyebrow">
            <span aria-hidden="true" /> INOVAÇÃO EDUCACIONAL
          </div>
          <h1 id="page-title">
            Seus materiais,
            <br />
            prontos para <span>inovar.</span>
          </h1>
          <p className="intro">
            Envie provas e atividades para transformar conteúdo educacional em novas possibilidades de
            aprendizagem.
          </p>
          <div className="capabilities" aria-label="Recursos de extração">
            <span>
              <b aria-hidden="true">✓</b> Extração de texto
            </span>
            <span>
              <b aria-hidden="true">✓</b> OCR em português
            </span>
          </div>
          <div className="formats-note">
            PDF · PNG · JPG <i aria-hidden="true" /> Arquivos de até 20 MB
          </div>
        </section>

        <section
          className="upload-card"
          aria-labelledby="upload-title"
          hidden={Boolean(result) && !showUpload}
        >
          <div className="card-heading">
            <div className="card-icon" aria-hidden="true">
              <span>↑</span>
            </div>
            <div>
              <p className="card-kicker">NOVO MATERIAL</p>
              <h2 id="upload-title">Enviar documento</h2>
            </div>
          </div>
          <p className="card-intro">Selecione uma prova ou atividade para começar.</p>

          <form onSubmit={handleSubmit}>
            <label
              className={`drop-area${dragging ? " is-dragging" : ""}`}
              htmlFor="document-file"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <span className="file-icon" aria-hidden="true">
                ↑
              </span>
              <span className="drop-title">
                {selectedFile ? "Arquivo selecionado" : "Escolha um arquivo"}
              </span>
              <span className="drop-subtitle">ou clique aqui para procurar no dispositivo</span>
              <input
                ref={fileInput}
                id="document-file"
                name="document"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                onChange={handleFileChange}
              />
            </label>

            {selectedFile && (
              <div className="file-details" role="status">
                {selectedFile.name} · {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            )}
            <button className="submit-button" type="submit" disabled={!selectedFile || busy}>
              {busy ? "Enviando e processando…" : "Enviar material"}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
            {busy && (
              <button
                className="cancel-upload-button"
                type="button"
                onClick={() => uploadCancellation.current?.abort()}
              >
                Cancelar envio e processamento
              </button>
            )}
            {busy && showProcessingHint && (
              <p className="processing-hint" role="status" aria-live="polite">
                Ainda estamos lendo o documento. Arquivos escaneados podem demorar mais. Você pode cancelar o
                processamento a qualquer momento.
              </p>
            )}
          </form>

          {!result && feedback && (
            <div className={`feedback ${feedback.kind}`} role="status" aria-live="polite">
              {feedback.message}
            </div>
          )}
          <p className="privacy-note">
            <span aria-hidden="true">◆</span> O documento é validado antes de ser processado.
          </p>
        </section>

        {result && (
          <section className="review-panel" aria-labelledby="review-title">
            <div className="review-heading">
              <div>
                <p className="card-kicker">ETAPA DE REVISÃO</p>
                <h1 id="review-title">Revisar questões</h1>
                <p className="document-name">{result.origin.fileName}</p>
                <div className="review-progress">
                  <span>{result.questions.filter((q) => q.status === "approved").length} aprovadas</span>
                  <span>
                    {result.questions.filter((q) => q.status === "pending_review").length} em revisão
                  </span>
                  <span>{result.questions.filter((q) => q.status === "rejected").length} rejeitadas</span>
                </div>
                <button
                  className="new-document-button"
                  type="button"
                  onClick={() => setShowUpload((v) => !v)}
                >
                  {showUpload ? "Fechar envio" : "Enviar outro documento"}
                </button>
                <p className="review-summary">
                  {result.questionCount === 0
                    ? "O texto foi extraído, mas não encontramos enunciados com segurança suficiente."
                    : `${result.questionCount} questão(ões) encontradas · ${result.pages} página(s) · extração por ${extractionMethodLabel(result.method)}`}
                </p>
                {result.identification && (
                  <details
                    className={`identification-diagnostic ${result.identification.method === "rules" ? "is-fallback" : ""}`}
                  >
                    <summary>Detalhes do processamento</summary>
                    <strong>{identifierLabel(result.identification.method)}</strong>
                    {result.identification.model && <span>Modelo: {result.identification.model}</span>}
                    <span>
                      Extração PDF/OCR: {durationLabel(result.identification.extractionDurationMs ?? 0)}
                      {result.identification.ollama
                        ? ` · Ollama: ${durationLabel(result.identification.ollama.durationMs)}${result.identification.ollama.loadDurationMs !== undefined ? ` (carregamento ${durationLabel(result.identification.ollama.loadDurationMs)})` : ""}`
                        : ` · Identificação: ${durationLabel(result.identification.durationMs)}`}
                    </span>
                    {result.identification.ollama?.promptTokens !== undefined && (
                      <span>
                        Tokens de entrada: {result.identification.ollama.promptTokens} · Resposta:{" "}
                        {result.identification.ollama.outputTokens ?? 0} tokens
                      </span>
                    )}
                    {result.identification.reason && <span>{result.identification.reason}</span>}
                  </details>
                )}
              </div>
              <span className="review-count" aria-label={`${result.questionCount} questões`}>
                {result.questionCount}
              </span>
            </div>

            {feedback && (
              <div className={`feedback ${feedback.kind}`} role="status">
                {feedback.message}
              </div>
            )}
            {result.questions.length > 0 ? (
              <div className="questions-list">
                <nav className="question-navigation" aria-label="Navegar pelas questões">
                  <button
                    type="button"
                    disabled={selectedQuestion === 0}
                    onClick={() => setSelectedQuestion((n) => n - 1)}
                  >
                    Anterior
                  </button>
                  <label>
                    Questão
                    <select
                      value={selectedQuestion}
                      onChange={(event) => setSelectedQuestion(Number(event.currentTarget.value))}
                    >
                      {result.questions.map((q, i) => (
                        <option key={q.id} value={i}>
                          Questão {q.number ?? i + 1} —{" "}
                          {q.status === "approved"
                            ? "Aprovada"
                            : q.status === "rejected"
                              ? "Rejeitada"
                              : "Em revisão"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>
                    {selectedQuestion + 1} de {result.questions.length}
                  </span>
                  <button
                    type="button"
                    disabled={selectedQuestion === result.questions.length - 1}
                    onClick={() => setSelectedQuestion((n) => n + 1)}
                  >
                    Próxima
                  </button>
                </nav>
                {result.questions
                  .map((question, index) => ({ question, index }))
                  .filter(({ index }) => index === selectedQuestion)
                  .map(({ question, index }) => (
                    <article className="question-item" key={question.id}>
                      <div className="question-meta">
                        <span className="question-label">Questão {question.number ?? index + 1}</span>
                        {questionDrafts[question.id] && (
                          <span className="unsaved-badge">Alterações não salvas</span>
                        )}
                        <span className="question-page">
                          {question.pageStart === null
                            ? "Página desconhecida"
                            : question.pageStart === question.pageEnd
                              ? `Página ${question.pageStart}`
                              : `Páginas ${question.pageStart}–${question.pageEnd}`}
                        </span>
                      </div>
                      <div className="question-columns">
                        <div className="question-content">
                          {result.origin.id && (
                            <VisualSourceEditor
                              documentId={result.origin.id}
                              pages={result.pages}
                              content={questionDraft(question)}
                              onChange={(change) =>
                                setQuestionDrafts((current) => ({
                                  ...current,
                                  [question.id]: {
                                    ...questionDraft(question),
                                    ...change,
                                  },
                                }))
                              }
                            />
                          )}
                          <span className="question-type">{getResponseTypeLabel()}</span>
                          <section className="question-section">
                            <h3>Enunciado</h3>
                            <p className="question-text">{question.prompt ?? question.text}</p>
                            {question.missingComponents?.includes("prompt") && (
                              <p className="question-answer-empty">
                                Enunciado não identificado com segurança; revise o texto completo.
                              </p>
                            )}
                          </section>
                          {question.missingComponents?.some((component) => component !== "prompt") && (
                            <p className="question-answer-empty">
                              {question.missingComponents.includes("alternatives") &&
                                "Alternativas não identificadas. "}
                              {question.missingComponents.includes("answer") &&
                                "Gabarito não identificado no documento."}
                            </p>
                          )}
                          <section className="question-section">
                            <h3>Alternativas</h3>
                            {question.alternatives && question.alternatives.length > 0 ? (
                              <ul className="question-alternatives">
                                {question.alternatives.map((alternative, alternativeIndex) => (
                                  <li key={`${alternative.label}-${alternativeIndex}`}>
                                    <strong>{alternative.label}</strong> {alternative.text}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="question-answer-empty">{getMissingAnswerMessage()}</p>
                            )}
                          </section>
                          <QuestionContentEditor
                            content={questionDraft(question)}
                            onChange={(change) =>
                              setQuestionDrafts((current) => ({
                                ...current,
                                [question.id]: {
                                  ...questionDraft(question),
                                  ...change,
                                },
                              }))
                            }
                          />
                        </div>
                        <aside className="question-inspector" aria-label="Revisão e classificação">
                          <h3>03 · Gabarito e revisão</h3>

                          {question.responseType === "multiple_choice" && (
                            <label className="question-edit-field">
                              <span>Selecione o gabarito</span>
                              <select
                                value={questionDraft(question).answerKey ?? ""}
                                onChange={(event) => {
                                  const value = event.currentTarget.value;
                                  setQuestionDrafts((current) => ({
                                    ...current,
                                    [question.id]: {
                                      ...questionDraft(question),
                                      answerKey: value || null,
                                    },
                                  }));
                                }}
                              >
                                <option value="">Selecione uma alternativa</option>
                                {questionDraft(question).alternatives.map((alternative, alternativeIndex) => (
                                  <option key={alternativeIndex} value={alternative.label}>
                                    {alternative.label} — {alternative.text}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          {question.answerKey && (
                            <p className="question-answer-empty">
                              <strong>Gabarito registrado:</strong> {question.answerKey}
                            </p>
                          )}
                          <details className="question-pedagogy" open>
                            <summary>04 · Classificação pedagógica</summary>
                            <div className="analysis-toolbar" aria-label="Status da classificação pedagógica">
                              <span className="classification-state">{progress.label}</span>
                              <div role="status" aria-live="polite">
                                <p>{progress.message}</p>

                                {(classification?.status === "running" ||
                                  classification?.status === "queued") && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const response = await fetch(
                                          `/documents/${encodeURIComponent(result.origin.id ?? "")}/classification/cancel`,
                                          { method: "POST" },
                                        );
                                        setClassification(await readApiResponse<PedagogicalJob>(response));
                                      } catch (error) {
                                        setClassification((current) => ({
                                          ...current,
                                          status: "failed",
                                          suggestions: current?.suggestions ?? [],
                                          error: errorMessage(error),
                                        }));
                                      }
                                    }}
                                  >
                                    Cancelar classificação
                                  </button>
                                )}

                                {classification?.stale && (
                                  <p>O conteúdo foi alterado após a análise. Solicite uma nova análise.</p>
                                )}
                                <button
                                  type="button"
                                  disabled={
                                    classification?.status === "running" ||
                                    classification?.status === "queued"
                                  }
                                  onClick={() => setAnalysisAttempt((n) => n + 1)}
                                >
                                  Classificar novamente
                                </button>
                              </div>
                            </div>

                            {classification?.suggestions
                              .filter((s) => s.questionId === question.id && s.processingMs !== undefined)
                              .map((s) => (
                                <p className="classification-timing" key={s.questionId}>
                                  Tempo de classificação: {(s.processingMs! / 1000).toFixed(1)} s ·{" "}
                                  {s.targetMet ? "Dentro" : "Acima"} da meta de {(s.targetMs ?? 15000) / 1000}{" "}
                                  s
                                </p>
                              ))}
                            <p className="editor-help">
                              A IA preenche os campos vazios. Confira os dados e salve. BNCC não é preenchida
                              automaticamente.
                            </p>
                            <PedagogyFields
                              pedagogy={questionDraft(question).pedagogy}
                              onChange={(change) =>
                                setQuestionDrafts((current) => {
                                  const draft = current[question.id] ?? createQuestionDraft(question);
                                  return {
                                    ...current,
                                    [question.id]: {
                                      ...draft,
                                      pedagogy: {
                                        ...draft.pedagogy,
                                        ...change,
                                      },
                                    },
                                  };
                                })
                              }
                            />
                          </details>
                          <label className="question-edit-field">
                            <span>Responsável pela revisão</span>
                            <input
                              value={questionDraft(question).reviewedBy}
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setQuestionDrafts((current) => ({
                                  ...current,
                                  [question.id]: {
                                    ...questionDraft(question),
                                    reviewedBy: value,
                                  },
                                }));
                              }}
                              maxLength={120}
                            />
                          </label>
                          {question.status === "approved" && result.publishedQuestionIds && (
                            <p className="editor-help">
                              {result.publishedQuestionIds.includes(question.id)
                                ? "Publicada no banco de questões."
                                : "Esta aprovação antiga tem pendências. Confira enunciado, alternativas, gabarito e responsável antes de salvar."}
                            </p>
                          )}
                          <span className="question-status">
                            {question.status === "approved"
                              ? "Aprovada"
                              : question.status === "rejected"
                                ? "Rejeitada"
                                : "Aguardando revisão"}
                          </span>
                          <div className="question-actions">
                            <button
                              type="button"
                              onClick={() => void saveQuestion(question)}
                              disabled={savingQuestion !== null}
                            >
                              {savingQuestion === question.id ? "Salvando…" : "Salvar alterações"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveQuestion(question, "pending_review")}
                              disabled={savingQuestion !== null}
                            >
                              Manter em revisão
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveQuestion(question, "approved")}
                              disabled={savingQuestion !== null}
                            >
                              Aprovar
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveQuestion(question, "rejected")}
                              disabled={savingQuestion !== null}
                            >
                              Rejeitar
                            </button>
                          </div>
                        </aside>
                      </div>
                    </article>
                  ))}
              </div>
            ) : (
              <p className="no-questions">
                Nenhuma questão foi enviada como válida. Confira o texto extraído ou envie uma versão mais
                nítida e com a numeração das questões visível.
              </p>
            )}

            {result.text && (
              <details className="source-preview">
                <summary>Consultar texto extraído do documento</summary>
                <pre>{result.text}</pre>
              </details>
            )}
          </section>
        )}
      </main>

      <footer>
        <span>MENTARY</span>
        <i aria-hidden="true" /> TECNOLOGIA QUE MOVE A EDUCAÇÃO
      </footer>
    </div>
  );
}

export { App };
