# Bancada no Mac: fechando as duas condições do Parakeet v3 (23/10/2026)

## Ambiente

Apple M5 Pro, 15 núcleos, 24 GB, macOS (Darwin 27). Chrome 155.0.8059.86 (`channel: 'chrome'`, Playwright 1.64.1, headless), página isolada
(COOP same-origin + COEP credentialless), transformers.js 4.2.0 e onnxruntime-web do repo. WebKit: build do Playwright
(versão reportada 27.2), headless, 8 núcleos visíveis, crossOriginIsolated = false.
Áudio: as mesmas falas FLEURS da §1 do documento de 09/10 (pt 100 falas/21,0 min, es 50 falas de 100/ amostra es_419, semente 20260924; pt e en conferem com a durações do doc). Pontuador: o do repo (filtrarAlucinacao + WER de src/core/eval, bootstrap 1000).
RTF = tempo de decodificação / duração do áudio (sem carga nem aquecimento). Uma máquina, uma rodada por célula, sequencial (sem concorrência entre rodadas).

## A. WER e RTF por threads (Chrome, WASM)

| Sistema          | Idioma (n) | WER % [IC 95%]   | RTF 1 thread | RTF 2 threads | RTF 4 threads |
| ---------------- | ---------- | ---------------- | ------------ | ------------- | ------------- |
| Parakeet v3 int8 | pt (100)   | 5,8 [4,6–7,1]    | 0,304        | 0,160         | 0,095         |
| Whisper base q8  | pt (100)   | 18,8 [16,4–21,1] | 0,183        | 0,109         | 0,071         |
| Parakeet v3 int8 | es (50)    | 4,3 [3,0–5,8]    | 0,304        | 0,169         | 0,095         |
| Whisper base q8  | es (50)    | 15,3 [12,5–18,2] | 0,192        | 0,114         | 0,075         |

O WER é idêntico entre as contagens de threads (mesmo texto). Diferença pareada Parakeet − Whisper base q8: pt −13,05 pts [−15,02; −11,11]; es −11,00 [−13,34; −8,73]; ambas significativas.
Observação: o 1 thread do Parakeet (0,30) ficou mais lento que o do Whisper base q8 (0,18-0,19) neste Mac; em 4 threads os dois estão em 0,07-0,10. (No Ryzen de 09/10 eram 0,265 x 0,247 com 1 thread.) Parakeet é cerca de 1,3-1,7x mais lento que o Whisper base q8 em qualquer contagem, mas sempre mais rápido que a fala (>=3,3x com 1 thread).

## B. "PC fraco simulado": 2 threads + CPU 4x mais lenta (CDP Emulation.setCPUThrottlingRate 4), pt, 30 falas

| Sistema          | RTF 2t normal (100 falas) | RTF 2t + 4x | p50 / p95 por fala | WER % (30 falas) |
| ---------------- | ------------------------- | ----------- | ------------------ | ---------------- |
| Parakeet v3 int8 | 0,160                     | **0,634**   | 7,8 s / 12,1 s     | 4,6 [2,7–7,3]    |
| Whisper base q8  | 0,109                     | **0,375**   | 4,7 s / 5,5 s      | 17,9 [14,7–21,2] |

A lentidão AFETA os workers do WASM (RTF subiu 3,4-4,0x nos dois, e o Whisper decodifica quase todo em workers do ORT), então a simulação é válida em ordem de grandeza. Limitações: o estrangulamento é por fatiamento de tempo do Chrome, não reproduz cache pequeno, banda de memória baixa nem núcleos pequenos/térmica de notebook real; o Mac continua com 15 núcleos e 24 GB. Teste prévio de 6 falas confirmou: 0,158->0,640 (Parakeet) e 0,105->0,398 (Whisper). Ainda dá folga (<1,0) nos dois: o Parakeet processa 1 s de fala em 0,63 s no aparelho simulado, mas isso é com 2 threads; com 1 thread e 4x lento a conta seria cerca de 1,2 (extrapolação, não medida) e não acompanharia a fala.

## C. Memória (soma do RSS de todos os processos do Chrome da bancada, via `ps`)

Amostrada a cada 2 s durante toda a rodada (carga + inferência); "pico" = maior amostra. RSS conta páginas compartilhadas entre processos mais de uma vez e inclui o processo de GPU; não é a mesma métrica de working set do Windows (valores não comparam 1 para 1 com os 2,0 GB e 1,0 GB do documento).

| Sistema                              | Pico (MB)   | Final (MB)  |
| ------------------------------------ | ----------- | ----------- |
| Parakeet v3 int8, WASM (1, 2 ou 4 t) | 3.915-3.924 | 3.057-3.377 |
| Whisper base q8, WASM                | 1.954-2.104 | 1.917-2.051 |
| Whisper small hybrid, WebGPU         | 3.798       | 3.597       |

Parakeet int8 usa cerca de 1,9x a memória do Whisper base q8 (no Windows foi 2,0x), e o pico não depende das threads. O Whisper small hybrid na GPU fica no mesmo patamar do Parakeet. No Mac a base de comparação é alta: o próprio Chrome headless com a página vazia já ocupa algumas centenas de MB (não medido isolado). Para um aparelho com 4-8 GB, ~3,9 GB de RSS é o ponto crítico da adoção; não há como conferir aqui o que o SO faria (swap/kill).

Whisper small hybrid WebGPU, só para referência (pt, 30 falas): WER 8,5 [5,9–10,9], RTF 0,042, carga 24,6 s (com download).

## D. WebKit do Playwright (proxy do Safari), 1 thread, pt, 30 falas

Roda. crossOriginIsolated = false (o WebKit ignora COEP credentialless), então o ORT fica em 1 thread sem SharedArrayBuffer; as duas cargas abriram e transcreveram 30/30 sem falha.

| Sistema          | WER % (30)       | RTF   | Carga                     | Chrome 1 thread (100 falas) |
| ---------------- | ---------------- | ----- | ------------------------- | --------------------------- |
| Parakeet v3 int8 | 4,6 [2,7–7,3]    | 0,304 | 1,6 s (arquivos do disco) | 0,304                       |
| Whisper base q8  | 17,9 [14,7–21,2] | 0,177 | 7,8 s                     | 0,183                       |

Mesmo texto e velocidade do Chrome com 1 thread. Limitações: é o WebKit do Playwright (não o Safari do sistema, nem iOS); Mac de 15 núcleos, não iPhone/iPad; a memória no WebKit não foi medida (os processos do WebKit não carregam o caminho do perfil na linha de comando, o filtro por perfil não os acha); sem WebGPU testado; o iOS tem teto de memória por aba bem menor, e ~3,9 GB no Chrome sugere que o Parakeet não caberia lá (inferência, não medida).

## E. SpeechRecognition.available (Chrome 155.0.8059.86, perfil novo do Playwright, janela visível)

`SpeechRecognition.available({langs:[...], processLocally:true})`:

- pt-BR: "downloadable"; es-ES: "downloadable"; en-US: "downloadable"; as três juntas: "downloadable".
  Nenhuma instalada (perfil novo); não chamei install(). O que importa é que a API existe no Chrome 155 e reconhece os três idiomas como instaláveis, mas num perfil real de usuário o resultado pode ser "available" se o pacote já estiver baixado. Contexto seguro (https) necessário.

## Resposta às duas condições

1. Desempenho em aparelho fraco: nesta simulação (2 threads, CPU 4x mais lenta) o Parakeet int8 fica em RTF 0,63 e acompanha a fala; o Whisper base q8 em 0,38. Nenhum dos dois é medição em notebook real. Com 1 thread e 4x lento o Parakeet provavelmente passa de 1,0 (extrapolação).
2. Memória: Parakeet int8 chega a ~3,9 GB de RSS (soma dos processos), 1,9x o Whisper base q8 (~2,0 GB), igual para qualquer nº de threads. É a restrição real da adoção.

## Alterações nos scripts (working tree, sem commit)

- scripts/eval-fala/bancada/navegador/rodar.mjs: `--lentidao N` (CDP setCPUThrottlingRate, id do resultado ganha `@lentoNx`), `--navegador webkit` (WebKit do Playwright, perfil `perfil-webkit`, id ganha `@webkit`), memória por `ps` (macOS) no lugar do PowerShell, amostragem de pico a cada 2 s (`memoriaPicoBytes`).
- scripts/eval-fala/bancada/navegador/pontuar.mjs: `--saida <dir>` (antes escrevia sempre em docs/auditoria/eval/...), colunas memoriaPicoMb/lentidao/navegador no resumo.
  Dados brutos em ~/babel-bancada/navegador/resultados; pontuação em .../pesquisa/pontuacao/resumo.json.
