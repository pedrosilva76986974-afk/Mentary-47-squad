function getResponseTypeLabel(): string {
  return "Múltipla escolha";
}

function getMissingAnswerMessage(): string {
  return "Nenhum gabarito ou alternativa foi identificado no documento.";
}

export { getMissingAnswerMessage, getResponseTypeLabel };
