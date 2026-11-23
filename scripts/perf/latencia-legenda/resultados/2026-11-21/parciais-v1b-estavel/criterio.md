# Critério do A/B — V1b `parciais_vivos` com exibição estável (change `parciais-incrementais`, tarefa 2.6, variante nova)

Escrito ANTES de qualquer rodada de V1b (a fumaça de 1 rodada por modo, que não conta, vem depois deste commit). É uma variante NOVA:
não reabre o critério de V1 (`../parciais-v1-vivos/criterio.md`), que ficou REPROVADO com `cauda-token` e continua assim.

## Hipótese

V1 (`parciais_vivos`) cortou o atraso por palavra em 80% no desktop, mas reprovou pelo pisca: a erasure do original foi de 0,59 para
3,60 e `rendersPorS.fala` de 91 para 223, porque cada token do `onUpdate` repinta a cauda provisória. Manter a cadência e a
LocalAgreement-2 de V1 e mudar SÓ o que se pinta preserva parte do ganho de atraso e corta o pisca.

## Braços (mesmo `dist/`, um servidor; o braço muda só `babel.flags` e a chave de laboratório do navegador)

| braço              | flags            | `babel.lab.parciaisModo` | o que a tela mostra                                                                                             |
| ------------------ | ---------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `atual`            | nenhuma          | (ausente)                | o de hoje                                                                                                       |
| `v1b-sem-cauda`    | `parciais_vivos` | `sem-cauda`              | SÓ o prefixo confirmado da LocalAgreement-2 (nunca regride); nenhum token do `onUpdate` é pintado               |
| `v1b-cauda-decode` | `parciais_vivos` | `cauda-decode`           | confirmado + cauda provisória, que só muda a cada decode COMPLETO e nunca encurta mais de 2 palavras de uma vez |

Comparação: cada braço `v1b-*` contra `atual`, por perfil (`desktop` medido, `fraco` EMULADO). O modo `cauda-token` (= V1) não é
refeito: serve de referência só como linha de comparação no relatório (números do relatório anterior).

## Medição

`bancada-captura.mjs` + `ab-parciais.mjs --variante v1b`, áudio `fleurs-en-8`, >= 10 rodadas válidas por braço e perfil, intercaladas,
aquecimento descartado, rodada inválida refeita. Bootstrap pareado por fala, 10 000 reamostragens, semente 20261121, IC 95% POR
COMPARAÇÃO, sem correção de multiplicidade (declarado: 2 braços × 2 perfis; por isso a aprovação exige a primária E todas as guardas).

## Métrica primária

`atrasoDePalavraMs` p50 do ORIGINAL, por perfil: diferença pareada por fala (palavras somadas), IC 95%.

## Efeito mínimo

-20% sobre o p50 de `atual` (PROVISÓRIO, a confirmar pelo dono; tarefa 1.2 [D]). B só é "melhor" se o IC 95% inteiro ficar abaixo de 0
e o efeito for >= 20% em módulo. IC que cruza 0, ou efeito < 20%: "sem diferença provada".

## Guardas (qualquer uma que falhe reprova B)

1. `fimDaFalaAteLegendaMs` p75: limite superior do IC 95% da diferença B − A **<= +30 ms**. Declarado: a resolução da bancada é de
   ~100 ms (amostragem e quadros), então a guarda `<= 0` de V1 era mais rígida do que a régua enxerga (V1 reprovou por +4 ms de limite
   superior). +30 ms fica abaixo da resolução: é "sem piora perceptível", não uma licença para atrasar o final.
2. `erasureOriginal`: limite superior do IC 95% da diferença B − A **<= +0,05** (a mesma regra da Emenda 1 de V1: não piorar contra
   `atual`). A meta absoluta de 0,2 (NE de Arivazhagan et al.) é só informada.
3. Texto final: o final é intocado, mas 5 de 8 falas já variam entre as rodadas do próprio `atual` (a janela do VAD muda o decode), então
   "texto fora do conjunto de A" é régua ruidosa e não decide. A guarda é o **WER pareado do final contra a referência do FLEURS**:
   diferença B − A (por fala, bootstrap pareado), limite superior do IC 95% **<= +2 pontos percentuais** (+0,02). Os números de
   "fora do conjunto de A" saem no relatório, só como informação.
4. `framesLongos.n50/n100/somaMs`, `cpuSilencio.processoPct`, `rendersPorS.*` (silêncio e fala) e taxa de falha, todos do
   `slo-captura.json`: regra "B > A x (1 + tolerância) + folga piora", sobre a mediana das rodadas. Memória de pico: o headless não
   expõe (sem base).

## Leitura do perfil `fraco`

O perfil leve liga o modo desempenho automático: 1 parcial por fala por desenho, e a cadência não atua (V1 foi inerte ali). O
relatório reporta o que sair, sem mudar o desenho. Fraco EMULADO não aprova celular; ele só ordena e acha regressão.

## Decisão

APROVADO = primária (IC inteiro abaixo de 0, efeito >= 20%) E todas as guardas. REPROVADO = alguma guarda falha, ou primária pior (IC
inteiro acima de 0). SEM DIFERENÇA PROVADA = IC da primária cruza 0 ou efeito < 20%, sem guarda reprovada. Se os dois braços
aprovarem, recomenda-se o de maior efeito na primária (empate: o de `sem-cauda`, o mais simples). Ligar a flag é decisão [D] do dono,
e mesmo aprovado no desktop o ganho em celular exige a rodada [R] em aparelho real. O critério não muda depois de ver o número.
