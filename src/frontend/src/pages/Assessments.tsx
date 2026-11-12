import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { SiteHeader } from "../components/SiteHeader.js";
import { readApiResponse } from "../utils/api-response.js";

type Counts = { correct: number; incorrect: number; omitted: number; total: number; percentage: number; averageDurationMs: number | null };
type Group = Counts & { id: string; prompt?: string; distribution?: Record<string, number> };
type Application = { id: string; title: string; externalId: string; schoolId: string; classId: string; appliedAt: string; summary: Counts };
type Detail = Omit<Application, "summary"> & { results: { summary: Counts; students: Group[]; questions: Group[]; skills: Group[]; descriptors: Group[] } };
type Page = { applications: Application[]; total: number; page: number; pageSize: number };
const percent = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
function ResultTable({ title, rows }: { title: string; rows: Group[] }) {
  return <section className="assessment-report"><h3>{title}</h3>{!rows.length ? <p>Nenhuma informação cadastrada nesta dimensão.</p> : <div className="assessment-table-scroll"><table>
    <caption className="sr-only">{title}: acertos, erros, omissões e tempo médio</caption>
    <thead><tr><th scope="col">Identificação</th><th scope="col">Acertos</th><th scope="col">Erros</th><th scope="col">Em branco</th><th scope="col">Desempenho</th><th scope="col">Tempo médio</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}><th scope="row">{row.prompt ?? row.id}{row.distribution && <small>{Object.entries(row.distribution).map(([label, count]) => `${label}: ${count}`).join(" · ")}</small>}</th><td>{row.correct}</td><td>{row.incorrect}</td><td>{row.omitted}</td><td><meter min={0} max={100} value={row.percentage} aria-label={`Desempenho de ${row.id}`} /> {percent(row.percentage)}</td><td>{row.averageDurationMs === null ? "Não informado" : `${(row.averageDurationMs / 1000).toLocaleString("pt-BR")} s`}</td></tr>)}</tbody>
  </table></div>}</section>;
}

export function Assessments() {
  const [filters, setFilters] = useState({ schoolId: "", classId: "", from: "", to: "" });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [comparison, setComparison] = useState<Detail[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [imported, setImported] = useState<unknown>(null);
  const [importName, setImportName] = useState("");
  const [saving, setSaving] = useState(false);
  const [descriptor, setDescriptor] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setData(null); setError("");
    void fetch(`/assessments?${query}&page=${page}`, { signal: controller.signal }).then(response => readApiResponse<Page>(response))
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Não foi possível consultar as aplicações."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, page, attempt]);
  useEffect(() => {
    setDetail(null); setDescriptor("");
    if (!selectedId) return;
    const controller = new AbortController();
    void fetch(`/assessments/${encodeURIComponent(selectedId)}`, { signal: controller.signal }).then(response => readApiResponse<Detail>(response))
      .then(result => { if (!controller.signal.aborted) setDetail(result); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Não foi possível abrir o resultado."); });
    return () => controller.abort();
  }, [selectedId, attempt]);
  function search(event: FormEvent) {
    event.preventDefault();
    setQuery(new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString());
    setPage(1); setSelectedId(""); setComparison([]); setAttempt(value => value + 1);
  }
  async function chooseImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setImported(null); setImportName(""); setNotice(""); setError("");
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("O arquivo de avaliação deve ter até 2 MB.");
      const parsed: unknown = JSON.parse(await file.text());
      setImported(parsed); setImportName(file.name);
    } catch (e) { setError(e instanceof SyntaxError ? "O arquivo não contém JSON válido." : e instanceof Error ? e.message : "Não foi possível ler o arquivo."); }
  }
  async function saveImport() {
    if (!imported || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/assessments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(imported) });
      const result = await readApiResponse<{ id: string; created: boolean }>(response);
      setNotice(result.created ? "Aplicação importada e respostas corrigidas." : "Esta aplicação já foi importada. Os resultados existentes foram preservados.");
      setImported(null); setImportName(""); setSelectedId(result.id); setPage(1); setQuery(""); setFilters({ schoolId: "", classId: "", from: "", to: "" }); setAttempt(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível importar a aplicação."); }
    finally { setSaving(false); }
  }
  return <div className="page-shell"><SiteHeader active="assessments" /><main className="bank-panel assessment-panel">
    <p className="card-kicker">INTELIGÊNCIA AVALIATIVA</p><h1>Avaliações e dashboards</h1><p>Acompanhe as aplicações recebidas, a correção das respostas e o desempenho por estudante, questão, habilidade e descritor.</p>
    <details className="assessment-import"><summary>Importar aplicação</summary><p>Selecione o arquivo JSON de uma aplicação exportada pelo sistema principal. O arquivo deve incluir questões, gabaritos, identificadores e respostas.</p><label>Arquivo de avaliação<input type="file" accept=".json,application/json" onChange={event => void chooseImport(event)} disabled={saving} /></label>{importName && <p>{importName}</p>}<button type="button" disabled={!imported || saving} onClick={() => void saveImport()}>{saving ? "Importando…" : "Importar e corrigir respostas"}</button></details>
    <form className="bank-filters assessment-filters" onSubmit={search}>{([['schoolId', 'Escola'], ['classId', 'Turma'], ['from', 'De'], ['to', 'Até']] as const).map(([key, label]) => <label key={key}>{label}<input type={key === "from" || key === "to" ? "date" : "text"} value={filters[key]} onChange={event => setFilters(current => ({ ...current, [key]: event.currentTarget.value }))} /></label>)}<button type="submit">Aplicar filtros</button></form>
    {error && <p role="alert" className="feedback error">{error}</p>}{notice && <p role="status" className="feedback success">{notice}</p>}
    {loading && <p role="status">Carregando aplicações…</p>}
    {data && <><p>{data.total} aplicação(ões) encontrada(s).</p>{!data.total && <p>Nenhuma aplicação neste período. Importe uma aplicação para começar.</p>}
      <div className="assessment-applications">{data.applications.map(application => <button type="button" key={application.id} aria-pressed={selectedId === application.id} onClick={() => setSelectedId(application.id)}><strong>{application.title}</strong><span>{application.classId} · {application.schoolId} · {application.appliedAt.split("-").reverse().join("/")}</span><span>{percent(application.summary.percentage)} de acertos</span></button>)}</div>
      <nav className="bank-pagination" aria-label="Paginação de avaliações"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Página anterior</button><span>Página {data.page} de {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" disabled={page * data.pageSize >= data.total || loading} onClick={() => setPage(value => value + 1)}>Próxima página</button></nav>
    </>}
    {selectedId && !detail && !error && <p role="status">Carregando resultados…</p>}
    {detail && <section aria-label="Resultados da aplicação"><h2>{detail.title}</h2><p>Turma {detail.classId} · Escola {detail.schoolId}</p><div className="assessment-metrics">{[["Acertos", detail.results.summary.correct], ["Erros", detail.results.summary.incorrect], ["Em branco", detail.results.summary.omitted], ["Desempenho", percent(detail.results.summary.percentage)]] .map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <button type="button" disabled={comparison.some(item => item.id === detail.id) || comparison.length >= 2} onClick={() => setComparison(current => [...current, detail])}>Adicionar à comparação ({comparison.length}/2)</button>
      <ResultTable title="Por estudante" rows={detail.results.students} /><ResultTable title="Por questão" rows={detail.results.questions} /><ResultTable title="Por habilidade BNCC" rows={detail.results.skills} />
      <label>Selecionar descritor<select value={descriptor} onChange={event => setDescriptor(event.currentTarget.value)}><option value="">Todos</option>{detail.results.descriptors.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label>
      <ResultTable title="Por descritor" rows={detail.results.descriptors.filter(item => !descriptor || item.id === descriptor)} />
    </section>}
    {!!comparison.length && <section className="assessment-comparison"><h2>Comparação de aplicações</h2><p>Resultados descritivos. Aplicações com questões diferentes não medem necessariamente a mesma aprendizagem.</p><button type="button" onClick={() => setComparison([])}>Limpar comparação</button>{comparison.length < 2 && <p>Abra outra aplicação e adicione à comparação.</p>}{comparison.length === 2 && <><ResultTable title="Resultados lado a lado" rows={comparison.map(item => ({ id: `${item.title} · ${item.classId} · ${item.appliedAt}`, ...item.results.summary }))} />{comparison.map(item => <ResultTable key={item.id} title={`${item.title} — habilidades`} rows={item.results.skills} />)}</>}</section>}
  </main></div>;
}
