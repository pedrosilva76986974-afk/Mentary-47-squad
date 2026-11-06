# Ciclos de desenvolvimento — 04/11/2026

## Análise pedagógica posterior ao upload — 06/11/2026

O Ollama foi retirado da identificação síncrona. PDF.js/OCR e parser local devolvem a revisão sem esperar pela IA. A interface inicia uma solicitação posterior via POST e consulta o estado via GET, sem bloquear a edição.

Foi implementada fila serial com limite de vinte documentos ativos e lotes de cinco questões. As sugestões e os estados são salvos em arquivos separados das revisões. Solicitações simultâneas são deduplicadas; resultados do mesmo conteúdo/modelo são reutilizados. Falhas podem ser repetidas e análises interrompidas por reinício são sinalizadas. A fila é para uma instância do servidor; não há recuperação automática ou coordenação distribuída.

A IA sugere área, disciplina, tipo de questão e BNCC com justificativa e confiança. Ano/série e disciplina já informados são enviados como contexto. Mudanças no enunciado, alternativas ou contexto pedagógico invalidam as sugestões anteriores. Área e tipo foram acrescentados aos campos editáveis e são persistidos no JSON pedagógico existente. Sugestões média/alta podem preencher somente campos vazios após ação explícita do revisor; confiança baixa não permite cópia rápida. É necessário salvar para confirmar os dados.

Validação: suíte geral com 86 testes passando, zero falhas e um teste PostgreSQL optativo ignorado; ambos os builds passaram. Testes direcionados (cinco, incluindo o teste pai) cobriram retorno sem esperar pelo modelo, deduplicação, cache, falhas, repetição, preservação dos dados revisados, conteúdo desatualizado, reinício e rejeição de índices/códigos inválidos. Os testes antigos de filtragem síncrona pelo Ollama foram substituídos, pois esse comportamento foi removido.

Ensaio real com `qwen3.5:4b` em uma questão fictícia: aproximadamente 33 segundos na primeira execução e 3,3 segundos na segunda com modelo carregado. A resposta foi de baixa confiança e BNCC vazia; a primeira resposta também errou o tipo. Esses ensaios validam comunicação e formato, não acurácia pedagógica. As instruções foram ajustadas e a cópia rápida de baixa confiança foi bloqueada. Os tempos são amostras únicas, não benchmark.

Limites: códigos BNCC passam por validação de formato, sem consulta a catálogo oficial. Sua existência e pertinência não são garantidas pelo modelo. Conferência docente continua obrigatória. Não há classificação automática de gabarito, aprovação nem alteração de texto pela IA. O processamento em segundo plano ainda compartilha CPU/GPU com extração e OCR. Não foi feita homologação visual manual do navegador; os campos novos passaram por compilação e verificação de tipos.

## Retomada — 06/11/2026

O Docker Engine voltou a ficar disponível. Foi acrescentado um teste real de PostgreSQL que cria um banco com nome aleatório, aplica as migrações e remove apenas esse banco temporário ao terminar. O banco da aplicação permanece preservado.

Verificações reais: migrações 001–004, preservação da ordem das alternativas e do gabarito, importação legada sem sobrescrita, exclusão de questões pendentes/rejeitadas da view, índice correto começando em zero e rollback de uma gravação inválida sem perda da revisão anterior.

A migração 004 corrige a prontidão de exportação: metadados BNCC ausentes ou malformados retornam `false` e sinalizam a pendência. As migrações já publicadas não foram reescritas.

Validação desta retomada: 87 testes gerais passaram, sem falhas; o teste PostgreSQL é ignorado nessa execução comum e foi executado separadamente com sucesso. Builds do backend e frontend passaram. `git diff --check` passou. Lint dedicado continua não configurado.

Os ciclos funcionais de 04/11 foram revalidados. A indisponibilidade do Docker relatada abaixo é histórica e está resolvida. A publicação em `public.questions` continua pendente do schema oficial de destino e dos testes de integração dessa publicação. Não foi declarado atendimento integral às issues #17 e #18.

Base da execução: branch `pedro-backend`, commit `f3acfe6`. Escopo do produto: questões objetivas, com revisão humana dos candidatos incertos. As issues citadas pertencem a `pedrosilva76986974-afk/Mentary-47-squad`.

## Ciclo 1 — Integridade da aprovação (#14 e #16)

Problema: a validação era executada somente quando a atualização incluía `status: approved`. Uma edição posterior podia remover gabarito ou responsável e manter a questão aprovada.

Implementado:

- Validar o estado final em toda atualização que mantém a aprovação.
- Exigir enunciado, pelo menos duas alternativas com texto e rótulos não vazios e únicos, gabarito correspondente e responsável.
- Rejeitar alterações inválidas com HTTP 400, preservando os dados salvos.
- Permitir retirar dados obrigatórios junto com a devolução para `pending_review`.
- Retirar a validação dos UUIDs de dentro do laço de campos pedagógicos, evitando quatro execuções desnecessárias.

Validação: teste de integração aprova uma questão, tenta sete alterações inválidas e consulta o registro após cada tentativa. Confirma também a devolução para revisão com remoção do gabarito. A suíte de documentos passou com 36 testes nesta etapa.

Limites: a verificação cobriu a API e a persistência em arquivos temporários. Registros antigos inconsistentes não foram alterados automaticamente. PostgreSQL real e autenticação do responsável não foram validados; o responsável continua sendo informado pelo revisor, como na arquitetura existente.

## Ciclo 2 — Preservar candidatos incompletos (#9)

Problema: uma questão numerada sem instrução explícita de seleção podia desaparecer quando o OCR não recuperava suas alternativas. O Ollama também podia descartar candidatos incompletos.

Implementado:

- Manter candidatos numerados sem alternativas quando não apresentam instrução clara de resposta discursiva ou lista de cálculos.
- Preservar texto, identificação, páginas e sinalizações de componentes ausentes.
- Ignorar a classificação negativa do Ollama para candidatos com menos de duas alternativas e indicar manutenção das regras locais no diagnóstico.
- Manter a exclusão dos exercícios claramente discursivos e listas de equações já cobertos pelos testes.

Validação: dez testes direcionados de identificação/Ollama passaram. Foi acrescentada uma integração que envia um PDF sem alternativas e consulta a revisão para confirmar a persistência do candidato e das sinalizações.

Limites: o parser ainda precisa reconhecer um candidato. Não há garantia de recuperar texto ilegível ou questões cujos limites não foram identificados. Itens numerados ambíguos podem aparecer para rejeição manual. A issue #9 tem avanço validado, mas não representa homologação de todos os formatos de documentos.

## Ciclo 3 — Documentação (#1, #4 e #6)

- Restaurada a seção de integrantes e links conforme o README da `main` consultado no GitHub.
- Documentado o fluxo de branches `feature/USxx-descricao`, commits relacionados às issues e integração por Pull Request.
- Padronizadas as 12 histórias com prefixo `US`, mantendo os vínculos com RF01–RF12 e os critérios existentes.
- Documentadas as regras de aprovação e preservação de candidatos.

Validação: conferência das 12 identificações US e dos 12 requisitos RF; verificação de espaços pelo Git. A documentação da #4 está atendida, mas a configuração de proteção da `main` permanece sem confirmação. Nenhuma issue foi fechada ou movida no quadro nesta execução.

## Verificação final

| Verificação | Resultado |
| --- | --- |
| `node --import tsx --test --test-force-exit test/*.test.ts` no backend | 87 testes passaram; zero falhas e zero ignorados |
| `npm run build` no backend | Passou |
| `npm run build` no frontend | Typecheck e compilação passaram |
| `git diff --check` | Passou |
| Lint dedicado | O projeto não possui script/configuração de lint; o typecheck não equivale a lint |
| Integração com PostgreSQL real | Bloqueada: Docker Engine indisponível |

A opção `--test-force-exit` encerra o processo após os testes. Não foi demonstrado nesta execução o encerramento natural de todos os recursos de OCR; isso permanece uma tarefa de infraestrutura dos testes. Os testes de schema existentes verificam o SQL como texto, não executam migrações em um servidor PostgreSQL.

## Próximas prioridades e bloqueios

1. **#17 — Publicação no Banco Mentary:** disponibilizar PostgreSQL/Docker para testes isolados e obter a migration oficial de `public.questions` e suas referências. O README descreve o formato, mas não fornece todos os detalhes do schema. Implementar publicação transacional, vínculo de origem e prevenção de duplicatas, verificando UUIDs contra os registros de destino. Não considerar a view existente uma publicação concluída.
2. **#18 — Consulta e filtros:** implementar API e interface de consulta dos registros publicados, com paginação, filtros combinados e seleção de questões. Depende da definição e validação do banco de destino.
3. **#10 — Elementos visuais:** substituir a associação apenas por página por identificação da região visual de cada questão e validar páginas com várias questões/imagens.
4. **#11 — Origem sem página:** permitir representação explícita de página desconhecida no contrato, banco e interface, com migração validada.
5. **#4 — Proteção da main:** conferir no GitHub se Pull Requests são obrigatórios e alinhar as regras com a equipe. A documentação não altera as permissões do repositório.
6. **Infraestrutura:** configurar lint dedicado, identificar recursos que mantêm os testes abertos e acrescentar testes reais de migração/persistência em banco isolado.

Nenhum deploy, alteração de credenciais, reset de banco ou remoção de dados de usuário foi realizado.
