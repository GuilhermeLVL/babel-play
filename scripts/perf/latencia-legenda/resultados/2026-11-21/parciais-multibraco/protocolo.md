# Protocolo do A/B multibraço dos parciais (change `parciais-incrementais`, tarefas 2.6, 3.3 e 4.3)

Escrito em 21/11/2026, ANTES da primeira rodada válida. Vale para V1, V2 e V3. Os critérios de cada variante já estão commitados
(`../parciais-v1-vivos/criterio.md`, `../parciais-v2-parakeet/criterio.md`, `../parciais-v3-traducao-incremental/criterio.md`, com a
Emenda 1) e NÃO mudam depois de ver o número. Este arquivo só diz como as rodadas são feitas e como cada número é lido.

## Build medido

`npm run build:estatica` do commit `895fde23` (= `8bb08365` + o conserto de `fontesDeAudio.ts`, que repassava os callbacks um a um
e perdia `cadenciaDoParcial`: com `parciais_vivos` ligada a cadência adaptativa nunca rodava; achado na rodada de fumaça). Com a
flag desligada o callback devolve `undefined`: o braço `atual` é o comportamento de hoje. Um só `dist/`, um só servidor; o braço
muda só as flags do navegador (`babel.flags`, via `--flag-do-alvo`).

## Braços (áudio inglês `fleurs-en-8`, perfis `desktop` medido e `fraco` EMULADO)

| braço   | flags ligadas                         | papel                                     |
| ------- | ------------------------------------- | ----------------------------------------- |
| `atual` | nenhuma                               | A de V1; A auxiliar de V3                 |
| `v1`    | `parciais_vivos`                      | B de V1; A de V3 (a comparação principal) |
| `v1v3`  | `parciais_vivos,traducao_incremental` | B de V3                                   |

Comando: `node scripts/perf/latencia-legenda/bancada-captura.mjs --perfis desktop,fraco --rodadas 12 --sem-comparar --porta 4181
--alvos atual=URL,v1=URL,v1v3=URL --flag-do-alvo "atual=;v1=parciais_vivos;v1v3=parciais_vivos,traducao_incremental"` (as três URLs
são o mesmo servidor). Rodadas INTERCALADAS dentro de cada perfil (atual, v1, v1v3, atual, v1, v1v3...), uma rodada de aquecimento
por braço e perfil, descartada. 12 rodadas por braço e perfil; rodada inválida é refeita, nunca preenchida nem retirada da média.
Mínimo de 10 válidas por braço (o `ab.mjs` recusa abaixo disso). Máquina livre, nada rodando junto, `npm run limpar` antes.

## Comparações e o critério de cada uma

- V1: `v1` contra `atual`, pelo critério de V1 (primária: `atrasoDePalavraMs` p50 do original, efeito mínimo -20%).
- V3: a comparação PRINCIPAL é `v1v3` contra `v1` (isola `traducao_incremental`, que o critério de V3 define com `parciais_vivos`
  ligada nos dois lados), pelo critério de V3 (primária: `atrasoDePalavraMs` p50 da TRADUÇÃO, proxy proporcional). `v1v3` contra
  `atual` sai também, como informação (o ganho somado), sem decidir V3.
- V2 (Parakeet): ver abaixo; o áudio inglês NÃO exercita o Parakeet (a rota só o usa em pt e es), então nenhum braço deste áudio
  vale para V2.

## Estatística

Diferença pareada B − A por fala (a mesma fala do roteiro nos dois braços), bootstrap de 10 000 reamostragens, semente fixa
(20261121), IC 95% POR COMPARAÇÃO. NÃO há correção de multiplicidade (declarado): são 2 variantes decididas × 2 perfis, e cada
critério tem a sua regra de IC; a leitura conjunta de várias métricas ao mesmo tempo aumenta a chance de um falso positivo isolado,
e por isso a aprovação exige a primária E todas as guardas.

- Atraso por palavra: as palavras da fala sorteada, em todas as rodadas sorteadas, somadas; p50 (e p90) das palavras. Falas fora do
  cálculo do alinhamento (< 90% casadas) ficam de fora do atraso e entram na erasure.
- Erasure: Σ apagadas ÷ Σ palavras finais sobre as falas e rodadas sorteadas.
- `fimDaFalaAteLegendaMs` p75: o `bootstrapPareado` de `ab.mjs` (a mediana das rodadas por fala, p75 das falas).
- `primeiroTextoNaTelaMs`: mediana das rodadas por braço (informativo; é de rodada, não de fala), com a diferença das medianas.

## Guardas, lidas exatamente como os critérios as escrevem

1. `fimDaFalaAteLegendaMs` p75: limite superior do IC 95% da diferença B − A ≤ 0.
2. Erasure (Emenda 1): limite superior do IC 95% da diferença B − A ≤ +0,05, em `erasureOriginal` (V1) e também em
   `erasureTraducao` (V3). A META de 0,2 (média de B) só é informada, não decide.
3. Texto final: o final é intocado. Para cada fala, o texto final de cada rodada de B tem de estar entre os textos finais que A
   produziu naquela fala (o Moonshine pode variar de uma rodada para outra por causa da janela do VAD; o conjunto de A é a régua).
   Qualquer texto de B fora do conjunto de A reprova. Sai também o WER do final contra a referência do FLEURS, agregado por braço,
   e quantas falas de A divergem entre as próprias rodadas (o ruído da régua). A tradução final segue a mesma regra no V3.
4. Frames longos (n50, n100, soma), CPU no silêncio, renders por s (silêncio e fala) e taxa de falha: regra de `slo-captura.json`
   sobre a mediana das rodadas (`avaliarGuardas`: B > A × (1 + tolerância) + folga = piorou). Memória: o headless não expõe.
5. No V3, o p50 do atraso do ORIGINAL é guarda: "piorou" se o IC 95% da diferença inteiro fica acima de 0 (piora provada); um IC
   que cruza 0 não reprova.

## Veredito

APROVADO = primária (IC 95% inteiro abaixo de 0 e efeito >= 20% em módulo) E todas as guardas. REPROVADO = alguma guarda falha, ou o
IC da primária fica inteiro acima de 0. SEM DIFERENÇA PROVADA = o IC da primária cruza 0 (ou o efeito < 20%), sem guarda
reprovada. Quando a primária ganha e uma guarda reprova, o veredito é REPROVADO (o relatório mostra a primária assim mesmo).
Perfil `fraco` é EMULADO: não aprova celular; o veredito dele só ordena e acha regressão. Ligar a flag é decisão [D] do dono.

## V2 (Parakeet) e o limite do áudio

V2 precisa de áudio em pt ou es com tempo por palavra e exige o Parakeet efetivamente na rota do braço `atual`. Se o áudio ou o
alinhamento não existirem nas condições do critério (>= 6 falas casadas >= 90%, falas de até ~5,8 s para o VAD não cortá-las), V2
é registrado como "não medido", com o motivo, no relatório. Nada do áudio inglês é usado como substituto.
