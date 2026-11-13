ALTER TABLE extrator.review_questions ALTER COLUMN page_start DROP NOT NULL;
ALTER TABLE extrator.review_questions ALTER COLUMN page_end DROP NOT NULL;
ALTER TABLE extrator.review_questions DROP CONSTRAINT IF EXISTS review_questions_page_start_check;
ALTER TABLE extrator.review_questions DROP CONSTRAINT IF EXISTS review_questions_page_end_check;
ALTER TABLE extrator.review_questions ADD CONSTRAINT review_questions_page_range_check
 CHECK ((page_start IS NULL AND page_end IS NULL) OR
        (page_start IS NOT NULL AND page_end IS NOT NULL AND page_start > 0 AND page_end >= page_start));
