# A/B dos parciais: V1, V2 e V3 (change `parciais-incrementais`, tarefas 2.6, 3.3, 4.3)

Medido em 21/11/2026 no commit `895fde23` (= `8bb08365` + conserto de `fontesDeAudio.ts`, abaixo). Protocolo, braços e leitura de cada número:
`scripts/perf/latencia-legenda/resultados/2026-11-21/parciais-multibraco/protocolo.md` (commit `75fba6c7`, antes da 1ª rodada válida). Critérios:
`parciais-v1-vivos`, `parciais-v3-traducao-incremental` (com a Emenda 1). Dados: `.../parciais-multibraco/{desktop,fraco}/` (métricas por rodada, resultado por braço, saída da
bancada, tabelas e JSON do `ab-parciais.mjs`; as rodadas brutas ficam fora do git, como na linha de base).

## Resumo dos vereditos

| variante                              | perfil           | veredito       | motivo principal                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | ---------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 `parciais_vivos` (v1 × atual)      | desktop (medido) | **REPROVADO**  | A primária ganha (atraso do original p50 1.265 → 255 ms, −80%, IC [−1.217, −854]), mas a erasure do original vai de 0,59 para 3,60 (+3,0; limite superior do IC +3,4 contra o teto de +0,05), o `rendersPorS.fala` do SLO piora (91 → 223) e o p75 de `fimDaFalaAteLegendaMs` tem limite superior +4 ms (guarda exige ≤ 0) |
| V1                                    | fraco (EMULADO)  | **REPROVADO**  | A primária não se move (1.650 → 1.650 ms, IC [−132, +212]): no perfil leve o modo desempenho automático faz um parcial por fala e a cadência não atua (por desenho). Guardas: erasure +0,053 (IC [+0,003, +0,125]), p75 do final IC [−25, +20]                                                                             |
| V3 `traducao_incremental` (v1v3 × v1) | desktop          | **REPROVADO**  | A primária PIORA: atraso da tradução p50 1.290 → 2.692 ms (+1.402, IC [+367, +1.916]); p75 do final +169 ms; tradução final difere                                                                                                                                                                                         |
| V3                                    | fraco (EMULADO)  | **REPROVADO**  | Primária pior (2.409 → 3.079, IC [+226, +1.067]); p75 do final +177 ms (IC [+20, +200])                                                                                                                                                                                                                                    |
| V2 `parciais_parakeet`                |                  | **NÃO MEDIDO** | ver seção V2                                                                                                                                                                                                                                                                                                               |

Nenhuma flag deve ser ligada. "Fraco emulado não aprova celular": nenhum número daqui vale para celular; o ganho de V1 no desktop, se um dia for aprovado, ainda exige a rodada [R] em aparelho real (tarefa 5.1).

## Como foi medido

- `bancada-captura.mjs --perfis <desktop|fraco> --rodadas 12 --sem-comparar --alvos atual,v1,v1v3 --flag-do-alvo "atual=;v1=parciais_vivos;v1v3=parciais_vivos,traducao_incremental"`, um servidor, três braços intercalados (atual, v1, v1v3, ...). Aquecimento descartado.
- **12 rodadas válidas por braço e perfil, nenhuma inválida** (36 por perfil). Áudio `fleurs-en-8` (inglês, 8 falas; 6 com atraso por palavra, 2 fora do cálculo por alinhamento < 90%, como na base).
- Máquina: Apple M5 Pro, 15 núcleos, 24 GB, Chromium headless 159; motor `moonshine-base-ONNX` + opus-mt. `desktop` = medido; `fraco` = notebook de entrada EMULADO (CPU 4x, 2 núcleos, 2 GB, sem WebGPU).
- Bootstrap pareado por fala (10.000 reamostragens, semente 20261121), IC 95% POR COMPARAÇÃO, sem correção de multiplicidade (declarado). Com só 6 falas no atraso por palavra os IC são largos; o IC apoia-se nas 12 rodadas por braço.
- Tradução: referência proporcional (proxy), só compara braços entre si. O áudio inglês não exercita o Parakeet.
- `ab-parciais.mjs` (novo, com `tests/abParciais.test.ts`) calcula as métricas novas por fala com as funções de `medidasDeParcial.ts`/`palavras-da-fala.mjs`; `ab.mjs` só tinha o p75 do final.

## Bug achado na fumaça e corrigido (commit `895fde23`)

Com `parciais_vivos` ligada o pipeline definia `cadenciaDoParcial`, mas `src/lib/captura/fontesDeAudio.ts` repassa os callbacks à captura um a um e esse ficou de fora: a cadência adaptativa nunca rodava (o parcial seguia o tique fixo de 2 s). Corrigido para a fonte do sistema e o microfone (flag desligada: o callback devolve `undefined`, sem mudança), com teste. Sem o conserto, a fumaça mostrava atraso 1.072 ms; com ele, 241 ms. Outro achado, NÃO corrigido (fora do escopo, mudaria o comportamento com a flag desligada): `maxParciaisPorFala` também não é repassado pelo `fontesDeAudio`, então o teto de parciais por fala do aparelho leve nunca vale.

## Resultados por comparação e perfil

#### V1 desktop (medido): `v1` contra `atual`

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1265  | 255   | −1010  | [−1217, −854]              | 6     |
| atraso por palavra, original, p90 (ms)         | 2683  | 2334  | −348   | [−1526, +7]                | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2073  | 1290  | −783   | [−1276, −65]               | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4028  | 3931  | −96    | [−303, +137]               | 6     |
| erasure do original                            | 0.587 | 3.595 | +3.008 | [+2.609, +3.403]           | 8     |
| erasure da tradução (proxy)                    | 0.496 | 2.010 | +1.514 | [+0.894, +2.093]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1016  | 853   | −163   | [−173, +4]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3194  | 1226  | −1968  | (sem IC: medida de rodada) |       |

Guardas:

| guarda                                          | situação     | detalhe                                                                                                                 |
| ----------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                       | **reprovou** | dif -163 ms, IC 95% [-173, 4], limite superior ≤ 0                                                                      |
| erasureOriginal (Emenda 1: não piorar contra A) | **reprovou** | dif 3.008, IC 95% [2.609, 3.403], limite superior ≤ 0.050                                                               |
| texto final do original                         | **reprovou** | 5 de 96 textos de B fora do conjunto de A (normalizado: 4); WER A 20.8%, B 20.7%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                            | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                           | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                         | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                     | ok           | A 12.94, B 13.279, limite 23.115                                                                                        |
| SLO rendersPorS.silencio                        | ok           | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                            | **reprovou** | A 90.93, B 223.45, limite 123.662                                                                                       |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha           | ok           | A 0, B 0, limite 0.15                                                                                                   |

Primária (atraso do original p50): efeito −79.8% sobre A; IC inteiro abaixo de 0 e efeito >= 20%.

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75; erasureOriginal (Emenda 1: não piorar contra A); texto final do original; SLO rendersPorS.fala)

#### V1 fraco (EMULADO): `v1` contra `atual`

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1650  | 1650  | 0      | [−132, +212]               | 6     |
| atraso por palavra, original, p90 (ms)         | 3707  | 3822  | +115   | [−125, +527]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2456  | 2409  | −47    | [−355, +156]               | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4264  | 4268  | +4     | [−168, +124]               | 6     |
| erasure do original                            | 0.508 | 0.561 | +0.053 | [+0.003, +0.125]           | 8     |
| erasure da tradução (proxy)                    | 0.456 | 0.426 | −0.030 | [−0.139, +0.047]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1214  | 1222  | +8     | [−25, +20]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1920  | 1872  | −49    | (sem IC: medida de rodada) |       |

Guardas:

| guarda                                          | situação     | detalhe                                                                                                                 |
| ----------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                       | **reprovou** | dif 8 ms, IC 95% [-24, 20], limite superior ≤ 0                                                                         |
| erasureOriginal (Emenda 1: não piorar contra A) | **reprovou** | dif 0.053, IC 95% [0.003, 0.125], limite superior ≤ 0.050                                                               |
| texto final do original                         | **reprovou** | 6 de 96 textos de B fora do conjunto de A (normalizado: 3); WER A 21.2%, B 20.8%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                            | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                           | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                         | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                     | ok           | A 13.326, B 13.563, limite 23.656                                                                                       |
| SLO rendersPorS.silencio                        | ok           | A 27.166, B 27.154, limite 36.957                                                                                       |
| SLO rendersPorS.fala                            | ok           | A 102.081, B 109.2, limite 137.601                                                                                      |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha           | ok           | A 0, B 0, limite 0.15                                                                                                   |

Primária (atraso do original p50): efeito 0.0% sobre A; IC cruza 0 ou efeito < 20%.

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75; erasureOriginal (Emenda 1: não piorar contra A); texto final do original)

#### V3 desktop (medido): `v1v3` contra `v1` (comparação principal)

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 255   | 265   | +10    | [−45, +105]                | 6     |
| atraso por palavra, original, p90 (ms)         | 2334  | 2338  | +3     | [−645, +832]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 1290  | 2692  | +1402  | [+367, +1916]              | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 3931  | 4074  | +143   | [−37, +456]                | 6     |
| erasure do original                            | 3.595 | 3.553 | −0.042 | [−0.420, +0.343]           | 8     |
| erasure da tradução (proxy)                    | 2.010 | 0.121 | −1.889 | [−2.673, −1.064]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 853   | 1021  | +169   | [−5, +181]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1226  | 1020  | −206   | (sem IC: medida de rodada) |       |

Guardas:

| guarda                                              | situação     | detalhe                                                                                                                 |
| --------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                           | **reprovou** | dif 169 ms, IC 95% [-5, 181], limite superior ≤ 0                                                                       |
| erasureOriginal (Emenda 1: não piorar contra A)     | **reprovou** | dif -0.042, IC 95% [-0.420, 0.343], limite superior ≤ 0.050                                                             |
| erasureTraducao (Emenda 1: não piorar contra A)     | ok           | dif -1.889, IC 95% [-2.673, -1.064], limite superior ≤ 0.050                                                            |
| atrasoDePalavraMs p50 do original (não pode piorar) | ok           | dif 10, IC 95% [-45, 105], reprova só com o IC inteiro acima de 0                                                       |
| texto final do original                             | **reprovou** | 2 de 96 textos de B fora do conjunto de A (normalizado: 1); WER A 20.7%, B 20.2%; falas em que A varia entre rodadas: 5 |
| tradução final                                      | **reprovou** | 34 de 96 traduções de B fora do conjunto de A (normalizado: 22); falas em que A varia entre rodadas: 7                  |
| SLO framesLongos.n50                                | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                               | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                             | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                         | ok           | A 13.279, B 13.215, limite 23.591                                                                                       |
| SLO rendersPorS.silencio                            | ok           | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                                | ok           | A 223.45, B 203.229, limite 289.313                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha               | ok           | A 0, B 0, limite 0.15                                                                                                   |

Primária (atraso da tradução p50): efeito +108.7% sobre A; IC inteiro ACIMA de 0 (pior).

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75; erasureOriginal (Emenda 1: não piorar contra A); texto final do original; tradução final)

#### V3 fraco (EMULADO): `v1v3` contra `v1` (comparação principal)

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1650  | 1530  | −120   | [−313, +36]                | 6     |
| atraso por palavra, original, p90 (ms)         | 3822  | 3706  | −117   | [−256, +227]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2409  | 3079  | +670   | [+226, +1067]              | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4268  | 4432  | +164   | [−1, +328]                 | 6     |
| erasure do original                            | 0.561 | 0.556 | −0.005 | [−0.057, +0.037]           | 8     |
| erasure da tradução (proxy)                    | 0.426 | 0.000 | −0.426 | [−0.606, −0.263]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1222  | 1399  | +177   | [+20, +200]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1872  | 1875  | +3     | (sem IC: medida de rodada) |       |

Guardas:

| guarda                                              | situação     | detalhe                                                                                                                 |
| --------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                           | **reprovou** | dif 177 ms, IC 95% [20, 200], limite superior ≤ 0                                                                       |
| erasureOriginal (Emenda 1: não piorar contra A)     | ok           | dif -0.005, IC 95% [-0.057, 0.037], limite superior ≤ 0.050                                                             |
| erasureTraducao (Emenda 1: não piorar contra A)     | ok           | dif -0.426, IC 95% [-0.606, -0.263], limite superior ≤ 0.050                                                            |
| atrasoDePalavraMs p50 do original (não pode piorar) | ok           | dif -120, IC 95% [-313, 36], reprova só com o IC inteiro acima de 0                                                     |
| texto final do original                             | **reprovou** | 6 de 96 textos de B fora do conjunto de A (normalizado: 6); WER A 20.8%, B 20.9%; falas em que A varia entre rodadas: 5 |
| tradução final                                      | **reprovou** | 56 de 96 traduções de B fora do conjunto de A (normalizado: 54); falas em que A varia entre rodadas: 7                  |
| SLO framesLongos.n50                                | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                               | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                             | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                         | ok           | A 13.563, B 13.224, limite 23.988                                                                                       |
| SLO rendersPorS.silencio                            | ok           | A 27.154, B 27.192, limite 36.942                                                                                       |
| SLO rendersPorS.fala                                | ok           | A 109.2, B 103.728, limite 146.5                                                                                        |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha               | ok           | A 0, B 0, limite 0.15                                                                                                   |

Primária (atraso da tradução p50): efeito +27.8% sobre A; IC inteiro ACIMA de 0 (pior).

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75; texto final do original; tradução final)

#### V3 contra `atual` (informativo, sem veredito)

Desktop:

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1265  | 265   | −1001  | [−1201, −820]              | 6     |
| atraso por palavra, original, p90 (ms)         | 2683  | 2338  | −345   | [−1565, +210]              | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2073  | 2692  | +619   | [+169, +1016]              | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4028  | 4074  | +46    | [−32, +333]                | 6     |
| erasure do original                            | 0.587 | 3.553 | +2.966 | [+2.616, +3.353]           | 8     |
| erasure da tradução (proxy)                    | 0.496 | 0.121 | −0.375 | [−0.632, −0.141]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1016  | 1021  | +6     | [−19, +170]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3194  | 1020  | −2174  | (sem IC: medida de rodada) |       |

Fraco (EMULADO):

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1650  | 1530  | −120   | [−291, +73]                | 6     |
| atraso por palavra, original, p90 (ms)         | 3707  | 3706  | −2     | [−215, +615]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2456  | 3079  | +623   | [+175, +1044]              | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4264  | 4432  | +168   | [+15, +247]                | 6     |
| erasure do original                            | 0.508 | 0.556 | +0.048 | [+0.000, +0.107]           | 8     |
| erasure da tradução (proxy)                    | 0.456 | 0.000 | −0.456 | [−0.662, −0.283]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1214  | 1399  | +185   | [+17, +202]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1920  | 1875  | −46    | (sem IC: medida de rodada) |       |

## Leitura

1. **V1 no desktop** faz o que promete no atraso (p50 do original −80%, 1º texto na tela 3,2 s → 1,2 s, `fimDaFalaAteLegendaMs` p75 −163 ms) e quebra a estabilidade: cada token do decode em curso vira um quadro (a tela passa de ~91 para ~223 renders/s na fala) e a erasure sobe ~6x (0,59 → 3,60; inclui alucinações curtas do Moonshine em janelas de ~0,6 s, tipo "all all all"). A Emenda 1 (não piorar contra A) reprova de longe, e a meta absoluta de 0,2 também não é atingida (0,59 no A, 3,60 no B). A guarda do p75 do final reprova por 4 ms de limite superior do IC (+4 contra ≤ 0), lida como o critério a escreve. Candidata a retrabalho: pintar só no fim do decode ou agrupar tokens, para cortar a erasure sem perder o atraso; isso é decisão de design do dono, e qualquer variante nova pede critério novo.
2. **V1 no fraco** é inerte por desenho: o perfil leve liga o modo desempenho automático (1 parcial por fala; `cadenciaDoParcial` devolve `undefined`). Medido: parciais por fala iguais à base (0 a 1). O ganho de V1 só existe onde o aparelho acompanha; celular real fica para a rodada [R].
3. **V3** traduz só o prefixo confirmado: a erasure da tradução cai (0,50 → 0,12 no desktop, 0,46 → 0,00 no fraco, a guarda dela passa), mas quase não há mais tradução de parcial na tela, e o atraso da tradução piora (+1,4 s no desktop). Com a LocalAgreement-2 confirmando pouco em falas de 2 a 6 s, o confirmado chega tarde. O ganho de estabilidade se paga em latência e a primária reprova.
4. **Texto final** (guarda "qualquer diferença reprova"): reprova em todas as comparações, mas a régua é ruidosa: 5 das 8 falas já variam entre as 12 rodadas do próprio `atual` (a janela do VAD muda o decode). O WER do final é igual (A 20,8% × B 20,7% em V1 desktop). Aplicada como escrita, a regra reprova até por ruído; o veredito de V1 não depende dela (já reprova por erasure e renders). Sugestão ao dono: trocar a guarda por WER pareado com IC.
5. **Tradução final em V3**: 34 de 96 (desktop) e 56 de 96 (fraco) traduções de B fora do conjunto de `v1`. Diagnóstico posterior (não decide nada): condicionado ao mesmo texto original, B difere de `v1` em 32 de 94 (desktop) e 50 de 90 (fraco) casos, contra 16 de 85 e 14 de 92 no controle `v1` × `v1` (leave-one-out). Há sinal de efeito real no fraco; vale investigar se o caminho incremental altera a tradução final (o critério de V3 diz que não deve).
6. As rodadas do fraco no V3 mostram o p75 do final +177 ms (IC [+20, +200]): a tradução incremental atrasa a legenda final no aparelho emulado.

## V2 `parciais_parakeet`: NÃO MEDIDO

Motivo: V2 precisa de áudio pt ou es com tempo por palavra (>= 6 falas casadas a >= 90%) e as falas precisam caber no corte do VAD local (6 s de voz; fala maior é partida em duas). O FLEURS local (100 falas por idioma, `~/babel-bancada/navegador/stt`) tem só 5 falas em pt e 5 em es com 1 a 5,9 s de voz; abaixo do mínimo de 6 antes mesmo do alinhamento (`montar-audio.mjs` recusa). Não tentei o alinhamento (nem baixar o Whisper multilíngue `_timestamped` e os 672 MB do Parakeet) por isso. Além disso, a bancada não liga a chave `babel.stt.parakeet` nem troca o cenário para pt (o `medir.mjs` só tem o cenário inglês da base): faltaria `--parakeet` e `--fixture` na bancada e confirmar que a rota do braço `atual` usa o Parakeet. Caminho: um fixture pt maior (outra fonte de áudio, ou FLEURS completo) ou aceitar falas até 5,9 s com 5 falas e declarar a amostra menor no critério (decisão do dono).

## O que não foi medido

- V2 (acima). Celular e iPhone reais (tarefa 5.1 [R]); o `fraco` é emulado. Memória de pico (o headless não expõe). Amostra manual de ~20 falas do alinhamento (tarefa 1.6 [D]). Tradução sem referência por palavra (proxy). Varredura de k do mask-k em {1,2,3} (V3 rodou só com k=2, o do critério). Efeito mínimo (−20%) e k seguem PROVISÓRIOS (1.2 [D]).
