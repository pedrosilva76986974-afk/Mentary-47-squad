# Modelo de domínio e diagrama de classes

O diagrama representa entidades e serviços lógicos. Os serviços são implementados como funções TypeScript, não como classes instanciadas.

```mermaid
classDiagram
  class DocumentOrigin {
    +UUID id
    +string fileName
    +string mimeType
    +string sha256
  }
  class ReviewResult {
    +UUID documentId
    +string sourceText
    +ReviewQuestion[] questions
  }
  class ReviewQuestion {
    +string id
    +string prompt
    +string answerKey
    +string status
    +string reviewedBy
    +NullableNumber pageStart
    +NullableNumber pageEnd
  }
  class Alternative {
    +string label
    +string text
  }
  class Pedagogy {
    +string discipline
    +string grade
    +string topic
    +string[] bnccSkills
    +string descriptor
    +string difficulty
  }
  class VisualReference {
    +number page
    +string kind
    +string association
    +Region region
  }
  class Region {
    +number x
    +number y
    +number width
    +number height
  }
  class PublishedQuestion {
    +UUID id
    +string fingerprint
    +string prompt
    +string answerKey
  }
  class PublicationSource {
    +string reviewQuestionId
    +UUID documentId
    +boolean active
    +Pedagogy pedagogy
  }
  class QuestionBankService {
    <<service>>
    +syncQuestionBank()
    +searchQuestionBank()
    +selectBankQuestions()
  }
  class ExtractionService {
    <<service>>
    +extractDocument()
  }
  class ClassificationService {
    <<service>>
    +startClassification()
    +cancelClassification()
  }
  DocumentOrigin "1" -- "1" ReviewResult : identifica
  ReviewResult "1" *-- "0..*" ReviewQuestion : contém
  ReviewQuestion "1" *-- "0..*" Alternative
  ReviewQuestion "1" *-- "0..1" Pedagogy
  ReviewQuestion "1" *-- "0..*" VisualReference
  VisualReference *-- Region
  PublishedQuestion "1" *-- "1..*" PublicationSource
  PublishedQuestion "1" *-- "2..*" Alternative
  PublicationSource --> DocumentOrigin : snapshot
  PublicationSource ..> ReviewQuestion : identidade lógica da origem
  QuestionBankService --> PublishedQuestion
  ExtractionService --> ReviewResult
  ClassificationService --> Pedagogy
```

A relação entre PublicationSource e a revisão é lógica: o conteúdo publicado não é apagado em cascata por remoção administrativa da revisão. A limpeza automática protege origens com publicações ativas. Alternativas publicadas e snapshots são valores JSONB; as alternativas da revisão possuem tabela relacional própria.

```mermaid
sequenceDiagram
  actor Revisor
  participant UI
  participant API
  participant PostgreSQL
  Revisor->>UI: Aprovar questão
  UI->>API: PATCH revisão
  API->>API: Validar estado final
  API->>PostgreSQL: BEGIN
  API->>PostgreSQL: Salvar revisão e alternativas
  API->>PostgreSQL: Publicar por fingerprint e vincular origem
  API->>PostgreSQL: COMMIT
  API-->>UI: Revisão salva e publicação confirmada
  Revisor->>UI: Pesquisar e selecionar
  UI->>API: GET /questions com filtros
  API->>PostgreSQL: Consultar somente origens ativas aprovadas
  API-->>UI: Resultados paginados
```
