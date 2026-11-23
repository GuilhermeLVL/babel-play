# Critério do A/B: V7 `parciais_vivos`, CONFIRMAÇÃO da V6 com amostra maior e o teto do final na resolução da bancada (change `parciais-incrementais`, tarefa 2.6, variante nova)

Escrito e commitado ANTES de qualquer rodada válida de V7. A fumaça (1 rodada por braço) não conta e vem depois deste commit. É uma variante NOVA, só para rodadas novas: não reabre nada medido
(V1 a V6 mantêm os vereditos que têm). O código é o da V6 (`4a2d0c4b`) mais a correção das telas que liam o estado das falas (`71a6ae3f`: Intérprete, Conversa virtual e iChat voltam a ver o texto em
curso). O caminho do parcial, do final e da cadência não mudou desde a V6; o `dist/` é refeito (`npm run build:estatica`) antes das rodadas.

## Decisão do dono (registrada aqui, antes de qualquer rodada)

**O teto da guarda do final passa de +30 ms para +100 ms.** Razão declarada: +100 ms é a RESOLUÇÃO da bancada (os quadros de captura e a granularidade do p75 sobre 14 a 16 falas). Medido, o efeito do parcial vivo
sobre o final do original no pt ficou perto de zero e dominado por essa resolução: V5 deu −48 ms (IC [−114, +62]) e V6 deu +48 ms (IC [+1, +116]), com o MESMO código de final e de parcial. Um teto abaixo da
resolução não separa efeito de ruído. É decisão de produto/medição do dono, não um afrouxamento descoberto depois de ver o número: o limite novo foi escolhido com base nos números JÁ publicados da V5 e V6, e
vale para esta variante em diante. Os vereditos anteriores (V4, V5, V6) NÃO mudam.

## Hipótese

O ganho de atraso medido na V6 (−58% no p50 por palavra no pt/Parakeet), com renders dentro do SLO e erasure dentro do orçamento, se confirma com 20 ou mais rodadas válidas, e o custo no final do original
fica dentro de +100 ms (limite superior do IC 95%). Flag desligada = comportamento de hoje.

## Fixtures (declarado)

- pt: `tests/fixtures/bancada-captura/fleurs-pt-16.json` (a mesma da V6; 14 de 16 falas no cálculo por palavra).
- inglês: `tests/fixtures/bancada-captura/fleurs-en-8.json` (cenário padrão da bancada: en-US para pt-BR).

## Braços (mesmo `dist/`, um servidor; o braço muda só `babel.flags` e as chaves de laboratório do navegador)

| braço   | perfis                       | cenário                                                                               | flags                              | `babel.lab.parciaisModo` | `babel.lab.parciaisMascara` | limitador | papel                    |
| ------- | ---------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------ | --------------------------- | --------- | ------------------------ |
| `atual` | os mesmos do braço comparado | o mesmo do braço comparado                                                            | nenhuma                            | (ausente)                | (ausente)                   | não       |                          |
| `v7-pt` | desktop                      | `fleurs-pt-16`, `--eles pt-BR --eu pt-BR --qualidade accurate` (Parakeet, pt para pt) | `parciais_vivos,parciais_parakeet` | `acrescenta-decode`      | (ausente = 2, o padrão)     | sim       | **DECISÃO de aprovação** |
| `v7-en` | desktop e fraco (EMULADO)    | `fleurs-en-8`                                                                         | `parciais_vivos`                   | `acrescenta-decode`      | (ausente = 2, o padrão)     | sim       | SÓ NÃO-REGRESSÃO         |

Comparação: cada braço `v7-*` contra o `atual` do MESMO cenário e perfil.

## Papéis (declarado)

- **pt/Parakeet, desktop (`v7-pt`): é a decisão de aprovação.** Vale o veredito inteiro (primária E todas as guardas).
- **Inglês, desktop e fraco emulado (`v7-en`): SÓ NÃO-REGRESSÃO.** A flag `parciais_vivos` vale para todos os idiomas, então o inglês precisa provar que não piora. Passa se TODAS as guardas passam
  (guarda 1 a 4, abaixo, com o MESMO teto de +100 ms). A métrica primária é INFORMATIVA: o inglês pode dar "sem diferença provada" e ainda assim passar a não-regressão; não aprova nem reprova por ela. O relatório
  imprime o veredito da ferramenta e declara à parte "não-regressão: passa/falha" pelas guardas.
- **O fraco emulado não aprova celular:** é um notebook de entrada emulado por software (CPU 4× mais lenta pelo CDP, sem WebGPU), não um aparelho; e não exerce o Parakeet (rota `whisper-base`). Passar nele
  não substitui a rodada [R] em aparelho real.

## Medição

`bancada-captura.mjs` + `ab-parciais.mjs --variante v4 --criterio <este arquivo> --teto-final-ms 100` (a mesma lógica de veredito da V4/V5/V6; `--teto-final-ms` é o único parâmetro novo da ferramenta, com teste
em `tests/abParciais.test.ts`, e sem ele os vereditos antigos não mudam). **>= 20 rodadas válidas por braço no pt; >= 10 rodadas válidas por braço e perfil no inglês**, intercaladas, aquecimento descartado,
rodada inválida refeita (o número de rodadas pedido já prevê folga; a ferramenta usa todas as válidas). Bootstrap pareado por fala, 10.000 reamostragens, semente 20261121, IC 95% POR COMPARAÇÃO, sem correção de
multiplicidade (a aprovação do pt exige a primária E todas as guardas). Só informativo (não é guarda): `sttEspera`, `commitsPorS`.

## Métrica primária

`atrasoDePalavraMs` p50 do ORIGINAL: diferença pareada por fala (palavras somadas), IC 95%. (Decisória no pt; informativa no inglês.)

## Efeito mínimo

-20% sobre o p50 de `atual` (provisório). B só é "melhor" se o IC 95% inteiro ficar abaixo de 0 e o efeito for >= 20% em módulo. IC que cruza 0, ou efeito < 20%: "sem diferença provada".

## Guardas (qualquer uma que falhe reprova B; no inglês, falha a não-regressão)

1. Final: **`fimDaFalaAteOriginalMs` p75** onde NÃO há tradução (pt para pt); **`fimDaFalaAteLegendaMs` p75** onde há (inglês para pt). Limite superior do IC 95% da diferença B − A **<= +100 ms** (era +30 ms; ver a decisão do dono).
2. **`erasureOriginal` de B, orçamento absoluto:** média <= 0,5 E limite superior do IC 95% de B <= 0,6. A erasure de A e B − A só informadas.
3. Texto final: **WER pareado** do final contra a referência do FLEURS, diferença B − A, limite superior do IC 95% **<= +2 pp** (+0,02).
4. `framesLongos.n50/n100/somaMs`, `cpuSilencio.processoPct`, `rendersPorS.*` (silêncio e fala) e taxa de falha do `slo-captura.json`: regra "B > A x (1 + tolerância) + folga piora", sobre a mediana das
   rodadas. Para `rendersPorS.fala` (tolerância 25%, folga 10): o limite é `mediana(atual)` x 1,25 + 10, como na V5/V6.

Nada além do teto da guarda 1 foi afrouxado em relação à V6.

## Decisão

pt: APROVADO = primária (IC inteiro abaixo de 0, efeito >= 20%) E todas as guardas. REPROVADO = alguma guarda falha, ou primária pior (IC inteiro acima de 0). SEM DIFERENÇA PROVADA = IC da primária cruza 0 ou
efeito < 20%, sem guarda reprovada. Inglês: NÃO-REGRESSÃO passa se nenhuma guarda reprova (a primária não entra). Ligar a flag é decisão [D] do dono, e mesmo aprovado no desktop o ganho em celular exige a rodada [R]
em aparelho real. O critério não muda depois de ver o número. A fumaça não decide nada; se algo estranho aparecer nela (renders longe do `atual`, rodada inválida repetida), a implementação é investigada ANTES
do A/B completo.
