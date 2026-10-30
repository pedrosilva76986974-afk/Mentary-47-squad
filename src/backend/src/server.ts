import { app } from "./app.js";
import { cleanupExpiredDocuments } from "./services/document-retention.service.js";

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

  await runRetentionCleanup();
  const cleanupTimer = setInterval(() => void runRetentionCleanup(), 24 * 60 * 60 * 1000);
  cleanupTimer.unref();
  app.listen(port, () => console.log(`Mentary backend disponível em http://localhost:${port}`));
}

void startServer();
