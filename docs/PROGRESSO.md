# Ciclos de desenvolvimento — 04/11/2026

## Reorganização UI/UX — 07/11/2026

Após o upload, a apresentação institucional dá lugar à área de revisão. Marca, roxo, azul e verde Mentary foram preservados. Cabeçalho mostra documento e contadores de status; análise IA e detalhes técnicos ficam recolhidos. Conteúdo, fonte e edição textual ficam à esquerda em desktop; decisões de revisão, gabarito, classificação e ações ficam no painel direito. Até 1000 px os painéis passam para uma coluna. O formulário de novo envio abre por ação explícita, sem ocupar permanentemente o topo da revisão. Mensagens de salvamento aparecem no contexto da revisão, sem duplicação no formulário escondido.

Homologação real no navegador: navegação à questão 2 do documento fictício, seleção de gabarito, edição de responsável e área, salvamento confirmado, abertura/fechamento do novo envio e foco por Tab. Conferidos 1366 px (duas colunas) e 390 px (uma coluna), sem transbordamento horizontal. Cabeçalho principal H1 e foco visível confirmados. Dados editados pertencem exclusivamente à revisão fictícia de teste. Não houve teste com participantes humanos.

## Interface e testes de uso simulados — 07/11/2026

A #4 foi confirmada como atendida pelo responsável no GitHub; não permanece como bloqueio desta execução.

Reorganizada a revisão com um cartão por vez, navegação entre questões, sugestões da IA dentro do cartão correspondente, editor recolhível e diagnóstico técnico sob demanda. Corrigidos o total undefined ao reabrir revisões e onze handlers que liam event.currentTarget dentro de atualizadores adiados do React, causando tela em branco ao editar. Valores dos eventos são capturados antes de atualizar o estado.

Foram executados testes reais na tela com dados fictícios, incluindo aprovação bloqueada, gabarito, responsável, aprovação/reabertura, navegação, foco e cancelamento da IA em 390 px. Evidências textuais e limites em docs/TESTES-DE-TELA.md. Não se trata de teste com usuários humanos. A inicialização da análise foi ajustada para consultar o estado existente antes de iniciar uma nova tarefa; reabrir uma revisão cancelada não deve reiniciá-la automaticamente.

O teste revelou reinícios do backend por monitoramento de arquivos gerados. Substituído o watcher nativo pelo watcher do tsx com exclusão de uploads/public; repetido o cenário de aprovação com sucesso.

Verificação final: 94 testes gerais passaram, zero falhas e um teste PostgreSQL optativo ignorado na suíte comum; esse teste foi executado separadamente em banco isolado e passou. Build/typecheck frontend passou. Cancelamento ao reabrir foi confirmado também na tela. Lint dedicado permanece uma pendência; checagem de espaços do Git é distinta de lint.

Próxima etapa #17 bloqueada pela ausência do SQL oficial do destino public.questions. Solicitado ao responsável o link da migration. A #18 depende da definição dos registros publicados; não foi implementada uma consulta que fingisse publicar dados no banco definitivo. A view de preparação existente não é equivalente à publicação. Nenhuma tabela de referência foi inventada ou substituída.

## Cancelamento de upload e IA — issue #23 — 06/11/2026

Implementado botão de cancelamento do upload com AbortController; o backend observa a desconexão e propaga AbortSignal para PDF/renderização/OCR, verifica cancelamento entre etapas e desfaz os registros da requisição cancelada antes de devolver sucesso. O worker OCR ativo é terminado no cancelamento. Operações nativas curtas/validação/armazenamento já iniciados não são preemptivos; seu resultado é descartado ou desfeito ao observar o sinal.

Acrescentado cancelamento explícito da análise pedagógica: endpoint POST /documents/{id}/classification/cancel, botão na revisão, estado persistido cancelled, interrupção do fetch e dos próximos lotes, preservação de resultados parciais e repetição após cancelamento. Tarefas enfileiradas canceladas não chamam Ollama. Conclusões existentes são preservadas. Documentos sem questões não iniciam IA no frontend e são rejeitados nessa rota pelo backend.

Validação: 94 testes passaram, zero falhas, um teste PostgreSQL optativo ignorado; builds backend e frontend passaram. Regressões cobrem PDF com duas páginas abortado no primeiro OCR, cancelamento antes da extração, requisição Ollama pendente abortada, tarefa enfileirada cancelada, repetição idempotente e nova análise. Não foi homologada visualmente a interação no navegador nem demonstrada liberação imediata de GPU; abortar a chamada não descarrega necessariamente o modelo.

## Recuperar análise com BNCC malformada — 06/11/2026

O PDF de erro mostrou `Sugestão pedagógica inválida`. A falha foi reproduzida com Qwen 3.5 4B no documento de 13 questões: o modelo retornou descrições no array de códigos e exemplos incompletos como EM13MAT02. A validação anterior rejeitava o lote inteiro, inclusive suas classificações não BNCC.

Agora códigos completos podem ser extraídos de descrições; códigos incompletos são descartados com aviso, sem inventar dígitos ou perder área, disciplina e tipo. Não há validação de existência em catálogo oficial. A validação estrutural de índices e duplicatas continua obrigatória.

Cada lote concluído é persistido e mostrado na tela durante o processamento. Nova execução real no mesmo documento terminou com 13 sugestões, com progresso observado em 5 e 10 itens. Seis testes direcionados passaram, ambos os builds passaram. Os metadados confirmados não são preenchidos automaticamente: as sugestões surgem automaticamente para conferência e cópia explícita dos campos vazios.

## Questão 5 com alternativas numéricas — 06/11/2026

O relato em PDF foi comparado com o arquivo original `Lista de Questoes para Teste de OCR (1).pdf`. A questão 5 tinha alternativas `1.` a `5.` com pares de raízes, não reconhecidas pelo extrator de alternativas. Foi acrescentado reconhecimento conservador de sequências numéricas pontuadas com respostas numéricas/equações e leitura de gabaritos explícitos como `Q05: 1`, preservando os rótulos originais.

Reprocessamento real: 13 questões mantidas; questão 5 com cinco alternativas e gabarito `1`. Teste de regressão inclui a questão seguinte e gabarito misto letra/número. Suíte: 89 testes passaram, zero falhas, um teste PostgreSQL optativo ignorado; build backend passou. Limite separado: expoentes e índices do PDF ainda podem perder sua posição no texto extraído; esta correção não reconstrói fórmulas nem resolve as questões.

O ambiente local não tinha OLLAMA_MODEL; foi configurado `qwen3.5:4b` e o backend foi reiniciado com sucesso. O arquivo de ambiente local não é versionado.

## Respostas vazias da API — 06/11/2026

Relato: `Response.json(): Unexpected end of JSON input`. As chamadas do frontend liam JSON diretamente, inclusive quando o corpo estava vazio. Foi acrescentado um leitor compartilhado que trata respostas vazias, HTML, JSON truncado e formato inesperado; preserva mensagens de validação enviadas pela API. Upload, consulta, salvamento e análise pedagógica usam o leitor.

Validação: dois testes de regressão passaram e o build/typecheck do frontend passou. Na inspeção ao vivo, `/health` respondeu 200 com JSON, e uma consulta inexistente pelo proxy de 5173 respondeu 404 com JSON. A falha transitória original não foi reproduzida; não foi atribuída uma causa de rede sem evidência. O tratamento evita a exceção de JSON, mas indisponibilidade da API ainda exige restabelecer o backend.

## Correção de inicialização — 06/11/2026

Foi reproduzido no banco existente o erro PostgreSQL 42P16 ao aplicar a migração 004: instalações antigas tinham a view com colunas em ordem diferente. A migração agora recria somente a view não materializada, sem CASCADE e sem remover dados das tabelas. O teste PostgreSQL isolado cobre também o formato legado. Após a correção, a migração aplicada no ambiente local permitiu iniciar a API e `/health` respondeu `{"status":"ok"}`. Endereços e comandos de execução permanecem os mesmos.

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
