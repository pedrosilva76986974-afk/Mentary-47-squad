import { app } from "./app.js";
import { cleanupExpiredDocuments } from "./services/document-retention.service.js";
import { initializeDatabase } from "./services/database.service.js";
import { migrateLegacyReviewFiles } from "./services/review-results.service.js";

const port = Number(process.env.PORT ?? 3000);

async function startServer(): Promise<void> {
  const runRetentionCleanup = async (): Promise<void> => {
    try {
      const removedCount = await cleanupExpiredDocuments();
      if (removedCount > 0) console.log(`${removedCount} registro(s) expirado(s) removido(s).`);
    } catch (error) {
      console.error("Falha na limpeza de documentos expirados.", error);
    }
  };

  await initializeDatabase();
  const migratedReviews = await migrateLegacyReviewFiles();
  if (migratedReviews > 0) console.log(`${migratedReviews} revisão(ões) antiga(s) migrada(s) para o PostgreSQL.`);
  await runRetentionCleanup();
  const cleanupTimer = setInterval(() => void runRetentionCleanup(), 24 * 60 * 60 * 1000);
  cleanupTimer.unref();
  app.listen(port, (error?: Error) => {
    if (error) { console.error("Não foi possível iniciar o backend. Confira se a porta já está em uso:", error.message); process.exitCode = 1; return; }
    console.log(`Mentary backend disponível em http://localhost:${port}`);
  });
}

void startServer();
