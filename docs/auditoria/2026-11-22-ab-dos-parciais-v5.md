# A/B de V5 — final livre (o final nunca espera o parcial)

Data: 22/11/2026. Branch `lab/streaming-parciais` (código `62f2d7b3`). Critério escrito antes de qualquer rodada:
`scripts/perf/latencia-legenda/resultados/2026-11-22/parciais-v5-final-livre/criterio.md` (commit `7cb6d3f9`).
Decisões de `ab-parciais.mjs --variante v4` (mesmas regras da V4), 11 rodadas válidas por braço e perfil, aquecimento descartado.
Dados: `.../parciais-v5-final-livre/{desktop-pt,desktop,fraco}/` e as métricas por rodada.

## Causa medida (diagnóstico antes do A/B)

Na V4 pt (Parakeet), em 24 falas, 5 tinham parcial em voo quando o final foi postado; o final esperou 30–638 ms e nenhum parcial
foi cancelado: o `run` do ONNX bloqueia o worker e a mensagem do final só entrava quando o parcial acabava.

## O que mudou (atrás de `parciais_vivos`/`parciais_parakeet`; flag desligada = hoje)

- O parcial do Parakeet cede ao laço de eventos (entre extrator, encoder e a cada 4 passos do TDT), e o final o cancela. O final nunca cede.
- Cadência `fim-provavel`: com silêncio acumulado, não começa parcial cujo decode estimado passe dos 450 ms do final especulativo.

## Resultado

| braço               | perfil        | atraso por palavra p50                           | erasure (B)                 | final do original p75 (B − A)  | renders/s na fala    | veredito                                                     |
| ------------------- | ------------- | ------------------------------------------------ | --------------------------- | ------------------------------ | -------------------- | ------------------------------------------------------------ |
| `v5-pt` (Parakeet)  | desktop       | 2.553 → 1.145 ms (**−55%**, IC [−1.618, −1.113]) | 0,39 (IC de B [0,26, 0,52]) | **−48 ms**, IC [−114, +62]     | 57 → 109 (limite 82) | **REPROVADO** (guarda 1 pelo limite superior do IC; renders) |
| `v5-en` (máscara 1) | desktop       | 1.168 → 1.507 ms (+339, IC [−376, +868])         | 0,39                        | legenda −17 ms, IC [−175, +12] | 94 → 111 (ok)        | **REPROVADO** (WER pareado)                                  |
| `v5-en`             | fraco emulado | 1.774 → 1.783 ms (+10, IC [−151, +216])          | 0,45                        | legenda −25 ms, IC [−71, +16]  | ok                   | **SEM DIFERENÇA PROVADA**                                    |

"Fraco emulado não aprova celular."

## Leitura

- **O atraso do final da V4 foi resolvido no ponto:** de +198 ms (IC [+54, +445]) para −48 ms (IC [−114, +62]). O IC ainda passa do teto de
  +30 ms, então pelo critério reprova; a bancada tem resolução de ~100 ms e 10–12 falas, por isso o IC é largo. Não há evidência de piora,
  mas também não há prova de que não piora dentro de 30 ms.
- **O ganho subiu:** −55% no atraso por palavra (V4: −39%), porque o Parakeet agora produz mais parciais (o worker não fica preso).
- **Renders:** com mais parciais, as mutações do DOM na fala dobraram (57 → 109/s), acima do limite do SLO, apesar do limitador de 125 ms
  por fala. O limitador corta a FREQUÊNCIA das atualizações, não o custo de cada uma.
- **Inglês:** sem ganho de atraso; a variante não serve ao inglês como está.

## Próximos passos sugeridos (critério novo antes das rodadas)

1. Reduzir o custo de cada atualização do parcial (atualizar só o nó de texto da cauda, sem re-render do balão) para trazer os renders ao SLO.
2. Mais falas pt no áudio (há 17 frases únicas no split de teste) para estreitar o IC da guarda do final.
