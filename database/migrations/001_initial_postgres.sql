CREATE TABLE IF NOT EXISTS review_documents (
  document_id UUID PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'no_questions')),
  message TEXT NOT NULL,
  origin JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL,
  page_count INTEGER NOT NULL CHECK (page_count >= 0),
  extraction_method TEXT NOT NULL CHECK (extraction_method IN ('pdf-text', 'ocr', 'hybrid')),
  source_text TEXT NOT NULL,
  identification JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_questions (
  question_id TEXT PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES review_documents(document_id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  question_number INTEGER,
  source_text TEXT NOT NULL,
  prompt TEXT,
  answer_key TEXT,
  response_type TEXT NOT NULL DEFAULT 'multiple_choice' CHECK (response_type = 'multiple_choice'),
  missing_components TEXT[] NOT NULL DEFAULT '{}',
  page_start INTEGER NOT NULL CHECK (page_start > 0),
  page_end INTEGER NOT NULL CHECK (page_end >= page_start),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium')),
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'approved', 'rejected')),
  pedagogy JSONB,
  reviewed_by TEXT,
  visual_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (document_id, position)
);

CREATE INDEX IF NOT EXISTS review_questions_document_order_idx
  ON review_questions (document_id, position);

CREATE INDEX IF NOT EXISTS review_questions_status_idx
  ON review_questions (status);

CREATE TABLE IF NOT EXISTS question_alternatives (
  question_id TEXT NOT NULL REFERENCES review_questions(question_id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  label TEXT NOT NULL,
  choice_text TEXT NOT NULL,
  PRIMARY KEY (question_id, position),
  UNIQUE (question_id, label)
);
