import type { Question } from "../types/review.js";
import { useEffect, useState } from "react";

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

function parseBnccText(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

export function PedagogyFields({ pedagogy, onChange }: Props) {
  // Preserve a comma while typing the next code; normalize only on blur or save.
  const [bnccText, setBnccText] = useState(() => pedagogy.bnccSkills?.join(", ") ?? "");
  useEffect(() => {
    const stored = pedagogy.bnccSkills ?? [];
    if (JSON.stringify(stored) !== JSON.stringify(parseBnccText(bnccText))) {
      setBnccText(stored.join(", "));
    }
  }, [pedagogy.bnccSkills, bnccText]);
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
            value={bnccText}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setBnccText(value);
              onChange({ bnccSkills: parseBnccText(value) });
            }}
            onBlur={() => setBnccText(pedagogy.bnccSkills?.join(", ") ?? "")}
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
