import { editAlternative, removeAlternative, nextAlternativeLabel, type Alternative } from "../utils/alternative-editing.js";

type Content = { prompt: string; alternatives: Alternative[]; answerKey: string | null };
export function QuestionContentEditor({ content, onChange }: { content: Content; onChange: (change: Partial<Content>) => void }) {
  return <details className="question-editor">
    <summary>Editar conteúdo da questão</summary>
    <p className="editor-help">Edite cada parte separadamente. As mudanças serão registradas ao salvar a questão.</p>
    <fieldset className="editor-category">
      <legend><span>01</span> Enunciado</legend>
      <label className="question-edit-field"><span>Texto do enunciado</span>
        <textarea rows={6} value={content.prompt} onChange={event => onChange({ prompt: event.currentTarget.value })} />
      </label>
      <p className="editor-help">Mantenha aqui o contexto, a pergunta e as instruções. Edite as opções na seção abaixo.</p>
    </fieldset>
    <fieldset className="editor-category">
      <legend><span>02</span> Alternativas</legend>
      <p className="editor-help">Cada opção tem seu próprio identificador e texto. Rótulos numéricos também são aceitos.</p>
      {content.alternatives.map((item, index) => <div className="alternative-editor" key={index}>
        <div className="alternative-editor-heading"><strong>Alternativa {index + 1}</strong>
          <button type="button" className="remove-alternative" aria-label={`Remover alternativa ${index + 1}`} onClick={() => onChange(removeAlternative(content.alternatives, content.answerKey, index))}>Remover</button>
        </div>
        <div className="alternative-editor-fields">
          <label className="question-edit-field"><span>Rótulo</span>
            <input aria-label={`Identificador da alternativa ${index + 1}`} maxLength={10} value={item.label} onChange={event => onChange(editAlternative(content.alternatives, content.answerKey, index, { label: event.currentTarget.value }))} />
          </label>
          <label className="question-edit-field"><span>Texto</span>
            <textarea aria-label={`Texto da alternativa ${index + 1}`} rows={3} value={item.text} onChange={event => onChange(editAlternative(content.alternatives, content.answerKey, index, { text: event.currentTarget.value }))} />
          </label>
        </div>
        {item.label && content.answerKey === item.label && <span className="correct-choice-note">Gabarito selecionado</span>}
      </div>)}
      {!content.alternatives.length && <p className="editor-help">Nenhuma alternativa. Adicione as opções encontradas no documento.</p>}
      <button type="button" className="add-alternative" onClick={() => onChange({ alternatives: [...content.alternatives, { label: nextAlternativeLabel(content.alternatives), text: "" }] })}>+ Adicionar alternativa</button>
      <p className="editor-help">Se remover a alternativa marcada como correta, selecione um novo gabarito no painel de revisão.</p>
    </fieldset>
  </details>;
}
