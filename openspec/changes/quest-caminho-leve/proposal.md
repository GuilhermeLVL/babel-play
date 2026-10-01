## Why

No Meta Quest o app está inutilizável: ao iniciar a captura o headset inteiro trava (relato do dono,
01/10/2026; no celular a Fase A trouxe ganho). O dono só precisa de áudio e microfone ali, não da tela.

A leitura do código e a pesquisa (`docs/pesquisa/2026-10-quest-navegador-e-hardware.md`) apontam três causas,
nenhuma medida no aparelho ainda:

- **O Quest seguia o caminho do computador.** `capturaDoSistema` era "a API `getDisplayMedia` existe". O
  Meta Quest Browser a tem desde a 36.5 (14/01/2025). No headset de verdade o app pedia o compartilhamento
  da visão inteira e nascia com o microfone desligado. A emulação dos testes tirava a API, então o caminho
  real nunca foi exercitado.
- **Carga demais para o que o headset dá a um app.** A Meta documenta cerca de 3 núcleos por app em clock
  reduzido. O app punha ali o Whisper com 2 threads, o tradutor com até 2, o VAD na thread principal, um
  parcial por fala e o microbenchmark da sonda, este último no início da captura.
- **O modelo errado no modo só microfone.** A rota olhava o idioma de destino, que ali ninguém decodifica:
  um vídeo em inglês legendado para português caía no Whisper base em vez do Moonshine.

## What Changes

- **Etapa 1, o caminho leve do Quest.**
  - `capturaDoSistema` passa a ser decisão do perfil: no Quest, nunca. O microfone nasce ligado.
  - Uma thread por motor no Quest (`distribuirThreads`, campo `quest`).
  - A sonda do início da captura vai sem o microbenchmark no Quest (`OpcoesDaSonda.semBenchmark`).
  - Nenhum parcial no Quest (`querParcial`).
  - Só microfone (`soMicrofone`): o modelo segue o idioma da fala. Em inglês, Moonshine tiny no Quest.
- **Etapa 2, a página `/diagnostico`.** Mede no próprio aparelho, sem cabo: os sinais do navegador, o
  microfone com e sem tratamento de voz, o compartilhamento de tela (áudio junto, áudio sem vídeo, custo) e a
  velocidade de cada modelo de transcrição com as travadas da tela. Resultado na tela e em JSON.

Fica de fora, à espera das medidas: tirar o VAD da thread principal (o `env.wasm.proxy` do ORT já foi
tentado e quebra com o vad-web, ver `systemAudio.ts`), o som do headset pelo compartilhamento, o microfone
sem cancelamento de eco, e a decisão de onde fica o trabalho pesado (headset, nuvem ou celular).

## Impact

- Código: `src/lib/dispositivo/{perfil,orcamentoDeThreads,sonda,diagnostico}.ts`, `src/gateway/sttRouter.ts`,
  `src/lib/captura/pipelineDeFala.ts`, `src/components/views/{LiveCapture,Diagnostico}.tsx`, rotas e `App.tsx`.
- Comportamento fora do Quest: só a regra do `soMicrofone` (celular e desktop praticando a própria voz em
  inglês passam ao Moonshine). O resto é condicionado ao perfil `quest`.
- Risco: com 1 thread a legenda em português pode ficar mais lenta no Quest. É a troca escolhida (o headset
  não travar primeiro); a etapa 2 mede se 2 threads cabem.
