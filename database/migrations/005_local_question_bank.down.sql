-- Rollback seguro: recusa remover publicações existentes. Não executar em produção sem revisão.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM banco.questions) THEN
   RAISE EXCEPTION 'Rollback recusado: existem questões publicadas. Preserve/exporte os dados antes de planejar a reversão.';
 END IF;
END $$;
DROP TABLE banco.question_sources;
DROP TABLE banco.questions;
