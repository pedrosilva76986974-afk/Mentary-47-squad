CREATE TABLE IF NOT EXISTS extrator.classification_jobs (
  document_id UUID PRIMARY KEY REFERENCES extrator.review_documents(document_id) ON DELETE CASCADE,
  job JSONB NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued','running','completed','failed','cancelled')),
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  owner TEXT,
  lease_until TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS classification_jobs_pending ON extrator.classification_jobs(state, updated_at);

CREATE SCHEMA IF NOT EXISTS avaliacoes;
CREATE TABLE IF NOT EXISTS avaliacoes.aplicacoes (
  id UUID PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  school_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  applied_at DATE NOT NULL,
  title TEXT NOT NULL,
  payload JSONB NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aplicacoes_turma_data ON avaliacoes.aplicacoes(school_id, class_id, applied_at);
