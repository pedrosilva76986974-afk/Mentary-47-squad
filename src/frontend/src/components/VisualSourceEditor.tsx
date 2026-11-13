import { useState } from "react";
import { applySourceCrop, type QuestionSource as Source, type SourceRegion as Region } from "../utils/source-editing.js";

export function VisualSourceEditor({
  documentId,
  pages,
  content,
  onChange,
}: {
  documentId: string;
  pages: number;
  content: Source;
  onChange: (value: Partial<Source>) => void;
}) {
  const first = content.visualReferences?.[0];
  const [page, setPage] = useState(String(first?.page ?? content.pageStart ?? ""));
  const [region, setRegion] = useState<Region>(first?.region ?? { x: 0, y: 0, width: 1, height: 1 });
  const [error, setError] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const previewPage = first?.page ?? content.pageStart;
  const previewRegion = first?.region ?? { x: 0, y: 0, width: 1, height: 1 };
  const params = new URLSearchParams({
    page: String(previewPage),
    ...Object.fromEntries(Object.entries(previewRegion).map(([k, v]) => [k, String(v)])),
  });
  function apply() {
    try {
      const updated = applySourceCrop(content, Number(page), pages, region);
      setError("");
      setPreviewError(false);
      onChange(updated);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível aplicar o recorte.");
    }
  }
  return (
    <details className="question-source">
      <summary>Documento original e vínculo visual</summary>
      {first?.association === "automatic" && (
        <p className="visual-review-note">
          Recorte estimado pelos limites da questão. Confira e ajuste quando necessário.
        </p>
      )}
      {first?.extractionWarning && <p className="visual-review-note" role="alert">{first.extractionWarning}</p>}
      {first && !first.region && !first.extractionWarning && (
        <p className="visual-review-note" role="note">
          Elemento detectado nesta página; a associação ainda precisa de confirmação. Defina um recorte
          abaixo.
        </p>
      )}
      {content.pageStart === null && (
        <p role="note">Página de origem desconhecida. O documento continua vinculado à questão.</p>
      )}
      {previewPage !== null && !previewError && (
        <img
          key={`${previewPage}-${params}`}
          src={`/documents/${documentId}/preview?${params}`}
          alt="Recorte do documento original vinculado à questão"
          onError={() => setPreviewError(true)}
          loading="lazy"
        />
      )}
      {previewError && (
        <p role="alert">
          A prévia não está disponível. O arquivo pode ter expirado; consulte os dados de origem.
        </p>
      )}
      <a
        href={`/documents/${documentId}/source${content.pageStart === null ? "" : `#page=${content.pageStart}`}`}
        target="_blank"
        rel="noreferrer"
      >
        Abrir documento completo
      </a>
      <label className="bank-select-label">
        <input
          type="checkbox"
          checked={content.pageStart === null}
          onChange={(e) => {
            const checked = e.currentTarget.checked;
            if (checked) {
              onChange({ pageStart: null, pageEnd: null });
              setPage("");
            } else {
              setPage("1");
              onChange({ pageStart: 1, pageEnd: 1 });
            }
          }}
        />
        Página de origem desconhecida
      </label>
      <fieldset className="source-crop-fields">
        <legend>Ajustar associação com a questão</legend>
        <label className="question-edit-field">
          <span>Página de origem</span>
          <input
            type="number"
            min={1}
            max={pages}
            value={page}
            onChange={(e) => setPage(e.currentTarget.value)}
          />
        </label>
        {(
          [
            { key: "x", label: "Esquerda (%)" },
            { key: "y", label: "Topo (%)" },
            { key: "width", label: "Largura (%)" },
            { key: "height", label: "Altura (%)" },
          ] as const
        ).map((f) => (
          <label className="question-edit-field" key={f.key}>
            <span>{f.label}</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={Math.round(region[f.key] * 1000) / 10}
              onChange={(e) => {
                const value = Number(e.currentTarget.value) / 100;
                setRegion((current) => ({ ...current, [f.key]: value }));
              }}
            />
          </label>
        ))}
        <button type="button" onClick={apply}>
          Aplicar recorte à questão
        </button>
        <p className="editor-help">As mudanças serão registradas ao salvar a questão.</p>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
