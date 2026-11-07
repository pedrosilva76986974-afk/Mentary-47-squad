type Fields = { area?: string; discipline?: string; questionType?: string; bnccSkills?: string[] };
export function fillEmptyPedagogy<T extends Fields>(current: T, classification: Fields): T & Fields {
  return { ...current,
    area: current.area || classification.area,
    discipline: current.discipline || classification.discipline,
    questionType: current.questionType || classification.questionType,
    bnccSkills: current.bnccSkills?.length ? current.bnccSkills : classification.bnccSkills,
  };
}
