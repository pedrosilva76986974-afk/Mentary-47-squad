# Auditoria de issues — 11/11/2026

Escopo confirmado pelo responsável: concluir o extrator e cadastrar avaliações/dashboards como backlog futuro. A auditoria compara critérios das issues com código, testes e documentação; issue fechada não é, sozinha, evidência de implementação. As alterações ainda precisam ser revisadas e integradas.

Continuação em 12/11/2026: a [revisão técnica do código](REVISAO-CODIGO.md) registra novos achados e as issues #36–#43. O [guia do código](GUIA-DO-CODIGO.md) documenta módulos, API, persistência, configuração e manutenção. As garantias de concorrência são para uma instância; o atendimento distribuído continua parcial em #38 e #42.

## Rastreabilidade do extrator

| Issue | Situação verificada | Evidência e ação |
| --- | --- | --- |
| #1 Equipe no README | Conteúdo presente | README inicia com squad, integrantes e links. |
| #2 Histórias como issues | Lacuna de cadastro corrigida | US01–US12 em #7–#18; US13–US20 agora em #27–#34. |
| #3 GitHub Projects | Fechada no GitHub; quadro não verificado | A integração disponível não permite administrar o Projects. Prioridade/dependências da próxima etapa foram registradas nas issues e neste documento. |
| #4 Proteção da main | Regras documentadas; configuração não verificada | Consulta à proteção retornou HTTP 403. Lista de rulesets vazia não comprova ausência de proteção clássica. Não afirmar que main está protegida ou desprotegida. |
| #5 Nome do repositório | Nome presente | Mentary-47-squad. |
| #6 Histórias e requisitos | Documento presente; numeração corrigida | docs/HistoriasUsuarios.markdown padronizado em US01–US20, com RF e critérios. |
| #7 Envio | Implementado; testes de sucesso/falha | documents.test.ts, upload-concurrency.test.ts e cancellation.test.ts; limites de formato, assinatura, páginas e tamanho. |
| #8 Extração | Implementada com revisão humana | PDF digital, escaneado, misto, PNG/JPEG e parser; documentos ilegíveis não viram questões válidas. |
| #9 Componentes | Implementados; inconsistência corrigida | Avisos de alternativas incompletas passam pela mesma normalização ao salvar e reabrir; regressão em documents.test.ts. |
| #10 Visuais | Implementados com recortes estimados e ajuste humano | Corrigida troca da referência principal. Falha de inspeção visual passa a gerar aviso por página, sem descartar texto legível; cancelamento continua propagado. Aviso só sai após confirmação do recorte. |
| #11 Origem | Implementada | Documento, intervalo ou página desconhecida preservados; fontes publicadas protegidas pela retenção. |
| #12 Revisão | Implementada; salvamento reforçado | Resposta tardia de salvar não apaga edição feita durante a requisição. Testes de rascunho e persistência. |
| #13 Edição | Implementada | Enunciado e alternativas independentes; relabeling preserva associação do gabarito; remoção da correta limpa a seleção. |
| #14 Gabarito | Implementado | Gabarito obrigatório e correspondente para aprovar; aprovação inválida preserva os dados salvos. |
| #15 Pedagogia | Implementada | Área, tipo, disciplina, série, tema, BNCC manual, descritor e dificuldade; testes de edição/persistência. Sem promessa de validação oficial dos códigos. |
| #16 Estados | Implementados | Aprovar, rejeitar, manter em revisão e exigir responsável; validação do estado final em toda atualização. |
| #17 Banco próprio | Implementado | Publicação transacional no PostgreSQL, UNIQUE por representação normalizada, origens e retirada de aprovação. Sem deduplicação semântica universal. |
| #18 Consulta | Implementada; seleção reforçada | Todos os filtros, paginação, múltiplas origens, revalidação e exportação JSON. Prévia é limpa ao mudar a seleção; requisição pendente é cancelada ao sair da tela. |
| #21 IA posterior | Implementada | Fila serial, cache, retentativa e resultados incrementais. Reinício exige nova tentativa; não é fila distribuída. |
| #22 Preenchimento pedagógico | Implementado | Somente campos vazios, sem BNCC automática e sem alterar texto/gabarito/status. Resultados precisam ser salvos pelo revisor. |
| #23 Cancelamento | Implementado; apresentação de parciais reforçada | Estados cancelado/falha mostram quantidade parcial preservada; fila, fetch e resultados tardios cobertos em ollama.test.ts. |
| #24 Diagrama | Documento presente e atualizado | docs/DIAGRAMA-DE-CLASSES.md descreve entidades, serviços funcionais e persistência. |

## Avaliações e dashboards: próxima etapa

Estas histórias estão cadastradas, mas **não implementadas**. Não são pendências ocultas da entrega do extrator.

| História | Issue | Prioridade | Dependências principais |
| --- | --- | --- | --- |
| US13 Receber dados da avaliação | #27 | P1, após o extrator | #17 e #18; contrato e permissões |
| US14 Processar respostas | #28 | P1 | #27 |
| US15 Calcular desempenho | #29 | P2 | #28 |
| US16 Dashboard por perfil | #30 | P2 | #29 e definição de acesso |
| US17 Relatório por descritor | #31 | P2 | #29 |
| US18 Comparar resultados | #32 | P2 | #29 |
| US19 Lacunas de aprendizagem | #33 | P2 | #29 e #31 |
| US20 Qualidade das questões | #34 | P2 | #28 e #29 |

## Ciclos executados

1. Inventário: 22 issues existentes, 11 abertas e 11 fechadas; comparadas com as 20 histórias do documento. Identificados oito cadastros ausentes e divergências documentais.
2. Correções: recortes, continuidade diante de falha visual, avisos de campos incompletos, preservação de edições durante salvamento, seleção do banco e mensagens de classificação parcial.
3. Validação: testes de regressão, lint e builds; integração PostgreSQL/OCR e checagens remotas acompanhadas no PR da entrega. Os resultados finais ficam registrados em docs/PROGRESSO.md e na execução do GitHub Actions.

## Limites e verificação humana

- Não foram alterados estados das issues para fingir que código ainda não integrado já está entregue na main.
- Homologação pedagógica com professores e acervo amplo continua necessária. Testes sintéticos não substituem essa validação.
- Acesso administrativo ao GitHub Projects e à proteção da main não está disponível pela integração atual.
- Autenticação por instituição e armazenamento durável de rascunhos após fechar/recarregar a aba são evoluções recomendadas antes de uso compartilhado; não eram critérios obrigatórios das issues do extrator. O módulo futuro exige definir essas permissões antes da implementação.
- Deploy permanece fora do escopo até a escolha de hospedagem, conforme decisão anterior do responsável. CI é tratado no PR #26.

## Critério de encerramento deste trabalho

Encerrar quando cada issue existente estiver ligada à implementação/evidência ou a uma limitação explícita; as lacunas corrigíveis do extrator passarem nas verificações; e US13–US20 estiverem cadastradas com critérios e dependências. Novas ideias não reiniciam indefinidamente o ciclo.
