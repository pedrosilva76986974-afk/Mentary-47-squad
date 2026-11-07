import { useEffect, useState, type FormEvent } from "react";
import { SiteHeader } from "../components/SiteHeader.js";
import { readApiResponse } from "../utils/api-response.js";
type BankQuestion = { id: string; prompt: string; alternatives: Array<{label:string;text:string}>; answerKey: string;
  pedagogy: { discipline?:string; grade?:string; topic?:string; descriptor?:string; bnccSkills?:string[]; difficulty?:string };
  sources: Array<{documentId:string;origin:{fileName:string};pageStart:number|null;pageEnd:number|null;visualReferences?:Array<{page:number;region?:{x:number;y:number;width:number;height:number}}>} > };
type Result = { questions: BankQuestion[]; total: number; pages: number };
const fields = [{ key:"q",label:"Pesquisar enunciado" },{key:"discipline",label:"Disciplina"},{key:"grade",label:"Ano/série"},{key:"topic",label:"Tema"},{key:"bncc",label:"Habilidade BNCC"},{key:"descriptor",label:"Descritor"}];
function BankVisual({url,page}:{url:string;page:number}) { const [failed,setFailed]=useState(false);return failed?<p>Prévia indisponível. Consulte a origem.</p>:<img className="bank-visual" src={url} alt={"Elemento visual vinculado, página "+page} loading="lazy" onError={()=>setFailed(true)}/>; }
export function QuestionBank() {
  const [filters,setFilters] = useState<Record<string,string>>({});
  const [attempt,setAttempt] = useState(0); const [query,setQuery] = useState(""); const [page,setPage] = useState(1);
  const [result,setResult] = useState<Result>({questions:[],total:0,pages:0});
  const [loading,setLoading] = useState(true); const [error,setError] = useState("");
  const [selected,setSelected] = useState<string[]>([]); const [selection,setSelection] = useState<BankQuestion[]>([]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    void fetch(`/questions?${query}${query ? "&" : ""}page=${page}&pageSize=10`,{signal:controller.signal}).then(readApiResponse<Result>).then(value => {
      if (!controller.signal.aborted) setResult(value);
    }).catch(error => { if(!controller.signal.aborted)setError(error instanceof Error ? error.message : "Não foi possível consultar o banco."); }).finally(() => {if(!controller.signal.aborted)setLoading(false);});
    return () => controller.abort();
  },[query,page,attempt]);
  function search(event: FormEvent) { event.preventDefault(); setAttempt(n=>n+1); setPage(1); setQuery(new URLSearchParams(Object.entries(filters).filter(([,v])=>v.trim())).toString()); }
  async function loadSelection(download: boolean) {
    try {
      setError("");const response=await fetch("/questions/selection",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ids:selected})});
      const data=await readApiResponse<{questions:BankQuestion[]}>(response);setSelection(data.questions);
      if(download){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="questoes-selecionadas.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(error){setSelection([]);setError(error instanceof Error?error.message:"Não foi possível carregar a seleção.");}
  }
  return <div className="page-shell"><SiteHeader active="bank"/><main className="bank-panel">
    <p className="card-kicker">SEU ACERVO</p><h1>Banco de questões</h1><p>Questões aprovadas e publicadas no banco do projeto.</p>
    <form className="bank-filters" onSubmit={search}>{fields.map(field=><label className="question-edit-field" key={field.key}><span>{field.label}</span><input value={filters[field.key]??""} onChange={e=>{const value=e.currentTarget.value;setFilters(current=>({...current,[field.key]:value}));}}/></label>)}
      <label className="question-edit-field"><span>Dificuldade</span><select value={filters.difficulty??""} onChange={e=>{const value=e.currentTarget.value;setFilters(current=>({...current,difficulty:value}));}}><option value="">Todas</option><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option><option value="unknown">Não definida</option></select></label>
      <div className="bank-actions"><button type="submit">Pesquisar</button><button type="button" onClick={()=>{setFilters({});setQuery("");setPage(1);setAttempt(n=>n+1);}}>Limpar filtros</button></div></form>
    <div className="bank-selection"><span>{selected.length} selecionadas</span><button type="button" disabled={!selected.length} onClick={()=>void loadSelection(false)}>Revisar seleção</button><button type="button" disabled={!selected.length} onClick={()=>void loadSelection(true)}>Exportar seleção</button><button type="button" disabled={!selected.length} onClick={()=>{setSelected([]);setSelection([]);}}>Limpar seleção</button></div>
    {error&&<p role="alert">{error}</p>}<p role="status" aria-live="polite">{loading?"Consultando questões…":`${result.total} questão(ões) encontrada(s)`}</p>
    {!loading&&!result.questions.length&&!error&&<p>Nenhuma questão corresponde aos filtros. Altere a pesquisa ou aprove questões na revisão.</p>}
    {!loading&&result.questions.map((question,index)=><article className="bank-question" key={question.id}>
      <label className="bank-select-label"><input type="checkbox" aria-label={`Selecionar questão ${index+1}`} disabled={selected.length>=100&&!selected.includes(question.id)} checked={selected.includes(question.id)} onChange={e=>{const checked=e.currentTarget.checked;setSelected(current=>checked?[...current,question.id]:current.filter(id=>id!==question.id));}}/>Selecionar questão</label>
      <p className="bank-tags">{[question.pedagogy.discipline,question.pedagogy.grade,question.pedagogy.topic].filter(Boolean).join(" · ")||"Metadados não informados"}</p>
      <p className="question-text">{question.prompt}</p><ul className="question-alternatives">{question.alternatives.map((a,i)=><li key={i}><strong>{a.label}</strong> {a.text}</li>)}</ul>
      <details><summary>Gabarito e informações pedagógicas</summary><p>Gabarito: {question.answerKey}</p><p>Descritor: {question.pedagogy.descriptor||"Não informado"}</p><p>BNCC: {question.pedagogy.bnccSkills?.join(", ")||"Não informada"}</p><p>Dificuldade: {({easy:"Fácil",medium:"Média",hard:"Difícil"} as Record<string,string>)[question.pedagogy.difficulty??""]??"Não definida"}</p></details>
      <details><summary>Origens ({question.sources.length})</summary>{question.sources.map((source,i)=><div key={i}><p>{source.origin.fileName} · {source.pageStart===null?"Página desconhecida":`Página ${source.pageStart}${source.pageEnd!==source.pageStart?`–${source.pageEnd}`:""}`} · <a href={`/?review=${source.documentId}`}>Consultar revisão</a></p>{source.visualReferences?.filter(ref=>ref.region).map((ref,j)=><BankVisual key={j} page={ref.page} url={`/documents/${source.documentId}/preview?${new URLSearchParams({page:String(ref.page),...Object.fromEntries(Object.entries(ref.region!).map(([k,v])=>[k,String(v)]))})}`}/>)}</div>)}<p className="editor-help">Origens vinculadas a publicações são preservadas pela limpeza automática.</p></details>
    </article>)}
    <nav className="bank-pagination" aria-label="Paginação do banco"><button type="button" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>Página anterior</button><span>Página {page} de {Math.max(1,result.pages)}</span><button type="button" disabled={loading||page>=result.pages} onClick={()=>setPage(p=>p+1)}>Próxima página</button></nav>
    {selection.length>0&&<section aria-label="Questões selecionadas"><h2>Sua seleção</h2><ol>{selection.map(q=><li key={q.id}>{q.prompt}</li>)}</ol></section>}
  </main></div>;
}
