DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM extrator.review_questions WHERE page_start IS NULL OR page_end IS NULL) THEN
   RAISE EXCEPTION 'Rollback recusado: existem páginas desconhecidas. Não será inventada uma página para esses registros.';
 END IF;
END $$;
ALTER TABLE extrator.review_questions DROP CONSTRAINT review_questions_page_range_check;
ALTER TABLE extrator.review_questions ALTER COLUMN page_start SET NOT NULL;
ALTER TABLE extrator.review_questions ALTER COLUMN page_end SET NOT NULL;
ALTER TABLE extrator.review_questions ADD CHECK(page_start > 0);
ALTER TABLE extrator.review_questions ADD CHECK(page_end >= page_start);
