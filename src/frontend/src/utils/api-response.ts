/** Read the body once and translate empty/HTML proxy errors into actionable messages. */
export async function readApiResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  const status = `HTTP ${response.status}`;
  const unavailable = "Não foi possível obter uma resposta da API. Verifique se o backend está ativo na porta 3000 e tente novamente.";
  if (!body.trim()) throw new Error(`${unavailable} (${status}; resposta vazia).`);
  let payload: unknown;
  try { payload = JSON.parse(body); }
  catch { throw new Error(`${unavailable} (${status}; resposta inválida).`); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`A API retornou dados em formato inválido (${status}).`);
  }
  if (!response.ok) {
    const error = (payload as { error?: unknown }).error;
    throw new Error(typeof error === "string" && error.trim() ? error : `Falha na comunicação com a API (${status}).`);
  }
  return payload as T;
}
