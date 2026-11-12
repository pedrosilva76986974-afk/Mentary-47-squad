import type { PedagogicalJob } from "../types/review.js";

export function classificationProgress(job: PedagogicalJob | null, total: number) {
  const count = job?.suggestions.length ?? 0;
  const partial = count > 0 ? ` ${count} de ${total} questão(ões) classificadas; resultados parciais preservados.` : "";
  switch (job?.status) {
    case "cancelled":
      return { label: "Cancelada", message: `Classificação cancelada.${partial}` };
    case "failed":
      return { label: "Precisa de atenção", message: `${job.error ?? "Falha na classificação."}${partial}` };
    case "completed":
      return { label: "Concluída", message: `Classificação concluída: ${count} de ${total} questão(ões).` };
    case "queued":
      return { label: "Na fila", message: `Classificação na fila.${partial} Você já pode revisar as questões.` };
    default:
      return { label: "Em andamento", message: `Classificação em andamento (${count} de ${total}); você já pode revisar as questões.` };
  }
}
