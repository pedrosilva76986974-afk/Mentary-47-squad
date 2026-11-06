DROP VIEW IF EXISTS extrator.approved_question_exports;
ALTER TABLE extrator.question_alternatives SET SCHEMA public;
ALTER TABLE extrator.review_questions SET SCHEMA public;
ALTER TABLE extrator.review_documents SET SCHEMA public;
DROP SCHEMA IF EXISTS extrator;
