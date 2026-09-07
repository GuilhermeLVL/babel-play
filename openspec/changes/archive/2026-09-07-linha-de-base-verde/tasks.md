## 1. Decisao sobre a arvore suja

- [x] 1.1 Registrar em `design.md` a saida escolhida — (a) commitar atras de interruptor real ou (b) descartar — com a lista dos 38 caminhos afetados (`git status` de 2026-09-07) — saida (b) escolhida pelo dono
- [x] 1.2 Executar a saida: (b) camada commitada na branch `gamificacao-v2-wip` (`0ac344d`, 74 arquivos) e `main` de volta ao HEAD `976af2c`; nada perdido
- [x] 1.3 `/loja` mostra prateleira de Seeds, carteira (Seeds + Creditos), Passe e Conquistas; `/loja/passe` monta `PasseDeTemporada` — verificado no navegador em 2026-09-07 (abas Passe · Meu visual · Loja · Desafios; aba Passe selecionada em `/loja/passe`; saldo "2900 Seeds" e Creditos na carteira); teste de componente: `tests/comprar-creditos.test.tsx` e `tests/passe.test.ts` verdes na suite

## 2. Suite unitaria verde

- [x] 2.1 Isolar `canvas-confetti` em `src/lib/gameFeel.ts` atras de `podeDesenhar()` (canvas com `getContext('2d')` nao nulo); sem canvas, no-op
- [x] 2.2 `tests/blitzGame.test.tsx` e `tests/termoTravado.test.tsx` passam sem mock por teste (13/13; suite completa 2.775/2.775)
- [x] 2.3 Teste do Termo "pedir dica": o controle existe com rotulo "Dica" (`TermoGame.tsx:549-556`); o teste segue o rotulo atual, decisao registrada no proprio teste

## 3. E2E verde

- [x] 3.1 `abrirSeletor` (`tests/e2e/_helpers.ts`) e `facetas.e2e.ts` usam o botao "Fonte" do lobby (`SeletorDeConteudo.tsx:144`), por papel acessivel
- [x] 3.2 Os 6 testes que falhavam passam; os 8 que passavam continuam passando — 14/14 em 3,9 min contra servidor sobre copia do banco (2026-09-07)
- [x] 3.3 Suite e2e roda contra servidor com `DATABASE_URL` de teste (nunca `data/babel.db`) — documentado em `tests/e2e/README.md` (secao "Banco")

## 4. Gates de i18n e workflows

- [x] 4.1 Remover as 18 chaves orfas de `public/i18n/en.json`; regenerar `xx.json` (675 chaves; `orfas` e `pseudo --check` exit 0)
- [x] 4.2 Corrigir `.github/workflows/uptime.yml`: corpo da issue vai por `printf` para `corpo.md` + `--body-file`; YAML valido (js-yaml)
- [x] 4.3 Passo de CI que valida o YAML de todos os workflows: `scripts/validar-workflows.mjs` + `npm run workflows:validar` como primeiro passo do `ci.yml`
- [x] 4.4 `deploy-pages.yml` executa os mesmos passos do `ci.yml` (workflows, typecheck, typecheck:core, lint, test, pseudo --check, i18n:orfas, audit:gate, playwright install, test:e2e, ast-grep) antes de `build:leve`; `ci.yml` ganhou `npx playwright install --with-deps chromium`, que faltava antes do e2e

## 5. Dependencias

- [x] 5.1 `three` e `@types/three` — saiu com a saida (b): o `package.json` de HEAD nunca os teve. Entrou `js-yaml` como devDependency (validador de workflows). `browserslist` atualizado no lock para fechar o HIGH do `audit:gate`
- [x] 5.2 `npx knip`/`depcheck` sem `three` na lista (nao esta no `package.json`)

## 6. Verificacao final

- [x] 6.1 Rodar a lista completa de "Pronto quando" e colar a saida no PR
- [x] 6.2 Atualizar `openspec/audits/2026-09-07-coerencia.md` secao 1 com o estado apos esta change
