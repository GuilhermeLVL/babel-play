# A/B dos parciais, V1c: só acrescenta, com máscara (change `parciais-incrementais`, tarefa 2.6)

Medido em 21 e 22/11/2026 no `dist/` do commit `300fc0b7` (reconstruído). Critério (escrito e commitado ANTES de qualquer rodada, mais a Emenda 1 só operacional, commit `8f8c2408`, escrita antes das rodadas pt; métrica e guardas não mudaram):
`scripts/perf/latencia-legenda/resultados/2026-11-21/parciais-v1c-acrescenta/criterio.md`. Dados e tabelas: `.../parciais-v1c-acrescenta/{desktop,fraco,desktop-pt}/` (`ab-parciais.mjs --variante v1c`).
Relatórios anteriores: V1 `2026-11-21-ab-dos-parciais.md`, V1b `2026-11-21-ab-dos-parciais-v1b.md`, V2 `2026-11-21-ab-do-parakeet-parcial.md`.

## Veredito: **nenhum modo aprovado; nada deve ser ligado**

A hipótese de V1c (erasure perto de 0 sem perder o ganho de atraso) não se confirmou. A erasure cai pouco (desktop) e o ganho de atraso some: com a tela travada quando a hipótese diverge, o original aparece MAIS TARDE que hoje em inglês.

| braço (modo)                     | perfil          | veredito                  | motivo principal                                                                                                                                                                              |
| -------------------------------- | --------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v1c-acrescenta-decode`          | desktop         | **SEM DIFERENÇA PROVADA** | Atraso p50 1.280 → 1.876 ms (+596, IC [−292, +1.127]): cruza 0; erasure 0,63 → 0,38 (IC [−0,49, +0,02]); guardas todas ok                                                                     |
| `v1c-acrescenta-token`           | desktop         | **REPROVADO**             | Primária PIOR (1.280 → 1.956, +676, IC [+74, +1.170]); erasure com limite superior +0,22 (teto +0,05); `rendersPorS.fala` 92 → 129 (limite 125)                                               |
| `v1c-acrescenta-decode`          | fraco (EMULADO) | **REPROVADO**             | Primária PIOR (1.540 → 1.953, +413, IC [+136, +665]); p75 do final limite superior +35 ms (teto +30); WER pareado limite superior +2,0 pp (IC [−1,1, +2,0], reprovou no arredondamento)       |
| `v1c-acrescenta-token`           | fraco (EMULADO) | **REPROVADO**             | Primária PIOR (1.540 → 1.957, +417, IC [+129, +675]); p75 do final limite superior +44 ms (teto +30)                                                                                          |
| `v1v2-acrescenta` (Parakeet, pt) | desktop         | **REPROVADO**             | Primária GANHA (2.521 → 1.154 ms, −54%, IC [−1.586, −1.066]); erasure 0,00 → 0,41 (IC [+0,27, +0,53], teto +0,05); `rendersPorS.fala` 57 → 113 (limite 82); guarda 1 sem medida (ver limites) |

Todas as decisões vêm do `ab-parciais.mjs`, não de leitura à mão. O critério não mudou depois do número.

## Números por braço e perfil (A = `atual`; 11 rodadas válidas por braço, nenhuma inválida)

Inglês, `fleurs-en-8` (6 falas no atraso por palavra, 8 na erasure). Diferenças B − A, IC 95% pareado por fala (10.000 reamostragens, semente 20261121).

| perfil  | braço       | atraso original p50 (ms)        | p90 (ms)                       | erasure original                    | p75 do final (ms)         | 1º texto (mediana, ms) | WER final B − A           | renders de fala/s |
| ------- | ----------- | ------------------------------- | ------------------------------ | ----------------------------------- | ------------------------- | ---------------------- | ------------------------- | ----------------- |
| desktop | `atual`     | 1.280                           | 2.757                          | 0,632                               | 1.022                     | 3.203                  |                           | 91,7              |
| desktop | acr.-decode | 1.876 (+596, IC [−292, +1.127]) | 3.478 (+722, IC [+25, +1.114]) | 0,376 (−0,255, IC [−0,492, +0,019]) | 964 (−58, IC [−178, +4])  | 1.430                  | −0,5 pp (IC [−2,5, +0,8]) | 111,0             |
| desktop | acr.-token  | 1.956 (+676, IC [+74, +1.170])  | 3.511 (+754, IC [+31, +1.130]) | 0,470 (−0,162, IC [−0,453, +0,220]) | 976 (−46, IC [−175, +8])  | 1.428                  | −0,1 pp (IC [−1,4, +1,2]) | 128,7             |
| fraco   | `atual`     | 1.540                           | 3.681                          | 0,489                               | 1.230                     | 1.928                  |                           | 101,5             |
| fraco   | acr.-decode | 1.953 (+413, IC [+136, +665])   | 3.714 (+32, IC [−60, +625])    | 0,353 (−0,135, IC [−0,186, −0,080]) | 1.223 (−7, IC [−37, +35]) | 1.928                  | +0,3 pp (IC [−1,1, +2,0]) | 100,8             |
| fraco   | acr.-token  | 1.957 (+417, IC [+129, +675])   | 3.803 (+121, IC [−10, +633])   | 0,391 (−0,098, IC [−0,166, −0,005]) | 1.229 (−1, IC [−41, +44]) | 1.928                  | −0,2 pp (IC [−1,8, +1,2]) | 101,1             |

Pt com Parakeet (desktop, `fleurs-pt-12`, 10 falas no cálculo por palavra, 12 na erasure): `atual` (Parakeet sem parciais) contra `v1v2-acrescenta` (`parciais_vivos,parciais_parakeet`, modo `acrescenta-decode`).

| métrica                                        | `atual`          | `v1v2-acrescenta` | B − A         | IC 95%                |
| ---------------------------------------------- | ---------------- | ----------------- | ------------- | --------------------- |
| atraso original p50 (ms)                       | 2.521            | 1.154             | −1.367 (−54%) | [−1.586, −1.066]      |
| atraso original p90 (ms)                       | 4.231            | 3.214             | −1.017        | [−1.593, −483]        |
| erasure do original                            | 0,000            | 0,406             | +0,406        | [+0,270, +0,529]      |
| 1º texto na tela (mediana, ms)                 | 6.289            | 3.026             | −3.263        | sem IC                |
| WER pareado do final                           |                  |                   | +0,1 pp       | [−0,5, +0,9] ok       |
| `rendersPorS.fala`                             | 57,2             | 113,3             |               | limite 81,6: reprovou |
| framesLongos, cpuSilencio, renders do silêncio | 0 / 14,8% / 22,9 | 0 / 13,9% / 22,9  |               | ok                    |
| `fimDaFalaAteLegendaMs` p75                    | sem medida       | sem medida        |               |                       |

Com o Parakeet o modo acrescenta funciona como esperado para o ATRASO (o 1º texto vem ~3,3 s antes e a primária ganha), mas a erasure não é perto de 0 e os renders dobram.

## Smoke da implementação (1 rodada por modo, não conta)

Desktop, inglês, `acrescenta-decode` e `acrescenta-token`: o parcial cresce na tela por decode (`Lions are the` → `…most social` → … → frase inteira), erasure 0,36/0,39 contra 0,6 do `atual`, e o final substitui o balão. Nenhum defeito de implementação encontrado: o texto mostrado nunca encurta nem troca no parcial. Dois efeitos reais, não bugs, que explicam o número:

1. **O final substitui o que ficou na tela.** Em falas onde o parcial confirmado estava errado ("All the resters also paid tribute" → "Fellow wrestlers also paid tribute to Luna."), a troca na hora do final conta como palavra apagada; é isso que sobra da erasure (0,38 a 0,47 em inglês, 0,41 no pt). Também o decode do final tem `onUpdate` próprio que pinta tokens no balão antes do final chegar (`pipelineDeFala.ts`, ~linha 1200), fora dos modos de parcial.
2. **A tela trava quando a hipótese diverge.** Com a máscara de 2 palavras e a regra de só acrescentar, uma hipótese inicial errada ("all the more all the more all the") congela o balão até o final; isso explica o atraso por palavra maior que o de `atual` em inglês.

## Comparação com V1, V1b e V2 (atraso p50 do original; erasure; renders de fala; desktop)

| variante                     | atraso p50 (ms)      | erasure     | renders de fala/s | veredito              |
| ---------------------------- | -------------------- | ----------- | ----------------- | --------------------- |
| V1 `cauda-token` (en)        | 1.265 → 255 (−80%)   | 0,59 → 3,60 | 91 → 223          | REPROVADO             |
| V1b `cauda-decode` (en)      | 1.164 → 263 (−77%)   | 0,66 → 2,25 | 94 → 168          | REPROVADO             |
| V1b `sem-cauda` (en)         | 1.164 → 1.846 (+59%) | 0,66 → 0,23 | 94 → 93           | REPROVADO             |
| V1c `acrescenta-decode` (en) | 1.280 → 1.876 (+47%) | 0,63 → 0,38 | 92 → 111          | SEM DIFERENÇA PROVADA |
| V1c `acrescenta-token` (en)  | 1.280 → 1.956 (+53%) | 0,63 → 0,47 | 92 → 129          | REPROVADO             |
| V2 `v1v2` cauda-token (pt)   | 2.575 → 799 (−69%)   | 0,00 → 0,72 | 57 → 134          | REPROVADO             |
| V1c `v1v2-acrescenta` (pt)   | 2.521 → 1.154 (−54%) | 0,00 → 0,41 | 57 → 113          | REPROVADO             |

Leitura: V1c anda no sentido da erasure sem reprovar nela no desktop em inglês (só `acrescenta-decode`), mas por um custo igual ao de `sem-cauda`: o ganho de atraso some. O ponto entre "rápido e piscando" (V1/V1b) e "estável e lento" (`sem-cauda`, V1c) continua sem solução pelos modos de exibição. No pt, `v1v2-acrescenta` troca parte do ganho de V2 (−69% → −54%) por menos erasure (0,72 → 0,41, ainda 8 vezes o teto de +0,05 contra um `atual` sem parcial) e menos renders (134 → 113, ainda acima do limite 82).

## Como foi medido

- `bancada-captura.mjs` num servidor estático só (`tests/e2e-estatica/_servidor-estatico.mjs`), braços como alvos de mesma URL, intercalados: `--flag-do-alvo` e `--armazenamento-do-alvo` (`babel.lab.parciaisModo`). Inglês: `--perfis desktop,fraco --rodadas 11`, braços `atual`, `v1c-acrescenta-decode`, `v1c-acrescenta-token`. Pt: `--perfis desktop --rodadas 11 --fixture tests/fixtures/bancada-captura/fleurs-pt-12.json --eles pt-BR --eu pt-BR --qualidade accurate`, braços `atual` e `v1v2-acrescenta`.
- **Confirmado** no pt: `capSummary.porMotor` é `parakeet-local` (12 falas) nos dois braços. 11 rodadas válidas por braço e perfil, aquecimento descartado, nenhuma inválida.
- Análise: `ab-parciais.mjs --variante v1c` por braço e perfil (bootstrap pareado por fala, 10.000 reamostragens, semente 20261121, IC 95% por comparação, sem correção de multiplicidade: 2 braços × 2 perfis em inglês). Apple M5 Pro, Chromium headless. As rodadas brutas (~14 MB) ficam fora do repositório; o repositório guarda as métricas por rodada, as tabelas `.md` e os `.json` do A/B.

## Limites (leia antes de usar o número)

1. **Fraco EMULADO não aprova celular.** CPU 4x, 2 núcleos e sem WebGPU emulados num Mac: só ordena e acha regressão. No fraco o modo desempenho automático faz 1 parcial por fala por desenho; a erasure ali é menor porque há menos parciais, e o "1º texto" é igual nos três braços (1.928 ms). Nada daqui vale para celular; a rodada [R] em aparelho real (tarefa 5.1) segue sem acontecer. O fraco também não exerce o Parakeet (rota `whisper-base`).
2. **Pt: guarda 1 sem medida.** `fimDaFalaAteLegendaMs` é o tempo até a TRADUÇÃO e o pt para pt não tem tradução (declarado na Emenda 1 e no relatório de V2). O veredito do pt não depende dela (já reprova por erasure e renders). Se o modo passar nas demais, a aprovação precisa de métrica própria do "final do original".
3. Poucas falas: 6 no atraso por palavra em inglês (10 em pt), 8 a 12 na erasure; os IC são largos, e o `acrescenta-decode` desktop (IC do atraso [−292, +1.127]) não permite dizer que é pior, só que não é melhor.
4. Erasure do `atual` em pt é 0 porque o Parakeet não tem parcial: a guarda "não piorar contra A" compara contra a ausência de parcial.
5. O WER do `acrescenta-decode` no fraco reprova pelo limite superior do IC, que o `ab-parciais` marcou acima de +2,0 pp (exibido arredondado como +2,0); a regra foi aplicada como escrita, sem arredondar a favor.

## Próximos passos (exigem critério novo)

- Nenhum modo de exibição de cauda resolveu o trio atraso, erasure e renders. Antes de outro modo, medir se a erasure do original é PERCEBIDA pela pessoa (teste manual), pois parte do que sobra é a correção legítima do final; talvez o teto de +0,05 seja a guarda errada para o produto.
- Se o ganho de atraso do Parakeet (−54% a −69%) vale o custo, a variante a testar é um parcial do Parakeet com máscara adaptativa (mostrar mais cedo só quando duas janelas concordam) e render por quadro (limitar a ~60/s), com critério novo.
- Métrica própria de "final do original" para a guarda 1 em pt e mais falas pt (treino/validação do FLEURS).
