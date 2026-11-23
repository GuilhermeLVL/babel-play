# Critério do Lote A — linha de base dos parciais (change `parciais-incrementais`, tarefa 1.8)

Escrito ANTES de qualquer rodada do Lote A. Não é um A/B: é a medida da base, com os parciais de HOJE (nenhuma flag nova), para que
os A/B de V1, V2 e V3 (pastas irmãs `parciais-v1-vivos`, `parciais-v2-parakeet`, `parciais-v3-traducao-incremental`) tenham contra o que comparar.

## Hipótese

Com os parciais atuais (tique de 2 s, máx. 3 por fala), o atraso por palavra é dominado pelo tique e a base de `fimDaFalaAteLegendaMs`
continua coerente com a do ciclo 1 (desktop p75 ~967 ms; fraco emulado ~1.373 ms).

## Variantes

- Única: o commit do dia, `npm run build:estatica`, sem flag nova. Aparelho: este Mac, Chromium headless do Playwright
  (`desktop`, origem `medido`) e `fraco` (CPU 4x, 2 núcleos, 2 GB, sem WebGPU, origem `emulado`, não aprova celular).
- Mesmo áudio (`fleurs-en-8.json`), modelos em cache (`--cache-modelos`), >= 10 rodadas VÁLIDAS por perfil; a de aquecimento é descartada;
  rodada inválida é refeita.

## Métricas

Primárias da base: `atrasoDePalavraMs` (p50/p90, original e tradução-proxy), `erasureOriginal`, `erasureTraducao`.
Contexto: `fimDaFalaAteLegendaMs` p75, `primeiroTextoNaTelaMs`, `primeiraLegendaMs`, framesLongos, CPU, rendersPorS.
A tradução usa referência PROPORCIONAL (proxy declarado); só compara variantes entre si.

## Regra de aceitação da base

A base é aceita se: (a) >= 10 rodadas válidas por perfil; (b) `fimDaFalaAteLegendaMs` p75 do desktop dentro de +-25% de 967 ms
(coerência com o ciclo 1); (c) falas com < 90% das palavras casadas ficam fora do cálculo e são contadas. Se (b) falhar, o relatório
diz e a base nova passa a valer só para estes A/B (o motivo é investigado, não escondido). Nenhum limiar muda depois de ver o número.
