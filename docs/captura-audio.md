# Captura de áudio no navegador: o que dá, o que não dá, e por quê (2026-08-27)

A pergunta que motivou este documento: "dá para capturar o áudio quando a pessoa compartilha uma
JANELA (um jogo, o Discord), e não só uma aba do navegador?"

## A matriz real (Chrome/Edge no Windows)

| Superfície escolhida no picker | Vídeo | Áudio | Observações |
| --- | --- | --- | --- |
| Guia (aba do navegador) | sim | **sim** | marcar "Compartilhar áudio da guia". A rota mais confiável. |
| Tela inteira (monitor) | sim | **sim** | marcar "Também compartilhar o áudio do sistema". Captura TUDO que toca no PC (jogos, Discord, players). É a rota para apps fora do navegador. |
| **Janela** | sim | **não** | Limitação de plataforma: o Windows não expõe áudio por janela para o navegador, e o Chrome nem mostra o checkbox (o picker avisa "para compartilhar áudio, use guia ou tela"). Nenhuma constraint muda isso. |

Firefox: não entrega áudio em `getDisplayMedia` no Windows (nem aba). Safari: sem áudio de captura.

## O que o app faz para espremer o máximo (src/gateway/capture/systemAudio.ts)

`getDisplayMedia` é chamado com as opções completas:

- `systemAudio: 'include'`: pede ao Chrome para oferecer o áudio do sistema na aba Tela inteira;
- `monitorTypeSurfaces: 'include'`: garante a aba "Tela inteira" no picker;
- `selfBrowserSurface: 'exclude'`: esconde a própria janela do Babel (evita eco);
- `surfaceSwitching: 'include'`: permite trocar a aba compartilhada sem reabrir o picker;
- `audio: { suppressLocalAudioPlayback: false }`: o som continua tocando normalmente no PC.

Quando a escolha vem sem áudio, o erro agora é TIPADO (`JANELA_SEM_AUDIO` /
`SEM_AUDIO_COMPARTILHADO`) e a tela de Captura abre um guia com o passo a passo e o botão
"Escolher de novo" (o picker só reabre com um gesto novo do usuário; isso é regra do navegador).

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
