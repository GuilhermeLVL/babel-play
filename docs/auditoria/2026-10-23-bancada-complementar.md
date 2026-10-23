# Bancada complementar: Parakeet × Moonshine em inglês e reconhecimento local do Chrome (23/10/2026)

Complementa `2026-10-23-bancada-mac.md` (método, pontuador e ambiente iguais). Mac M5 Pro (15 núcleos, 24 GB), Chrome 155.0.8059.86 (`channel: 'chrome'`, Playwright 1.64.1, headless), página isolada (COOP/COEP), transformers.js 4.2.0 e onnxruntime-web do repo. Pontuador do repo (`filtrarAlucinacao` + WER de `src/core/eval`, bootstrap de 1000). RTF = tempo de decodificação / duração do áudio, sem carga nem aquecimento.

## 1. Parakeet v3 int8 × Moonshine base q8, inglês (FLEURS en, 100 falas, WASM, 4 threads)

| Sistema           | WER % [IC 95%]   | CER % | RTF   | p50 / p95 por fala | Carga | Pico de memória (RSS) |
| ----------------- | ---------------- | ----- | ----- | ------------------ | ----- | --------------------- |
| Parakeet v3 int8  | 7,1 [5,6–8,5]    | 3,8   | 0,090 | 0,84 s / 1,61 s    | 1,5 s | 3.920 MB              |
| Moonshine base q8 | 13,6 [10,5–17,2] | 7,8   | 0,033 | 0,31 s / 0,55 s    | 6,0 s | 1.958 MB              |

Diferença pareada (mesmas 100 falas): Parakeet − Moonshine = −6,49 pts [−9,72; −3,65], significativa a favor do Parakeet; só 15 das 100 transcrições são idênticas. O Moonshine devolveu 3 transcrições vazias (contadas como erro); o Parakeet, nenhuma.

Leitura: em inglês o Parakeet erra cerca de metade do que o Moonshine base, mas é 2,7x mais lento (ainda 11x mais rápido que a fala) e usa 2,0x a memória (mesma razão do Whisper base q8 na bancada anterior). A carga de 1,5 s do Parakeet é com os ONNX já em disco local (sem download); a do Moonshine inclui leitura do cache do perfil.

Limitações: uma máquina, uma rodada por célula; havia outros processos de desenvolvimento (tsc, testes) usando CPU no Mac durante a rodada, o que pode inflar os tempos (o RTF do Parakeet em 4 threads, 0,090, ficou dentro da faixa 0,095 medida em pt/es); a memória é a soma do RSS dos processos do Chrome da bancada, não comparável 1 para 1 com working set do Windows; Moonshine base é inglês-only, então não há comparação nos outros idiomas.

## 2. Reconhecimento local do Chrome (`SpeechRecognition`, `processLocally: true`): NÃO MEDIDO

Resultado: **não foi possível obter nenhuma transcrição local**, então não há WER nem RTF para pt, es e en. Prazo de 1 h respeitado (parei em cerca de 40 min).

O que funciona (verificado):

- A API existe no Chrome 155 (`SpeechRecognition.available/install`, `start(MediaStreamTrack)`).
- `install({langs, processLocally:true})` funciona SEM gesto do usuário: pt-BR 7,7 s, es-ES 7,5 s, en-US 12,1 s; `available()` passa de `downloadable` para `available`. Os pacotes SODA ficam no perfil (`SODA/1.2.12`, 25 MB; `SODALanguagePacks` pt-BR 68 MB, es-ES 153 MB, en-US 194 MB). Em nova execução do navegador o `available()` volta a dizer `downloadable` mesmo com os arquivos no perfil, e o `install()` responde em <1 ms; é preciso chamar `install()` em toda sessão antes de `start()`, senão `start()` dá `language-not-supported`.
- A entrada por `MediaStreamTrack` (AudioBufferSource → MediaStreamDestination, e também `<audio>.captureStream()`) é aceita por `start(track)`, e a faixa chega ao reconhecedor.
- Controle em nuvem (`processLocally: false`, mesma faixa, en, 1 fala de FLEURS): transcreve corretamente, com resultados parciais desde ~1,5 s e o final ao fim da fala. Portanto a faixa de áudio é inteligível e o caminho de entrada está certo. (Foi uma fala pública do FLEURS enviada ao serviço do Chrome, só como diagnóstico; nenhum dado de usuário.)

O que falha: com `processLocally: true`, mesma faixa e mesmas condições, o reconhecedor dispara `audiostart`, `soundstart`, `speechstart`, `speechend`, `audioend`, `end` (a detecção de som acontece) mas NUNCA emite `result` (nem parcial) nem `error`; o texto final é vazio. Testado em pt-BR, en-US (e es-ES carregado), com:

1. faixa por `AudioBufferSource` (buffer inteiro), com 3 s de espera antes de `stop()`;
2. faixa por `<audio>.captureStream()`;
3. microfone falso do Chrome (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>%noloop`, sem faixa): encerra em ~8 s com `no-speech`;
4. Chrome aberto direto (sem as flags do Playwright), conectado por CDP: mesmo `no-speech`;
5. iniciar a fala 10 s depois do `start()` (para o motor aquecer): nada.

Causa provável (não confirmada): o motor local (`libsoda`, arm64) não produz hipóteses neste ambiente (Chrome 155 + macOS 27/Darwin 27 de pré-lançamento, ou o componente SODA 1.2.12 com os pacotes baixados). Não consegui log do motor (`--enable-logging=stderr --v=1` não imprime nada de SODA). Não é o áudio (a nuvem entende a mesma faixa) nem falta de pacote (instalado, `available`). Próximos passos se o dono quiser insistir: repetir num Chrome estável em macOS estável / Windows, ou testar o Chrome Canary, com a mesma bancada.

Consequência para a decisão: não há medida própria do reconhecimento local do Chrome; qualquer uso dele no app fica sem número de qualidade da bancada, e este caminho é mais frágil do que parecia (precisa de `install()` por sessão e, aqui, não entregou texto).

## Arquivos (bancada, sem código de app)

- `scripts/eval-fala/bancada/navegador/chrome-local.html` e `chrome-local.mjs`: bancada do reconhecimento local (`--sonda` instala e informa a disponibilidade; sem ela, roda os conjuntos e grava no formato do `rodar.mjs`, pontuável por `pontuar.mjs`; `--modo audio` usa `<audio>.captureStream()`). Mede fala em tempo real, então o "RTF" dela seria ≥ 1 por construção; guarda também `latenciaAposFimMs`.
- `scripts/eval-fala/bancada/navegador/servidor.mjs`: rota `/chrome-local.html`.
- Dados brutos: `~/babel-bancada/navegador/resultados/{parakeet-v3_int8_wasm,moonshine-base_q8_wasm}__fleurs_en.json`.
