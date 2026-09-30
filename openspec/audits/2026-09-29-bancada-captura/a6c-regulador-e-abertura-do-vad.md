# A6c: o regulador não corta os parciais pela abertura do VAD

**Data:** 30/09/2026. **Branch:** `perf/a6b-primeira-legenda` (commit `03edd13`), sobre a `perf/gratis-leve` em `a037514`. **Máquina:** a do A0, compartilhada. A comparação é intercalada: antes, depois, antes, depois…

## O problema

O A6b mostrou (achado 1) que, no notebook fraco, o regulador cortava os parciais já no 1º parcial da sessão. Por isso só a 1ª fala ganhava a prévia do modo desempenho automático.

## A causa

Dois quadros que não são da captura caíam na janela de 10 s do `travamento` (≥ 400 ms de bloqueio):

1. **A abertura do VAD.** O `MicVAD.new` cria a sessão do Silero, e a 1ª sessão do ORT da página instancia o `ort-wasm-simd-threaded.wasm` (12 MB) na thread principal.
   - Medido isolado, com o mesmo ORT, o mesmo modelo e 1 thread: um quadro de **883 ms** com a CPU 4× mais lenta e **172 ms** sem freio, **dentro do `InferenceSession.create`**.
   - O LoAF não atribui script nenhum ao quadro: é o V8 instanciando o módulo, não JS.
   - O resto da abertura (1º decode, `AudioContext`, `addModule` do worklet, a fonte do stream) não deu quadro longo.
2. **O React de antes do "Iniciar"** (montar a tela, os ajustes). Na bancada, dois ou três quadros de 150–190 ms de bloqueio caíam na janela do 1º parcial.

**Tirar da thread principal?** Com `ort.env.wasm.proxy = true`, o ORT roda num worker, e o quadro some (medido: nenhum quadro longo na criação). Mas o vad-web reusa o tensor `sr` a cada quadro, e o proxy transfere o buffer: o 2º `run` falha com `DataCloneError`. Além disso, o worker do proxy num bundle do Vite ainda precisa ser provado. Fica como mudança própria, com a sua medição. **Adiar** só mudaria o congelamento de lugar: a captura precisa do VAD na hora.

## A solução

- A captura marca o intervalo do `MicVAD.new` com `marcarAberturaDoVad`, uma medida do User Timing (`babel:abertura-do-vad`) que o DevTools também mostra.
- O vigia descarta **só o quadro que começa dentro** desse intervalo. Os quadros de antes e de depois continuam contando.
- A janela do bloqueio no regulador passa a começar no `reiniciar` da sessão.
- Travamento de verdade durante a sessão continua cortando (testes).
- Cada decisão do regulador vai ao console com o motivo (`[cap] regulador: cortar-parciais ← travamento`). Foi assim que se viu o achado abaixo.

## Números: fraco, 6 rodadas intercaladas, mediana [mín–máx]

| métrica | antes (`a037514`) | depois | Δ |
|---|---|---|---|
| falas com prévia (de 8) | 1 [1–1] | **6** [5–7] | |
| decodes do STT na sessão | 9 | 16 | +7 |
| 1ª legenda (ms) | 2 068 [2 000–2 172] | 2 056 [1 921–2 075] | −1% |
| frames > 50 ms | 3 [2–4] | 3,5 [2–10] | +17% |
| frames > 100 ms | 2 [2–3] | 2 [2–6] | 0% |
| soma dos frames longos (ms) | 1 162 | 1 150 | −1% |
| CPU fora da principal na fala (%, com o freio) | 118,3 [117,0–120,5] | 125,5 [123,9–127,0] | +6% |
| idem, sem os ~100 do freio do CDP | ~18 | ~26 | **+39%** |
| CPU no silêncio (%) | 5,9 | 6,4 | +8% |
| RTF p95 (falas somadas) | 0,127 | 0,119 | −7% |
| renders/s com fala | 92 | 111 | +20% |

- **Contra a regra do A6b** (frames ≤ +20%, CPU na fala ≤ +25%, na CPU bruta que decidiu ali), passa: +17% e +6%.
- **Tirado o freio do CDP**, os workers vão de ~18 para ~26% de um núcleo (+39%). É o custo de 7 decodes (~260 ms cada) e 5 traduções a mais.
  - Se isso contar, a alavanca é não traduzir a prévia: a tradução dela custou ~1,2 s de worker por sessão. É uma decisão de produto; não foi feita.

**Desktop (4 rodadas):** frames 1 → 1, soma −4%. Ali o modo desempenho não liga, então essa comparação não mede esta mudança. As duas colunas sofreram cortes pela pressão da CPU (ver abaixo), e a CPU e os parciais variam com eles.

## Achado: a pressão de CPU da máquina compartilhada

A rodada de confirmação da build final (4 rodadas por perfil, contra o SLO) mostrou o motivo dos cortes que sobraram:

- **Os cortes vieram da pressão de CPU:** `cortar-parciais ← pressao`, `modelo-menor ← pressao` e, no fim, `oferecer-nativo-ou-nuvem ← pressao`. Isso aconteceu em 3 das 4 rodadas do desktop e em 1 das 4 do fraco (que também tinha `travamento`: 109 quadros longos, a máquina toda ocupada).
  - O Compute Pressure (`PressureObserver('cpu')`) mede a máquina inteira, e as outras frentes a ocupavam.
- **As descidas de modelo explicam os "piorou" dessa rodada:** memória do desktop +46% e RTF p95 do fraco +220%.
- **Nas rodadas sem pressão, o fraco teve prévia em 6 ou 7 das 8 falas.**
- **Recomendação para a bancada:** desligar o `PressureObserver` na sonda, ou registrar os estados dele, para que a carga das outras frentes não se passe por regressão. No produto, reagir à pressão da máquina é o comportamento certo.
