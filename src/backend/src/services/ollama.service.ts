import type { ParsedQuestion } from "./question-parser.service.js";

type OllamaResponse = {
  message?: { content?: unknown };
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
};

type OllamaMetrics = {
  durationMs: number;
  loadDurationMs?: number;
  promptTokens?: number;
  outputTokens?: number;
};

type QuestionClassification = {
  questionIndex: number;
  isMultipleChoice: boolean;
  confidence: "high" | "medium";
};

const classificationInstructions = [
  "Você classifica questões que já foram extraídas e separadas pelo sistema local.",
  "Não extraia, transcreva, reescreva, corrija, resuma ou complete conteúdo. Não devolva texto de enunciado, alternativa ou resposta.",
  "Para cada questão, informe somente isMultipleChoice: true ou false.",
  "Marque true quando a questão pede para selecionar uma alternativa, inclusive quando o OCR não conseguiu reconhecer as alternativas mas o enunciado deixa claro que elas existem. Marque false para perguntas discursivas, listas de exercícios que pedem cálculos individuais ou agrupamentos incorretos de questões.",
  "Preserve os índices recebidos. Marque confidence high somente quando a classificação for clara; caso contrário medium.",
].join(" ");

const classificationSchema = {
  type: "object",
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          questionIndex: { type: "integer" },
          isMultipleChoice: { type: "boolean" },
          confidence: { type: "string", enum: ["high", "medium"] },
        },
        required: ["questionIndex", "isMultipleChoice", "confidence"],
      },
    },
  },
  required: ["classifications"],
} as const;

function parseClassifications(content: unknown, questionCount: number): QuestionClassification[] {
  if (typeof content !== "string") throw new Error("Ollama retornou uma resposta de classificação vazia.");
  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== "object" || parsed === null || !("classifications" in parsed) || !Array.isArray(parsed.classifications)) {
    throw new Error("Ollama retornou uma estrutura de classificação inválida.");
  }

  const seen = new Set<number>();
  return parsed.classifications.map((item): QuestionClassification => {
    if (typeof item !== "object" || item === null) throw new Error("Classificação inválida na resposta do Ollama.");
    const entry = item as Record<string, unknown>;
    const index = entry.questionIndex;
    if (!Number.isInteger(index) || Number(index) < 0 || Number(index) >= questionCount || seen.has(Number(index))) {
      throw new Error("Ollama retornou um índice de questão inválido ou repetido.");
    }
    if (typeof entry.isMultipleChoice !== "boolean") {
      throw new Error("Ollama retornou uma classificação objetiva inválida.");
    }
    if (entry.confidence !== "high" && entry.confidence !== "medium") {
      throw new Error("Ollama retornou confiança inválida.");
    }
    seen.add(Number(index));
    return {
      questionIndex: Number(index),
      isMultipleChoice: entry.isMultipleChoice,
      confidence: entry.confidence,
    };
  });
}

async function classifyQuestionsWithOllamaDetailed(questions: ParsedQuestion[]): Promise<{ classifications: QuestionClassification[]; metrics: OllamaMetrics }> {
  if (questions.length === 0) return { classifications: [], metrics: { durationMs: 0, promptTokens: 0, outputTokens: 0 } };
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL;
  if (!model) throw new Error("Defina OLLAMA_MODEL para habilitar a classificação pelo Ollama.");
  const configuredTimeout = Number(process.env.OLLAMA_TIMEOUT_MS);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 90_000;
  const state = questions.map((question, questionIndex) => ({
    questionIndex,
    number: question.number,
    prompt: question.prompt ?? "",
    alternatives: (question.alternatives ?? []).map(({ label, text }) => ({ label, text })),
  }));
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      stream: false,
      keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? "15m",
      think: false,
      options: { temperature: 0 },
      format: classificationSchema,
      messages: [
        { role: "system", content: classificationInstructions },
        { role: "user", content: JSON.stringify(state) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Ollama respondeu com HTTP ${response.status}.`);
  const result = await response.json() as OllamaResponse;
  return {
    classifications: parseClassifications(result.message?.content, questions.length),
    metrics: {
      durationMs: typeof result.total_duration === "number" ? Math.round(result.total_duration / 1_000_000) : Date.now() - startedAt,
      ...(typeof result.load_duration === "number" ? { loadDurationMs: Math.round(result.load_duration / 1_000_000) } : {}),
      ...(typeof result.prompt_eval_count === "number" ? { promptTokens: result.prompt_eval_count } : {}),
      ...(typeof result.eval_count === "number" ? { outputTokens: result.eval_count } : {}),
    },
  };
}

export { classifyQuestionsWithOllamaDetailed, classificationInstructions };
export type { OllamaMetrics, QuestionClassification };
