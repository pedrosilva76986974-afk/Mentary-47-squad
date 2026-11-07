# Catálogo de bugs e regressões

Os casos abaixo foram simulados com dados sintéticos e possuem verificações reproduzíveis. Testes de tela foram operados pelo agente; não são uma pesquisa com participantes humanos.

| ID | Reprodução | Correção/resultado esperado | Evidência |
| --- | --- | --- | --- |
| BANCO-01 | Publicar duas origens iguais simultaneamente | Uma publicação, duas origens; sem duplicata | postgres.integration.test.ts |
| BANCO-02 | Reabrir/rejeitar uma origem publicada | Somente origens ainda aprovadas permanecem na consulta | postgres.integration.test.ts |
| BANCO-03 | Filtrar uma origem anterior após publicar outra série | Filtros encontram qualquer origem ativa compatível | postgres.integration.test.ts |
| BANCO-04 | Expirar documento de uma publicação | Limpeza protege revisão e arquivo de publicações ativas | postgres.integration.test.ts |
| ORIGEM-01 | Salvar página desconhecida | null preservado em PostgreSQL/API/tela; documento mantido | postgres.integration.test.ts e teste de tela |
| VISUAL-01 | Duas questões com figuras diferentes na mesma página | Recortes separados pelo limite de cada questão; associação pode ser ajustada | question-bank.test.ts e teste de tela |
| VISUAL-02 | Enviar recorte fora da página ou parcialmente inválido | HTTP 400; dados salvos preservados | postgres.integration.test.ts e question-bank.test.ts |
| OCR-01 | JPEG faz A) virar AJ, antes de B) e C) | Recuperar A somente em sequência de alternativas; não converter prosa comum | ocr-corpus.integration.test.ts e ocr-label-regression.test.ts |
| OCR-02 | PDF escaneado, PNG e JPEG com gabarito impresso | Duas questões, três opções cada, gabaritos e regiões preservados | ocr-corpus.integration.test.ts, OCR português real |
| WEB-01 | Consultar /questions pelo Vite | Encaminhar à API, evitando HTML com HTTP 200 | vite.config.ts e teste de tela |
| WEB-02 | Repetir a mesma pesquisa após erro | Nova tentativa mesmo sem alterar filtros | QuestionBank.tsx e teste de tela |
| INTEGRIDADE-01 | Aprovar sem gabarito/revisor ou editar aprovação deixando-a inválida | Bloquear atualização e preservar registro anterior | documents.test.ts |
| IA-01 | Timeout, cancelamento e resultado tardio | Preservar parciais; retomar somente pendentes; duração inclui tentativa falha | ollama.test.ts |

## Como reproduzir

No backend: npm test; npm run test:postgres; npm run test:ocr. A integração PostgreSQL cria uma base com nome aleatório e remove apenas essa base. Não executa reset no banco da aplicação.

## Limites conhecidos

- OCR ilegível, colunas ambíguas, fórmulas com posição de expoentes e questões sem marcadores podem exigir correção manual. Os testes não cobrem todos os documentos possíveis.
- Recorte automático é estimado; não equivale a compreender semanticamente todas as imagens da página. Casos ambíguos são sinalizados e têm ajuste manual.
- O banco deduplica representação textual normalizada, não paráfrases nem equivalência matemática geral.
- Classificação pedagógica continua sujeita à revisão docente; a meta de 15 segundos não é SLA universal.
- Homologação com professores reais permanece uma etapa humana; não foi simulada como se tivesse ocorrido.
