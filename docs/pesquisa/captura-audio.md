# Captura de áudio no navegador: o que dá, o que não dá, e por quê (2026-08-27)

A pergunta que motivou este documento: "dá para capturar o áudio quando a pessoa compartilha uma
JANELA (um jogo, o Discord), e não só uma aba do navegador?"

## A matriz real (Chrome/Edge no Windows)

| Superfície escolhida no picker | Vídeo | Áudio                             | Observações                                                                                                                                                                       |
| ------------------------------ | ----- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guia (aba do navegador)        | sim   | **sim**                           | marcar "Compartilhar áudio da guia". A rota mais confiável.                                                                                                                       |
| Tela inteira (monitor)         | sim   | **sim**                           | marcar "Compartilhar áudio do sistema". Captura o que toca no PC (jogos, Discord, players), **menos o som do próprio Chrome** (ver abaixo). É a rota para apps fora do navegador. |
| Janela                         | sim   | **sim** (Chrome recente, ex. 153) | o seletor passou a oferecer "Compartilhar áudio do sistema" também na Janela: é o MESMO áudio do sistema da Tela inteira, não o áudio só daquela janela.                          |

**Atualização 2026-09-27** (`openspec/audits/2026-09-27-audio-do-sistema/relatorio.md`): sem
`restrictOwnAudio`, o Chrome abre o áudio de janela/tela pelo loopback do WASAPI da saída padrão
pedindo estéreo; numa saída configurada como **5.1/7.1** o Windows recusa (0x88890008,
AUDCLNT_E_UNSUPPORTED_FORMAT) e o `getDisplayMedia` falha com `NotReadableError: Could not start
audio source`, com qualquer constraint de DSP. Com `audio.restrictOwnAudio: true` o Chrome usa o
loopback **por processo** (`loopbackWithoutChrome`), que abre em qualquer layout. O app pede sempre
assim; o preço é que o som tocando dentro do Chrome não entra na janela/tela (para isso: a aba).

Firefox: não entrega áudio em `getDisplayMedia` no Windows (nem aba). Safari: sem áudio de captura.

## O que o app faz para espremer o máximo (src/gateway/capture/systemAudio.ts)

`getDisplayMedia` é chamado com as opções completas:

- `systemAudio: 'include'`: pede ao Chrome para oferecer o áudio do sistema na aba Tela inteira;
- `monitorTypeSurfaces: 'include'`: garante a aba "Tela inteira" no picker;
- `selfBrowserSurface: 'exclude'`: esconde a própria janela do Babel (evita eco);
- `surfaceSwitching: 'include'`: permite trocar a aba compartilhada sem reabrir o picker;
- `audio: { suppressLocalAudioPlayback: false }`: o som continua tocando normalmente no PC;
- `audio: { restrictOwnAudio: true }`: loopback por processo (abre em saídas 5.1/7.1, exclui o som do Chrome);
- `audio: { echoCancellation/noiseSuppression/autoGainControl: false }`: sem DSP de chamada.

Quando a escolha vem sem áudio, o erro agora é TIPADO (`JANELA_SEM_AUDIO` /
`SEM_AUDIO_COMPARTILHADO`) e a tela de Captura abre um guia com o passo a passo e o botão
"Escolher de novo" (o picker só reabre com um gesto novo do usuário; isso é regra do navegador).
Se o Windows ainda assim recusar o áudio (`AUDIO_DA_TELA_INDISPONIVEL`), o seletor NÃO reabre
sozinho: o guia oferece "Escolher a aba" e "Usar o loopback", e a falha fica lembrada no navegador
para a dica da rota recomendar esses caminhos antes do próximo clique. Diagnóstico para o usuário:
`/diagnostico-audio.html`.

## Então como cobrir jogos e apps HOJE

1. **Tela inteira + "áudio do sistema"** — funciona no Chrome/Edge do Windows e captura qualquer
   app. É o caminho recomendado na interface.
2. **Dispositivo de loopback (VB-Audio Cable / Stereo Mix)** — o sistema inteiro vira um
   "microfone". Rota à prova de falhas, exige instalação única (edição completa oferece o guia).
3. **Servidor local WASAPI** (edição completa/self-host) — captura a saída padrão do Windows sem
   picker nenhum. É a base da futura versão instalada, a rota definitiva para "traduzir qualquer
   app com dois cliques" (fase futura registrada no plano).

## O que fica de fora por decisão

Capturar o áudio de UM app específico (só o Discord, só o jogo) sem instalar nada: o navegador
não oferece; o WASAPI por-processo exige app nativo (fase da versão instalada).
