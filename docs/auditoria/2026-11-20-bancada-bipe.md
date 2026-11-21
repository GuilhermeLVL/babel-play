# Bancada de captura: diagnóstico do "bipe não encontrado"

Tarefas 1.1 a 1.4 da change `lab-medicao-legenda-traduzida`. Aparelho: Mac (Darwin 27), Chromium do Playwright
(headless e headful), build `npm run build:estatica` do commit `a341c2d7` + esta mudança, áudio do fixture
`fleurs-en-8` (bipe em 4 s). Origem: `medido`.

## Evidência por hipótese

`medir.mjs` agora grava, por rodada: `tArmado` (instante em que `__LAT_ARMADO` ficou verdadeiro), `wav`
(existe, RIFF, formato PCM = 1, taxa), `armado` em cada evento `gum` e `estado` do `AudioContext` em `sonda:ok`.

| Rodada                                                   | `sonda:ok` | estado do contexto | `gum`/`gdm` vs armado | janelas em `aud` | RMS máx. | razão máx. a 2 kHz | bipe (ms após `gdm`/`gum`) |
| -------------------------------------------------------- | ---------- | ------------------ | --------------------- | ---------------- | -------- | ------------------ | -------------------------- |
| sistema, headless, perfil novo                           | sim        | `running`          | depois de armado      | 3 846            | 0,40     | 1,0                | 4 056                      |
| mic, headless, perfil novo                               | sim        | `running`          | `gum` armado=true     | 296              | 0,70     | 1,0                | 4 068                      |
| sistema, headful                                         | sim        | `running`          | depois de armado      | 3 829            | 0,38     | 1,0                | 4 054                      |
| bancada: aquecimento + r1, r2, r3 (perfil reaproveitado) | sim        | `running`          | depois de armado      | ~3 700           | 0,40     | 1,0                | 4 064 / 4 052 / 4 063      |

WAV: existe, RIFF, PCM 16 bit, 16 kHz, mono, em todas as rodadas.

- Hipótese 1 (bipe antes da sonda): não se confirmou. O 1º `gum`/`gdm` vem depois de `__LAT_ARMADO` e o bipe
  chega ~4,05 s depois dele, como o arquivo manda.
- Hipótese 2 (sonda não rodou): não se confirmou. `sonda:ok` com contexto `running` em todas.
- Hipótese 3 (arquivo não tocado): não se confirmou. RMS e razão a 2 kHz altos no instante certo.

## Causa encontrada

Nenhuma das três hipóteses reproduziu "bipe não encontrado" neste Mac. O que quebrava a rodada era outro defeito
da bancada: com `--eu en-US` a interface muda de idioma (`ui.captureSourceLang` também define o idioma da
interface), e `medir.mjs` procurava o botão só como "Iniciar captura" e o título só em português. Em inglês o
botão é "Start capture" e a rodada morria por `Timeout` antes de armar a sonda (perfil reaproveitado com `en-US`
falha já no título "Ready to caption"). Correção em `medir.mjs`: o botão aceita os dois idiomas.

Dados que ainda faltam: o relato original do "bipe não encontrado" não foi reproduzido, então a causa real nele
não está provada (o Mac em que apareceu pode ser outro, ou a falha era a deste item vista de longe). Os motivos
distintos da tarefa 1.2 existem justamente para nomear a causa na próxima ocorrência.

Observação fora do escopo: em `--modo mic` a página fechou ~10 s depois do clique em três rodadas (headless e
headful; `dom 0`, `cap 0`), enquanto `--modo sistema` roda inteiro. O bipe foi achado mesmo assim. Vale investigar
numa tarefa própria.

## Tarefa 1.2: motivos

`acharAncoraDoBipe` (em `analisar.mjs`) devolve a âncora ou um dos motivos: `sem-sonda` (nenhuma janela),
`bipe-antes-da-sonda` (1ª janela depois de `1º gum + bipeS`), `sem-audio` (RMS máx. ≤ 0,01), `sem-2khz`. A rodada
inválida imprime `motivo: detalhe` e `metricasDaRodada` traz `motivoCodigo`.

## Tarefa 1.3: rodadas

`bancada-captura.mjs --perfis desktop --rodadas 3` (cenário padrão, sistema): 3 rodadas seguidas VÁLIDAS, bipe a
4 064, 4 052 e 4 063 ms do `gdm` (dispersão 12 ms, ≤ 20 ms).

## Tarefa 1.4: recusa

`comparar.mjs` sai com 1 e lista rodada e motivo se `perfis.*.invalidas` não estiver vazio (não compara nem grava
linha de base). `rodar-matriz.mjs` valida as rodadas gravadas e sai com 1 com inválida, sem JSON ou sem rodada;
`--so-validar` só confere uma pasta.
