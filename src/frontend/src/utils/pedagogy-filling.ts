type Fields = { area?: string; discipline?: string; questionType?: string; grade?: string; topic?: string; descriptor?: string; difficulty?: "easy" | "medium" | "hard" | "unknown"; bnccSkills?: string[] };
export function fillEmptyPedagogy<T extends Fields>(current: T, classification: Fields): T & Fields {
  return { ...current,
    area: current.area || classification.area,
    discipline: current.discipline || classification.discipline,
    questionType: current.questionType || classification.questionType,
    grade: current.grade || classification.grade,
    topic: current.topic || classification.topic,
    descriptor: current.descriptor || classification.descriptor,
    difficulty: current.difficulty && current.difficulty !== "unknown" ? current.difficulty : classification.difficulty,
  };
}
