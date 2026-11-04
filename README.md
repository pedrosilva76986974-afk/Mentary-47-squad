# Mentary

Extrator de Questões e Módulo de Inteligência Avaliativa.

## Requisitos atuais

- Node.js **22.13 ou superior** (ou Node.js 24 ou superior) e npm.
- Conexão com a internet durante a instalação das dependências. No primeiro uso do OCR, o Tesseract.js também pode precisar baixar os dados do idioma português.
- Windows, macOS ou Linux.

O projeto inclui uma interface em React com TypeScript e Vite e um backend em Node.js com TypeScript. A integração com banco de dados ainda não está configurada; não é necessário configurar um banco para iniciar o projeto.

## Instalar as dependências

Instale as dependências do backend e do frontend em terminais separados:

```powershell
cd src/backend
npm install
```

```powershell
cd src/frontend
npm install
```

## Iniciar para desenvolvimento

Abra dois terminais na pasta do projeto. No primeiro, inicie a API:

```powershell
cd src/backend
npm run dev
```

No segundo, inicie o frontend React:

```powershell
cd src/frontend
npm run dev
```

A interface ficará disponível em `http://localhost:5173` e encaminhará as chamadas da API para `http://localhost:3000`. Para confirmar que a API está ativa, acesse `http://localhost:3000/health` ou execute:

```powershell
curl.exe http://localhost:3000/health
```

A resposta esperada é:

```json
{"status":"ok"}
```

## Enviar um documento

O endpoint `POST /documents` recebe o arquivo no campo `document`. Neste momento, são aceitos PDF, PNG e JPG/JPEG, com tamanho máximo de 20 MB. PDFs podem ter até 50 páginas. Para limitar o uso de memória durante OCR e análise por IA, a API processa um upload por vez; uploads simultâneos adicionais recebem HTTP 429 e podem ser reenviados quando o processamento atual terminar.

Você pode selecionar um arquivo na tela em `http://localhost:3000` ou enviá-lo pelo PowerShell, substituindo o caminho pelo arquivo desejado:

```powershell
curl.exe -F "document=@C:\caminho\para\prova.pdf" http://localhost:3000/documents
```

O sistema confere extensão, tipo informado e conteúdo real do arquivo antes de processá-lo. Em PDFs, cada página é avaliada separadamente: páginas com texto suficiente usam extração direta; páginas escaneadas ou com pouco texto passam pelo OCR em português. Assim, PDFs mistos podem combinar os dois métodos sem descartar páginas escaneadas. Imagens também passam pelo OCR. Em seguida, o parser procura questões com rótulos como `Questão 1`, numeração acompanhada de um enunciado ou perguntas diretas. Cada questão recebe número, texto, páginas de origem e status `pending_review`.

As questões ficam disponíveis na tela de revisão logo após o envio. Também podem ser consultadas pela rota `GET /documents/{id}/review`, usando o `id` retornado pelo upload. A revisão permite editar enunciados e alternativas, registrar gabaritos e salvar o status de cada questão (`pending_review`, `approved` ou `rejected`) pela rota `PATCH /documents/{id}/review/questions/{questionId}`. Questões de múltipla escolha precisam de gabarito antes de serem aprovadas. A tela pode ser reaberta pelo link de revisão compartilhável. Se nenhum enunciado for identificado, o sistema informa isso, salva um resultado sem questões e disponibiliza o texto extraído para conferência. Se a extração falhar ou não produzir texto legível, a operação retorna erro e não cria um resultado de revisão.

Os registros de origem ficam em `src/backend/uploads/manifest.json`, com nome do arquivo, tipo, tamanho, data e hash SHA-256. Os arquivos originais ficam em `src/backend/uploads/documents` e podem ser consultados durante a revisão pela rota `GET /documents/{id}/source`; PDFs abrem na página da questão e imagens são exibidas no cartão correspondente. Os resultados de revisão — incluindo texto extraído, questões e alterações feitas pelo revisor — ficam em arquivos JSON dentro de `src/backend/uploads/reviews`. Esses dados ainda não usam banco de dados. Por padrão, documentos, registros e revisões com mais de 30 dias são removidos na inicialização e depois diariamente. Configure `MENTARY_RETENTION_DAYS` para outro prazo em dias ou use `0` para desativar a limpeza automática.

## Identificação de questões com Ollama (opcional)

Instale o [Ollama para Windows](https://ollama.com/download/windows) ou a versão correspondente ao seu sistema operacional. No Windows, abra o aplicativo Ollama pelo menu Iniciar e, em um terminal novo, baixe um modelo local gratuito. Exemplo:

```powershell
ollama pull qwen3:4b
ollama list
```

O comando `ollama list` mostra o nome exato do modelo instalado. Abra um terminal na pasta `src/backend`, configure a integração e inicie a API:

```powershell
$env:QUESTION_IDENTIFIER = "ollama"
$env:OLLAMA_BASE_URL = "http://127.0.0.1:11434"
$env:OLLAMA_MODEL = "qwen3:4b"
$env:OLLAMA_TIMEOUT_MS = "90000"
$env:OLLAMA_KEEP_ALIVE = "15m"
npm run dev
```

Substitua `qwen3:4b` pelo nome exato que apareceu no seu `ollama list`. O backend usa a API local `http://127.0.0.1:11434/api/chat` para classificar se os itens já separados pelo parser são questões de múltipla escolha. A extração do texto e a separação do enunciado e das alternativas continuam locais; o Ollama não reescreve nem fornece conteúdo. Questões discursivas e listas de cálculos são descartadas, enquanto questões objetivas sem alternativas legíveis ficam sinalizadas para revisão. Se a IA falhar ou não tiver confiança suficiente, o resultado local é mantido. O gabarito só é mostrado quando está escrito no documento ou registrado pelo revisor; a IA não resolve a questão. Sem `QUESTION_IDENTIFIER=ollama`, o projeto usa apenas as regras locais.

Para usar um modelo de nuvem, configure o nome do modelo de nuvem no `OLLAMA_MODEL`, entre na sua conta do Ollama e confirme que o aplicativo/CLI consegue executá-lo. O uso de nuvem pode estar sujeito aos limites gratuitos ou à cobrança da conta; modelos locais não consomem créditos de nuvem.

## Compilar e verificar o projeto

Compile o frontend e o backend separadamente:

```powershell
cd src/frontend
npm run build
```

```powershell
cd src/backend
npm test
npm run build
```

Os testes do backend incluem respostas simuladas da API do Ollama para verificar que ele classifica somente questões já estruturadas, sem substituir enunciados, alternativas ou respostas, além do fallback quando a API falha. Eles não precisam de Ollama aberto nem baixam modelos.

O build do frontend verifica os tipos TypeScript e gera os arquivos estáticos em `src/backend/public`. O build do backend compila o servidor para `src/backend/dist`. Depois de compilar os dois, a versão de produção pode ser iniciada com `npm start` dentro de `src/backend` e ficará disponível em `http://localhost:3000`.

## Estrutura

- `src/backend` — API, extração de documentos, identificação de questões e resultados de revisão
- `src/frontend` — interface React, estilos e configuração Vite
- `src/backend/public` — arquivos gerados pelo build do frontend e servidos pelo backend
- `docs` — documentação do projeto
- `database` — scripts e estrutura do banco de dados
- `src/backend/test` — testes automatizados do backend
