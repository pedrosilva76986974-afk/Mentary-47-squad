export type ResponseType = "open" | "multiple_choice" | "mixed" | "unknown" | undefined;

function getResponseTypeLabel(responseType: ResponseType): string {
  if (responseType === "multiple_choice") return "Múltipla escolha";
  if (responseType === "open") return "Resposta aberta";
  if (responseType === "mixed") return "Formato misto";
  return "Tipo não identificado";
}

function getMissingAnswerMessage(responseType: ResponseType): string {
  if (responseType === "open") return "Resposta aberta; o documento não informa uma resposta pronta.";
  return "Nenhuma resposta ou alternativa foi identificada no documento.";
}

export { getMissingAnswerMessage, getResponseTypeLabel };
