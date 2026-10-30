import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { getMissingAnswerMessage, getResponseTypeLabel } from "../utils/question-presentation.js";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const supportedFormats = {
  ".pdf": { mime: "application/pdf", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  ".png": { mime: "image/png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  ".jpg": { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  ".jpeg": { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
} as const;

type Question = {
  id: string;
  number: number | null;
  text: string;
  prompt?: string;
  answer?: string | null;
  answerKey?: string | null;
  responseType?: "open" | "multiple_choice" | "mixed" | "unknown";
  alternatives?: Array<{ label: string; text: string }>;
  pedagogy?: {
    discipline?: string;
    grade?: string;
    topic?: string;
    bnccSkills?: string[];
    descriptor?: string;
    difficulty?: "easy" | "medium" | "hard" | "unknown";
  };
  missingComponents?: Array<"prompt" | "alternatives" | "answer">;
  pageStart: number;
  pageEnd: number;
  status: "pending_review" | "approved" | "rejected";
  reviewedBy?: string | null;
  visualReferences?: Array<{ page: number; kind: "image" | "graphic" }>;
};

type ReviewUpdate = { prompt: string; alternatives: Array<{ label: string; text: string }>; answerKey: string | null; pedagogy: NonNullable<Question["pedagogy"]>; reviewedBy: string; status?: Question["status"] };

type UploadResult = {
  status: "pending_review" | "no_questions";
  message: string;
  origin: { fileName: string; id?: string; mimeType?: string };
  pages: number;
  method: "pdf-text" | "ocr" | "hybrid";
  text: string;
  questionCount: number;
  questions: Question[];
  reviewUrl: string;
  sourceUrl?: string;
  identification?: {
    method: "ollama" | "ollama+rules" | "rules";
    model?: string;
    reason?: string;
    durationMs: number;
    localParserMs: number;
    extractionDurationMs?: number;
    ollama?: { durationMs: number; loadDurationMs?: number; promptTokens?: number; outputTokens?: number };
  };
};

type Feedback = { message: string; kind: "success" | "warning" | "error" };

/** Checks the file's extension, browser MIME type, size, and real file signature before upload. */
async function validateFile(file: File): Promise<void> {
  const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  const format = supportedFormats[extension as keyof typeof supportedFormats];
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
  if (method === "ollama") return "Ollama classificou o tipo; texto e separação vieram do processamento local";
  if (method === "ollama+rules") return "Ollama classificou parte das questões; regras locais mantiveram as demais";
  return "Identificador local por regras (Ollama não foi usado)";
}

function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showProcessingHint, setShowProcessingHint] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, ReviewUpdate>>({});
  const [savingQuestion, setSavingQuestion] = useState<string | null>(null);

  useEffect(() => {
    const reviewId = new URLSearchParams(window.location.search).get("review");
    if (!reviewId) return;
    let cancelled = false;
    void fetch(`/documents/${encodeURIComponent(reviewId)}/review`)
      .then(async (response) => {
        const payload = await response.json() as UploadResult & { sourceText?: string; error?: string };
        if (!response.ok) throw new Error(payload.error || "Não foi possível carregar a revisão.");
        if (!cancelled) {
          setResult({ ...payload, text: payload.sourceText ?? "", reviewUrl: `/documents/${encodeURIComponent(reviewId)}/review`, sourceUrl: `/documents/${encodeURIComponent(reviewId)}/source` });
          setFeedback({ message: `Registro de revisão carregado: ${payload.origin.fileName}.`, kind: "success" });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setFeedback({ message: errorMessage(error), kind: "error" });
      });
    return () => { cancelled = true; };
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
    try {
      const body = new FormData();
      body.append("document", selectedFile);
      const response = await fetch("/documents", { method: "POST", body });
      const payload = await response.json() as UploadResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível enviar o documento.");

      setResult(payload);
      setFeedback({
        message: `${payload.message} Origem registrada: ${payload.origin.fileName}.`,
        kind: payload.questionCount > 0 ? "success" : "warning",
      });
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (error) {
      setFeedback({ message: errorMessage(error), kind: "error" });
    } finally {
      window.clearTimeout(processingHintTimer);
      setBusy(false);
      setShowProcessingHint(false);
    }
  }

  function questionDraft(question: Question): ReviewUpdate {
    return questionDrafts[question.id] ?? {
      prompt: question.prompt ?? question.text,
      alternatives: question.alternatives ?? [],
      answerKey: question.answerKey ?? null,
      pedagogy: question.pedagogy ?? {},
      reviewedBy: question.reviewedBy ?? "",
    };
  }

  async function saveQuestion(question: Question, status?: Question["status"]): Promise<void> {
    if (!result || savingQuestion) return;
    setSavingQuestion(question.id);
    try {
      const response = await fetch(`${result.reviewUrl}/questions/${encodeURIComponent(question.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...questionDraft(question), ...(status ? { status } : {}) }),
      });
      const payload = await response.json() as { questions?: Question[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar a revisão.");
      if (payload.questions) setResult((current) => current ? { ...current, questions: payload.questions! } : current);
      setQuestionDrafts((current) => { const next = { ...current }; delete next[question.id]; return next; });
      setFeedback({ message: status === "approved" ? "Questão aprovada e salva." : status === "rejected" ? "Questão rejeitada e salva." : status === "pending_review" ? "Questão mantida em revisão." : "Alterações da questão salvas.", kind: "success" });
    } catch (error) {
      setFeedback({ message: errorMessage(error), kind: "error" });
    } finally {
      setSavingQuestion(null);
    }
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <a className="brand" href="https://mentary.com.br/" aria-label="Mentary, site institucional">
          <img src="/assets/mentary-logo.png" alt="Mentary" />
        </a>
        <nav aria-label="Navegação principal">
          <a href="https://mentary.com.br/">INÍCIO</a>
          <a className="active" href="/">ENVIAR MATERIAL</a>
        </nav>
      </header>

      <main className="hero-layout">
        <section className="hero-copy" aria-labelledby="page-title">
          <div className="eyebrow"><span aria-hidden="true" /> INOVAÇÃO EDUCACIONAL</div>
          <h1 id="page-title">Seus materiais,<br />prontos para <span>inovar.</span></h1>
          <p className="intro">Envie provas e atividades para transformar conteúdo educacional em novas possibilidades de aprendizagem.</p>
          <div className="capabilities" aria-label="Recursos de extração">
            <span><b aria-hidden="true">✓</b> Extração de texto</span>
            <span><b aria-hidden="true">✓</b> OCR em português</span>
          </div>
          <div className="formats-note">PDF · PNG · JPG <i aria-hidden="true" /> Arquivos de até 20 MB</div>
        </section>

        <section className="upload-card" aria-labelledby="upload-title">
          <div className="card-heading">
            <div className="card-icon" aria-hidden="true"><span>↑</span></div>
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
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <span className="file-icon" aria-hidden="true">↑</span>
              <span className="drop-title">{selectedFile ? "Arquivo selecionado" : "Escolha um arquivo"}</span>
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
            {busy && showProcessingHint && (
              <p className="processing-hint" role="status" aria-live="polite">
                Ainda estamos processando seu documento. Arquivos escaneados ou a análise pelo Ollama podem levar alguns minutos; se a IA exceder o limite, a identificação local será usada.
              </p>
            )}
          </form>

          {feedback && <div className={`feedback ${feedback.kind}`} role="status" aria-live="polite">{feedback.message}</div>}
          <p className="privacy-note"><span aria-hidden="true">◆</span> O documento é validado antes de ser processado.</p>
        </section>

        {result && (
          <section className="review-panel" aria-labelledby="review-title">
            <div className="review-heading">
              <div>
                <p className="card-kicker">ETAPA DE REVISÃO</p>
                <h2 id="review-title">Questões identificadas</h2>
                <p className="review-summary">
                  {result.questionCount === 0
                    ? "O texto foi extraído, mas não encontramos enunciados com segurança suficiente."
                    : `${result.questionCount} questão(ões) encontradas · ${result.pages} página(s) · extração por ${extractionMethodLabel(result.method)}`}
                </p>
                {result.identification && (
                  <div className={`identification-diagnostic ${result.identification.method === "rules" ? "is-fallback" : ""}`} role="status">
                    <strong>{identifierLabel(result.identification.method)}</strong>
                    {result.identification.model && <span>Modelo: {result.identification.model}</span>}
                    <span>
                      Extração PDF/OCR: {durationLabel(result.identification.extractionDurationMs ?? 0)}
                      {result.identification.ollama
                        ? ` · Ollama: ${durationLabel(result.identification.ollama.durationMs)}${result.identification.ollama.loadDurationMs !== undefined ? ` (carregamento ${durationLabel(result.identification.ollama.loadDurationMs)})` : ""}`
                        : ` · Identificação: ${durationLabel(result.identification.durationMs)}`}
                    </span>
                    {result.identification.ollama?.promptTokens !== undefined && (
                      <span>Tokens de entrada: {result.identification.ollama.promptTokens} · Resposta: {result.identification.ollama.outputTokens ?? 0} tokens</span>
                    )}
                    {result.identification.reason && <span>{result.identification.reason}</span>}
                  </div>
                )}
              </div>
              <span className="review-count" aria-label={`${result.questionCount} questões`}>{result.questionCount}</span>
            </div>

            {result.questions.length > 0 ? (
              <div className="questions-list">
                {result.questions.map((question, index) => (
                  <article className="question-item" key={question.id}>
                    <div className="question-meta">
                      <span className="question-label">Questão {question.number ?? index + 1}</span>
                      <span className="question-page">
                        {question.pageStart === question.pageEnd
                          ? `Página ${question.pageStart}`
                          : `Páginas ${question.pageStart}–${question.pageEnd}`}
                      </span>
                    </div>
                    {result.origin.id && result.origin.mimeType && (
                      <details className="question-source">
                        <summary>{question.visualReferences?.length ? "Ver elemento visual no documento original" : "Ver documento original nesta página"}</summary>
                        {question.visualReferences?.map((visual) => (
                          <p className="visual-review-note" key={`${visual.page}-${visual.kind}`} role="note">
                            {visual.kind === "image" ? "Imagem" : "Gráfico, tabela ou figura"} detectado na página {visual.page}. A página original foi preservada, mas o elemento não foi isolado; confirme a associação com a questão.
                          </p>
                        ))}
                        {result.origin.mimeType === "application/pdf" ? (
                          (question.visualReferences?.length ? question.visualReferences.map((visual) => (
                            <iframe key={`${visual.page}-${visual.kind}`} title={`Página ${visual.page} do documento original`} src={`/documents/${encodeURIComponent(result.origin.id ?? "")}/source#page=${visual.page}`} loading="lazy" />
                          )) : <iframe title={`Página ${question.pageStart} do documento original`} src={`/documents/${encodeURIComponent(result.origin.id)}/source#page=${question.pageStart}`} loading="lazy" />)
                        ) : (
                          <img src={`/documents/${encodeURIComponent(result.origin.id)}/source`} alt={`Documento original da questão ${question.number ?? index + 1}`} loading="lazy" />
                        )}
                      </details>
                    )}
                    <span className="question-type">
                      {getResponseTypeLabel(question.responseType)}
                    </span>
                    <section className="question-section">
                      <h3>Enunciado</h3>
                      <p className="question-text">{question.prompt ?? question.text}</p>
                      {question.missingComponents?.includes("prompt") && (
                        <p className="question-answer-empty">Enunciado não identificado com segurança; revise o texto completo.</p>
                      )}
                    </section>
                    {question.missingComponents?.some((component) => component !== "prompt") && (
                      <p className="question-answer-empty">
                        {question.missingComponents.includes("alternatives") && "Alternativas não identificadas. "}
                        {question.missingComponents.includes("answer") && "Gabarito/resposta não identificado no documento."}
                      </p>
                    )}
                    <section className="question-section">
                      <h3>{question.alternatives?.length
                        ? question.responseType === "open"
                          ? "Itens da questão"
                          : question.responseType === "mixed" ? "Alternativas e resposta aberta" : "Resposta / alternativas"
                        : "Resposta"}</h3>
                      {question.responseType === "mixed" ? (
                        <>
                          {question.alternatives && question.alternatives.length > 0 && (
                            <ul className="question-alternatives">
                              {question.alternatives.map((alternative, alternativeIndex) => (
                                <li key={`${alternative.label}-${alternativeIndex}`}>
                                  <strong>{alternative.label}</strong> {alternative.text}
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="question-text">
                            {question.answer ? <><strong>Resposta aberta:</strong> {question.answer}</> : getMissingAnswerMessage("open")}
                          </p>
                        </>
                      ) : question.answer ? (
                        <p className="question-text">{question.answer}</p>
                      ) : question.alternatives && question.alternatives.length > 0 ? (
                        <ul className="question-alternatives">
                          {question.alternatives.map((alternative, alternativeIndex) => (
                            <li key={`${alternative.label}-${alternativeIndex}`}>
                              <strong>{alternative.label}</strong> {alternative.text}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="question-answer-empty">
                          {getMissingAnswerMessage(question.responseType)}
                        </p>
                      )}
                    </section>
                    <label className="question-edit-field">
                      <span>Editar enunciado</span>
                      <textarea value={questionDraft(question).prompt} onChange={(event) => setQuestionDrafts((current) => ({ ...current, [question.id]: { ...questionDraft(question), prompt: event.currentTarget.value } }))} rows={3} />
                    </label>
                    {(question.alternatives && question.alternatives.length > 0 || question.responseType === "multiple_choice") && (
                      <label className="question-edit-field">
                        <span>Editar alternativas (uma por linha: rótulo | texto)</span>
                        <textarea value={questionDraft(question).alternatives.map((item) => `${item.label} | ${item.text}`).join("\n")} onChange={(event) => {
                          const alternatives = event.currentTarget.value.split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
                            const [label, ...textParts] = line.split("|");
                            return { label: label?.trim() || String.fromCharCode(65 + index), text: textParts.join("|").trim() || line.trim() };
                          });
                          setQuestionDrafts((current) => ({ ...current, [question.id]: { ...questionDraft(question), alternatives } }));
                        }} rows={Math.max(3, question.alternatives?.length ?? 0)} />
                      </label>
                    )}
                    {question.responseType === "multiple_choice" && (
                      <label className="question-edit-field">
                        <span>Selecione o gabarito</span>
                        <select value={questionDraft(question).answerKey ?? ""} onChange={(event) => setQuestionDrafts((current) => ({ ...current, [question.id]: { ...questionDraft(question), answerKey: event.currentTarget.value || null } }))}>
                          <option value="">Selecione uma alternativa</option>
                          {questionDraft(question).alternatives.map((alternative) => (
                            <option key={alternative.label} value={alternative.label}>{alternative.label} — {alternative.text}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {question.answerKey && <p className="question-answer-empty"><strong>Gabarito registrado:</strong> {question.answerKey}</p>}
                    <details className="question-pedagogy">
                      <summary>Classificação pedagógica</summary>
                      <div className="pedagogy-fields">
                        <label className="question-edit-field"><span>Disciplina</span><input value={questionDraft(question).pedagogy.discipline ?? ""} onChange={(event) => setQuestionDrafts((current) => ({ ...current, [question.id]: { ...questionDraft(question), pedagogy: { ...questionDraft(question).pedagogy, discipline: event.currentTarget.value } } }))} /></label>
                        <label className="question-edit-field"><span>Ano/série</span><input value={questionDraft(question).pedagogy.grade ?? ""} onChange={(event) => setQuestionDrafts((current) => ({ ...current, [question.id]: { ...questionDraft(question), pedagogy: { ...questionDraft(question).pedagogy, grade: event.currentTarget.value } } }))} /></label>
                        <label className="question-edit-field"><span>Tema</span><input value={questionDraft(question).pedagogy.topic ?? ""} onChange={(event) => setQuestionDrafts((current) => ({ ...current, [question.id]: { ...questionDraft(question), pedagogy: { ...questionDraft(question).pedagogy, topic: event.currentTarget.value } } }))} /></label>
                        <label className="question-edit-field"><span>Habilidades BNCC (separadas por vírgula)</span><input value={questionDraft(question).pedagogy.bnccSkills?.join(", ") ?? ""} onChange={(event) => setQuestionDrafts((current) => ({ ...current, [question.id]: { ...questionDraft(question), pedagogy: { ...questionDraft(question).pedagogy, bnccSkills: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) } } }))} /></label>
                        <label className="question-edit-field"><span>Descritor</span><input value={questionDraft(question).pedagogy.descriptor ?? ""} onChange={(event) => setQuestionDrafts((current) => ({ ...current, [question.id]: { ...questionDraft(question), pedagogy: { ...questionDraft(question).pedagogy, descriptor: event.currentTarget.value } } }))} /></label>
                        <label className="question-edit-field"><span>Dificuldade</span><select value={questionDraft(question).pedagogy.difficulty ?? "unknown"} onChange={(event) => setQuestionDrafts((current) => ({ ...current, [question.id]: { ...questionDraft(question), pedagogy: { ...questionDraft(question).pedagogy, difficulty: event.currentTarget.value as NonNullable<Question["pedagogy"]>["difficulty"] } } }))}><option value="unknown">Não definida</option><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select></label>
                      </div>
                    </details>
                    <label className="question-edit-field">
                      <span>Responsável pela revisão</span>
                      <input value={questionDraft(question).reviewedBy} onChange={(event) => setQuestionDrafts((current) => ({ ...current, [question.id]: { ...questionDraft(question), reviewedBy: event.currentTarget.value } }))} maxLength={120} />
                    </label>
                    <span className="question-status">{question.status === "approved" ? "Aprovada" : question.status === "rejected" ? "Rejeitada" : "Aguardando revisão"}</span>
                    <div className="question-actions">
                      <button type="button" onClick={() => void saveQuestion(question)} disabled={savingQuestion !== null}>{savingQuestion === question.id ? "Salvando…" : "Salvar alterações"}</button>
                      <button type="button" onClick={() => void saveQuestion(question, "pending_review")} disabled={savingQuestion !== null}>Manter em revisão</button>
                      <button type="button" onClick={() => void saveQuestion(question, "approved")} disabled={savingQuestion !== null}>Aprovar</button>
                      <button type="button" onClick={() => void saveQuestion(question, "rejected")} disabled={savingQuestion !== null}>Rejeitar</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="no-questions">Nenhuma questão foi enviada como válida. Confira o texto extraído ou envie uma versão mais nítida e com a numeração das questões visível.</p>
            )}

            {result.text && (
              <details className="source-preview">
                <summary>Consultar texto extraído do documento</summary>
                <pre>{result.text}</pre>
              </details>
            )}
            <a className="review-record-link" href={result.origin.id ? `/?review=${encodeURIComponent(result.origin.id)}` : result.reviewUrl}>
              Abrir registro completo da revisão ↗
            </a>
          </section>
        )}
      </main>

      <footer><span>MENTARY</span><i aria-hidden="true" /> TECNOLOGIA QUE MOVE A EDUCAÇÃO</footer>
    </div>
  );
}

export { App };

