import type { RequestHandler } from "express";

function createUploadConcurrencyLimiter(maxConcurrentUploads: number): RequestHandler {
  if (!Number.isInteger(maxConcurrentUploads) || maxConcurrentUploads < 1) {
    throw new RangeError("O limite de uploads simultâneos deve ser um inteiro positivo.");
  }

  let activeUploads = 0;

  return (_request, response, next) => {
    if (activeUploads >= maxConcurrentUploads) {
      response.status(429).json({ error: "Outro documento está sendo processado. Aguarde e tente novamente." });
      return;
    }

    activeUploads += 1;
    let released = false;
    const releaseSlot = (): void => {
      if (released) return;
      released = true;
      activeUploads -= 1;
    };

    response.once("finish", releaseSlot);
    response.once("close", releaseSlot);
    next();
  };
}

const limitConcurrentUploads = createUploadConcurrencyLimiter(1);

export { createUploadConcurrencyLimiter, limitConcurrentUploads };
