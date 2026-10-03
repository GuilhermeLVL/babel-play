## Context

`systemAudio.ts` já tem `acquireDisplayStream` (getDisplayMedia com `restrictOwnAudio`, sem DSP, vídeo mínimo de 1 quadro/s),
`startSystemLoopbackCapture` (Stereo Mix ou VB-Cable), `startServerLoopbackCapture` (WASAPI do servidor local) e as sondas
`probeSystemAudio`/`probeLoopback`. A seleção está em `LiveCapture.tsx:728` (`display`, `loopback`, `server`). O intérprete,
porém, só abre o microfone (`abrirMicrofoneNoLado`) e a captura de sistema é cortada por `soNoToque`. A direção da tradução
no intérprete vem do lado tocado (ou da detecção automática, Premium).

Fatos de plataforma (pesquisa de 02/10/2026): `getDisplayMedia({audio})` entrega áudio de **aba** em todo desktop Chromium e
áudio de **sistema** só no Windows/ChromeOS com tela inteira; janela, Safari, Firefox e macOS (sistema) não entregam. Áudio de
loopback ignora o cancelador de eco do navegador, e capturar o mix inteiro sem fone devolve a voz do outro com 250–450 ms
(laço de eco). `speechSynthesis` **não** permite escolher o dispositivo de saída; `AudioContext.setSinkId`/`HTMLMediaElement.setSinkId`
permitem, para áudio que o app produz.

## Goals / Non-Goals

**Goals:**
- Entender a outra pessoa na chamada em texto e voz, e falar de volta traduzido, com eco controlado.
- Cobrir primeiro o caminho de menor risco (aba, fone, só ouvir) e provar o caminho com microfone virtual antes de prometer.

**Non-Goals:**
- Mais de duas pessoas rotuladas (diarização de grupos). App nativo com microfone virtual embutido (alternativa futura).
- Gravar a chamada. Falar por cima do outro (half-duplex é aceito).
- macOS com áudio de sistema (só aba, ou driver virtual do usuário).

## Decisions

1. **Direção fixa por fonte.** `Eles` = fala do outro (idioma do outro → o meu); `Você` = minha fala (meu → o do outro). Dispensa a
   detecção automática de idioma e o Whisper obrigatório: mais barato e mais rápido. `controleDoInterprete` ganha o modo
   "fontes fixas" ao lado de "toque" e "automático". Dois pipelines independentes, cada um com seu VAD e STT.
2. **Captura de "Eles".** Ordem de preferência: (a) **aba** com `suppressLocalAudioPlayback: true` e `systemAudio: 'exclude'`
   (o app toca o original por um `GainNode`, então pode abaixar o volume durante a tradução, e a captura é antes da
   reprodução, sem laço); (b) **sistema** no Windows só com confirmação "estou de fone" e `restrictOwnAudio`; nesse caso o
   original toca nativamente e **não** há ducking. Sem faixa de áudio devolvida, o app diz que faltou marcar "compartilhar
   áudio". Alternativa (loopback do servidor, WASAPI) fica como rota avançada, já existente.
3. **Eco: três camadas.** (i) `restrictOwnAudio` e aba preferida; (ii) a leitura da tradução de "Eles" pausa o VAD de
   "Eles" durante a voz e a cauda de 800 ms **apenas** se `restrictOwnAudio` não estiver ativo no trilho; (iii) aviso de fone
   para a captura de sistema. A fala de "Eles" durante a leitura não se perde: o buffer do VAD é mantido e processado ao
   liberar (limite de 12 s, como hoje).
4. **Saída para a chamada.** A tradução de "Você" é sintetizada por voz do app (nuvem Premium, `voz_natural`, ou voz do site),
   decodificada e tocada por um `AudioContext` com `setSinkId(deviceId)` do microfone virtual (ex.: "CABLE Input"). Na chamada, o
   usuário escolhe "CABLE Output" como microfone. Para o usuário **não** ouvir duas vezes, a leitura local dessa tradução é
   opcional ("ouvir também aqui"), desligada por padrão. **A voz do aparelho não pode ser roteada**: sem voz do app, o botão
   explica que precisa da voz natural. Local (Kokoro/Piper em WASM) fica como pergunta aberta.
5. **Detecção do microfone virtual** por nome do dispositivo (`CABLE`, `VB-Audio`, `BlackHole`, `VoiceMeeter`), com guia passo a passo
   (instalar, escolher no app de chamada, testar) e **tom de teste** que o usuário confirma ouvir na chamada de teste. Sem
   dispositivo, o app funciona só localmente.
6. **Spike com portão antes da Fase 5.** Em Windows com VB-Cable e Meet/Zoom: medir eco (a voz do outro volta?), atraso
   fim-da-fala→chegada na chamada, e artefatos. Só vira recurso se: nenhum laço de eco, atraso ≤ 3 s no p50 e áudio
   inteligível pelo outro lado (teste cego). O resultado vai para `docs/auditoria/eval/`.
7. **Tela.** A lista em bolhas da Fase 1 é a tela principal (não a metade virada 180°), com rótulos "Eles" e "Você", nível de
   cada fonte, botões "só legenda", "ouvir original" (baixinho) e "ouvir a tradução aqui". O estado de cada fonte (ouvindo,
   traduzindo, lendo) aparece no rótulo.
8. **Consentimento e idade.** Antes de começar: aviso fixo de que a outra pessoa não é avisada e deve ser informada; a
   conversa não é gravada nem salva por padrão. Maiores de 18 (a auditoria apontou público <12 e LGPD art. 14): o modo fica
   oculto para contas de menores.
9. **Plano.** Entitlement `conversaVirtual` (Premium e selfhost). Conta no teto de STT e de voz já existentes; medidor de
   minutos visível; ao atingir o teto, cai para só legenda.

## Risks / Trade-offs

- [Laço de eco no sistema] → aba como padrão, `restrictOwnAudio`, aviso de fone e teste no spike.
- [Microfone virtual é driver de terceiro] → guia, detecção, tom de teste e uso 100% opcional; o modo vale sem ele.
- [Voz do aparelho não roteia] → exigir voz do app e dizer isso na tela; evitar prometer o que não cabe.
- [Chrome muda a captura de sistema] → sonda a cada abertura e mensagem clara quando não há faixa de áudio.
- [Privacidade de terceiros] → aviso, sem gravação por padrão, 18+, medidor e botão de parar sempre visível.
- [Atraso de duas traduções em série na conversa] → mostrar o medidor por fonte; meta de p50 ≤ 3 s por sentido.

## Migration Plan

Fase 4 atrás da chave `babel.interprete.virtual` e do entitlement; Fase 5 atrás de `babel.interprete.virtualSaida` e do
portão do spike. Reversão = desligar as chaves. Sem migração de dados.

## Open Questions

- Aceitar o Kokoro (82M, CPU, WASM) como voz local roteável para o Grátis? Medir peso e qualidade antes.
- Vale um app nativo (WASAPI + AEC3 + microfone virtual embutido) depois do spike? Decidir pelos números do spike e da demanda.
