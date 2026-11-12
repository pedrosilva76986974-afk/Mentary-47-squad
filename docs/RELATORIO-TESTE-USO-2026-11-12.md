# Teste de uso simulado — 12/11/2026

Execução pelo agente em navegador real, usando dados fictícios. Não houve participação de professores nem pesquisa com usuários humanos. Somente revisões do ensaio foram alteradas.

## Ambiente e dados

- Frontend em localhost:5173; backend em localhost:3000; PostgreSQL e Ollama local com qwen3.5:2b.
- Desktop com largura de 1280 px e ensaio móvel com largura efetiva de 390 px. O conteúdo mediu 1265 e 375 px respectivamente, com scrollbar, sem transbordamento horizontal nas telas verificadas.
- PDF fictício `mentary-ensaio-UX1212A.pdf`: duas questões aritméticas, três alternativas e duas figuras coloridas.
- Revisão PDF: `0c3338e1-f8a9-444d-a3dd-f6ba6f25a07a`.
- Imagem fictícia `mentary-cancelamento-UX1212A.png`, derivada do PDF; revisão OCR `094d5c8a-5332-4fce-ba0a-bce747f20df9`.
- Arquivo TXT fictício para verificar rejeição de formato.
- Originais e capturas do ensaio permanecem em `tmp/ux-20261112` na máquina de teste; não são arquivos de usuário nem requisito para executar a suíte automatizada.

## Erros reproduzidos e corrigidos

| Problema observado | Antes | Correção e reteste |
| --- | --- | --- |
| Digitar duas habilidades BNCC | A vírgula era removida pelo campo controlado; `EF01MA01, EF01MA02` virava `EF01MA01EF01MA02`. | Manter texto em edição e normalizar a lista sem consumir o separador. Digitado caractere a caractere, salvo, reaberto e exportado como dois códigos. |
| Endereço da revisão | Retornar do banco removia o parâmetro review; recarregar abria o envio. O upload também não mantinha um endereço reabrível. | Workspace preserva o ID da revisão ativa e atualiza o endereço ao concluir envio, inclusive se o usuário estiver no banco. Retorno e recarga reabriram a revisão salva. |
| Título da aba | Banco e revisão mantinham “Envio de documento”. | Títulos acompanham a tela ativa, inclusive ao voltar do banco. |
| Mensagem da questão anterior | Após rejeitar a questão 2 e ir para a questão 1, a confirmação de rejeição continuava no topo. | Feedback é limpo ao trocar a questão; verificado com salvamento e navegação. |
| OCR perde um rótulo intermediário | A imagem gerou alternativas A e C, sem B. O gabarito era sinalizado, mas a sequência de alternativas não. | Sequências convencionais com lacuna são sinalizadas para conferência. A alternativa B não é inventada. Ordem C/A/B e rótulos V/F não geram o mesmo aviso; aprovação humana pode confirmar rótulos intencionais. |

## Cenários e resultados

| Cenário | Resultado observado |
| --- | --- |
| TXT selecionado no envio | Formato rejeitado; envio permaneceu desabilitado. |
| Selecionar PDF, ir ao banco e voltar antes de enviar | Arquivo e botão de envio preservados. |
| Enviar PDF digital | Duas questões separadas; alternativas, páginas e gabaritos B/C reconhecidos. |
| Aprovar sem responsável | Bloqueado com orientação, sem alterar aprovação. |
| Cancelar classificação ativa | Estado Cancelada; nova tentativa disponível. |
| Retomar classificação | Duas questões concluídas; campos vazios preenchidos e BNCC manual preservada. Tempo observado de cerca de 2,4 s por questão no ensaio, sem garantia geral. |
| Renomear alternativa correta B para D | Gabarito acompanhou D. |
| Remover a alternativa correta | Gabarito limpo; aprovação sem gabarito bloqueada. |
| Adicionar alternativa novamente e selecionar gabarito | Alternativa B criada, texto preenchido e gabarito salvo. |
| Digitar duas habilidades manualmente | Separador preservado; dois códigos na revisão reaberta e no JSON. |
| Recorte estimado da primeira questão | Figura vermelha exibida junto à primeira questão, sem a figura azul da segunda. |
| Recorte fora dos limites | Rejeitado antes de salvar. |
| Aplicar recorte válido | Associação manual salva. |
| Aprovar com responsável e gabarito | Publicação confirmada no banco. |
| Recarregar revisão salva | Enunciado, alternativas, gabarito, revisor, metadados e estado preservados. |
| Editar sem salvar, ir ao banco e voltar | Rascunho e aviso de alterações não salvas preservados durante a navegação interna. |
| Banco: texto + Matemática + segunda habilidade BNCC | Uma questão fictícia correspondente. |
| Revisar seleção e exportar JSON | Arquivo baixado; conteúdo conferido: uma questão do ensaio, duas habilidades e gabarito B. |
| Retirar aprovação na revisão e exportar seleção antiga em outra aba | Exportação bloqueada; nova consulta retornou zero questões do ensaio. |
| Segunda questão com página desconhecida e rejeição | Null preservado; origem continuou acessível sem inventar página. |
| Envio de imagem para OCR | Duas questões reconhecidas; omissão de B detectada no ensaio e agora sinalizada. |
| Cancelar envio enquanto OCR estava ativo | “Envio e processamento cancelados”; botão Enviar material habilitado novamente. |
| Celular: revisão e banco | Painéis empilhados, campos e botões acessíveis, sem rolagem horizontal na largura verificada. |
| Navegação por teclado | Link do banco recebeu foco por Tab com contorno visível. Não equivale a auditoria completa de acessibilidade. |
| Console da revisão após retestes | Sem erros inesperados capturados. Respostas 400 de validações intencionais não são falhas do ensaio. |

## Evidência automatizada e estado final

Após as correções: lint e builds dos dois projetos aprovados; suíte geral com 137 testes, 135 aprovados, zero falhas e duas integrações opcionais desativadas nessa etapa. Regressões adicionais verificam lacunas OCR e preservação do aviso até a confirmação humana. PostgreSQL/OCR reais são executados separadamente no CI do commit da entrega.

A publicação fictícia foi retirada ao final para não permanecer no acervo: questão 1 em revisão, questão 2 rejeitada. A revisão OCR permanece pendente. Não foram apagados arquivos ou revisões do usuário.

## Limites

- O OCR ainda pode omitir ou deformar conteúdo. A correção desta rodada sinaliza a lacuna observada; não recupera automaticamente texto que o OCR não leu nem prova que todas as omissões serão detectadas.
- Rascunhos não salvos continuam sem recuperação durável após recarga/fechamento (#41). Preservar o endereço reabre a versão salva no servidor.
- Não foram testados Safari/Firefox, leitores de tela, carga simultânea extensa, toda a faixa de dispositivos ou precisão pedagógica em acervo amplo.
- A homologação com professores e dados autorizados segue pendente em #43.
