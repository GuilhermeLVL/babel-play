# Áudio do sistema por Janela / Tela inteira — depuração (2026-09-27)

Branch `fix/audio-do-sistema` (a partir de `main` 5dbf181e). Reproduzido na máquina do dono
(Windows 11 Pro 26100, Chrome estável **153.0.8010.53**, instalado em 21/09/2026).

## Resumo

- **Causa raiz provada:** a saída de som padrão do Windows está configurada em **5.1** (Realtek,
  6 canais, 48 kHz, float32). Sem `restrictOwnAudio`, o Chrome abre o áudio de Janela/Tela pelo
  loopback WASAPI **do dispositivo** (`deviceId: loopback`) pedindo **estéreo**. O Windows recusa
  esse formato no loopback: `IAudioClient::Initialize` → **0x88890008
  (AUDCLNT_E_UNSUPPORTED_FORMAT)** → `NotReadableError: Could not start audio source`.
- **Não é o app.** Falha igual com `{video:true, audio:true}` numa página vazia, com qualquer
  combinação de DSP, com as constraints anteriores a 24/09 e com as do "modo compatível".
- **O que funciona:** `audio.restrictOwnAudio: true`. O Chrome passa a usar o loopback **por
  processo** (`deviceId: loopbackWithoutChrome`), que abre em qualquer layout de saída. Janela e
  Tela inteira passaram a entregar áudio (com sinal) no Chrome real e no app real.
- **Correção:** o app pede sempre `restrictOwnAudio: true`. A repetição "modo compatível", que
  reabria o seletor para falhar igual, saiu. Se o Windows ainda recusar, o erro vira
  `AUDIO_DA_TELA_INDISPONIVEL`, com texto curto e os botões "Escolher a aba" / "Usar o loopback".
  A falha fica lembrada no navegador. A captura de ABA não mudou.

## 1. Estado do áudio do Windows (só leitura)

Lido com `Get-PnpDevice -Class AudioEndpoint`, o registro `MMDevices\Audio\Render` e a Core Audio
(`IMMDeviceEnumerator::GetDefaultAudioEndpoint` + `IAudioClient::GetMixFormat`). Nada foi alterado.

| Item | Valor |
| --- | --- |
| Saída padrão (console, multimídia e comunicação) | **Alto-falantes (Realtek High Definition Audio)**, `{d80430a1-…}` |
| Bluetooth / hands-free | **não** (Realtek on-board; o headset CORSAIR HS80 não está presente) |
| Formato de mixagem | WAVE_FORMAT_EXTENSIBLE, **6 canais**, 48000 Hz, 32 bits float, máscara `0x60F` (FL FR FC LFE SL SR) = **5.1** |
| Modo exclusivo (Realtek) | permitido = 0, prioridade = 0 (desligado) |
| Volume mestre | 37 % (−14,8 dB), sem mudo |
| Outras saídas ativas | "3 - SFP24DFI FLAT" (AMD HDMI, 2 canais, exclusivo permitido), Steam Streaming Speakers/Microphone |
| Captura padrão | Microfone (Realtek), 2 canais, 192 kHz |
| Stereo Mix / VB-Cable | **não existem** nesta máquina (nenhum endpoint de captura de loopback) |
| Serviços | Audiosrv e AudioEndpointBuilder em execução, início automático |

Sonda WASAPI direta (`evidencias/wasapi-loopback-probe.ps1`: inicializa um cliente de loopback,
não chama `Start`, libera):

```
formato de mixagem do dispositivo + LOOPBACK (ch=6):          IsFormatSupported=0x00000000 Initialize=0x00000000
2ch float 48k (o que o Chrome pede) + LOOPBACK (ch=2):        IsFormatSupported=0x00000000 Initialize=0x88890008
2ch float 48k + LOOPBACK + AUTOCONVERTPCM|SRC_DEFAULT_QUALITY: IsFormatSupported=0x00000000 Initialize=0x00000000
```

O Windows responde "suportado" ao `IsFormatSupported` com 2 canais, mas o `Initialize` do loopback
recusa. É exatamente o caminho do Chrome (abaixo).

## 2. Reprodução com o Chrome real

**Como:** Playwright headful com `channel: 'chrome'` (o Chrome 153 instalado, perfil temporário
separado do perfil do dono), página mínima em `http://localhost` (`evidencias/pagina-matriz.html`).
As flags de automação não servem: `--auto-select-desktop-capture-source="Entire screen"` escolhe a
tela mas **não liga o áudio** (0 faixas); `--use-fake-ui-for-media-stream` entrega um dispositivo
"Fake audio" (não é loopback). A solução foi dirigir o **seletor real** por **UI Automation** do
Windows (`evidencias/uia-drive.ps1`): escolhe a aba (Chrome Tab / Window / Entire Screen), o item,
liga "Share with system audio" e clica em "Share with Audio". Um clique do Playwright por caso dá o
gesto do usuário. Sinal: vídeo do YouTube tocando no Chrome do dono (outro processo) ou um tom de
teste tocado por um processo PowerShell próprio.

### Matriz (seletor real, áudio do sistema LIGADO)

| Caso | constraints de áudio | Tela inteira | Janela | Aba |
| --- | --- | --- | --- | --- |
| `minimo` | `audio: true` | **NotReadableError** | **NotReadableError** | OK (Tab audio) |
| `sup_false` | `{suppressLocalAudioPlayback:false}` | NotReadableError | — | — |
| `dsp_off` | EC/NS/AGC `false` | NotReadableError | NotReadableError | — |
| `app_rico` | pedido do app 24/09–27/09 (sem DSP + systemAudio etc.) | NotReadableError | NotReadableError | OK |
| `app_compat` / `app_antigo` | pedido anterior a 24/09 (= "modo compatível") | NotReadableError | NotReadableError | OK |
| `sysaudio` | `audio:true` + `systemAudio:'include'` | NotReadableError | — | — |
| `win_system` | `windowAudio:'system'` | NotReadableError | NotReadableError | — |
| `win_window` | `windowAudio:'window'` | NotReadableError | abre **sem** faixa (o seletor tira o toggle) | — |
| `monitor` / `window` | `video:{displaySurface}` | NotReadableError | NotReadableError | — |
| `mono_48k` | `{channelCount:2, sampleRate:48000}` | NotReadableError | — | — |
| **`restrict_own`** | `{restrictOwnAudio:true}` | **OK**, `loopbackWithoutChrome`, pico 0,25 | **OK**, pico 0,19 | OK, `restrictOwnAudio` ignorado |
| **`rich_restrict`** | pedido NOVO do app (sem DSP + restrictOwnAudio) | **OK**, 2 canais, pico 0,04 | **OK**, pico 0,04 | OK (Tab audio, pico 0,03 = o tom da aba) |
| `compat_restrict` | DSP padrão + restrictOwnAudio | OK, pico 0,24 | OK, pico 0,16 | OK |
| `rich_restrict_ideal` | `restrictOwnAudio:{ideal:true}` | OK | — | — |

Dados brutos: `evidencias/resultados.jsonl` (uma linha por tentativa, com `getSettings()` da faixa).
Tela inteira e Janela com áudio do sistema usam a MESMA fonte ("System Audio"): o Chrome 153 não
tem áudio "só da janela" no Windows.

### O log do Chrome (`--enable-logging --vmodule=*wasapi*=2`)

Falha (`evidencias/chrome-log-loopback-falha.txt`):

```
WASAPIAudioInputStream({device_name=loopback}, … channels: 2, sample_rate: 48000 …)
WASAPIAudioInputStream => (audio loopback device is of type: ENDPOINT)
UpdateFormats => (audio engine format=[… nChannels: 2, nSamplesPerSec: 48000 … IEEE_FLOAT])
DesiredFormatIsSupported()
InitializeAudioEngine => (ERROR: IAudioClient::Initialize=[HRESULT: 0x88890008 …])
WAIS::Open => (ERROR: result=AUDIO_CLIENT_INIT_FAILED, hresult=0x88890008 …)
```

Sucesso (`evidencias/chrome-log-loopbackWithoutChrome-ok.txt`): mesmo pedido estéreo, mas
`device_name=loopbackWithoutChrome`, `audio loopback device is of type: PROCESS`,
`InitializeAudioEngine()` sem erro, `Start`, 10 ms por pacote, zero glitches.

## 3. Hipóteses

| Hipótese | Veredito | Evidência |
| --- | --- | --- |
| (a) constraints do app | **refutada** | `audio:true` numa página vazia falha igual; todas as variações de DSP falham |
| (b) o app segurando áudio (AudioContext, pré-aquecimento, VAD, MediaRecorder, loopback anterior) | **refutada** | a página mínima não tem nada disso e falha; o mesmo erro no 1º clique de um perfil novo |
| (c) ambiente do Windows | **confirmada**, com precisão: saída padrão em **5.1** + loopback de dispositivo em estéreo sem AUTOCONVERTPCM | sonda WASAPI 0x88890008 com 2 canais, OK com 6; log do Chrome idêntico. Não é Bluetooth nem modo exclusivo |
| (d) regressão do app em 24/09 (39f69d7) | **refutada** | as constraints exatas de `39f69d7~1` (`app_antigo`) falham igual. O "modo compatível" (d0f3948) mudava só o DSP e por isso nunca podia funcionar |

Sobre "antes de 24/09 a Tela inteira funcionava": com esta saída em 5.1, nenhuma versão do app
funcionaria no Chrome 153. O mais provável é que o layout 5.1 ou o Chrome 153 (instalado em 21/09,
aplicado ao reiniciar o navegador) tenha mudado nesse intervalo. O painel do Realtek e atualizações
de driver costumam gravar essa configuração. Não há registro no Windows que date a mudança de
layout, então isto fica como inferência.

## 4. Correção (TDD)

Testes primeiro: `tests/captura-audio-da-tela.test.ts` (substitui `captura-tela-inteira-retry`), 11
casos. Antes da correção, 10 falhavam (a ABA com uma chamada só já passava); depois, os 11 passam.

`src/gateway/capture/systemAudio.ts`:
- `constraintsDeDisplay()` agora sempre pede `restrictOwnAudio: true`, junto com o que já pedia
  (sem DSP, `suppressLocalAudioPlayback:false`, `systemAudio`, `monitorTypeSurfaces`,
  `selfBrowserSurface:'exclude'`, `surfaceSwitching`);
- `acquireDisplayStream()`: **uma** chamada por clique. Saíram o "modo compatível" e o estado
  `proximaAquisicaoCompativel`;
- `erroDaAquisicao()`: `NotReadableError`/`AbortError`/`OverconstrainedError` com "audio" viram
  `AUDIO_DA_TELA_INDISPONIVEL` com a mensagem curta "O Windows não liberou o áudio desta janela/tela.
  Use a aba do Chrome (com "compartilhar áudio da guia") ou o dispositivo de loopback.". Com "video"
  viram `TELA_INDISPONIVEL`, sem culpar o áudio. `NotAllowedError` mantém a mensagem de cancelado;
- **memória do aparelho** (`localStorage` `babel.captura.audioDaTelaFalhou`, com try/catch):
  guarda a falha e a esquece quando uma janela/tela volta a entregar áudio. A aba não conta.
  Exportada como `audioDaTelaFalhouNesteAparelho()`;
- o "Testar a captura" (`probeSystemAudio`) usa o mesmo diagnóstico;
- a mensagem de "janela sem áudio" deixou de dizer que a janela não tem áudio no Chrome.

`src/lib/captura/fontesDeAudio.ts` e `src/components/views/LiveCapture.tsx`:
- `AUDIO_DA_TELA_INDISPONIVEL` abre o guia "O Windows não liberou o áudio", com dois caminhos e os
  botões **Escolher a aba** (reabre o seletor) e **Usar o loopback** (só aparece se houver servidor
  local ou dispositivo de loopback detectado). O segundo troca a rota (persistida em
  `settings.ui.systemSource`), escolhe o primeiro loopback detectado se nenhum estiver escolhido (para
  não abrir o microfone) e já inicia;
- a dica da rota "Compartilhar" passou a dizer: "Janela e tela levam o som do computador, menos o
  do próprio Chrome: vídeo numa aba, compartilhe a aba". Com a falha lembrada, acrescenta: "Neste
  computador o Windows já recusou o áudio da janela/tela: prefira a aba ou o dispositivo de
  loopback.";
- o erro do "Testar" também abre o guia.

`docs/captura-audio.md`: a matriz foi corrigida (a Janela tem áudio do sistema no Chrome recente)
e ganhou a seção sobre o 5.1 e o `restrictOwnAudio`.

**Custo da correção:** com o loopback por processo, **o som que toca dentro do Chrome não entra**
na captura de Janela/Tela. Isso inclui outra aba (YouTube no mesmo Chrome) e a voz sintetizada do
próprio Babel. A voz do Babel fora da captura é um ganho, porque evita que o app transcreva a si
mesmo. Para conteúdo numa aba, o caminho certo continua sendo compartilhar a ABA, que não mudou.
Discord, jogos, Spotify e players fora do Chrome entram normalmente.

### Verificação no app real (edição estática desta branch)

`npm run build:estatica`, depois `tests/e2e-estatica/_servidor-estatico.mjs`, depois `/capturar`,
"Iniciar captura" e o seletor real via UIA (`evidencias/app-real.mjs`):

```
Tela inteira: superfície: monitor | vídeo: 1 | áudio: 1 · faixa de áudio ✓ System Audio · captura do sistema ATIVA ✓
Janela:       superfície: window  | vídeo: 1 | áudio: 1 · faixa de áudio ✓ System Audio · captura do sistema ATIVA ✓
```

Sem a correção, o fluxo termina em `NotReadableError`, como mostra o console de produção do dono. É o mesmo erro da página mínima com o pedido de `main` (`app_rico`).
Nesse teste, o nível medido pelo app nos primeiros 2,5 s ficou baixo (RMS 0,0000–0,0004 com o tom
de teste a 37 % de volume), e o aviso "faixa SILENCIOSA" apareceu. Na página mínima, o mesmo
loopback deu picos de 0,02 a 0,25 com conteúdo real. O fluxo abre. Falta o dono confirmar o nível
com conteúdo de verdade (Discord/jogo) no uso normal.

## 5. Página de diagnóstico para o dono

`public/diagnostico-audio.html`, publicada em `/diagnostico-audio.html` (`noindex`, sem rede, sem
o app). Mostra a versão do Chrome, os **canais da saída de som** (`AudioContext.destination.maxChannelCount`:
6 = 5.1, a pista da causa) e se o navegador suporta `restrictOwnAudio`. Depois roda 5 casos: o
pedido atual do app, `audio:true`, só `restrictOwnAudio`, o pedido anterior a 24/09 e o de
24/09–27/09. Um clique encadeia os seletores enquanto o navegador aceitar. Se recusar, pede outro
clique. No fim, mostra uma conclusão e o botão "Copiar relatório" (JSON).

Exercitada nesta máquina com o seletor real (`evidencias/diag.mjs`): pedido do app OK
(`loopbackWithoutChrome`), `audio:true` NotReadableError, só restrict OK, pedido antigo
NotReadableError, 24/09–27/09 NotReadableError. A conclusão foi "Mesma causa do relatório…".

## 6. Instruções para o dono

1. Depois do deploy desta branch: Captura, rota "Compartilhar", **Iniciar**. No seletor, escolha
   **Janela** ou **Tela inteira** e ligue **"Compartilhar áudio do sistema"**. Deve abrir de primeira.
2. Som que toca **dentro do Chrome** (YouTube em outra aba) não entra pela Janela/Tela. Para isso,
   compartilhe a **aba** com "Compartilhar áudio da guia".
3. Se ainda falhar, abra `https://<domínio>/diagnostico-audio.html`, clique em **Testar**, escolha a
   Janela/Tela com o áudio ligado em cada seletor e mande o relatório copiado.
4. Alternativa sem mexer no app (opcional, **só se o dono quiser**; este trabalho não alterou nada):
   configurar os alto-falantes Realtek como **Estéreo** em Som → Reprodução → Configurar também faz o
   loopback de dispositivo abrir. Não é necessário com a correção.

## 7. Gates

| Gate | Resultado |
| --- | --- |
| `tsc --noEmit` | 0 erros |
| `eslint src server server.ts tests --max-warnings 0` | 0 |
| `vitest run --maxWorkers=3` | 521 arquivos, 5279 passaram, 2 pulados |
| `i18n:orfas` | 0 órfãs |
| `build:estatica` | ok (`diagnostico-audio.html` em `dist/`) |
| e2e estático (`playwright.estatica.config.ts`) | 45 passaram, 4 pulados, 1 falhou: `jogos.e2e.ts` "Memória: fecha todos os pares" [mobile-375], timeout de 180 s. É intermitente e não tem relação com a captura: com `--repeat-each=3` passou 5 de 6 |

## Evidências (`evidencias/`)

- `pagina-matriz.html` e `run.mjs`: a matriz (modos `uia`, `autoselect`, `fakeui`);
- `uia-drive.ps1`: dirige o seletor real do Chrome por UI Automation;
- `wasapi-loopback-probe.ps1` e `wasapi-probe.txt`: a sonda WASAPI (só leitura);
- `chrome-log-loopback-falha.txt` e `chrome-log-loopbackWithoutChrome-ok.txt`: os logs do Chrome;
- `resultados.jsonl`: todas as tentativas;
- `diag.mjs`: roda a página de diagnóstico com o seletor real;
- `app-real.mjs` e `tom.ps1`: o app real construído, com um tom de teste fora do Chrome.
