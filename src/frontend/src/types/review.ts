export type Question = {
  id: string;
  number: number | null;
  text: string;
  prompt?: string;
  answerKey?: string | null;
  responseType?: "multiple_choice";
  alternatives?: Array<{ label: string; text: string }>;
  pedagogy?: {
    discipline?: string;
    area?: string;
    questionType?: string;
    grade?: string;
    topic?: string;
    bnccSkills?: string[];
    descriptor?: string;
    difficulty?: "easy" | "medium" | "hard" | "unknown";
  };
  missingComponents?: Array<"prompt" | "alternatives" | "answer">;
  pageStart: number | null;
  pageEnd: number | null;
  status: "pending_review" | "approved" | "rejected";
  reviewedBy?: string | null;
  visualReferences?: Array<{
    page: number;
    kind: "image" | "graphic";
    region?: { x: number; y: number; width: number; height: number };
    association?: "automatic" | "manual" | "unconfirmed";
    extractionWarning?: string;
  }>;
};

export type ReviewUpdate = {
  pageStart: number | null;
  pageEnd: number | null;
  visualReferences?: Question["visualReferences"];
  prompt: string;
  alternatives: Array<{ label: string; text: string }>;
  answerKey: string | null;
  pedagogy: NonNullable<Question["pedagogy"]>;
  reviewedBy: string;
  status?: Question["status"];
};

export type UploadResult = {
  publishedQuestionIds?: string[];
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
    ollama?: {
      durationMs: number;
      loadDurationMs?: number;
      promptTokens?: number;
      outputTokens?: number;
    };
  };
};

export type Feedback = {
  message: string;
  kind: "success" | "warning" | "error";
};
export type PedagogicalJob = {
  version?: number;
  sourceHash?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stale?: boolean;
  error?: string;
  suggestions: Array<{
    questionId: string;
    area: string;
    discipline: string;
    questionType: string;
    grade: string;
    topic: string;
    descriptor: string;
    difficulty: "easy" | "medium" | "hard" | "unknown";
    processingMs?: number;
    targetMs?: number;
    targetMet?: boolean;
  }>;
};
