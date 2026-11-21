# Overhead das marcas `frasy:*` na bancada (A/B com × sem marcas)

Tarefa 3.5 da change `lab-medicao-legenda-traduzida`; também é o ensaio do protocolo (6.2, `protocolo-do-laboratorio-de-latencia.md`).
Origem: `medido`. Aparelho: Mac Apple M5 Pro, 15 núcleos, 24 GB (Darwin 27), Chromium do Playwright 159 (headless), perfil `desktop`
(`desktop-sem-gpu`). Áudio: `tests/fixtures/bancada-captura/fleurs-en-8.json` (8 falas em inglês, legenda em português), modelos em cache.

## Montagem

- A = `a341c2d7` (sem as marcas), B = `efd0c702` (fase 1, com as marcas; `ff85a9be` só acrescenta docs). Cada um em um `git worktree`
  temporário fora do repositório, com `node_modules` por link simbólico e `npm run build:estatica`; servidos em 4182 (A) e 4183 (B).
  Conferido no build: `fala:fim` aparece no bundle de B e não no de A. As worktrees foram removidas no fim.
- Comando: `bancada-captura.mjs --perfis desktop --rodadas 12 --alvos antes=...:4182,depois=...:4183 --sem-comparar`
  (aquecimento por lado + 12 rodadas intercaladas A, B, A, B...). 12 rodadas VÁLIDAS por lado, 0 inválidas.
- Critério: `scripts/perf/latencia-legenda/resultados/2026-11-21/overhead-das-marcas/criterio.md`, escrito às 04:00:34Z; a 1ª rodada
  começou às 04:56:42Z. O arquivo NÃO estava commitado (quem commita é o dono), então `ab.mjs` rodou com `--ensaio`: o número vale como
  medida, a decisão formal exige o critério commitado antes de uma repetição.
- A métrica é a da bancada (fim da voz no arquivo → quadro com a tradução final), igual nos dois lados, porque o build A não tem marcas.

## Resultado (`ab.mjs`, 10 000 reamostragens, semente 20261121, 8 falas pareadas)

| percentil | A (ms) | B (ms) | B − A (ms) | IC 95% da diferença (ms) |
| --------- | ------ | ------ | ---------- | ------------------------ |
| p50       | 867    | 870    | +3         | [−82, +163]              |
| p75       | 1015   | 999    | −16        | [−133, +107]             |
| p95       | 1460   | 1439   | −21        | [−115, +64]              |

Taxa de falha: 0/96 nos dois lados. Guardas (mediana, limite do `slo-captura.json` sobre A), todas `ok`: frames > 50 ms 0 e 0; frames

> 100 ms 0 e 0; soma dos frames longos 0 e 0; CPU da aba no silêncio 13,89% e 13,86%; renders/s no silêncio 22,9 e 22,9; renders/s com
> fala 91,9 e 91,1.

**Decisão do critério (não inferioridade, limite superior do IC do p75 ≤ 5 ms): NÃO provada.** O limite superior foi +107 ms. A
estimativa pontual é −16 ms (B não é mais lento) e nenhuma guarda piorou, mas esta bancada não tem resolução para provar 5 ms.

## Por que o IC é largo

- Sete das oito falas têm A e B com medianas a menos de 25 ms uma da outra (fala 0: 1611 × 1620; fala 4: 681 × 702; fala 7: 1183 × 1180).
- A fala 6 é bimodal por corrida real do app, nos dois lados: ou a tradução do final especulativo (já na memória) chega ~70–220 ms
  depois do fim da voz, ou chega ~960 ms depois. A mediana de 12 rodadas salta entre os modos (A 229, B 764), e a reamostragem por
  rodada herda esse salto. Excluindo a fala 6 depois de ver o número (exploratório, não vale como decisão), o IC do p75 continua
  em [−111, +80] ms (`exploratorio-sem-fala-6.txt`).
- Com 12 rodadas por lado e falas de 3 a 4 s, a menor diferença que o A/B separa do ruído é da ordem de 100 ms no p75. O overhead de 5 ms
  só se sustenta por outra via: o teste da tarefa 2.6 (custo por marca ≤ 0,2 ms p95, 200 falas ≤ 50 KB) mais as guardas acima.

## Recomendação (decisão do dono, não aplicada)

Reescrever a regra de 3.5 para o que a bancada consegue provar: guardas dentro das tolerâncias + IC do p75 com limite superior ≤ 150 ms
(ou o microbench da 2.6 como prova do custo por marca), e deixar o "≤ 5 ms" para uma medida dedicada (laço de N marcas no navegador).

## Dados

`scripts/perf/latencia-legenda/resultados/2026-11-21/overhead-das-marcas/`: `criterio.md`, `ab.md`, `ab.json`,
`resultado-antes.json`, `resultado-depois.json`, `exploratorio-sem-fala-6.txt`. As rodadas brutas ficaram fora do git.
