# Critério do A/B: V5 `parciais_vivos` com o FINAL LIVRE (change `parciais-incrementais`, tarefa 2.6, variante nova)

Escrito e commitado ANTES de qualquer rodada de V5. A fumaça de 1 rodada por braço e a medição da causa (instrumentação da sonda) não contam e vêm depois deste commit.
É uma variante NOVA, só para rodadas novas: não reabre nada medido (V1, V1b, V1c, V2, V4 mantêm os vereditos que têm). Mesma métrica primária, mesmo orçamento de erasure,
mesmo limitador de 125 ms e mesmas guardas da V4 (`parciais-v4-orcamento/criterio.md`); o que muda é a HIPÓTESE e o código sob a mesma flag.

## Hipótese

A V4 pt (Parakeet, `acrescenta-decode`, limitador de 125 ms) ganhou -39% no atraso por palavra, mas o texto FINAL do original saiu +198 ms mais tarde (p75, IC [+54, +445]; reprovada
pela guarda 1). A hipótese: o worker está ocupado com um decode de PARCIAL (que o Parakeet não consegue abortar dentro do encoder) quando o decode final é postado, e o final espera.
V5 é "o final nunca espera o parcial": o código sob `parciais_vivos`/`parciais_parakeet` deixa de iniciar parcial que ainda estaria em voo quando o final chega, e/ou não deixa o final
esperar o parcial em voo. O MECANISMO exato é escolhido pela medição da causa (tempo do final na fila do worker; parcial em voo quando o VAD fecha), registrada no relatório; o
critério abaixo não depende dele. Flag desligada = comportamento de hoje.

## Braços (mesmo `dist/`, um servidor; o braço muda só `babel.flags` e as chaves de laboratório do navegador)

| braço   | perfis                       | cenário                                                                               | flags                              | `babel.lab.parciaisModo` | `babel.lab.parciaisMascara` | limitador |
| ------- | ---------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------ | --------------------------- | --------- |
| `atual` | os mesmos do braço comparado | o mesmo do braço comparado                                                            | nenhuma                            | (ausente)                | (ausente)                   | não       |
| `v5-pt` | desktop                      | `fleurs-pt-12`, `--eles pt-BR --eu pt-BR --qualidade accurate` (Parakeet, pt para pt) | `parciais_vivos,parciais_parakeet` | `acrescenta-decode`      | (ausente = 2, o padrão)     | sim       |
| `v5-en` | desktop e fraco (EMULADO)    | `fleurs-en-8`                                                                         | `parciais_vivos`                   | `acrescenta-decode`      | `1`                         | sim       |

Comparação: cada braço `v5-*` contra o `atual` do MESMO cenário e perfil (rodadas novas dos dois lados, no `dist/` da V5). Os números de V4 entram só como linha de referência.

## Medição

`bancada-captura.mjs` + `ab-parciais.mjs --variante v4` (a mesma lógica de veredito da V4, que é o orçamento absoluto de erasure), >= 10 rodadas válidas por braço e perfil, intercaladas,
aquecimento descartado, rodada inválida refeita. Bootstrap pareado por fala, 10.000 reamostragens, semente 20261121, IC 95% POR COMPARAÇÃO, sem correção de multiplicidade
(3 comparações; por isso a aprovação exige a primária E todas as guardas). Só informativo (não é guarda): `sttEspera` (parcial em voo quando o final foi postado) por fala.

## Métrica primária

`atrasoDePalavraMs` p50 do ORIGINAL, por perfil: diferença pareada por fala (palavras somadas), IC 95%.

## Efeito mínimo

-20% sobre o p50 de `atual` (provisório). B só é "melhor" se o IC 95% inteiro ficar abaixo de 0 e o efeito for >= 20% em módulo. IC que cruza 0, ou efeito < 20%: "sem diferença provada".

## Guardas (qualquer uma que falhe reprova B), iguais às da V4

1. Final: **`fimDaFalaAteOriginalMs` p75** onde não há tradução (pt para pt), **`fimDaFalaAteLegendaMs` p75** onde há (inglês): limite superior do IC 95% da diferença B - A **<= +30 ms**.
2. **`erasureOriginal` de B, orçamento absoluto:** média <= 0,5 E limite superior do IC 95% de B <= 0,6. A erasure de A e B - A só informadas.
3. Texto final: **WER pareado** do final contra a referência do FLEURS, diferença B - A, limite superior do IC 95% **<= +2 pp** (+0,02).
4. `framesLongos.n50/n100/somaMs`, `cpuSilencio.processoPct`, `rendersPorS.*` (silêncio e fala) e taxa de falha do `slo-captura.json`: regra "B > A x (1 + tolerância) + folga piora",
   sobre a mediana das rodadas.

## Leitura do perfil `fraco`

Fraco EMULADO (CPU 4x, 2 núcleos, sem WebGPU, num Mac) **não aprova celular**: só ordena e acha regressão. O fraco não exerce o Parakeet (rota `whisper-base`), então `v5-pt` só existe no desktop.

## Decisão

APROVADO = primária (IC inteiro abaixo de 0, efeito >= 20%) E todas as guardas. REPROVADO = alguma guarda falha, ou primária pior (IC inteiro acima de 0). SEM DIFERENÇA PROVADA = IC da
primária cruza 0 ou efeito < 20%, sem guarda reprovada. Ligar a flag é decisão [D] do dono, e mesmo aprovado no desktop o ganho em celular exige a rodada [R] em aparelho real.
O critério não muda depois de ver o número.
