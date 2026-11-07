-- Banco próprio. As tabelas de revisão e a antiga projeção permanecem intactas.
CREATE SCHEMA IF NOT EXISTS banco;
CREATE TABLE banco.questions (
  id UUID PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL CHECK (btrim(prompt) <> ''),
  alternatives JSONB NOT NULL CHECK (jsonb_typeof(alternatives) = 'array' AND jsonb_array_length(alternatives) >= 2),
  answer_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE banco.question_sources (
  review_question_id TEXT PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES banco.questions(id),
  document_id UUID NOT NULL,
  origin JSONB NOT NULL,
  page_start INTEGER,
  page_end INTEGER,
  pedagogy JSONB NOT NULL DEFAULT '{}',
  visual_references JSONB NOT NULL DEFAULT '[]',
  reviewed_by TEXT NOT NULL CHECK (btrim(reviewed_by) <> ''),
  active BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((page_start IS NULL AND page_end IS NULL) OR (page_start IS NOT NULL AND page_end IS NOT NULL AND page_start > 0 AND page_end >= page_start))
);
CREATE INDEX bank_sources_visible_idx ON banco.question_sources (question_id, updated_at DESC) WHERE active;
CREATE INDEX bank_sources_document_idx ON banco.question_sources(document_id);
CREATE INDEX bank_sources_metadata_idx ON banco.question_sources USING gin(pedagogy);
CREATE INDEX bank_sources_discipline_idx ON banco.question_sources(lower(pedagogy ->> 'discipline')) WHERE active;
COMMENT ON TABLE banco.questions IS 'Conteúdo próprio publicado; deduplicação por enunciado, alternativas ordenadas e gabarito.';
COMMENT ON TABLE banco.question_sources IS 'Origens preservadas independentemente da retenção das revisões. Somente fontes aprovadas ativas ficam disponíveis.';
