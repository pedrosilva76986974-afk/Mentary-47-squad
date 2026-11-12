import type { Question } from "../types/review.js";

type Pedagogy = NonNullable<Question["pedagogy"]>;
type Props = {
  pedagogy: Pedagogy;
  onChange: (change: Partial<Pedagogy>) => void;
};

const primaryFields = [
  { key: "area", label: "Área do conhecimento" },
  { key: "questionType", label: "Tipo de questão" },
] as const;

const detailFields = [
  { key: "discipline", label: "Disciplina" },
  { key: "grade", label: "Ano/série" },
  { key: "topic", label: "Tema" },
] as const;

export function PedagogyFields({ pedagogy, onChange }: Props) {
  function textField(field: { key: Exclude<keyof Pedagogy, "bnccSkills" | "difficulty">; label: string }) {
    return (
      <label className="question-edit-field" key={field.key}>
        <span>{field.label}</span>
        <input
          value={pedagogy[field.key] ?? ""}
          onChange={(event) => onChange({ [field.key]: event.currentTarget.value })}
        />
      </label>
    );
  }

  return (
    <>
      {primaryFields.map(textField)}
      <div className="pedagogy-fields">
        {detailFields.map(textField)}
        <label className="question-edit-field">
          <span>Habilidades BNCC (separadas por vírgula)</span>
          <input
            value={pedagogy.bnccSkills?.join(", ") ?? ""}
            onChange={(event) =>
              onChange({
                bnccSkills: event.currentTarget.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        {textField({ key: "descriptor", label: "Descritor" })}
        <label className="question-edit-field">
          <span>Dificuldade</span>
          <select
            value={pedagogy.difficulty ?? "unknown"}
            onChange={(event) =>
              onChange({
                difficulty: event.currentTarget.value as Pedagogy["difficulty"],
              })
            }
          >
            <option value="unknown">Não definida</option>
            <option value="easy">Fácil</option>
            <option value="medium">Média</option>
            <option value="hard">Difícil</option>
          </select>
        </label>
      </div>
    </>
  );
}
