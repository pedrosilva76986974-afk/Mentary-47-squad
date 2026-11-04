-- OCR may emit repeated labels for separate answer choices. Keep their source
-- order and content; question_id + position already provides row uniqueness.
ALTER TABLE question_alternatives
  DROP CONSTRAINT IF EXISTS question_alternatives_question_id_label_key;
