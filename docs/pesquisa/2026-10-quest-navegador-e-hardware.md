# Quest: navegador, hardware e recursos nativos (pesquisa de 01/10/2026)

Condensado de duas pesquisas na web e da leitura do código (main `d65b28f`). A = fonte oficial, B = relato de
comunidade, C = não encontrado. Corrige a pesquisa de setembro
(`2026-09-auditoria-seguranca-performance-dispositivos.md` §3), que supôs o Quest sem `getDisplayMedia`.

## O que o código fazia no Quest até 01/10/2026 (lido, não medido no aparelho)

- `src/lib/dispositivo/perfil.ts`: o Quest é reconhecido pelo UA (`OculusBrowser|Quest`). `capturaDoSistema = getDisplayMedia existe`.
- `src/components/views/LiveCapture.tsx:627,691,2557`: com `getDisplayMedia` presente, `systemEnabled = true` ("o som do
  computador entra sempre"), `micEnabled` nasce desligado e `semSomDoComputador` só é verdadeiro para celular. Ou seja: num
  Quest com Browser >= 36.5 o app segue o CAMINHO DO DESKTOP e pede compartilhamento de tela ao iniciar.
- `src/gateway/capture/systemAudio.ts:143-168`: `getDisplayMedia` com vídeo a 1 fps 640x360 (a API exige vídeo; parar a faixa
  encerra o áudio na "tela inteira" do desktop).
- `src/lib/dispositivo/orcamentoDeThreads.ts`: no modo leve o Whisper usa até 2 threads, o tradutor 1, o VAD roda o ONNX na
  thread principal, a impressão de voz 1.
- `src/lib/dispositivo/sonda.ts:469-487`: a sonda e o microbenchmark (WASM + WebGPU) são agendados no INÍCIO DA CAPTURA.
- `src/gateway/sttRouter.ts`: Quest = Whisper base q8 (80 MB) em WASM, ou WebGPU se a sonda provar adaptador real; tradutor
  opus-mt (~110 MB). Sem nuvem na edição estática.
- O e2e (`tests/e2e-estatica/perfis-de-dispositivo.e2e.ts`) emula o Quest SEM `getDisplayMedia`: o caminho real nunca foi testado.
- `docs/testar-no-quest.md`: roteiro de medição por adb; sem resultado registrado.

## Navegador (Meta Quest Browser)

- A: Chromium; 146.0 (21/04/2026) = M146; 150.1 em 28/08/2026; ~1 release/mês. https://developers.meta.com/horizon/release-notes/web/
- A: UA desktop (padrão) `X11; Linux x86_64; Quest 3 ... OculusBrowser/... Chrome/...`; modo mobile tem `Mobile VR`. 3S reporta `Quest 3`.
  https://developers.meta.com/horizon/documentation/web/browser-specs/
- A (conferido por mim): 36.5 (14/01/2025) "Screen sharing is now available on all websites" e "Install to Library".
  https://developers.meta.com/horizon/downloads/package/browser/36.5/
- B: compartilhar a "visão do headset" enviou imagem COM áudio (Discord/StreamYard, set/2025); se outro app monopoliza o
  microfone, o do navegador é desativado. https://zenn.dev/yushimatenjin/articles/quest-standalone-livestream
- A: WebGPU desde 32.0 (27/02/2024). https://developers.meta.com/horizon/downloads/package/browser/32.0/ ; em WebXR só experimental (146.0+).
- B: Web Speech (reconhecimento) não funciona no Quest (2022-2025): fóruns Meta 1168273, 1189761, 1246408. C: nada de 2026.
- A (Chrome): Translator/Language Detector só desktop. https://developer.chrome.com/docs/ai/get-started ; C: nada no Quest.
- A: PWA via `@meta-quest/bubblewrap-cli` (TWA); mesma mídia do Browser. https://developers.meta.com/horizon/documentation/web/pwa-packaging/
- A: até 3 janelas 2D sobre app imersivo; entrada de áudio permitida sem foco. https://developers.meta.com/horizon/resources/vrc-quest-input-4/
- C: `hardwareConcurrency`, `deviceMemory`, limite por aba, constraints do microfone, áudio na trilha do compartilhamento, throttling sem foco.

## Hardware e sistema

- A: Quest 2 = XR2 Gen 1, 6 GB; Quest 3 = XR2 Gen 2, 8 GB. Limite por app 4,4 GiB (Q2/Pro) e 5,75 GiB (Q3/3S).
  https://developers.meta.com/horizon/essentials/memory-ram
- A: níveis de CPU: Q3/3S nível 4 = 1,92 GHz (máx. 2,36); Q2 nível 4 = 1,48 GHz. No Q2/Pro o app tem 3 núcleos.
  https://developers.meta.com/horizon/documentation/native/android/os-cpu-gpu-levels/ e /essentials/boost-cpu-gpu-levels/
- A: térmico: sob carga contínua o sistema reduz clocks. https://developers.meta.com/horizon/essentials/thermal
- B: XR2 Gen 2 = 2 núcleos de desempenho + 4 de eficiência. https://uploadvr.com/snapdragon-xr2-gen-2
- B: Whisper-tiny (Unity Sentis) no Quest 2 trava na carga e engasga a renderização.
  https://huggingface.co/unity/inference-engine-whisper-tiny/discussions/2
- C: nenhum relato de transformers.js/onnxruntime-web no navegador do Quest; nenhum RTF medido em XR2.

## Recursos nativos de fala

- A: Live Captions do sistema (Acessibilidade > Audição). B: desde a v76 vale para qualquer app, modelo local ~150 MB, SEM tradução.
  https://www.meta.com/help/quest/674999931400954/ ; https://www.uploadvr.com/quest-v76-no-longer-lets-you-uninstall-horizon-worlds/
- A: ditado do teclado (no aparelho, opcional); só como digitação. https://www.meta.com/help/quest/463323051789865/
- B: `SpeechRecognizer` do Android sem serviço no Quest; sem motor TTS Android.
- A: app NATIVO pode capturar o áudio do aparelho (MediaProjection + AudioPlaybackCapture), mas a política limita a
  "casting, live streaming, or screen sharing". https://developers.meta.com/horizon/documentation/native/native-media-projection/
- A: Voice SDK/Wit.ai: Unity/Unreal, nuvem, grátis; português em prévia.

## Padrão do mercado

Óculos/headsets de legenda (XRAI Glass, Even Realities G2, TranscribeGlass) mandam o trabalho para o celular ou a nuvem; o visor só
exibe. Exceções no aparelho: Xander (Vuzix) e a tradução do Ray-Ban Meta (pacotes baixados, latência 2,7 s).

## Só medindo no aparelho

1. `hardwareConcurrency`, `deviceMemory`, `crossOriginIsolated`, adaptador WebGPU e limites.
2. O compartilhamento entrega trilha de áudio? Parar a faixa de vídeo mantém o áudio? Quanto custa o compartilhamento sozinho?
3. Microfone com AEC/NS/AGC desligados capta os alto-falantes do headset?
4. RTF de Moonshine tiny e Whisper tiny/base com 1 e 2 threads (WASM) e na GPU.
5. Memória de pico e comportamento com a janela sem foco / sobre app imersivo.

## O que mudou no código (change `quest-caminho-leve`)

- O Quest é só microfone por decisão do perfil (`capturaDoSistema` falso), com ou sem `getDisplayMedia`.
- Uma thread por motor no Quest; sem o microbenchmark no início da captura; nenhum parcial.
- Só microfone: o modelo segue o idioma da FALA; em inglês, Moonshine tiny no Quest.
- A página `/diagnostico` mede, no aparelho, os itens da lista acima.

Medida no PC de desenvolvimento (Chrome 152, 12 núcleos, 01/10/2026), 11 s de fala: Moonshine tiny em 1
thread, fator 0,05; Whisper base q8 em 1 thread, 0,27; em 2 threads, 0,16. O Moonshine é cerca de 5 vezes
mais rápido que o Whisper base no mesmo núcleo. No Quest falta medir.
