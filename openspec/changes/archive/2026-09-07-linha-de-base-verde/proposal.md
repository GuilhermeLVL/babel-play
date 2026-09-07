## Why

A auditoria de 2026-09-07 (`openspec/audits/2026-09-07-coerencia.md`, achados A01, A41-A45, A43, A56) mediu que a linha de base nao esta verde:

- `npm test`: 2.784/2.788, **3 falhas** — `tests/blitzGame.test.tsx` e `tests/termoTravado.test.tsx` (`canvas-confetti` chama `clearRect` em canvas nulo no jsdom; botao `/pedir dica/i` nao existe mais no Termo).
- `npm run test:e2e`: **6 de 14 falham** esperando `getByRole('button', { name: 'Trocar' })` (`tests/e2e/_helpers.ts:110`); o botao saiu de `Play.tsx` em `976af2c`.
- `npm run i18n:orfas`: **exit 1**, 18 chaves orfas em `public/i18n/en.json` e `xx.json`.
- `.github/workflows/uptime.yml:66-76`: YAML invalido (linhas do `--body` na coluna 0 dentro de `run: |`) desde `c6eb8b3`; o vigia nunca rodou.
- Arvore suja: `src/components/views/Loja.tsx:151` fixa `modoVisual='pro'` e o setter nunca e chamado — loja de Seeds, compra/gasto de Creditos, Passe, Conquistas e Personalizar ficam inalcancaveis (EXEC `/loja`, `/loja/passe`). `src/core/index.ts:56` re-exporta `./catalogoMestre`, que nao esta no git. `three`/`@types/three` foram adicionados ao `package.json` sem nenhum import.
- `deploy-pages.yml:40-46` publica sem rodar lint, orfas, pseudo e e2e que o `ci.yml` exige.

Nenhuma outra change pode ser medida sobre uma arvore que nem o CI aceita. Esta e a primeira e bloqueia todas.

## What Changes

1. **Decisao registrada sobre a camada nao rastreada** (pergunta 1 do relatorio). Duas saidas aceitas, uma delas escolhida em `design.md` antes de codar:
   - (a) commitar a camada em branch propria atras de um interruptor real (o `modoVisual` vira estado persistido com controle na UI), com `catalogoMestre.ts` incluido no commit; ou
   - (b) descartar (`git stash`/branch de arquivo) e voltar `Loja.tsx`, `core/index.ts` e os 26 arquivos ao HEAD.
   Em qualquer saida, `/loja` volta a mostrar loja de Seeds, carteira, Passe e Conquistas, e `/loja/passe` monta o Passe.
2. `npm test` verde: `canvas-confetti` isolado atras de um adaptador que nao roda sem canvas (ou mock global no setup de teste); o teste do Termo passa a procurar o controle de dica que existe hoje, ou o controle volta.
3. `npm run test:e2e` verde: `abrirSeletor` em `tests/e2e/_helpers.ts` aponta para o controle atual do lobby (papel/acessibilidade, nao classe CSS).
4. `npm run i18n:orfas` verde: chaves orfas removidas de `en.json` e `xx.json` regenerado (`scripts/i18n/pseudo.mjs`).
5. `uptime.yml` valido (indentar o corpo do `--body` dentro do bloco) — validado com um parser YAML no CI.
6. `deploy-pages.yml` roda exatamente os passos do `ci.yml` antes de publicar.
7. `three` e `@types/three` removidos do `package.json` (sem import em `src/`, `server/`, `tests/`).

## Capabilities

### New Capabilities
- `linha-de-base-verde`: o repositorio tem uma definicao executavel de "verde" que o CI e o deploy compartilham.

### Modified Capabilities
- nenhuma spec vigente existe ainda (ver `spec-vigente-do-codigo`).

## Impact

- `src/components/views/Loja.tsx`, `src/core/index.ts`, `package.json`, `package-lock.json`
- `tests/blitzGame.test.tsx`, `tests/termoTravado.test.tsx`, `tests/setup-db-isolada.ts` (ou novo `tests/setup-canvas.ts`), `src/lib/gameFeel.ts`
- `tests/e2e/_helpers.ts`
- `public/i18n/en.json`, `public/i18n/xx.json`
- `.github/workflows/uptime.yml`, `.github/workflows/deploy-pages.yml`
- Remove: dependencias `three`, `@types/three`; 18 chaves orfas; se (b), os 10 caminhos nao rastreados saem da arvore.

## Pronto quando

Todos exit 0, na mesma arvore, com `git status` limpo apos o commit: `npm run typecheck`, `npm run typecheck:core`, `npm run lint`, `npm test`, `npm run i18n:orfas`, `node scripts/i18n/pseudo.mjs --check`, `npm run audit:gate`, `npm run test:e2e`, `./node_modules/.bin/ast-grep scan -c sgconfig.yml src server server.ts`; e `node -e "require('js-yaml').load(fs.readFileSync('.github/workflows/uptime.yml','utf8'))"` sem erro.

## Dependencias e paralelismo

Sem dependencias. **Bloqueia todas as outras changes.** Nao pode rodar em paralelo com nenhuma.
