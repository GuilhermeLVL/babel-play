# Critério do A/B — overhead das marcas `frasy:*` (tarefa 3.5)

Escrito em **2026-11-21T04:00:34Z**, ANTES de qualquer rodada deste A/B. Ordem registrada: (1) este arquivo; (2) `bancada-captura.mjs --alvos`
(a primeira rodada só começa depois do carimbo acima); (3) `ab.mjs`. O arquivo NÃO foi commitado quando as rodadas rodaram (quem
commita é o dono da change); por isso o `ab.mjs` desta rodada usou `--ensaio` e o resultado vale como ensaio do protocolo (6.2) e
como medida do overhead, mas a decisão formal só vale com este arquivo commitado antes de uma repetição.

## Hipótese

As marcas de desempenho (`fala:fim`, `legenda:traduzida`, `modelo:*`) e a leitura delas em `captureMetrics` NÃO atrasam a legenda:
a métrica da bancada com as marcas (B) fica no máximo 5 ms acima da mesma bancada sem elas (A).

## Variantes

- A = build SEM as marcas: commit `a341c2d7` (anterior à fase 1), `npm run build:estatica` num worktree temporário.
- B = build COM as marcas: commit `efd0c702` (fase 1), mesmo comando, outro worktree temporário.
- Mesmo aparelho (este Mac, Chromium headless do Playwright, perfil `desktop`), mesmo áudio (`tests/fixtures/bancada-captura/fleurs-en-8.json`),
  mesmos modelos em cache (`--cache-modelos`), rodadas intercaladas A, B, A, B, 12 por lado (a de aquecimento é à parte e descartada).

## Métrica primária

`fimDaFalaAteLegendaMs` da BANCADA (fim da voz no arquivo → quadro com a tradução final), p75, perfil `desktop`. As duas variantes são
medidas pelo MESMO método (DOM + áudio), por isso a comparação vale para o build sem marcas.

## Guardas

Tolerâncias de `slo-captura.json`, regra "B > A × (1 + tol) + folga piora": `framesLongos.n50/n100/somaMs`, `cpuSilencio.processoPct`,
`rendersPorS.silencio/fala`, taxa de falha da legenda.

## Efeito mínimo e regra de decisão

Não inferioridade: o limite SUPERIOR do IC 95% (bootstrap pareado por fala, 10 000, semente 20261121) da diferença B − A do p75 deve ser
≤ +5 ms. p50 e p95 saem no relatório, sem decidir. Se o limite superior passar de 5 ms, o overhead NÃO está descartado e o relatório diz
isso. Nenhuma guarda pode piorar. O critério não muda depois de ver o número.
