# Banco próprio e contratos

O projeto mantém revisão e acervo definitivo no mesmo PostgreSQL, em schemas separados. Não depende de tabelas, contas nem disponibilidade de um banco externo.

| Schema/tabela | Finalidade |
| --- | --- |
| extrator.review_documents | Documento, texto extraído e diagnóstico |
| extrator.review_questions | Questão editável e seu estado de revisão |
| extrator.question_alternatives | Alternativas ordenadas da revisão |
| banco.questions | Conteúdo publicado com identificação por hash único |
| banco.question_sources | Todas as origens, metadados e recortes de cada publicação |

## Publicação e duplicidade

Salvar uma aprovação válida publica dentro da mesma transação da revisão. São necessários enunciado, duas alternativas válidas com rótulos únicos, gabarito correspondente e responsável. BNCC, descritor oficial, autor externo e instituição externa não são obrigatórios para publicar; os campos pedagógicos disponíveis são preservados. Não há aprovação automática pela IA.

O hash considera texto normalizado em Unicode NFC/espaçamento, alternativas na ordem original e gabarito. Rótulos ignoram diferença entre maiúsculas e minúsculas; conteúdo matemático preserva essa diferença. A deduplicação é conservadora: não afirma equivalência semântica entre paráfrases, fórmulas diferentes ou alternativas reordenadas. A restrição UNIQUE impede duplicatas concorrentes com a mesma representação normalizada. Origens repetidas são associadas à publicação existente.

Rejeitar ou reabrir uma questão desativa sua origem no banco. Uma publicação continua disponível se outra origem estiver aprovada. Os filtros procuram uma origem ativa que satisfaça todos os critérios combinados. O retorno preserva todas as origens ativas, e os metadados apresentados correspondem à origem encontrada pelo filtro (ou à mais recentemente atualizada).

Documentos/revisões associados a publicações ativas são protegidos da limpeza automática. Mesmo em remoção administrativa da revisão, a publicação conserva seu snapshot de origem; a disponibilidade do arquivo exige que ele também seja preservado no backup.

## API

| Método | Rota | Contrato |
| --- | --- | --- |
| GET | /questions | q, discipline, grade, topic, bncc, descriptor, difficulty, page, pageSize |
| GET | /questions/:id | Questão publicada e origens |
| POST | /questions/selection | Objeto com ids: lista de 1 a 100 UUIDs; conserva a ordem selecionada |
| PATCH | /documents/:id/review/questions/:questionId | Revisão, metadados, pageStart/pageEnd e visualReferences |
| GET | /documents/:id/preview | page e recorte normalizado x/y/width/height; retorna PNG |

Busca textual aceita trechos literais no enunciado. Filtros pedagógicos são combinados por AND e comparam o valor completo, ignorando maiúsculas/minúsculas. Habilidades BNCC comparam cada código do array. Paginação padrão 20, máximo 100. Seleção de uma publicação que deixou de estar disponível retorna erro, sem exportar silenciosamente uma seleção incompleta.

Páginas desconhecidas são null em ambos os limites, nunca zero ou uma página inventada. Recortes usam coordenadas entre 0 e 1, com origem no canto superior esquerdo. Associação automática é uma estimativa pelo início da questão e da próxima questão na mesma coluna. Ambiguidades conservam a página completa com aviso e ajuste manual.

## Migrações e rollback

001–004 são históricas e permanecem preservadas. A antiga view approved_question_exports existe por compatibilidade e não controla o novo banco.

005 cria o banco próprio; 006 aceita página desconhecida; 007 reforça no PostgreSQL a integridade do gabarito/alternativas e da faixa de páginas. Migrações são transacionais, registradas e protegidas por trava de inicialização. O backfill publica aprovações antigas válidas sem reescrever seu conteúdo original; aprovações antigas inconsistentes permanecem na revisão para correção.

Rollbacks não são executados automaticamente. O rollback 005 recusa remoção quando existem publicações; o 006 recusa conversão quando há páginas desconhecidas. Essas proteções são testadas em banco temporário. Não usar DROP CASCADE nem apagar volumes para atualizar o projeto.

## Backup

Preservar conjuntamente o dump PostgreSQL e src/backend/uploads (manifesto, arquivos originais, classificações e revisões legadas). Para recuperação, restaurar ambos no mesmo ponto de consistência e iniciar a API para aplicar somente migrações ainda não registradas. A remoção do container sem remover o volume mantém o banco; não executar down -v para atualização comum.
