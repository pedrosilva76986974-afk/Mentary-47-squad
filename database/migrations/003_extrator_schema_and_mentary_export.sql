-- Keep the challenge's public.questions schema untouched. All review data
-- owned by the extractor lives in its own schema.
CREATE SCHEMA IF NOT EXISTS extrator;

ALTER TABLE public.review_documents SET SCHEMA extrator;
ALTER TABLE public.review_questions SET SCHEMA extrator;
ALTER TABLE public.question_alternatives SET SCHEMA extrator;

COMMENT ON SCHEMA extrator IS
  'Dados de extração, revisão humana e preparação de questões para o Banco Mentary.';

-- Read-only projection in the destination format described by the Mentary
-- reference README. Rows remain drafts until the application explicitly sends
-- a ready item to public.questions.
CREATE OR REPLACE VIEW extrator.approved_question_exports AS
WITH alternatives AS (
  SELECT
    qa.question_id,
    array_agg(qa.choice_text ORDER BY qa.position) AS answer_options,
    array_agg(upper(qa.label) ORDER BY qa.position) AS labels
  FROM extrator.question_alternatives qa
  GROUP BY qa.question_id
)
SELECT
  q.question_id,
  q.document_id,
  q.position,
  jsonb_build_object(
    'title', q.prompt,
    'question_type', CASE q.response_type
      WHEN 'multiple_choice' THEN 'MULTIPLA ESCOLHA'
      ELSE upper(q.response_type)
    END,
    'answer_options_type', 'TEXTO',
    'answer_options', COALESCE(a.answer_options, ARRAY[]::text[]),
    'correct_answer_index', array_position(a.labels, upper(trim(q.answer_key))) - 1,
    'answers_explanation', NULL,
    'subjects', q.pedagogy ->> 'discipline',
    'fk_user_id', CASE
      WHEN q.pedagogy ->> 'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (q.pedagogy ->> 'userId')::uuid
      ELSE NULL
    END,
    'fk_institution_id', CASE
      WHEN q.pedagogy ->> 'institutionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (q.pedagogy ->> 'institutionId')::uuid
      ELSE NULL
    END,
    'metadata', jsonb_build_object(
      'bncc', CASE
        WHEN jsonb_typeof(q.pedagogy -> 'bnccSkills') = 'array'
          THEN (SELECT string_agg(value, ',') FROM jsonb_array_elements_text(q.pedagogy -> 'bnccSkills'))
        ELSE NULL
      END,
      'saebDescriptor', q.pedagogy ->> 'descriptor',
      'difficulty', CASE q.pedagogy ->> 'difficulty'
        WHEN 'easy' THEN 'Fácil'
        WHEN 'medium' THEN 'Média'
        WHEN 'hard' THEN 'Difícil'
        ELSE NULL
      END,
      'assunto', q.pedagogy ->> 'topic',
      'tipo', 'Múltipla escolha',
      'ano_escolar', q.pedagogy ->> 'grade'
    )
  ) AS mentary_question,
  array_remove(ARRAY[
    CASE WHEN COALESCE(q.pedagogy ->> 'userId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN 'fk_user_id' END,
    CASE WHEN COALESCE(q.pedagogy ->> 'institutionId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN 'fk_institution_id' END,
    CASE WHEN q.prompt IS NULL OR btrim(q.prompt) = '' THEN 'title' END,
    CASE WHEN cardinality(COALESCE(a.answer_options, ARRAY[]::text[])) < 2 THEN 'answer_options' END,
    CASE WHEN array_position(a.labels, upper(trim(q.answer_key))) IS NULL THEN 'correct_answer_index' END,
    CASE WHEN COALESCE(q.pedagogy ->> 'discipline', '') = '' THEN 'subjects' END,
    CASE WHEN jsonb_typeof(q.pedagogy -> 'bnccSkills') <> 'array'
      OR jsonb_array_length(CASE WHEN jsonb_typeof(q.pedagogy -> 'bnccSkills') = 'array' THEN q.pedagogy -> 'bnccSkills' ELSE '[]'::jsonb END) = 0
      THEN 'metadata.bncc' END,
    CASE WHEN COALESCE(q.pedagogy ->> 'descriptor', '') = '' THEN 'metadata.saebDescriptor' END,
    CASE WHEN COALESCE(q.pedagogy ->> 'difficulty', '') NOT IN ('easy', 'medium', 'hard') THEN 'metadata.difficulty' END,
    CASE WHEN COALESCE(q.pedagogy ->> 'topic', '') = '' THEN 'metadata.assunto' END
  ]::text[], NULL) AS missing_destination_fields,
  (
    q.prompt IS NOT NULL AND btrim(q.prompt) <> ''
    AND cardinality(COALESCE(a.answer_options, ARRAY[]::text[])) >= 2
    AND array_position(a.labels, upper(trim(q.answer_key))) IS NOT NULL
    AND COALESCE(q.pedagogy ->> 'discipline', '') <> ''
    AND COALESCE(q.pedagogy ->> 'descriptor', '') <> ''
    AND COALESCE(q.pedagogy ->> 'topic', '') <> ''
    AND COALESCE(q.pedagogy ->> 'difficulty', '') IN ('easy', 'medium', 'hard')
    AND jsonb_typeof(q.pedagogy -> 'bnccSkills') = 'array'
    AND jsonb_array_length(q.pedagogy -> 'bnccSkills') > 0
    AND q.pedagogy ->> 'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND q.pedagogy ->> 'institutionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) AS is_ready_for_mentary,
  q.missing_components
FROM extrator.review_questions q
LEFT JOIN alternatives a ON a.question_id = q.question_id
WHERE q.status = 'approved';

COMMENT ON VIEW extrator.approved_question_exports IS
  'Projeção somente leitura de questões aprovadas para o formato public.questions; is_ready_for_mentary indica se os campos obrigatórios estão completos.';
