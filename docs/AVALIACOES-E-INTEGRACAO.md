# Avaliações, recuperação e integração — 12/11/2026

Decisão de escopo: identidade, login e autorização por instituição pertencem ao sistema principal. Este módulo não cria contas próprias. A integração real com esse sistema ainda precisa ser conectada e validada. Filtros de escola/turma são filtros de consulta, não controles de autorização.

## Primeira entrega de avaliações

Abra **AVALIAÇÕES** no menu. A tela recebe um arquivo JSON, consulta aplicações por escola/turma/período e abre indicadores, estudantes, questões, habilidades e descritores. Duas aplicações podem ser comparadas. Não são inseridos exemplos automaticamente no banco do usuário.

O [exemplo de entrada](EXEMPLO-AVALIACAO.json) contém apenas dados fictícios. O banco de questões e os snapshots da aplicação são independentes: a correção usa o gabarito registrado na aplicação, sem depender de edições posteriores no banco. O sistema principal pode preencher `questions[].id` com o identificador do seu banco.

### API

| Operação | Endpoint | Resultado |
| --- | --- | --- |
| Receber e corrigir | `POST /assessments` | 201 para nova aplicação; 200 para repetição idêntica; 409 se o mesmo `externalId` vier com conteúdo diferente. |
| Histórico | `GET /assessments?schoolId=...&classId=...&from=AAAA-MM-DD&to=AAAA-MM-DD&page=1` | Até 20 aplicações por página, total e resumo. |
| Resultados | `GET /assessments/:id` | Resumo e resultados por estudante, questão, BNCC e descritor. |

Entrada: `externalId` globalmente único da aplicação, `schoolId`, `classId`, `title`, `appliedAt` (data AAAA-MM-DD), questões e estudantes. Cada questão traz `id`, `prompt`, `alternatives` com rótulo/texto e `answerKey`; BNCC e descritor são opcionais. Cada estudante traz apenas `id` e `answers` indexadas pelo identificador da questão. Cada resposta tem `answer` (rótulo ou `null`) e `durationMs` opcional. Uma resposta ausente também conta como omissão.

Limites: 2 MB de JSON, 200 questões, 500 estudantes, 20 alternativas por questão. Rótulos são normalizados para maiúsculas; gabaritos inexistentes, duplicidades, datas impossíveis, respostas para outra questão e tempos negativos são rejeitados. Campos pessoais não reconhecidos são descartados no snapshot. Identificadores devem ser opacos, sem nomes/e-mails.

Persistência: migração `008_durable_jobs_and_assessments.sql`; schema `avaliacoes`, tabela `aplicacoes`, com entrada normalizada e resultados imutáveis. Reenvio com dados diferentes não sobrescreve o histórico.

### Cálculo

- Percentual = acertos / oportunidades de resposta, incluindo erros e omissões no denominador. Não é média de percentuais arredondados.
- Tempo médio usa somente respostas com duração informada. Zero é uma duração informada; ausência não vira zero.
- Uma questão pode contribuir para mais de uma habilidade. Totais entre habilidades não devem ser somados para calcular o total da turma.
- A distribuição de alternativas não inclui omissões; elas aparecem em coluna própria.
- Comparações são descritivas; provas diferentes não demonstram evolução de aprendizagem por si só.

Ainda faltam regras configuráveis de atenção/alertas, análise longitudinal comparável, exportação de relatórios e adaptação de escopo/perfis ao sistema principal. US13–US15 têm um fluxo inicial implementado; US16–US18 têm entrega parcial; US19–US20 permanecem parciais/futuros, sem classificação automática de lacunas pedagógicas.

## Rascunhos e conflitos

Cada questão retornada pela revisão recebe `revision`, um hash do seu conteúdo editável. O frontend envia `expectedRevision` no PATCH. Uma revisão diferente retorna HTTP 409/`REVIEW_CONFLICT` antes de qualquer gravação. O revisor conserva suas alterações para conciliar com a versão mais recente.

Integrações devem enviar `expectedRevision`. O campo permanece opcional para compatibilidade com clientes antigos, que não têm proteção contra a edição de uma versão desatualizada. Clientes antigos devem ser atualizados antes de trabalho colaborativo.

Com PostgreSQL, leitura, alteração e publicação usam a mesma transação e bloqueio por documento entre processos. O modo por arquivos continua destinado a uma única instância. Um teste cria processos Node independentes, demonstra preservação de duas questões e rejeição de uma versão antiga da mesma questão.

O usuário pode habilitar **Guardar rascunhos neste navegador por até 7 dias**. O armazenamento é local e explícito; após recarga é oferecida recuperação, download para conciliação ou descarte. Só questões cuja revisão ainda corresponde à do servidor são restauradas. Salvar limpa apenas a edição efetivamente enviada. Falha de armazenamento recebe aviso. Isso não sincroniza rascunhos entre dispositivos. A validade é conferida no acesso; apagar dados de um navegador fechado não é possível. No logout/troca de usuário do sistema principal, ele deve remover as chaves `mentary:review-drafts:v1:*` ou usar um contexto de navegador isolado. Não há identidade local para atribuir esses rascunhos a uma conta.

## Fila pedagógica com PostgreSQL

Com `DATABASE_URL`, tarefas, entrada, resultados parciais, cursor e tentativas são persistidos em `extrator.classification_jobs`. Um worker é acionado na inicialização e a cada 2 s. Uma trava de sessão PostgreSQL permite uma chamada ao modelo por vez no conjunto de servidores; cada tarefa usa posse e lease de 60 s, renovada a cada segundo.

Após queda, a tarefa volta a ser elegível quando expira o lease. A retomada usa a entrada registrada e o cursor confirmado; não repete resultados já persistidos. A chamada que terminou antes da queda, mas ainda não foi persistida, pode ser repetida. Cancelamento é persistido e percebido pelo worker em outra instância; gravações tardias são recusadas. Retenção adia exclusão de tarefas ativas ou ainda com lease válido.

Testes reais em banco temporário cobrem dois processos, exclusão mútua do modelo, queda, retomada, parciais e cancelamento entre processos. Uma mudança de host ainda exige que o Ollama esteja acessível pela URL configurada. Originais e manifesto de uploads continuam em arquivos: múltiplas instâncias da aplicação inteira exigem definir armazenamento compartilhado dos documentos; esta entrega coordena revisões e fila no PostgreSQL, não migra arquivos para um serviço de objetos.

Sem PostgreSQL, a fila antiga por arquivos continua disponível e exige retentativa manual após reinício. Snapshots antigos em arquivo não são migrados automaticamente para a nova tabela; pode-se iniciar uma nova classificação a partir da revisão salva.
