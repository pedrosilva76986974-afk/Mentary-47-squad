Histórias de Usuário — Mentary

Módulo 1 — Extrator de Questões
US01 — Enviar documento
Requisito: RF01 — O sistema deve permitir o envio de documentos.
História:
Como professor, elaborador ou revisor, quero enviar materiais educacionais para o sistema, para que eles possam ser processados e transformados em questões.

Critérios de aceitação:
- Deve permitir selecionar um documento para envio.
- Deve aceitar os formatos definidos pelo sistema.
- Deve validar o formato do arquivo.
- Deve registrar a origem do documento.
- Deve informar ao usuário se o envio foi realizado com sucesso.
- Deve informar o usuário caso ocorra uma falha no envio.
US02 — Extrair questões do documento
Requisito: RF02 — O sistema deve processar documentos e identificar questões.

História:
Como professor, quero que o sistema extraia automaticamente questões dos materiais enviados, para reduzir o trabalho manual de cadastramento.

Critérios de aceitação:
- Deve processar o documento enviado.
- Deve identificar questões existentes no material.
- Deve separar as questões identificadas.
- Deve encaminhar as questões para revisão.
- Deve informar quando não conseguir processar o documento.
US03 — Identificar elementos da questão
Requisito: RF03 — O sistema deve identificar enunciado, alternativas e gabarito.

História:
Como professor, quero que o sistema identifique o enunciado, as alternativas e o gabarito das questões, para que elas sejam estruturadas automaticamente.

Critérios de aceitação:
- Deve identificar o enunciado.
- Deve identificar as alternativas quando existirem.
- Deve identificar o gabarito quando estiver disponível.
- Deve manter a relação entre enunciado e alternativas.
- Deve sinalizar informações que não puderam ser identificadas.
US04 — Preservar elementos visuais
Requisito: RF04 — O sistema deve preservar imagens, gráficos, tabelas e figuras.

História:
Como professor, quero que imagens, gráficos, tabelas e figuras associadas às questões sejam preservados, para que o conteúdo original da questão seja mantido.

Critérios de aceitação:
- Deve identificar elementos visuais associados à questão.
- Deve manter esses elementos vinculados à questão correspondente.
- Deve preservar a visualização dos elementos quando possível.
- Deve sinalizar quando um elemento não puder ser extraído corretamente.
US05 — Registrar origem da questão
Requisito: RF05 — O sistema deve registrar a origem e a página.

História:
Como revisor, quero saber de qual documento e página uma questão foi extraída, para que eu possa consultar sua origem e garantir sua rastreabilidade.

Critérios de aceitação:
- Deve registrar o documento de origem.
- Deve registrar a página quando essa informação estiver disponível.
- Deve manter a informação vinculada à questão.
- Deve permitir consultar a origem durante a revisão.
US06 — Revisar questão extraída
Requisito: RF06 — O sistema deve disponibilizar uma interface de revisão.

História:
Como revisor, quero revisar as questões extraídas pelo sistema, para garantir que elas estejam corretas antes de serem utilizadas.

Critérios de aceitação:
- Deve apresentar a questão extraída.
- Deve permitir visualizar o conteúdo original quando disponível.
- Deve permitir editar os dados da questão.
- Deve permitir salvar as alterações.
- Deve indicar o status da revisão.
US07 — Editar enunciado e alternativas
Requisito: RF07 — O sistema deve permitir editar enunciados e alternativas.

História:
Como revisor, quero corrigir o enunciado e as alternativas de uma questão, para ajustar possíveis erros da extração automática.

Critérios de aceitação:
- Deve permitir alterar o enunciado.
- Deve permitir alterar as alternativas.
- Deve permitir salvar as alterações.
- Deve manter a questão vinculada ao documento de origem.
US08 — Definir gabarito
Requisito: RF08 — O sistema deve permitir definir ou corrigir o gabarito.

História:
Como revisor, quero informar ou corrigir o gabarito de uma questão, para garantir que sua resposta correta esteja registrada.

Critérios de aceitação:
- Deve permitir selecionar a resposta correta.
- Deve permitir alterar um gabarito previamente identificado.
- Não deve permitir aprovar uma questão sem gabarito quando ele for obrigatório.
- Deve salvar o gabarito junto à questão.
US09 — Classificar questão pedagogicamente
Requisito: RF09 — O sistema deve permitir associar informações pedagógicas.

História:
Como professor ou revisor, quero classificar uma questão por disciplina, série, tema, habilidade BNCC, descritor e dificuldade, para que ela possa ser utilizada em análises e avaliações pedagógicas.

Critérios de aceitação:
- Deve permitir informar a disciplina.
- Deve permitir informar o ano/série.
- Deve permitir informar o tema.
- Deve permitir associar habilidade BNCC.
- Deve permitir associar descritor.
- Deve permitir informar dificuldade.
- Deve armazenar essas informações junto à questão.
US10 — Aprovar ou rejeitar questão
Requisito: RF10 — O sistema deve permitir aprovar, rejeitar ou manter questões em revisão.

História:
Como revisor, quero aprovar, rejeitar ou devolver uma questão para revisão, para controlar quais questões estão prontas para utilização.

Critérios de aceitação:
- Deve permitir aprovar uma questão.
- Deve permitir rejeitar uma questão.
- Deve permitir manter a questão em revisão.
- Deve registrar o status atual.
- Deve registrar o responsável pela aprovação quando aplicável.
US11 — Integrar questão ao banco
Requisito: RF11 — O sistema deve enviar questões aprovadas para o banco.

História:
Como professor, quero utilizar questões aprovadas no banco de questões, para poder selecioná-las posteriormente na criação de avaliações.

Critérios de aceitação:
- Somente questões aprovadas devem ser disponibilizadas.
- A questão deve manter suas informações pedagógicas.
- A questão deve manter sua origem.
- O sistema não deve criar uma questão duplicada.
US12 — Consultar banco de questões
Requisito: RF12 — O sistema deve permitir consultar e selecionar questões.

História:
Como professor, quero pesquisar questões utilizando filtros pedagógicos, para encontrar questões adequadas à avaliação que estou planejando.

Critérios de aceitação:
- Deve permitir pesquisar questões.
- Deve permitir utilizar filtros.
- Deve permitir filtrar por disciplina.
- Deve permitir filtrar por série.
- Deve permitir filtrar por tema.
- Deve permitir filtrar por habilidade BNCC.
- Deve permitir filtrar por descritor.
- Deve permitir filtrar por dificuldade.
- Deve apresentar as questões correspondentes.

Módulo 2 — Avaliações e inteligência avaliativa (backlog futuro)

US13 — Receber dados da avaliação

Requisito: RF13 — O sistema deve receber os dados da aplicação.

História:

Como sistema de inteligência avaliativa, quero receber os dados das avaliações realizadas, para que o desempenho dos estudantes possa ser analisado.

Critérios de aceitação:

Deve receber as questões aplicadas.
Deve receber os gabaritos.
Deve receber as respostas dos estudantes.
Deve identificar a turma e a aplicação.
Deve registrar a data da aplicação.
Deve armazenar os dados recebidos.


US14 — Processar respostas

Requisito: RF14 — O sistema deve processar as respostas.

História:

Como professor, quero que as respostas das avaliações sejam corrigidas e classificadas automaticamente, para obter os resultados dos estudantes.

Critérios de aceitação:

Deve identificar respostas corretas.
Deve identificar respostas incorretas.
Deve identificar questões não respondidas.
Deve utilizar o gabarito registrado.
Deve armazenar os resultados processados.

US15 — Calcular desempenho

Requisito: RF15 — O sistema deve calcular desempenho em diferentes dimensões.

História:

Como professor, quero visualizar o desempenho por estudante, turma, questão, habilidade e descritor, para identificar onde existem dificuldades de aprendizagem.

Critérios de aceitação:

Deve calcular desempenho por estudante.
Deve calcular desempenho por turma.
Deve permitir analisar por questão.
Deve permitir analisar por habilidade BNCC.
Deve permitir analisar por descritor.
Deve armazenar o histórico dos resultados.

US16 — Consultar dashboard

Requisito: RF16 — O sistema deve disponibilizar dashboards por perfil.

História:

Como usuário pedagógico, quero visualizar indicadores de desempenho em um dashboard, para acompanhar os resultados das avaliações de forma centralizada.

Critérios de aceitação:

Deve apresentar indicadores de desempenho.
Deve permitir aplicar filtros.
Deve apresentar os dados de acordo com o perfil do usuário.
Deve permitir visualizar informações de estudantes, turmas ou escolas conforme a permissão.
Deve apresentar os resultados de forma visual.

US17 — Gerar relatório por descritor

Requisito: RF17 — O sistema deve gerar relatórios por descritor e habilidade.

História:

Como coordenador pedagógico, quero gerar relatórios de desempenho por descritor e habilidade, para identificar quais competências precisam de maior atenção.

Critérios de aceitação:

Deve permitir selecionar um descritor.
Deve apresentar quantidade de questões relacionadas.
Deve apresentar acertos, erros e omissões.
Deve apresentar o desempenho dos estudantes.
Deve apresentar o tempo médio de resposta quando disponível.
Deve permitir comparar resultados.
Deve apresentar o nível de atenção configurado.

US18 — Comparar resultados

Requisito: RF18 — O sistema deve permitir comparar classes e aplicações.

História:

Como coordenador pedagógico, quero comparar os resultados de diferentes turmas ou aplicações, para acompanhar diferenças e evolução do desempenho.

Critérios de aceitação:

Deve permitir selecionar duas ou mais referências de comparação.
Deve apresentar os resultados lado a lado.
Deve permitir comparar desempenho.
Deve permitir comparar habilidades e descritores.
Deve apresentar a evolução quando houver histórico disponível.

US19 — Identificar lacunas de aprendizagem

Requisito: RF19 — O sistema deve identificar lacunas de aprendizagem.

História:

Como professor, quero identificar habilidades e descritores com baixo desempenho, para saber quais conteúdos precisam de intervenção pedagógica.

Critérios de aceitação:

Deve analisar os resultados das avaliações.
Deve identificar habilidades com baixo desempenho.
Deve identificar descritores com baixo desempenho.
Deve classificar os resultados conforme os níveis de atenção configurados.
Deve apresentar as lacunas identificadas.
Deve permitir consultar os dados que originaram a identificação.

US20 — Analisar qualidade das questões

Requisito: RF20 — O sistema deve realizar análise básica da qualidade das questões.

História:

Como revisor, quero analisar o comportamento das questões após sua aplicação, para identificar questões que precisam ser revisadas.

Critérios de aceitação:

Deve apresentar quantidade de aplicações.
Deve apresentar taxa de acertos e erros.
Deve apresentar respostas em branco.
Deve apresentar distribuição das alternativas.
Deve apresentar o tempo médio de resposta.
Deve identificar comportamentos que mereçam atenção.
Deve gerar alertas quando regras configuradas forem atendidas.
