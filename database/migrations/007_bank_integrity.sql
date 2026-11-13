CREATE OR REPLACE FUNCTION banco.valid_objective_answers(options JSONB, correct TEXT) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(options)='array' AND jsonb_array_length(options)>=2 THEN
   NOT EXISTS(SELECT 1 FROM jsonb_array_elements(options) a WHERE
     jsonb_typeof(a->'label') IS DISTINCT FROM 'string' OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string'
     OR btrim(a->>'label')='' OR btrim(a->>'text')='')
   AND (SELECT count(*)=count(DISTINCT upper(btrim(a->>'label'))) FROM jsonb_array_elements(options) a)
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(options) a WHERE upper(btrim(a->>'label'))=upper(btrim(correct)))
 ELSE false END
$$;
ALTER TABLE banco.questions ADD CONSTRAINT bank_answers_valid CHECK(banco.valid_objective_answers(alternatives,answer_key));
ALTER TABLE banco.question_sources ADD CONSTRAINT bank_source_pages_valid CHECK(
 (page_start IS NULL AND page_end IS NULL) OR
 (page_start IS NOT NULL AND page_end IS NOT NULL AND page_start>0 AND page_end>=page_start));
