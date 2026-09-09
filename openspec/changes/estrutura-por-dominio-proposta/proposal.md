## Why

A árvore é organizada por tipo técnico (`components/`, `lib/`, `data/`, `gateway/` no cliente;
`routes/`, `db/repositories/`, `lib/`, `ai/` no servidor), e o domínio aparece só no nome do
arquivo. O custo medido: para entender a economia é preciso abrir `src/lib/` (8 arquivos),
`src/components/views/loja/`, `src/components/views/passe/`, `server/routes/` (3), `server/lib/`
(6) e `server/db/repositories/` (6) — 38 arquivos em seis pastas que não se citam.

O mapa completo (349 arquivos, um por linha, em `mapa.csv`) foi levantado do grafo de imports
resolvido, não por adivinhação de nome.

## O que a medição mostrou, e que muda a proposta

**1. O problema não é onde os arquivos estão. É que seis deles têm 11,6 mil linhas.**

| arquivo                                | linhas | domínios dentro dele                                                     |
| -------------------------------------- | -----: | ------------------------------------------------------------------------ |
| `src/components/views/LiveCapture.tsx` |  4.260 | sessao, transcricao, vocabulario, i18n, jogos                            |
| `src/components/views/Play.tsx`        |  3.522 | jogos, vocabulario, sessao, economia, dados                              |
| `src/components/views/Analysis.tsx`    |  2.886 | sessao, estatisticas, vocabulario, jogos, transcricao                    |
| `src/data/api.ts`                      |  1.163 | dados (funil) + 8 domínios de rota                                       |
| `src/App.tsx`                          |  1.030 | app, auth, conta, personalizacao, estatisticas, economia, sessao         |
| `src/data/efemero/servidor.ts`         |    972 | espelha os mesmos 8                                                      |
| `server.ts`                            |    703 | infra + uma rota de negócio inteira (`/api/gemini/chat`, linhas 255-397) |

Mover esses seis para uma pasta de domínio não resolve nada: cada um pertence a cinco. Eles
precisam ser **divididos**, e o `mapa.csv` traz o corte por faixa de linha de cada um.

**2. Três regras de portão quebram em SILÊNCIO com a movimentação.**

| regra                                              | glob hoje                                                                             | o que acontece                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `audit/rules/ast-grep/env-fora-de-config.yml:8`    | `server/routes/*.ts` (raso)                                                           | com rotas em subpastas, casa com ZERO arquivos e passa sempre |
| `audit/rules/ast-grep/rota-fala-com-o-banco.yml:9` | `server/routes/*.ts` (raso)                                                           | idem                                                          |
| `eslint.config.js:69`                              | `server/routes/**`, `server/ai/**`, `server/db/repositories/**` (`no-console: error`) | deixa de cobrir as camadas renomeadas                         |

Um portão que casa com nada tem a cara de código limpo. É o mesmo defeito que a Fase 2 acabou de
corrigir no `rotas-sem-consumidor.mjs`, que lia a si mesmo e dava toda rota como viva.

**3. Três arquivos do servidor importam de fora do núcleo** (os outros 42 imports apontam para
`src/core/**`, que é o contrato compartilhado e não se move):

- `server/ai/mtProxy.ts:9` → `src/lib/traducao/promptComunicativo` (o prompt de tradução é escrito
  uma vez e usado pelo proxy do servidor E pelos scripts de avaliação).
- `server/lib/niveisDaTrilha.ts:27` → `src/data/trilha/indice`.
- `server/lib/niveisDaTrilha.ts:29-44` → **16 JSON de `src/data/trilha/niveis/`**: os dados CEFR são
  assets do cliente lidos direto pelo servidor.

## What Changes

### A árvore-alvo

```
src/
  core/                     INALTERADO — fronteira isomórfica, alias @core, tsconfig próprio
  app/                      main.tsx, App.tsx dividido (Providers/Rotas/Casca), index.css, types.ts
  dominios/
    auth/          ui/ estado/            (11 arquivos)
    conta/         ui/ estado/ dados/     (13)
    vocabulario/   ui/ estado/ dados/     (31)
    sessao/        ui/ estado/ dados/     (33, inclui o que sair de LiveCapture)
    transcricao/   ui/ motor/ adapters/   (25, o gateway inteiro)
    jogos/         ui/ estado/            (46, inclui o que sair de Play)
    economia/      ui/ estado/ dados/     (23)
    personalizacao/ ui/ estado/           (28)
    i18n/          ui/ estado/ catalogo/  (11)
    estatisticas/  ui/ estado/            (6)
  compartilhado/   ui/ hooks/ lib/        (10)
  data/            api.ts, efemero/, trilha/   INALTERADO (funil e espelho)
server.ts                   bootstrap fino
server/
  http/                     app.ts (criarApp), erroGlobal, erroDeRota, requestId, rateLimitStore
  dominios/<d>/{rotas,servico,repositorio}/   auth, conta, vocabulario, sessao, jogos, economia,
                                              transcricao, i18n, estatisticas  (66 arquivos)
  infra/                    config, logger, crypto, diretorios, armazenamento, bootStatus, diario
  db/                       INALTERADO — db.ts, schema.ts, migrate.ts, migrations/
```

### A ordem, e por que ela é esta

1. **`servidor-app-e-bootstrap`** — extrai `criarApp()` de `server.ts` e tira a rota
   `/api/gemini/chat` de dentro do bootstrap. Não move arquivo nenhum; desbloqueia o harness de
   caracterização (que hoje duplica a montagem) e é pré-requisito de tudo.
2. **`portoes-cobram-por-camada-e-nao-por-pasta`** — reescreve as três regras com glob que sobrevive
   à movimentação, com **prova negativa registrada para cada uma**: introduzir a violação, ver o
   portão falhar, reverter. Sem isto, as movimentações seguintes desligam portões sem avisar.
3. **`dividir-<arquivo-deus>`** ×6 — um por commit, usando o corte por faixa de linha do `mapa.csv`.
   É aqui que está o valor: 11,6 mil linhas viram módulos com dono.
4. **`mover-<dominio>`** ×10 — folhas primeiro (i18n, estatisticas, auth, conta), os grandes por
   último (jogos, sessao, transcricao). `git mv` + `ts-morph` para reescrever os imports.
5. **`nucleo-recebe-o-que-o-servidor-usa`** — `promptComunicativo` e a trilha CEFR sobem para
   `src/core/`, fechando os três cruzamentos de fronteira.
6. **`formatacao-e-lint-estrito`** — a passada do Prettier (1.111 arquivos) vem **por último**: um
   arquivo movido e reformatado no mesmo commit é ilegível no diff.

## Nao-escopo

Renomear identificador (a catraca do glossário é change própria), consolidar duplicata (os ADRs são
changes próprias) e mudar comportamento. Uma movimentação que precise alterar código para compilar
não é movimentação — é refatoração, e para noutro commit.
