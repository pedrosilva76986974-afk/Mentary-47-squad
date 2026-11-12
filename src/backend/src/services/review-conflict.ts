export class ReviewConflictError extends Error {
  constructor() {
    super("Esta questão foi alterada em outra sessão. Suas edições foram preservadas. Recarregue a versão atual antes de conciliá-las.");
  }
}
