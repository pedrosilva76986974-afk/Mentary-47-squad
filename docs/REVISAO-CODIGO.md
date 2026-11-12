# Revisão técnica do código — 12/11/2026

Escopo: extrator atual, documentação técnica, consistência de dados, código sem uso e cadastro de pendências. A revisão amplia a [auditoria das issues](AUDITORIA-ISSUES.md). O [guia do código](GUIA-DO-CODIGO.md) descreve o comportamento final. As entregas estão em revisão no PR #35; não foram integradas automaticamente à main.

## Achados e tratamento

| Prioridade | Achado confirmado | Tratamento e evidência |
| --- | --- | --- |
| P1 | Dois PATCH podem ler a mesma versão e substituir alterações de questões diferentes do mesmo documento. | `document-lock.service.ts` serializa operações por documento na instância atual; regressões HTTP e PostgreSQL. A garantia entre processos e o controle de versão do mesmo campo ainda faltam: #38. |
| P1 | Consultas separadas de documento/questões/alternativas podem observar commits diferentes. | Leitura em um cliente e transação `REPEATABLE READ READ ONLY` em `postgres-review.service.ts`. |
| P1 | Retenção deixava snapshots de texto em `uploads/classifications` após excluir revisão/original. | Limpeza inclui classificação; tarefas ativas são adiadas e início/consulta são coordenados pelo mesmo bloqueio. Testes de retenção e cancelamento: #37. |
| P1 | JSON inválido e corpo JSON excessivo eram devolvidos como falha 500. | Tratamento explícito de 400/413 antes de acessar o banco; regressões em `http-errors.test.ts`: #39. |
| P1 | PDF pequeno em bytes pode pedir canvas nativo enorme; um recorte minúsculo ainda rasteriza a página inteira. | Limites por lado e pixels totais antes de criar canvas de OCR/prévia. Testes com PDF sintético e sem alocar imagem gigante: #39. O teto é por canvas, não um orçamento global de memória. |
| P2 | Contador `review-count` era renderizado somente em revisão e permanentemente oculto por `.has-review .review-count`. | Removidos elemento e dois seletores CSS; os indicadores de revisão permanecem. |
| P2 | Frontend montava `sourceUrl` sem consumir esse campo. | Removida atribuição e propriedade local; o campo de resposta da API foi preservado por compatibilidade. |
| P2 | Cinco tipos internos eram exportados sem consumidores externos aos respectivos arquivos. | Exportações removidas; as definições ainda usadas internamente foram mantidas. |
| P2 | Teste configurava `QUESTION_IDENTIFIER=rules`, variável que não controla mais o parser. | Removidos setup e restauração sem efeito desse teste. O teste que comprova que a extração ignora a configuração antiga continua. |
| P2 | Uma falha ao liberar a trava de migração podia impedir devolução da conexão ao pool. | `release()` garantido em `finally` próprio. |
| P2 | Documentação não oferecia referência completa do código e usava nome antigo do cancelamento. | Guia de módulos, API, configuração, testes e manutenção; README alinhado ao rótulo real: #36. |

## Código morto: método e limites

Foram inspecionados os pontos de entrada, imports, exports, scripts, testes e seletores CSS. O comando `npm run audit:source`, executado em `src/backend`, torna o inventário repetível.

Na versão desta rodada, o inventário encontra 49 arquivos TypeScript/TSX de produção e 33 arquivos de teste. Não restam candidatos a arquivos de produção sem caminho no grafo estático, exportações sem referência em outros arquivos ou classes CSS ausentes do código frontend após as remoções verificadas.

Isso não é prova de ausência universal de código morto: o inventário usa análise textual de imports/exports e nomes de classes, e requer conferência humana. TypeScript e lint complementam a checagem de variáveis, parâmetros, imports e trechos inalcançáveis.

Não foram removidos testes, migrations, tipos de dados persistidos, importação de legado, diagnósticos de versões antigas nem funções com consumidores reais. Compatibilidade não é código morto só porque deixou de ser produzida no fluxo novo.

## Issues novas e atendimento parcial

| Issue | Situação no fim desta revisão | O que falta |
| --- | --- | --- |
| #36 Documentação do código | Guia e inventário implementados | Revisão e integração do PR. |
| #37 Retenção de classificações | Correção e regressões implementadas para uma instância | Revisão e integração; coordenação distribuída depende de #42. |
| #38 Edições concorrentes | Parcial: bloqueio por documento e snapshot consistente implementados | Controle de versão/409 e transação coordenada entre processos. |
| #39 Entrada HTTP e rasterização | Correções e regressões implementadas | Revisão e integração do PR. |
| #40 Identidade e instituições | Não implementada; backlog P1 para uso compartilhado | Provedor de identidade, propriedade e autorização em todas as rotas. |
| #41 Rascunhos após recarga | Parcial: navegação interna e edição durante salvamento protegidas | Persistência, recuperação, validade e tratamento de conflito. |
| #42 Fila recuperável/distribuída | Parcial: fila e parciais persistidos para uma instância | Lease, retomada automática e cancelamento coordenado entre workers. |
| #43 Homologação com professores | Parcial: testes sintéticos e OCR real existentes | Acervo autorizado, medição de precisão e validação com participantes reais. |

As histórias US13–US20 continuam em #27–#34 como backlog futuro, conforme decisão do responsável. Não foram duplicadas. As limitações de Projects e proteção da main continuam ligadas às issues administrativas existentes; falta de permissão para consultar não comprova que a configuração esteja ausente.

## Verificações e critério de encerramento

Executar lint e build dos dois projetos, suíte geral, inventário estático e integrações PostgreSQL/OCR no GitHub Actions. A suíte comum desativa as duas integrações opcionais; elas precisam ser executadas separadamente para afirmar cobertura real.

Os resultados finais e o link do commit validado ficam no PR #35. Não houve nova pesquisa com professores, teste de múltiplas instâncias, teste de carga ou garantia de acurácia pedagógica nesta rodada.

O ciclo termina com documentação utilizável, achados corrigíveis desta revisão cobertos por regressões e pendências não implementadas cadastradas com critérios e limites explícitos. Criar uma issue não equivale a implementar ou homologar seu conteúdo.
