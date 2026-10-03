# Mentary

Extrator de Questões e Módulo de Inteligência Avaliativa.

## Requisitos atuais

- Node.js **22.13 ou superior** (ou Node.js 24 ou superior) e npm.
- Conexão com a internet durante a instalação das dependências. No primeiro uso do OCR, o Tesseract.js também pode precisar baixar os dados do idioma português.
- Windows, macOS ou Linux.

O projeto inclui o backend de upload e extração e uma tela simples de envio servida pela própria API. A integração com banco de dados ainda não está configurada; não é necessário configurar um banco para iniciar o projeto.

## Instalar e iniciar o backend

Abra um terminal na pasta do projeto e execute:

```powershell
cd src/backend
npm install
npm run dev
```

A tela de envio ficará disponível em `http://localhost:3000`. Para confirmar que a API está ativa, acesse `http://localhost:3000/health` ou execute em outro terminal:

```powershell
curl.exe http://localhost:3000/health
```

A resposta esperada é:

```json
{"status":"ok"}
```

## Enviar um documento

O endpoint `POST /documents` recebe o arquivo no campo `document`. Neste momento, são aceitos PDF, PNG e JPG/JPEG, com tamanho máximo de 20 MB. PDFs podem ter até 50 páginas.

Você pode selecionar um arquivo na tela em `http://localhost:3000` ou enviá-lo pelo PowerShell, substituindo o caminho pelo arquivo desejado:

```powershell
curl.exe -F "document=@C:\caminho\para\prova.pdf" http://localhost:3000/documents
```

O sistema confere extensão, tipo informado e conteúdo real do arquivo antes de processá-lo. PDFs que já contêm texto são processados por extração direta. Imagens e PDFs escaneados passam pelo OCR em português. Em seguida, o parser procura questões com rótulos como `Questão 1`, numeração acompanhada de um enunciado ou perguntas diretas. Cada questão recebe número, texto, páginas de origem e status `pending_review`.

As questões ficam disponíveis na tela de revisão logo após o envio. Também podem ser consultadas pela rota `GET /documents/{id}/review`, usando o `id` retornado pelo upload. Se nenhum enunciado for identificado, o sistema informa isso, salva um resultado sem questões e disponibiliza o texto extraído para conferência. Se a extração falhar ou não produzir texto legível, a operação retorna erro e não cria um resultado de revisão.

Os registros de origem ficam em `src/backend/uploads/manifest.json`, com nome do arquivo, tipo, tamanho, data e hash SHA-256. Os resultados de revisão — incluindo texto extraído e questões pendentes — ficam em arquivos JSON dentro de `src/backend/uploads/reviews`. O arquivo original é mantido apenas em memória durante o processamento; os resultados ainda não usam banco de dados.

## Verificar o projeto

Execute os comandos a partir de `src/backend`:

```powershell
npm test
npm run build
```

`npm test` executa os testes automatizados. `npm run build` verifica e compila o TypeScript para a pasta `src/backend/dist`.

## Estrutura

- `src/backend` — API, extração de documentos, identificação de questões e resultados de revisão
- `src/frontend` — tela de envio de documentos
- `docs` — documentação do projeto
- `database` — scripts e estrutura do banco de dados
- `src/backend/test` — testes automatizados do backend
