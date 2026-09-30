# A6b: a 1ª legenda no perfil leve (três variantes, medidas na bancada A0)

**Data:** 30/09/2026. **Branch:** `perf/a6b-primeira-legenda`, criada da `perf/gratis-leve` em `f252e5d`. **Máquina:** a do A0 (Ryzen 5 5600, Windows 11, Chromium headless), **compartilhada** com outras frentes. Por isso as variantes rodaram intercaladas: a, b, c, a, b, c…

## O problema

O relatório do A0 (achado 4) mostrou que, no perfil leve, a 1ª legenda passou de 2,3 s para 5,0 s. O A6 liga o modo desempenho de fábrica no aparelho leve, e o `querParcial` devolvia `false` sempre que ele estava ligado. Resultado: nenhum parcial, e o espaçamento de 2,2 s do A5 nunca chegava a valer.

## Resposta curta

- **Escolhida: (c), com um parcial único por fala que espera 1,5 s de fala.**
  - No fraco, a 1ª legenda caiu de **4,94 para 2,00 s**.
  - Frames longos e CPU ficaram iguais aos do (a).
  - O modo que a **pessoa** liga continua sem parcial nenhum ("Legenda só no fim de cada frase").
- **(b) reprova pela regra:** frames > 50 ms +67% (5 contra 3). A 1ª legenda "rápida" dele, 1,2 s, é quase sempre um pedaço: "the most", "The most,", "".
- **O (c) literal falhou no 1º ensaio.** Com o parcial único no 1º tique (0,6 s de fala), o Moonshine devolveu "" e a 1ª legenda ficou em 4,99 s, igual à do (a). Por isso o parcial único passou a esperar 1,5 s (`primeiroParcialComMs`, novo na captura).

## Como foi medido

- **Uma build só**, com uma chave temporária no pipeline: a variante vinha da URL da navegação (`/capturar?a6b-b`). Um servidor na 4197, e `bancada-captura.mjs --alvos a=…?a6b-a,b=…?a6b-b,c=…?a6b-c`.
  - Cada variante teve o seu perfil de navegador e o seu aquecimento, que fica fora da conta.
  - Rodadas: 6 por variante no fraco e 4 no desktop.
  - A chave saiu do código depois da medição.
- **Métricas:** as da bancada, mais duas contas feitas sobre os brutos, com as mesmas funções de `metricas-captura.mjs`:
  - **CPU na fala:** `cpuNaJanela` na janela `fala` do `janelasDaRodada`.
    - No Windows, "fora da principal" soma workers, compositor e áudio.
    - No fraco, ela inclui também **~100% de um núcleo do freio do CDP**; a thread principal fica em 3,5%, então o freio não está nela.
  - **1ª legenda útil:** o 1º texto do 1º balão com ≥ 2 palavras, metade delas no texto final do balão.
- **Dados condensados:** `dados/a6b-variantes.json` traz as medianas, mín–máx e cada rodada.

## Números: fraco (a regra decide aqui), 6 rodadas, mediana [mín–máx]

| métrica | (a) sem parcial | (b) parciais a cada 2,2 s | (c) parcial único com 1,5 s |
|---|---|---|---|
| 1ª legenda, qualquer texto (ms) | 4 942 [4 917–5 026] | 1 210 [1 136–4 965] | **2 004** [1 936–2 189] |
| o que aparece primeiro | "Lions…" (o final) | "the most", "", ". So." | "Lions are the most social cat" |
| frames > 50 ms | 3 [2–21] | **5** [2–41] | 3 [2–34] |
| frames > 100 ms | 2 [2–11] | 2 [2–28] | 2 [2–25] |
| soma dos frames longos (ms) | 1 024 [1 012–4 014] | 1 167 [966–11 602] | 1 059 [921–9 100] |
| CPU fora da principal na fala (% de 1 núcleo, com o freio) | 117,6 [116,0–129,0] | 126,9 [116,6–174,0] | 118,1 [116,8–120,5] |
| CPU da aba no silêncio (%) | 5,9 [5,6–7,8] | 6,2 [5,6–89,4] | 6,0 [5,6–186,1] |
| RTF p95 (falas somadas) | 0,116 | 0,176 | 0,122 |
| decodes do STT na sessão | 8 | 9 | 9 |
| rodadas com descida de modelo | 1 de 6 | 3 de 6 | 1 de 6 |

## Números: desktop (controle), 4 rodadas

O desktop não é leve, então o modo desempenho não liga e **as três colunas rodam o mesmo código**. A diferença entre elas é o ruído da máquina:

| métrica | a | b | c |
|---|---|---|---|
| 1ª legenda (ms) | 2 390 [1 202–2 884] | 1 812 [1 118–2 372] | 1 742 [1 098–2 464] |
| frames > 50 / > 100 ms | 1 / 1 | 2 / 1 | 2 / 1 |
| CPU fora da principal na fala (%) | 123,6 [49,1–146,0] | 131,7 [117,5–142,7] | 133,7 [62,5–136,5] |
| CPU da aba no silêncio (%) | 16,0 | 17,6 | 16,1 |
| RTF p95 (falas somadas) | 0,156 | 0,175 | 0,174 |

## A regra

A regra: fica a **menor 1ª legenda** entre as variantes que passam nos dois limites do fraco, frames longos ≤ +20% do (a) e CPU na fala ≤ +25% do (a).

- **(b):** reprova. Frames > 50 ms ficam em +67%. A CPU dos workers, tirado o freio, sobe de ~18 para ~27% de um núcleo (+50%).
- **(c):** passa. Frames > 50 ms 0%, > 100 ms 0%, CPU na fala +0,4% (+3% sem o freio).
- **Vence o (c).** A 1ª legenda útil dele é a menor: a do (b) só é menor se "the most" contar como legenda.

## Achados

1. **O regulador corta os parciais já no 1º parcial da sessão, no fraco.**
   - Causa: o quadro longo de 0,8–1,3 s da abertura da captura (VAD) cai na janela de 10 s do `travamento`.
   - Por isso, no (b) e no (c), só a 1ª fala tem parcial. As seguintes voltam a ter quando o regulador sobe, depois de 60 s de folga.
   - O ganho da 1ª legenda não depende disso.
   - **Recomendação (A6):** o vigia não contar o que aconteceu antes de a captura ficar ativa. **Feito no A6c** (`a6c-regulador-e-abertura-do-vad.md`): no fraco, a prévia passou de 1 para 6 das 8 falas.
2. **Descidas de modelo nas rodadas com rajada de frames longos.** Elas vieram da máquina compartilhada e aconteceram nas três variantes (1, 3 e 1 de 6). São elas que abrem a dispersão (CPU no silêncio de 89–186%, memória de 2,5–2,8 GB). A mediana não se mexe.
3. **A métrica `primeiraLegendaMs` da bancada conta qualquer texto.** Com o 1º parcial de 0,6 s, isso inclui ". So.". Fica como está (é o SLO), mas quem comparar variantes deve olhar o texto.

## Confirmação com a build final (sem a chave)

- `bancada-captura.mjs --perfis fraco --rodadas 3`, contra o SLO novo: **tudo ok**.
- 1ª legenda: 2 064 ms [1 471–2 179]. Frames > 50 ms: 5; > 100 ms: 2. CPU no silêncio: 5,7%.

## SLO

- A base `local-win32` → `fraco` → `primeiraLegendaMs` passou de 5 003 para **2 004**: a métrica mudou de faixa, do final da frase para o parcial único.
- A tolerância e a folga ficam como estão (25% + 1,5 s): o teto de ~4,0 s reprova a volta aos 5 s. Com a base antiga, o teto era 7,8 s, e essa regressão passaria.
