-- Destructive rollback: this removes all saved review documents and questions.
DROP TABLE IF EXISTS question_alternatives;
DROP TABLE IF EXISTS review_questions;
DROP TABLE IF EXISTS review_documents;
DROP TABLE IF EXISTS schema_migrations;
