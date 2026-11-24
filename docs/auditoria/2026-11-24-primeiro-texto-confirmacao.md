# Primeiro texto na tela: confirmação com o teto de +100 ms (2026-11-24)

Branch `fix/primeiro-texto-na-tela` (o mesmo conserto está no PR #205). Critério, escrito e commitado antes das rodadas:
`scripts/perf/latencia-legenda/resultados/2026-11-24/primeiro-texto-confirmacao/criterio.md`. Dados: a mesma pasta (`c1/`, `c2/`; as rodadas brutas ficam fora do git).
O veredito de 23/11 (REPROVADO pela guarda 1 com teto de +30 ms) FICA; esta é a confirmação decidida pelo dono (teto +100 ms, a resolução da bancada, decisão de 22/11 na V7).

## Veredito pelo critério

**APROVADO.** Primária melhor e as três guardas passam. O critério não mudou depois do número.

| item | resultado | critério | situação |
| --- | --- | --- | --- |
| Primária, C1 `fleurs-en-8`, desktop: `primeiroTextoNaTelaMs` mediana (12 × 12 válidas) | 3.241 → 1.632,5 ms; dif. −1.608,5 ms (−50%), IC 95% [−1.774, −1.543]; rodadas >= 2,5 s: 10/12 → 0/12 | IC < 0 e efeito >= 20% | melhor |
| Guarda 1, C2 `fleurs-pt-16`, desktop: `fimDaFalaAteOriginalMs` p75 pareado (16 falas) | 921 → 939 ms; dif. +18 ms, IC 95% [−73, +65] (`ab-parciais.mjs --teto-final-ms 100`) | limite superior <= +100 | passa |
| Guarda 1, C1 (informativa): `fimDaFalaAteLegendaMs` p75 (8 falas) | 1.017 → 970 ms; dif. −47 ms, IC [−164, +164] | informativa | só informa |
| Guarda 2: SLO `comparar.mjs --ambiente local-darwin` sobre `depois` (C1) | todas "ok"; 1º texto "melhorou" (−49%) | sem reprovação | passa |
| Guarda 3: taxa de falha da legenda (C1) | 0/96 em `antes` e em `depois` | <= antes | passa |

Rodadas: 12 válidas por braço em C1 e em C2, intercaladas, aquecimento descartado, nenhuma inválida, nenhuma refeita.
Informativo em C2: `primeiroTextoNaTelaMs` 6.373 → 6.333 ms, dif. −40 ms, IC [−138, +40] (sem diferença; nesta rota o 1º texto não é bimodal).

## Pontos de atenção

- Guarda 3 em C2: a taxa de falha (`fimDaFalaAteLegendaMs.taxaDeFalha`) não existe sem tradução (pt para pt), então não é medida ali; vale a de C1 (0/96 nos dois braços). Em C2 o texto final não piorou: WER pareado +0,3 pp, IC [−0,5, +1,0].
- A guarda 1 em C1 (8 falas) continua com IC largo ([−164, +164]); a decisiva é C2 (16 falas), como no critério.
- O IC de C2 ([−73, +65]) cabe no teto de +100 ms com folga, mas o teto é a resolução da bancada: ele exclui piora grande, não piora de dezenas de ms.
- Medido só no desktop (Chromium headless, Apple M5 Pro), nesta máquina. Não vale para celular real; a rodada [R] em aparelho real continua valendo.

## Execução

- Pré-voo: tampa aberta (`AppleClamshellState = No`), na tomada, portas 4182/4183 (a 3100 não foi tocada), 1 rodada de fumaça por braço e cenário, 2 primeiras rodadas vigiadas. Todo o lote sob `caffeinate -dimsu --`; a máquina não dormiu (12 + 12 rodadas por braço válidas).
- `bancada-captura.mjs --perfis desktop --rodadas 12 --alvos antes=:4182,depois=:4183 --sem-comparar` (C2 com `--fixture fleurs-pt-16.json --eles pt-BR --eu pt-BR --qualidade accurate`).
- Análise: `ab-primeiro-texto.mjs` (semente 20261123), `ab-parciais.mjs --variante v1b --teto-final-ms 100` (bootstrap pareado por fala, 10.000 reamostragens, semente 20261121), `ab.mjs` e `comparar.mjs`.

## Próximos passos

1. Dono: autorizar PR/merge do conserto (1 arquivo de produção, sem flag) e, depois, rebaixar a base `local-darwin` do `primeiroTextoNaTelaMs` em `slo-captura.json` (de ~3,2 s para ~1,6 s).
2. Rodada [R] em aparelho real para o celular.
