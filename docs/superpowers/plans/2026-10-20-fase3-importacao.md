# Fase 3 — Importação no navegador (Anki, PDF, DOCX) e web sem jsdom — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tirar do servidor toda a importação pesada: o `.apkg`, o PDF e o DOCX são lidos no navegador e o servidor só recebe notas/texto já extraídos em lotes; a importação de página web continua no servidor, mas sem `jsdom`, para rodar no Worker.

**Architecture:** as funções puras do leitor de Anki vão para `src/core/anki/` (sem Node, sem DOM) e passam a ser usadas pelo cliente e pelo servidor. O navegador lê o `.apkg` num Web Worker (`fflate` em streaming + `fzstd` + `sql.js`) e envia as notas por um protocolo JSON em três passos (`abrir` → `notas` em lotes de 500 → `fechar`) sobre `/api/anki/imports`; o servidor **reaplica** a limpeza de HTML, a identidade da nota (guid/hash) e a régua de qualidade, porque o cliente não é confiável. PDF/DOCX viram texto no navegador (`pdfjs-dist` com o worker próprio, `mammoth` build de browser) e seguem o fluxo já existente de sessão-documento. A exportação `.apkg` também vai para o navegador (`sql.js` + `fflate`), para o servidor ficar sem `@libsql/client`, `jszip`, `jsdom`, `pdfjs-dist` e `mammoth` no caminho de produção. A rota `/api/import/web` troca `JSDOM` por `linkedom` e decodifica charset com `TextDecoder`.

**Tech Stack:** TypeScript, React + Vite (Web Worker `{ type: 'module' }`), `fflate`, `fzstd`, `sql.js` (+ `@types/sql.js`), `pdfjs-dist` (build de browser), `mammoth` (browser), `linkedom`, `@mozilla/readability`, Express/Drizzle no servidor, vitest, Playwright.

**Spec:** `docs/specs/2026-10-19-migracao-cloudflare.md`, seção "Importação pesada (Anki, PDF, DOCX, web)" e critério de aceite "Importação de um `.apkg` de 200 MB conclui no navegador em ≤ 60 s num notebook comum, sem tocar o servidor além dos lotes de cartões". Contexto: `docs/auditoria/2026-10-19-spikes-cloudflare.md` (seção "Fase 2 concluída", pendências da Fase 3).

## Global Constraints

- Branch `cloudflare/migracao`; `main` e Fly intocados. Commits diretos na branch (autorizado pelo dono).
- Textos de UI, comentários e docs em português do Brasil; identificadores novos seguem o padrão da pasta.
- `src/core/` é puro: sem React, sem rede, sem DOM, sem `node:*`, sem `Buffer`; não importa de `src/gateway`, `src/components` nem `src/lib` (regra de ESLint).
- O servidor **nunca confia** no que o navegador extraiu: tudo que chega em `/api/anki/imports/*` passa de novo por `limparCampo`, `avaliarCartao` (perfil `'curado'`) e pelos limites de tamanho por campo. Os testes de segurança (`tests/seguranca/*`) não perdem cobertura: cada caso que sai do servidor ganha um equivalente no lugar certo.
- Tetos preservados (valores de hoje): expansão do zip 300 MB (`TETO_DE_EXPANSAO`), notas por arquivo 50.000 (`TETO_DE_NOTAS`), DOCX 20 MB por entrada / 40 MB total, PDF 500 páginas / 5.000.000 caracteres de texto, página web 4 MB / 5 redirects / 15 s por salto.
- Nada de `eval`; a CSP atual (`script-src 'self' 'wasm-unsafe-eval' blob:`, `worker-src 'self' blob:`) basta: WASM e workers vêm de `/assets` (`'self'`).
- Dependências novas só as listadas no Tech Stack. `@libsql/client` continua no `package.json` (scripts de migração/snapshot da Fase 5 usam), mas **nenhum arquivo de `server/` ou `src/` o importa** ao fim da fase. `jsdom` vira `devDependency` (ambiente de teste do vitest).
- Portão de cada tarefa: `npm run typecheck`, `npm run lint`, os testes citados na tarefa. Portão final (Task 10): `npm test`, `BANCO_DE_TESTE=postgres` para `tests/integration`, `npm run worker:build`, `WRANGLER_FUMACA=1 npm run fumaca:worker`, E2E Node e `E2E_RUNTIME=worker`, `npx knip`.
- Gemini é proibido (não se aplica aqui; só para constar).

## Review Focus

1. **`.anki21b` cujo frame zstd não declara o tamanho descomprimido** (o Anki moderno grava assim): o leitor precisa descomprimir em streaming contando bytes, não falhar nem confiar num cabeçalho. Teste em Task 2 (`fixture baralho-moderno.apkg` + frame sintético sem tamanho).
2. **Nota com mais partes em `flds` do que nomes de campo** (tipo de nota editado depois do export): os campos excedentes entram em `camposBrutos` como `campoN`, a nota não é descartada e o servidor aceita. Teste em Task 2 (leitor) e Task 3 (schema aceita `campo7`).
3. **Navegador fecha no meio do envio**: o import fica `gravando`; a limpeza diária marca `falhou` depois de 24 h; reimportar o mesmo arquivo depois funciona (dedupe por guid). Teste em Task 3.
4. **Página web em ISO-8859-1 ou Shift_JIS** declarada no `Content-Type` ou no `<meta charset>`: o texto chega sem mojibake. Teste em Task 8.
5. **Arquivo `.apkg` que não é um zip** (renomeado, truncado): erro legível vindo do worker ("não consegui abrir este .apkg…"), sem sessão nem import criado no servidor. Teste em Task 2 e Task 4.
6. **PDF digitalizado (sem camada de texto)**: erro claro no navegador, sem criar sessão vazia. Teste em Task 7.

---

## Mapa de arquivos

**Cria**

- `src/core/anki/tipos.ts` — `NotaAnki`, `LeituraAnki`, `Lacuna`, `RefsDeMidia`, `EscritaDominante`.
- `src/core/anki/campo.ts` — `limparCampo`, `extrairMidia`, `extrairCloze`, `limparELacunas`.
- `src/core/anki/mapeamento.ts` — `PADRAO_FRENTE`, `PADRAO_VERSO`, `indicePorNome`, `indiceDoExemplo`, `montarNota`.
- `src/core/anki/texto.ts` — `lerTextoAnki`.
- `src/core/anki/escrita.ts` — `contagemDeEscritas`, `escritaDominante`, `decidirIdiomaOrigem`, `versoEhDefinicao`.
- `src/core/anki/index.ts` — reexporta tudo acima.
- `src/lib/zip/zipComTeto.ts` — leitura de zip em streaming com teto (`extrairDoZip`, `medirExpansaoDoZip`, `ExpansaoAcimaDoTeto`).
- `src/lib/anki/sqlite.ts` — `abrirSqliteNoNavegador` (sql.js + wasm via `?url`).
- `src/lib/anki/lerApkg.ts` — `lerApkg(arquivo, deps)` (zip → zstd → sql.js → `LeituraAnki`), sem DOM, roda em Node nos testes.
- `src/lib/anki/leitorDeApkg.worker.ts` — cola do Web Worker.
- `src/lib/anki/lerBaralho.ts` — `lerBaralhoNoNavegador(arquivo, aoProgredir)` (cria o worker, devolve `LeituraAnki`).
- `src/lib/anki/montarApkg.ts` — exportação `.apkg` no navegador.
- `src/lib/import/extrairDocumento.ts` — PDF/DOCX/TXT → texto no navegador.
- `src/lib/import/pdfjsNoNavegador.ts` — carga do pdfjs com `workerSrc`.
- `server/import/identidadeDaNota.ts` — `guidDaNota`, `hashDaEstrutura` (node:crypto, só servidor).
- `server/routes/ankiImports.ts` — as três rotas do protocolo em lotes (montado dentro de `ankiRouter`).
- `scripts/perf/anki-200mb.mjs` — gera um `.apkg` sintético de ~200 MB e cronometra `lerApkg`.
- Testes: `tests/anki-leitor.test.ts`, `tests/zip-com-teto.test.ts`, `tests/anki-exportacao.test.ts`, `tests/extrair-documento.test.ts`, `tests/integration/anki-importacao-em-lotes.test.ts`, `tests/integration/import-web-charset.test.ts`.

**Modifica**

- `server/routes/anki.ts` (monta `ankiImportsRouter`), `server/db/repositories/anki.ts` (`marcarAusentesForaDoImport`, `somarPorMotivo`, `marcarImportsAbandonados`), `server/validation.ts` (schemas novos), `server/http/limitesDeCorpo.ts` (`ROTAS_DE_CORPO_GRANDE`), `server/lib/limpezaDiaria.ts`, `server/routes/import.ts` (fica só `/web` e `/youtube`), `server/import/web.ts` (linkedom + charset).
- `src/data/apiAnki.ts` (3 funções do protocolo), `src/data/importarAnki.ts` (orquestração), `src/data/rotas/importacao.ts` (só `importWeb`), `src/data/rotas/vocabulario.ts` (`exportarApkg` local), `src/lib/import/filaDeImportacao.ts`, `src/components/views/BaralhoAnki.tsx`, `src/components/views/cartoes/TrazerELevar.tsx`, `src/components/views/Library.tsx`, `src/core/planos.ts`.
- `wrangler.jsonc` (aliases), `tests/worker/bundle.test.ts`, `tests/contratos/api-contrato.json`, `tests/efemero-rotas.test.ts`, `tests/contratos/rotas-espelhadas.test.ts`, `tests/e2e/_fixtures.ts`, `package.json`.
- Docs: `CLAUDE.md`, `docs/deploy.md`, `docs/auditoria/2026-10-19-spikes-cloudflare.md`.

**Apaga**

- `server/import/anki.ts`, `server/import/ankiExport.ts`, `server/import/document.ts`, `server/stubs/{jsdom,readability,mammoth,pdfjs}.ts`, `tests/ankiMapaDeMidia.test.ts` (código morto: mapa de mídia sem chamador em produção — ruling R4), `tests/integration/anki-bomba.test.ts` (substituído por `tests/zip-com-teto.test.ts`), `tests/seguranca/rotas-sensiveis-e-bomba-de-docx.test.ts` (parte do DOCX vai para `tests/extrair-documento.test.ts`; as rotas sensíveis que ele cobre ficam, ver Task 7).

## Rulings de desenho (decididos antes da execução)

- **R1 — Protocolo em três passos, não um POST só.** Um `.apkg` com 50.000 notas e `camposBrutos` passa dos 5 MB do parser JSON; lotes de 500 notas cabem com folga (~1–2 MB) e dão progresso real na tela. O cliente envia os lotes **em sequência** (o servidor faz leitura-soma-escrita dos contadores sem trava).
- **R2 — Identidade da nota é do servidor.** `guid` ausente → `guidDaNota` deriva do conteúdo; `estruturaHash` sai de `hashDaEstrutura(campos)`; os dois ficam em `server/import/identidadeDaNota.ts` com `node:crypto` (o Worker tem `nodejs_compat`). O cliente não manda hash nenhum.
- **R3 — A rota binária `POST /api/import/anki` e `POST /api/import/anki/export` e `POST /api/import/document` são removidas** (não ficam como compatibilidade): manter dois caminhos dobraria a superfície de segurança. `POST /api/import/youtube` continua 410.
- **R4 — Mapa de mídia (`lerMapaDeMidia`, `extrairArquivoDeMidia`, `indiceInversoDeMidia`) não é portado**: nenhum chamador em produção. O leitor continua informando `temMidia`. Se mídia voltar à pauta, é feature nova.
- **R5 — Exportação `.apkg` vai para o navegador** (sql.js já carregado para importar): a rota não tinha guarda de runtime e falharia no Worker; sem ela o servidor dispensa `@libsql/client` e `jszip`.
- **R6 — PDF no thread principal com o worker próprio do pdfjs; DOCX/TXT no thread principal.** Um worker nosso aninhando o worker do pdfjs não é suportado em todo navegador. O pdfjs já tira o trabalho pesado da UI.
- **R7 — Nota inválida no lote (frente/verso vazios depois de `limparCampo`, campo acima do teto) → 400 `nota_invalida`** com o índice. O leitor honesto nunca manda isso; só um cliente hostil.
- **R8 — `linkedom` em Node e no Worker**, mesmo código nas duas plataformas; `HTMLRewriter` fica como plano B registrado, só se o `wrangler dev` provar que o `linkedom` não roda (Task 8 inclui essa prova).

---

### Task 1: `src/core/anki` — mover as funções puras do leitor

**Files:**

- Create: `src/core/anki/{tipos,campo,mapeamento,texto,escrita,index}.ts`
- Modify: `server/import/anki.ts` (passa a importar do core; some em Task 6), `server/routes/import.ts:164-220` (usa `decidirIdiomaOrigem`/`versoEhDefinicao` do core), `tests/anki.test.ts`, `tests/ankiMidia.test.ts`, `tests/importAnkiCampos.test.ts`, `tests/escrita-devanagari-thai.test.ts` (só trocam o caminho do import)
- Test: os quatro acima, sem mudar nenhum `expect`.

**Interfaces:**

- Produces (tudo exportado por `src/core/anki/index.ts`):
  - `tipos.ts`: `interface NotaAnki { guid: string; camposBrutos?: Record<string,string>; frente: string; verso: string; exemplo?: string; tags: string[]; midia?: RefsDeMidia; lacunas?: Lacuna[]; baralho?: string; notetype?: string; campos?: string[] }` (**`estruturaHash` sai** — R2 — e entra `campos`: os nomes dos campos do tipo da nota, na ordem); `interface LeituraAnki { notas: NotaAnki[]; formato: string; campos: string[]; descartadas: number; temMidia: boolean; baralhos?: string[]; truncado?: boolean; totalNoArquivo?: number }` (sem `mapaDeMidia` — R4); `Lacuna`, `RefsDeMidia`, `EscritaDominante` iguais aos de hoje.
  - `campo.ts`: `limparCampo(bruto: string): string`, `extrairMidia(bruto: string): RefsDeMidia`, `extrairCloze(bruto: string): { texto: string; lacunas: Lacuna[] }`, `limparELacunas(bruto: string): { texto: string; lacunas: Lacuna[] }` — corpos copiados de `server/import/anki.ts:108-264` sem alteração.
  - `mapeamento.ts`: `PADRAO_FRENTE`, `PADRAO_VERSO`, `indicePorNome(campos: string[], padroes: RegExp[]): number`, `indiceDoExemplo(campos: string[]): number`, `TETO_DE_NOTAS = 50_000`, e a nova `montarNota(entrada: { guid: string; flds: string; tags: string; nomesDosCampos: string[]; notetype?: string; baralho?: string }): NotaAnki | null` — o corpo do laço de `lerApkg` (`anki.ts:618-688`): separa por `\x1f`, extrai mídia e cloze, escolhe frente/verso/exemplo por nome ou posição, monta `camposBrutos` (`nomes[i] || \`campo${i}\``), devolve `null` quando falta frente ou verso.
  - `texto.ts`: `lerTextoAnki(texto: string): LeituraAnki` (corpo de `anki.ts:993-1028`).
  - `escrita.ts`: `contagemDeEscritas`, `escritaDominante` (de `anki.ts:936-991`), `decidirIdiomaOrigem(cabecalho: string | null, frentes: string[]): { idiomaOrigem: string | null; avisoIdioma?: string }` e `versoEhDefinicao(notas: Array<{ frente: string; verso?: string | null }>): boolean` (de `server/routes/import.ts:104-220`, inclusive `LANGS_ESCRITA_LATINA` e `ESCRITAS_NAO_LATINAS`; `vazaResposta` vem de `src/core/learning/pistaDeJogo`).
- `hashDaEstrutura` **não** vai para o core (usa `node:crypto`); fica em `server/import/anki.ts` até a Task 3 movê-la para `identidadeDaNota.ts`.

- [ ] **Step 1: Criar os cinco módulos e o `index.ts`** movendo o código (não reescrever; preservar os comentários longos, que são a documentação das decisões). `src/core/tsconfig.json` precisa compilar: rode `npm run typecheck:core`.

- [ ] **Step 2: Fazer `server/import/anki.ts` e `server/routes/import.ts` importarem do core** (`'../../src/core/anki'`), apagando as cópias locais. `lerApkg` passa a chamar `montarNota` no laço e preenche `campos: nomes` na nota; `estruturaHash` continua sendo calculado na rota (`hashDaEstrutura(n.campos ?? [])`) até a Task 3.

- [ ] **Step 3: Repontar os quatro testes puros** para `../src/core/anki` e rodar:

Run: `npx vitest run tests/anki.test.ts tests/ankiMidia.test.ts tests/importAnkiCampos.test.ts tests/escrita-devanagari-thai.test.ts tests/seguranca/anki-html-hostil.test.ts tests/integration/anki-rotas.test.ts`
Expected: todos passam sem alterar `expect` algum (o `ankiMidia.test.ts` testa `hashDaEstrutura`: esse caso continua importando de `server/import/anki`).

- [ ] **Step 4: `npm run typecheck && npm run lint`** (a regra do core proíbe `node:*`/`Buffer`: se o lint reclamar de `Buffer` em algum trecho movido, trocar por `Uint8Array`/`TextDecoder`).

- [ ] **Step 5: Commit** — `refactor(anki): funções puras do leitor em src/core/anki (Fase 3, T1)`

---

### Task 2: Leitor de `.apkg` no navegador (zip com teto, zstd, sql.js) e Web Worker

**Files:**

- Create: `src/lib/zip/zipComTeto.ts`, `src/lib/anki/sqlite.ts`, `src/lib/anki/lerApkg.ts`, `src/lib/anki/leitorDeApkg.worker.ts`, `src/lib/anki/lerBaralho.ts`
- Modify: `package.json` (deps `fflate`, `fzstd`, `sql.js`; devDep `@types/sql.js`), `vite.config.ts` (se preciso, `optimizeDeps.exclude: ['sql.js']`)
- Test: `tests/zip-com-teto.test.ts`, `tests/anki-leitor.test.ts`

**Interfaces:**

- Consumes: `src/core/anki` (Task 1).
- Produces:

  - `zipComTeto.ts`: `class ExpansaoAcimaDoTeto extends Error { constructor(nome: string, teto: number) }`; `extrairDoZip(arquivo: Blob, nomes: string[], teto: number): Promise<{ entradas: Map<string, Uint8Array>; nomes: string[] }>` — lê `arquivo.stream()` por pedaços com `fflate.Unzip` (+ `UnzipInflate`), infla **só** as entradas em `nomes`, conta os bytes de saída de cada uma e lança `ExpansaoAcimaDoTeto` ao passar de `teto` (nunca confia no tamanho declarado); `nomes` devolve todos os nomes vistos no zip. `medirExpansaoDoZip(arquivo: Blob, tetoPorEntrada: number, tetoTotal: number): Promise<number>` — infla tudo contando e descartando; lança `ExpansaoAcimaDoTeto`.
  - `sqlite.ts`: `type AbrirSqlite = () => Promise<SqlJsStatic>`; `abrirSqliteNoNavegador: AbrirSqlite` (`initSqlJs({ locateFile: () => wasmUrl })` com `import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'`, memoizado).
  - `lerApkg.ts`: `TETO_DE_EXPANSAO = 300 * 1024 * 1024`; `interface ProgressoDaLeitura { etapa: 'abrindo' | 'descomprimindo' | 'lendo'; notas?: number; total?: number }`; `lerApkg(arquivo: Blob, deps: { abrirSqlite: AbrirSqlite; aoProgredir?: (p: ProgressoDaLeitura) => void }): Promise<LeituraAnki>` — `extrairDoZip` com `['collection.anki21b','collection.anki21','collection.anki2']` (preferência nessa ordem); `.anki21b` passa por `fzstd.Decompress` em streaming contando a saída contra `TETO_DE_EXPANSAO`; `new SQL.Database(bytes)`; as mesmas consultas e fallbacks de `server/import/anki.ts:490-612` (`fields`→`col.models`, `notetypes`, `decks`→`col.decks`, `cards`, `count(*)`, `notes LIMIT 50000` com fallback sem `guid`), nomes de baralho normalizados (`\x1f`→`::`); `montarNota` por linha; `db.close()` sempre. `temMidia` = algum nome do zip é só dígitos. Mensagens de erro em português: zip inválido → `'não consegui abrir este .apkg (não é um zip válido)'`; sem coleção → `'não encontrei a coleção dentro do .apkg (collection.anki2/21/21b)'`.
  - `leitorDeApkg.worker.ts`: recebe `{ arquivo: Blob }`, responde `{ tipo: 'progresso', progresso }` várias vezes e `{ tipo: 'ok', leitura }` ou `{ tipo: 'erro', mensagem }` uma vez.
  - `lerBaralho.ts`: `lerBaralhoNoNavegador(arquivo: File, aoProgredir?: (p: ProgressoDaLeitura) => void): Promise<LeituraAnki>` — `.txt/.csv/.tsv` → `lerTextoAnki(await arquivo.text())` no thread principal; `.apkg` → `new Worker(new URL('./leitorDeApkg.worker.ts', import.meta.url), { type: 'module' })`, encerra o worker ao terminar ou falhar.

- [ ] **Step 1: Instalar** `npm i fflate fzstd sql.js && npm i -D @types/sql.js` (versões atuais do registro em 2026-10-20: fflate 0.8.x, fzstd 0.1.x, sql.js 1.15.x).

- [ ] **Step 2: Testes do zip com teto** em `tests/zip-com-teto.test.ts` (Node ≥ 22 tem `Blob.stream()`; monte os zips com `fflate.zipSync` no teste):

```ts
it('extrai só as entradas pedidas e lista todos os nomes', ...)        // zip com a.txt, b.txt, "0": pede ['a.txt'] → entradas.size 1, nomes = ['a.txt','b.txt','0']
it('recusa uma entrada que passa do teto DURANTE a inflação, mesmo com cabeçalho mentindo', ...) // 2 MB de zeros (comprime a KB), teto 1 MB → rejects ExpansaoAcimaDoTeto; o header do zip é reescrito para declarar 10 bytes
it('medirExpansaoDoZip soma todas as entradas e aplica os dois tetos', ...) // 3 entradas de 1 MB: tetoPorEntrada 2 MB ok, tetoTotal 2 MB → lança
it('Blob que não é zip → erro legível', ...)                           // rejects /não é um zip válido/
```

- [ ] **Step 3: Rodar e ver falhar** — `npx vitest run tests/zip-com-teto.test.ts` → FAIL (módulo não existe).

- [ ] **Step 4: Implementar `zipComTeto.ts`** e rodar até PASS.

- [ ] **Step 5: Testes do leitor** em `tests/anki-leitor.test.ts`, com `abrirSqlite` de Node: `initSqlJs({ locateFile: (f) => require.resolve(\`sql.js/dist/${f}\`) })`:

```ts
it('lê tests/fixtures/baralho-moderno.apkg (collection.anki21b, zstd) → 4 notas, formato "collection.anki21b"', ...)
it('lê tests/fixtures/baralho-antigo.apkg (collection.anki2) → notas com campos nomeados de col.models', ...)
it('frame zstd sem tamanho declarado é lido em streaming', ...)   // zstdCompressSync(colecao) do node:zlib gera frame sem content size por padrão; empacotar com fflate como collection.anki21b
it('coleção que passa de TETO_DE_EXPANSAO depois do zstd é recusada', ...) // usar teto injetável? NÃO: monte um .anki21b de 1 MB de zeros e rode lerApkg com deps.teto = 512*1024 — acrescente `teto?: number` em deps só para teste (padrão TETO_DE_EXPANSAO)
it('nota com mais partes em flds do que nomes → campoN em camposBrutos, nota mantida', ...)     // Review Focus 2
it('HTML hostil nos campos: nenhuma frente/verso sai com "<"; camposBrutos preserva o original', ...) // mova para cá os casos de leitura de tests/seguranca/anki-html-hostil.test.ts, montando o .apkg com sql.js (db.export()) + fflate.zipSync em vez de libsql + JSZip
it('arquivo que não é zip → "não consegui abrir este .apkg"', ...)   // Review Focus 5
it('lerTextoAnki continua acessível por lerBaralhoNoNavegador para .tsv', ...) // pode ficar só no core; opcional
```

- [ ] **Step 6: Rodar e ver falhar**, depois **implementar `sqlite.ts`, `lerApkg.ts`** até PASS: `npx vitest run tests/anki-leitor.test.ts`.

- [ ] **Step 7: Implementar `leitorDeApkg.worker.ts` e `lerBaralho.ts`** (sem teste unitário: o E2E da Task 6 cobre). `npm run build` precisa passar e o `dist/assets` precisa conter `sql-wasm-*.wasm` e o chunk do worker.

- [ ] **Step 8: Reduzir `tests/seguranca/anki-html-hostil.test.ts`** aos casos que ainda dependem do servidor (export → vão para Task 5; leitura → já movida). Se nada sobrar, apagar o arquivo nesta tarefa e dizer no relatório.

- [ ] **Step 9: `npm run typecheck && npm run lint && npx vitest run tests/zip-com-teto.test.ts tests/anki-leitor.test.ts`** → PASS.

- [ ] **Step 10: Commit** — `feat(anki): leitor de .apkg no navegador (fflate + fzstd + sql.js) com tetos (Fase 3, T2)`

---

### Task 3: Servidor — protocolo em lotes `/api/anki/imports` e limpeza de imports abandonados

**Files:**

- Create: `server/routes/ankiImports.ts`, `server/import/identidadeDaNota.ts`
- Modify: `server/routes/anki.ts` (`ankiRouter.use(ankiImportsRouter)`), `server/validation.ts`, `server/db/repositories/anki.ts`, `server/http/limitesDeCorpo.ts` (`ROTAS_DE_CORPO_GRANDE` += `'/api/anki/imports'`), `server/lib/limpezaDiaria.ts`, `server/import/anki.ts` (remove `hashDaEstrutura`), `server/routes/import.ts` (remove `guidDaNota`/`guidDerivadoDoConteudo`; usa `identidadeDaNota.ts`)
- Test: `tests/integration/anki-importacao-em-lotes.test.ts` (novo), `tests/ankiMidia.test.ts` (caso de `hashDaEstrutura` aponta para `identidadeDaNota`)

**Interfaces:**

- Consumes: `src/core/anki` (`limparCampo`, `decidirIdiomaOrigem`, `versoEhDefinicao`, `TETO_DE_NOTAS`), `ankiRepo` (`criarOuAcharDeck`, `criarImport`, `atualizarImport`, `gravarNotas`), `vocabRepo.ativarLote`, `avaliarCartao`.
- Produces:

  - `identidadeDaNota.ts`: `guidDaNota(n: { guid?: string; notetype?: string | null; frente: string; verso: string }): string` e `hashDaEstrutura(campos: string[]): string` (corpos de hoje, inalterados: sha256 truncado em 32 e 16 hex).
  - Schemas em `validation.ts`:
    - `abrirImportAnkiSchema`: `{ arquivo: z.string().min(1).max(400), bytes: z.number().int().min(0), formato: z.string().max(80), nomeNoArquivo: z.string().max(400).nullable().optional(), baralhos: z.array(z.string().max(400)).max(200).optional(), campos: z.array(z.string().max(200)).max(50), totalNoArquivo: z.number().int().min(0), truncado: z.boolean(), idiomaOrigem: <mesma regra de 'x-src-lang'>.nullable().optional(), idiomaAlvo: <idem>.nullable().optional(), amostra: z.array(z.object({ frente: z.string().max(2_000), verso: z.string().max(2_000) })).max(200) }`.
    - `notaRecebidaSchema`: `{ guid: z.string().max(64).optional(), notetype: z.string().max(200).nullable().optional(), campos: z.array(z.string().max(200)).max(50), camposBrutos: z.record(z.string().max(200), z.string().max(20_000)) (≤ 50 chaves — refine), frente: z.string().min(1).max(2_000), verso: z.string().min(1).max(2_000), exemplo: z.string().max(4_000).optional(), tags: z.array(z.string().max(200)).max(100), midia: z.object({ sons: z.array(z.string().max(400)).max(100), imagens: idem }).optional(), lacunas: z.array(z.object({ ordinal: z.number().int().min(0), resposta: z.string().max(2_000), dica: z.string().max(2_000).optional() })).max(100).optional() }`; `lotesDeNotasSchema = { notas: z.array(notaRecebidaSchema).min(1).max(500) }`.
  - Rotas (todas sob os mesmos middlewares de `/api/anki`: conta obrigatória, conta liberada; **não** entram no `expensiveLimiter` — um import de 50.000 notas são 100 requisições; a implementação confere que o limitador de escrita de `server/http/app.ts:302` (120/min) comporta isso e, se não, isenta `/api/anki/imports/:id/notas` dele, dizendo no relatório):
    - `POST /api/anki/imports` → `{ importId, deckId, idiomaOrigem: string | null, avisoIdioma?: string }`. Nome do deck = `baralhos[0] || arquivo sem extensão || 'baralho'`; `decidirIdiomaOrigem(idiomaOrigem, amostra.map(frente))`; `idiomaAlvo = versoEhDefinicao(amostra) ? idiomaOrigem decidido : idiomaAlvo`; `criarOuAcharDeck` → `criarImport({ deckId, arquivo, bytes })` → `atualizarImport(id, { estado: 'gravando' })`.
    - `POST /api/anki/imports/:id/notas` → `{ novas, atualizadas, iguais, descartadas, porMotivo }` do lote. 404 se o import não é do usuário; 409 `import_fechado` se `estado !== 'gravando'`; 400 `teto_de_notas` se `notasLidas + notas.length > TETO_DE_NOTAS`; 400 `nota_invalida` (R7) com `{ indice }` se, depois de `limparCampo`, `frente` ou `verso` ficam vazios. Por nota: `frente/verso/exemplo = limparCampo(...)`, `guid = guidDaNota`, `estruturaHash = campos.length ? hashDaEstrutura(campos) : null`, `avaliarCartao(..., { origem: 'curado' })` → `motivoDescarte`, `camposBrutos` gravado como hoje (`JSON.stringify({ campos: camposBrutos, midia, lacunas })`), `tags.join(' ')`. Depois `gravarNotas`, `atualizarImport(id, { notasLidas: n, notasNovas, notasAtualizadas, notasDescartadas })` (incrementos) e `ankiRepo.somarPorMotivo(id, porMotivoDoLote)`.
    - `POST /api/anki/imports/:id/fechar` → mesmo envelope da rota antiga: `{ importId, deckId, resumo: { ativadas, notas, novas, atualizadas, iguais, descartadas, porMotivo }, ...(erroDeAtivacao ? { erroDeAtivacao, code: 'ativacao_falhou' } : {}) }` com `iguais = notas − novas − atualizadas`. Faz `marcarAusentesForaDoImport`, `atualizarImport({ estado: 'concluido' })`, `vocabRepo.ativarLote` (falha não desfaz, como hoje). 409 se já fechado.
  - `ankiRepo`: `marcarAusentesForaDoImport(userId: UserId, deckId: string, importId: string): Promise<number>` (notas do deck, não apagadas, com `import_id <> importId` ou nulo → `ausente_no_arquivo`); para isso `gravarNotas` passa a carimbar `import_id` **também nas notas iguais** (hoje só novas/atualizadas — confira em `anki.ts:387,424` e acrescente um `UPDATE ... SET import_id` para as iguais em lote). `somarPorMotivo(id: string, porMotivo: Record<string, number>): Promise<void>` (lê, soma, grava). `marcarImportsAbandonados(corte: number): Promise<number>` (estado `lendo`/`gravando` e `created_at < corte` → `falhou`, `erro = 'abandonado: o navegador não concluiu o envio'`). `marcarAusentes` antigo é removido junto com a rota antiga (Task 6); até lá fica.
  - `limpezaDiaria.ts`: `limparBanco` chama `marcarImportsAbandonados(agora − 24h)` e conta no `RelatorioDaLimpeza` (`importsAbandonados: number`).

- [ ] **Step 1: Escrever `tests/integration/anki-importacao-em-lotes.test.ts`** com `subirApp({ modo: 'self-host' })` (padrão de `tests/caracterizacao/_app`), cobrindo:

```ts
it(
  'abrir → 2 lotes → fechar grava o acervo e devolve o resumo no envelope antigo (notas, novas, iguais, ativadas)',
);
it('reenviar o mesmo arquivo: segundo import reporta "iguais" e não duplica (dedupe por guid)');
it('fechar marca ausente_no_arquivo as notas que não vieram neste import');
it('nota sem guid recebe guid derivado do conteúdo, estável entre dois imports');
it(
  'frente com <script> chega limpa ao banco e camposBrutos preserva o HTML (servidor reaplica limparCampo)',
);
it('frente que fica vazia depois de limpar → 400 nota_invalida com indice');
it('lote 101 que passaria de 50.000 notas → 400 teto_de_notas');
it('lote depois de fechar → 409 import_fechado');
it('import de outro usuário → 404 em notas e fechar');
it(
  'S11: amostra CJK pura com idiomaOrigem "en" → idiomaOrigem null + avisoIdioma; com kana → "ja"',
); // porte dos 5 casos de tests/integration/anki-rotas.test.ts:190-292
it('campos excedentes (campo7) no camposBrutos são aceitos'); // Review Focus 2
it('import abandonado há 25 h vira falhou na limpeza diária; o mesmo arquivo reimporta depois'); // Review Focus 3
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/integration/anki-importacao-em-lotes.test.ts` → 404 nas rotas.

- [ ] **Step 3: Implementar** schemas, `identidadeDaNota.ts`, repositório, rotas, limpeza. Registrar as rotas em `tests/contratos/api-contrato.json` (`POST /api/anki/imports`, `POST /api/anki/imports/:id/notas`, `POST /api/anki/imports/:id/fechar`).

- [ ] **Step 4: Rodar** — `npx vitest run tests/integration/anki-importacao-em-lotes.test.ts tests/integration/anki-rotas.test.ts tests/ankiMidia.test.ts tests/contratos` → PASS (a rota antiga continua existindo até a Task 6, então `anki-rotas` ainda passa).

- [ ] **Step 5: `BANCO_DE_TESTE=postgres npx vitest run tests/integration/anki-importacao-em-lotes.test.ts`** com o Postgres 17 do Docker (`docker start pg-worker`; ver `docs/deploy.md`) → PASS.

- [ ] **Step 6: `npm run typecheck && npm run lint`; Commit** — `feat(anki): importação em lotes /api/anki/imports (abrir, notas, fechar) + imports abandonados (Fase 3, T3)`

---

### Task 4: Cliente — orquestração da importação no navegador e progresso na tela

**Files:**

- Modify: `src/data/apiAnki.ts`, `src/data/importarAnki.ts`, `src/components/views/BaralhoAnki.tsx`, `src/components/views/cartoes/TrazerELevar.tsx`
- Test: `tests/baralhoAnkiImport.test.tsx` (ajustar mocks para a nova função), `tests/importAnki.test.ts` (ver o que testa hoje e adaptar)

**Interfaces:**

- Consumes: `lerBaralhoNoNavegador` (Task 2), rotas da Task 3.
- Produces:

  - `apiAnki.ts`: `abrirImportAnki(dados: AberturaDeImport): Promise<{ importId: string; deckId: string; idiomaOrigem: string | null; avisoIdioma?: string }>`, `enviarNotasDoImport(importId: string, notas: NotaAnki[]): Promise<ResumoDoLote>`, `fecharImportAnki(importId: string): Promise<FechamentoDeImport>` — tipos espelhando os schemas da Task 3.
  - `importarAnki.ts`: `interface ProgressoDaImportacao { etapa: 'lendo' | 'enviando' | 'concluindo'; feitas: number; total: number }`; `importarBaralhoAnki(arquivo: File, idioma: string, idiomaNativo: string, aoProgredir?: (p: ProgressoDaImportacao) => void): Promise<ImportAnkiResposta>` — lê com `lerBaralhoNoNavegador`, abre (`amostra` = 200 primeiras notas, `campos`, `baralhos`, `formato`, `totalNoArquivo`, `truncado`, `bytes = arquivo.size`), envia lotes de `LOTE = 500` **em sequência**, fecha, e compõe `ImportAnkiResposta` (mesma forma de hoje, menos `estruturaHash`; `amostra` = 4 primeiras notas truncadas em 80; `avisoIdioma` do `abrir`). Erro em qualquer passo → lança com a mensagem do servidor; se a abertura já aconteceu, não tenta "desfazer" (o import fica `gravando` e a limpeza cuida — R/Review Focus 3). `soAColecao` e o import de `jszip` saem.
  - Telas: mostram o progresso (`"Lendo o arquivo…"`, `"Enviando 1.500 de 3.600 notas…"`, `"Concluindo…"`) no lugar do "Lendo…" fixo; texto "até 200 MB" permanece (agora é o navegador que lê). O `accept` continua `.apkg,.txt,.csv,.tsv`.

- [ ] **Step 1: Atualizar `tests/baralhoAnkiImport.test.tsx`** para mockar `importarBaralhoAnki` com `aoProgredir` e acrescentar: `it('mostra o progresso do envio enquanto a importação roda')` (chama `aoProgredir({ etapa: 'enviando', feitas: 1500, total: 3600 })` e espera `/1\.500 de 3\.600/`).

- [ ] **Step 2: Rodar e ver falhar**, implementar, rodar: `npx vitest run tests/baralhoAnkiImport.test.tsx tests/importAnki.test.ts tests/baralhosAnki.test.tsx` → PASS.

- [ ] **Step 3: Teste unitário da orquestração** em `tests/importAnki.test.ts` (ou novo `tests/importarAnki-lotes.test.ts`): com `fetch` mockado, um `LeituraAnki` de 1.200 notas gera exatamente 1 `POST /api/anki/imports`, 3 `POST .../notas` (500, 500, 200) em sequência e 1 `.../fechar`; o progresso reporta `feitas` 500/1000/1200.

- [ ] **Step 4: `npm run typecheck && npm run lint`; Commit** — `feat(anki): importação orquestrada no navegador com progresso (Fase 3, T4)`

---

### Task 5: Exportação `.apkg` no navegador

**Files:**

- Create: `src/lib/anki/montarApkg.ts`
- Modify: `src/data/rotas/vocabulario.ts` (`exportarApkg` passa a ser local, mesma assinatura `Promise<Blob>`), `server/routes/import.ts` (remove `/anki/export`), `server/validation.ts` (remove `ankiExportSchema`), `tests/contratos/api-contrato.json`, `tests/efemero-rotas.test.ts`
- Delete: `server/import/ankiExport.ts`
- Test: `tests/anki-exportacao.test.ts` (novo; porta os casos de export de `tests/seguranca/anki-html-hostil.test.ts:223-262`)

**Interfaces:**

- Consumes: `AbrirSqlite` (Task 2), `fflate.zipSync`.
- Produces: `montarApkg(cartoes: Array<{ frente: string; verso: string; exemplo?: string }>, nomeDoBaralho: string, abrirSqlite: AbrirSqlite): Promise<Uint8Array>` — mesmo esquema 11 e mesmos modelos/decks JSON de `server/import/ankiExport.ts` (copiar o SQL e o JSON tal qual; `db.export()` no lugar do arquivo temporário; `media` = `'{}'`); escape de HTML nos campos igual ao de hoje. `exportarApkg(cartoes, nome): Promise<Blob>` em `vocabulario.ts` chama `montarApkg(cartoes, nome, abrirSqliteNoNavegador)` e devolve `new Blob([bytes], { type: 'application/octet-stream' })`. Limites de hoje (`ankiExportSchema`: 1–5.000 cartões, campos ≤ 2.000, nome ≤ 120) viram validação local com as mesmas mensagens.

- [ ] **Step 1: Testes** `tests/anki-exportacao.test.ts` (abrirSqlite de Node): `it('gera um .apkg que o leitor da Task 2 lê de volta com os mesmos cartões')`, `it('escapa < & > nos campos (HTML hostil não vira tag no Anki da pessoa)')`, `it('nome do baralho com aspas e <script> chega íntegro e escapado em col.decks')`, `it('mais de 5.000 cartões → erro')`.
- [ ] **Step 2: Rodar e ver falhar; implementar; PASS.**
- [ ] **Step 3: Remover a rota, o schema e o arquivo do servidor**; atualizar contratos. `npx vitest run tests/contratos tests/efemero-rotas.test.ts tests/anki-exportacao.test.ts` → PASS. Grep: nenhuma referência a `anki/export` em `src/`, `server/`, `tests/`.
- [ ] **Step 4: `npm run typecheck && npm run lint`; Commit** — `feat(anki): exportação .apkg no navegador; rota /api/import/anki/export removida (Fase 3, T5)`

---

### Task 6: Remover a rota binária e o leitor Node; E2E pelo protocolo novo

**Files:**

- Delete: `server/import/anki.ts`, `tests/integration/anki-bomba.test.ts`, `tests/ankiMapaDeMidia.test.ts` (R4)
- Modify: `server/routes/import.ts` (fica só `/web` e `/youtube`; remove a guarda `ehWorker()` → 503 de `/anki`), `tests/integration/anki-rotas.test.ts` (casos de `POST /api/import/anki` saem — já cobertos na Task 3; os de ativar/purgar/escopo passam a semear pelo protocolo novo), `tests/caracterizacao/importacao-anki.test.ts` (reescrever o envio: parse do `.txt` com `lerTextoAnki` no teste + protocolo em lotes; manter os `expect` do acervo), `tests/seguranca/uploads-grandes.test.ts:306-340` (os dois casos do `/api/import/anki` saem; o semáforo continua coberto pelo áudio), `tests/contratos/api-contrato.json`, `tests/efemero-rotas.test.ts`, `tests/contratos/rotas-espelhadas.test.ts:40-42` (texto do motivo: "importar exige conta; a leitura do arquivo é no navegador"), `tests/e2e/_fixtures.ts` (`semearBaralhoAnki` envia 4 notas em JSON pelo protocolo; `MOTIVO_ANKI_SO_NO_NODE`/`NO_WORKER` deixam de pular suítes de Anki), `tests/e2e/cartoes.e2e.ts:291` (segue igual: o upload pela UI agora roda no navegador), `package.json` (remove `jszip`; `@libsql/client` fica — Global Constraints), `tests/worker/bundle.test.ts` (novo caso `it('@libsql/client e jszip não entram no bundle do Worker')`, sem mexer em `SO_NO_NODE`)
- Test: tudo acima.

- [ ] **Step 1: Apagar os arquivos e a rota; corrigir imports; `npm run typecheck`** até limpar.
- [ ] **Step 2: Reescrever os testes listados**; `npx vitest run tests/integration/anki-rotas.test.ts tests/caracterizacao/importacao-anki.test.ts tests/seguranca/uploads-grandes.test.ts tests/contratos tests/efemero-rotas.test.ts tests/worker` → PASS.
- [ ] **Step 3: E2E** — `npm run build && npx playwright test tests/e2e/cartoes.e2e.ts tests/e2e/baralhos.e2e.ts` (no modo Node, conforme `docs/deploy.md`/`tests/e2e/README` do projeto) → o caso `anki-arquivo` → `anki-lido` passa com o `.apkg` lido no navegador.
- [ ] **Step 4: `npm run worker:build` e `npx vitest run tests/worker`** → bundle sem `@libsql/client`, `jszip`, `jsdom`.
- [ ] **Step 5: `npm run lint`; Commit** — `refactor(anki): rota binária e leitor Node removidos; E2E semeia pelo protocolo em lotes (Fase 3, T6)`

---

### Task 7: PDF e DOCX no navegador

**Files:**

- Create: `src/lib/import/extrairDocumento.ts`, `src/lib/import/pdfjsNoNavegador.ts`
- Modify: `src/lib/import/filaDeImportacao.ts:107-111` (`importDocument` → `extrairDocumento`), `src/data/rotas/importacao.ts` (remove `importDocument` e `ImportTextResult.lang` continua), `server/routes/import.ts` (remove `/document`), `wrangler.jsonc` (remove aliases de `mammoth` e `pdfjs-dist`), `tests/worker/bundle.test.ts` (`pdfjs-dist`/`mammoth` continuam em `SO_NO_NODE` como regressão), `tests/contratos/api-contrato.json`, `tests/efemero-rotas.test.ts`, `tests/seguranca/rotas-sensiveis-e-bomba-de-docx.test.ts` (só o caso da bomba sai; se o arquivo cobrir outras rotas sensíveis, mantê-las)
- Delete: `server/import/document.ts`, `server/stubs/mammoth.ts`, `server/stubs/pdfjs.ts`
- Test: `tests/extrair-documento.test.ts`

**Interfaces:**

- Consumes: `medirExpansaoDoZip` (Task 2).
- Produces: `interface DependenciasDoExtrator { carregarPdfjs?: () => Promise<PdfjsMinimo> }` onde `PdfjsMinimo = { getDocument(args: { data: Uint8Array; isEvalSupported: false; useSystemFonts?: boolean }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: Array<{ str?: string }> }> }>; cleanup?(): Promise<unknown> }> } }`; `extrairDocumento(arquivo: File, deps?: DependenciasDoExtrator): Promise<{ title: string; text: string }>` — mesma lógica e mesmos tetos/mensagens de `server/import/document.ts` (`.docx` → `medirExpansaoDoZip(arquivo, 20 MiB, 40 MiB)` antes de `mammoth.extractRawText({ arrayBuffer })`; `.pdf` → 500 páginas / 5.000.000 caracteres; `.txt`/`text/*` → UTF-8; outro → `'formato não suportado — envie .txt, .pdf ou .docx'`). Limite de tamanho do arquivo no navegador: 30 MB (`'o documento passa do limite de 30 MB'`). `pdfjsNoNavegador.ts`: `carregarPdfjs(): Promise<PdfjsMinimo>` — `import('pdfjs-dist')` + `GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default`. `mammoth` importado como `'mammoth/mammoth.browser'` (ou o campo `browser` do pacote, o que o Vite resolver; checar que o bundle não puxa `node:*`).

- [ ] **Step 1: Testes** `tests/extrair-documento.test.ts` (ambiente node; para PDF, injetar `carregarPdfjs: () => import('pdfjs-dist/legacy/build/pdf.mjs')`): `it('.docx simples → texto')` (monte um `.docx` mínimo com `fflate.zipSync` contendo `[Content_Types].xml`, `_rels/.rels`, `word/document.xml` com dois parágrafos), `it('.docx que expande para 300 MB é recusado antes do mammoth')` (porte de `rotas-sensiveis-e-bomba-de-docx.test.ts`), `it('.pdf com texto → texto por página separado por linha em branco')` (gere um PDF mínimo à mão no teste — um objeto de página com `BT /F1 12 Tf (Olá mundo) Tj ET`), `it('.pdf sem camada de texto → "PDF sem texto selecionável…"')` (Review Focus 6), `it('.txt vazio → erro; .exe → formato não suportado')`, `it('arquivo acima de 30 MB → mensagem de limite sem ler o conteúdo')`.
- [ ] **Step 2: Rodar e ver falhar; implementar; PASS.**
- [ ] **Step 3: Remover rota, stubs, aliases**; `npm run worker:build && npx vitest run tests/worker tests/contratos tests/efemero-rotas.test.ts` → PASS. `npm run build` → o chunk do `pdf.worker` aparece em `dist/assets`.
- [ ] **Step 4: Fumaça manual no `npm run dev:local`**: importar um PDF e um DOCX reais pela Biblioteca cria a sessão-documento (relatar no report o que foi feito).
- [ ] **Step 5: `npm run typecheck && npm run lint`; Commit** — `feat(import): PDF e DOCX extraídos no navegador; rota /api/import/document removida (Fase 3, T7)`

---

### Task 8: Web sem `jsdom` (linkedom + charset) e prova no Worker

**Files:**

- Modify: `server/import/web.ts`, `package.json` (`linkedom` em deps; `jsdom` e `@types/jsdom` em devDeps), `wrangler.jsonc` (remove aliases `jsdom` e `@mozilla/readability`), `tests/worker/bundle.test.ts` (`@mozilla/readability` sai de `SO_NO_NODE` e ganha `it('linkedom e @mozilla/readability ENTRAM no bundle')`; `jsdom` continua fora), `scripts/worker/fumaca.mjs` (ver Step 4)
- Delete: `server/stubs/jsdom.ts`, `server/stubs/readability.ts`
- Test: `tests/integration/import-web-charset.test.ts` (novo), `tests/seguranca/ssrf-rebinding.test.ts` e `ssrf-vetores.test.ts` (inalterados, precisam continuar passando)

**Interfaces:**

- Produces em `web.ts`: `decodificarHtml(bytes: Uint8Array, contentType: string | null): string` (exportada para teste) — label de `charset=` no `Content-Type`; senão `<meta charset=...>` ou `<meta http-equiv="content-type" content="...charset=...">` nos primeiros 2.048 bytes lidos como ASCII; senão `utf-8`; label inválido (`new TextDecoder` lança `RangeError`) → `utf-8`. `extractArticle(rawUrl)` mantém a assinatura e o retorno `{ title, text, lang? }`; `lerComTeto` passa a devolver `Uint8Array` e a decodificação acontece com o `content-type` da resposta; DOM via `parseHTML(html)` do `linkedom`; `baseURI` do documento definido com a URL final (`Object.defineProperty(document, 'baseURI', { value: url.href })` ou `<base href>` injetado — o que o Readability aceitar: ele usa `doc.baseURI`/`documentURI` para resolver links relativos).

- [ ] **Step 1: Testes** `tests/integration/import-web-charset.test.ts` com um servidor HTTP local **permitido** pela guarda anti-SSRF (seguir o padrão de `tests/seguranca/ssrf-rebinding.test.ts:113-200`, que injeta resolução DNS para um nome público apontando ao loopback): `it('página em ISO-8859-1 declarada no Content-Type → "ação" íntegro')`, `it('página em windows-1252 declarada só no <meta charset> → sem mojibake')`, `it('charset inválido → cai em utf-8 sem lançar')`, `it('artigo com <p> dentro de <article> → text extraído e title do <title>')`, `it('página sem texto principal → "não consegui extrair o texto principal"')`.
- [ ] **Step 2: Rodar e ver falhar; implementar; PASS**: `npx vitest run tests/integration/import-web-charset.test.ts tests/seguranca/ssrf-rebinding.test.ts tests/seguranca/ssrf-vetores.test.ts`.
- [ ] **Step 3: Bundle**: `npm run worker:build && npx vitest run tests/worker` → PASS, com o tamanho do bundle anotado no relatório (antes/depois).
- [ ] **Step 4: Prova no Worker (R8)**: com `.dev.vars` e Postgres local como na fumaça da Fase 2 (`WRANGLER_FUMACA=1 npm run fumaca:worker` sobe o `wrangler dev`), fazer `POST /api/import/web` com uma conta de teste contra uma URL pública real (ex.: `https://pt.wikipedia.org/wiki/Língua_portuguesa`) e registrar no relatório: status, tamanho do texto, tempo. Se o `linkedom` falhar no `workerd`, **não** implementar o plano B: reportar `BLOCKED` com o erro exato.
- [ ] **Step 5: `npm run typecheck && npm run lint`; Commit** — `feat(import): página web sem jsdom (linkedom + charset), roda no Worker (Fase 3, T8)`

---

### Task 9: Tirar o YouTube do cliente e dos planos

**Files:**

- Modify: `src/core/planos.ts` (remove `youtubeImport` da interface e de todas as matrizes), `src/components/views/Library.tsx` (fonte `youtube` sai de `FONTES`, `youtubeTravado`, `importSource === 'youtube'`), `src/lib/import/filaDeImportacao.ts` (ramo `fonte === 'youtube'`), `src/data/rotas/importacao.ts` (`importYoutube` e `ImportYoutubeResult` saem), `src/components/BuscaGlobal.tsx:162`, `src/components/GuidePanel.tsx:35`, `src/components/conteudo/CatalogoDeConteudo.tsx:422-423` (copy sem "YouTube"), e os testes que citam `youtubeImport`: `tests/entitlements-cliente.test.ts`, `tests/anonimo-sem-rede.test.ts`, `tests/edicao-estatica.test.ts`, `tests/planos-tela-v2.test.tsx`, `tests/planos-anual-desligado.test.tsx`, `tests/planos-matriz.test.ts`, `tests/consumo-hoje-e-aviso-do-dia.test.tsx`, `tests/integration/mt1-me-entitlements-route.test.ts`, `tests/integration/audit-a05-api-timeout.test.ts`, `tests/integration/mt1-entitlements-server.test.ts`, `tests/caracterizacao/planos-e-quotas.test.ts`, `tests/caracterizacao/__snapshots__/get.me.entitlements.json` (editar à mão), `tests/e2e-publico/_nuance.ts`, `tests/e2e/modo-interprete.e2e.ts`.
- Não mexer: `server/routes/import.ts` (`/youtube` → 410 fica), `tests/integration/import-youtube-removida.test.ts`, `src/components/views/Analysis.tsx` (`youtube-caption-*` são tipos de sessão antiga, continuam válidos), `src/components/views/biblioteca/ExportarTranscricao.tsx` (copy sobre `.vtt`, não é importação).

- [ ] **Step 1: Remover tudo o que está listado**; `npm run typecheck` guia o resto (o tipo `Entitlements` sem `youtubeImport` aponta cada uso).
- [ ] **Step 2: `npx vitest run tests/entitlements-cliente.test.ts tests/planos-matriz.test.ts tests/caracterizacao/planos-e-quotas.test.ts tests/integration/mt1-entitlements-server.test.ts tests/integration/mt1-me-entitlements-route.test.ts tests/planos-tela-v2.test.tsx tests/planos-anual-desligado.test.tsx tests/consumo-hoje-e-aviso-do-dia.test.tsx tests/anonimo-sem-rede.test.ts tests/edicao-estatica.test.ts tests/integration/audit-a05-api-timeout.test.ts`** → PASS; `npm run i18n:orfas` sem chave órfã nova.
- [ ] **Step 3: `npm run lint`; Commit** — `refactor(import): YouTube fora do cliente e dos planos; rota segue 410 (Fase 3, T9)`

---

### Task 10: Benchmark de 200 MB, docs e portão da Fase 3

**Files:**

- Create: `scripts/perf/anki-200mb.mjs`
- Modify: `CLAUDE.md` (mapa: `src/core/anki`, `src/lib/anki`, `src/lib/import`; armadilha: "importação roda no navegador; o servidor só recebe lotes"), `docs/deploy.md` (seção Worker: importação sem stubs; `linkedom`), `docs/auditoria/2026-10-19-spikes-cloudflare.md` (seção "Fase 3 concluída": números do benchmark, bundle do Worker antes/depois, portão, decisões R1–R8, pendências)
- Test: portão completo.

- [ ] **Step 1: `scripts/perf/anki-200mb.mjs`** — gera num diretório temporário um `.apkg` sintético: `collection.anki21b` com 20.000 notas (esquema 18 mínimo: `notes`, `cards`, `col`, `notetypes`, `fields`, `decks`; gerado com `sql.js` + `zstdCompressSync`) e 2.000 entradas numéricas de ~100 KB de bytes aleatórios (≈ 200 MB), `media` em JSON; cronometra `lerApkg` (de `src/lib/anki/lerApkg.ts`, via `tsx`) com `abrirSqlite` de Node e imprime `tamanho do arquivo, notas lidas, segundos, pico de RSS`. Critério: ≤ 60 s. Não commitar o arquivo gerado.
- [ ] **Step 2: Rodar** `npx tsx scripts/perf/anki-200mb.mjs` e anotar os números no doc de auditoria. Medir também **no navegador**: `npm run dev:local`, importar o mesmo arquivo pela tela e cronometrar (relatar no doc: navegador, máquina, segundos).
- [ ] **Step 3: Portão** (nesta ordem; cada um precisa passar):
  - `npm run typecheck && npm run lint && npm test`
  - `BANCO_DE_TESTE=postgres npx vitest run tests/integration tests/caracterizacao`
  - `npx knip` (sem export morto novo; `@libsql/client` fica listado como usado pelos scripts)
  - `npm run build && npm run worker:build && npx vitest run tests/worker`
  - `WRANGLER_FUMACA=1 npm run fumaca:worker`
  - E2E Node: `npx playwright test` ; E2E Worker: `E2E_RUNTIME=worker npx playwright test` — as suítes de Anki não pulam mais.
  - `npm run limpar -- --dry-run` sem órfão.
- [ ] **Step 4: Docs** (CLAUDE.md, deploy.md, auditoria) e **Commit** — `docs(auditoria): Fase 3 concluída — importação no navegador, web sem jsdom, portão`

---

## Self-review (feito ao escrever)

- **Cobertura da spec:** Anki no navegador (T2, T4), "servidor só recebe cartões já extraídos em lotes" (T3, T6), PDF/DOCX no navegador (T7), web sem jsdom com SSRF preservada (T8), YouTube fora (T9), critério de 200 MB ≤ 60 s (T10). Exportação (T5) é ruling R5, fora da letra da spec mas exigida pelo Worker.
- **Tipos:** `NotaAnki.campos` (T1) é o que T3 valida como `campos` e T4 reenvia; `AbrirSqlite` (T2) é consumido por T5; `medirExpansaoDoZip` (T2) por T7; `ProgressoDaLeitura` (T2) alimenta `ProgressoDaImportacao` (T4).
- **Review Focus:** cada item tem o teste nomeado na tarefa dona (1, 2, 5 → T2; 2, 3 → T3; 4 → T8; 6 → T7; 5 também em T4 pela mensagem na tela).
- **Proporção:** o plano decide protocolo, tetos, nomes e onde cada regra de segurança passa a morar; os corpos das funções movidas não são repetidos (o código de origem está citado por linha).
