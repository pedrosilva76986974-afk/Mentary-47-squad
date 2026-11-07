# Homologação de interface — 07/11/2026

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
