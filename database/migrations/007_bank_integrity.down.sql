ALTER TABLE banco.questions DROP CONSTRAINT bank_answers_valid;
ALTER TABLE banco.question_sources DROP CONSTRAINT bank_source_pages_valid;
DROP FUNCTION banco.valid_objective_answers(JSONB,TEXT);
