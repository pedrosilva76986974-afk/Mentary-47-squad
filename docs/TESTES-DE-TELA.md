# Homologação de interface — 07/11/2026

## Edição por categorias

Edição textual dividida em fieldsets Enunciado e Alternativas; gabarito/revisão e classificação pedagógica permanecem no painel próprio. Cada alternativa tem rótulo e texto independentes, com inclusão e remoção. Homologação no documento fictício: alterado rótulo B para C com gabarito acompanhando C; removida a alternativa correta e verificada seleção vazia; adicionada nova alternativa B, preenchida e salva. Conferidos campos individuais, teclado e 390 px sem transbordamento. Há aviso de alterações não salvas. Os testes unitários cobrem preservação da associação, remoção, rótulos numéricos e preservação de quebras de linha/barras no texto.

## Segunda revisão visual

Layout reorganizado em workspace, mantendo a identidade Mentary. Verificados em navegador: 1366 x 900 com conteúdo/inspector em duas colunas; 390 x 844 com painéis empilhados e sem rolagem horizontal. A edição e gravação de gabarito, responsável e área na questão fictícia 2 passaram. O novo envio abre e fecha pelo botão do cabeçalho. Foco por Tab e cabeçalho H1 conferidos. Sugestões e justificativas da IA ficam associadas à questão e os detalhes secundários são expansíveis. Não representa validação com usuários humanos ou auditoria completa de acessibilidade.

Execução pelo agente em navegador real, com cenários de uso simulados. Não houve pesquisa ou teste com participantes humanos.

Documento fictício criado para o ensaio: `teste-interface-simulado.pdf`, revisão `c545be21-7c5b-41da-996a-caf8949fd1aa`, duas questões aritméticas. A questão 1 foi aprovada com o responsável fictício `Revisor de teste simulado`. Nenhuma revisão do usuário foi editada por esses ensaios.

| Cenário | Resultado observado |
| --- | --- |
| Reabrir revisão existente | Total correto de questões; corrigida exibição anterior de undefined |
| Navegar entre questões | Um cartão visível; Próxima levou à questão 2, com alternativas correspondentes |
| Abrir edição | Editor expandiu mantendo enunciado e alternativas consultáveis |
| Aprovar sem gabarito | Mensagem de validação exibida; aprovação bloqueada |
| Selecionar gabarito | Bug de tela em branco reproduzido e corrigido; evento agora é lido antes da atualização de estado |
| Informar responsável e aprovar | Confirmação de salvamento exibida |
| Reabrir após aprovação | Navegador de questões mostrou Questão 1 — Aprovada |
| Tela móvel 390 x 844 | Sem transbordamento horizontal; navegação adaptada |
| Teclado | Navegação com Tab e foco visível no seletor de questão |
| Cancelar IA na tela móvel | Estado cancelada exibido; botão de nova análise habilitado |
| Reabrir revisão cancelada | Estado cancelada preservado, sem reiniciar automaticamente a IA |

O monitor nativo do Node reiniciava o backend durante alterações em uploads, dependências ou arquivos gerados e interrompia requisições. O comando de desenvolvimento foi trocado pelo watcher do tsx, com exclusão explícita de uploads e public. O cenário de gravação que falhava foi repetido com sucesso após a mudança.

Revisão básica de acessibilidade: rótulos nos campos preservados; seções recolhíveis usam details/summary nativos; controles possuem foco visível; navegação por questão tem nome acessível; texto principal ampliado. A verificação foi básica e não representa auditoria completa WCAG ou teste com leitor de tela.

Limites: não foi demonstrado nesta execução upload/cancelamento por seletor de arquivo no navegador, comportamento em Safari/Firefox nem uso por participantes humanos. As rotas de cancelamento e extração possuem testes automatizados. A tela foi verificada em 870 px e 390 px. A persistência foi conferida pelo próprio fluxo de aprovação/reabertura.

## 2026-11-07 — Classificação automática direta

Teste assistido em navegador local, com teste-interface-simulado.pdf (duas questões). Ao solicitar classificação, a tela passou de andamento para concluída e preencheu área, disciplina, tipo e BNCC. A questão mostrou Alterações não salvas e manteve gabarito B, status aprovada e responsável existentes. Sem justificativa, confiança ou botão de copiar sugestão. A persistência requer Salvar alterações. Teste com Qwen local; BNCC sugerida não teve acurácia semântica validada. Os testes automatizados verificam preservação de campos humanos e contrato da resposta.

## 2026-11-07 — Edição compacta e classificação v3

Documento simulado com duas questões. Editor exibiu letra e texto lado a lado; texto alterado e restaurado, Tab funcionou. Qwen local concluiu e preencheu Matemática, múltipla escolha, tema adição, descritor textual e dificuldade fácil na primeira questão. Ano/série e BNCC permaneceram vazios, sem cartão duplicado. Gabarito B e status aprovado preservados. Formulário sinalizou alterações não salvas. Rótulos dos controles e foco visível verificados. Não representa validação da precisão pedagógica em todas as áreas.

## 2026-11-07 — Status dentro da ficha e fluxo incremental

Teste simulado em navegador com Qwen3.5:4b local e duas questões de matemática. Removido o bloco de classificação do topo; status e controles observados dentro de Classificação pedagógica. Primeira questão recebeu Matemática, Múltipla escolha, tema Operações básicas, descritor textual e dificuldade Fácil enquanto a segunda estava pendente. BNCC e série ficaram vazias. Salvar alterações confirmou a gravação sem interromper a fila; navegação para a segunda questão preservou o andamento. O modelo levou aproximadamente três minutos para a primeira resposta neste ambiente; não é garantia de desempenho. Teste realizado pelo agente, sem participantes humanos.

Resultado final do navegador: segunda questão concluída pelo Qwen, com área Matemática, tipo Múltipla escolha, disciplina Matemática, tema Adição de números inteiros, descritor Realizar adições simples de números inteiros e dificuldade Fácil. BNCC e série permaneceram vazias. Primeira questão salva durante o processamento, segunda preenchida posteriormente; status Concluída observado dentro da ficha pedagógica. Suíte final: 101 testes, 100 passaram e 1 integração opcional ignorada; builds backend e frontend aprovados.

## 2026-11-07 — Validação da meta de 15 segundos

Teste simulado pelo agente, sem participantes humanos. Foi gerado um PDF digital novo com questão de porcentagem e enviado pela API local; a tela de revisão solicitou a classificação automaticamente. No perfil final (Qwen3.5:2b e 16 camadas na GPU), foi observado status Concluída, Tempo de classificação: 4.9 s · Dentro da meta de 15 s, área Matemática, tipo Múltipla escolha, disciplina Matemática, tema Porcentagem, descritor Calcular uma porcentagem de um número e dificuldade Fácil. Série e BNCC permaneceram vazias; gabarito não foi inventado. Revisão permaneceu pendente, com alterações não salvas, para confirmação humana. Documento sintético: teste-meta-15s-isolado.pdf.

Também foram registradas medições acima da meta ao usar servidor/modelo antigo ou manter outro modelo residente. O ganho observado não garante 15 segundos em todos os arquivos, sob concorrência ou no primeiro carregamento. A tela agora apresenta o tempo real e não informa sucesso da meta quando ela é excedida.
