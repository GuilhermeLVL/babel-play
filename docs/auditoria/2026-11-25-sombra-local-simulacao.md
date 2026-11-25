# Sombra local: simulação offline do VAD (leve)

Change `sombra-sem-web-speech`, tarefa 1.2 (parte sem modelo). Script: `npx tsx scripts/eval-fala/sombra-vad.ts` (determinístico, 200 casos por linha). Réguas: `2026-11-25-sombra-local-reguas.md`.

| Régua                                                              | Limite | Resultado |
| ------------------------------------------------------------------ | ------ | --------- |
| Falso "tem fala" em silêncio digital e ruído de sala               | <= 1%  | 0,0%      |
| Fala de 3 s detectada, SNR 20 dB e 10 dB                           | >= 95% | 100%      |
| Fala de 0,8 s detectada, SNR 10 dB                                 | >= 90% | 100%      |
| Duração aparada dentro da folga (fala real + 2 x 200 ms, +-400 ms) | >= 95% | 100%      |

Também 100% a 6 dB (fala de 3 s e de 0,8 s).

## O que isto NÃO prova

- O ruído simulado é branco e estacionário. TV ao fundo, música, vozes de outras pessoas e vento não foram simulados; é onde um VAD de energia mais erra. A rodada real (3.4 [R]) decide se o Silero em Worker entra.
- A fala é sintética (harmônicos com envelope silábico), não voz de pessoa. Serve para a régua do VAD, não para WER.
- WER, alucinação do modelo em silêncio e nota contra o Web Speech (1.2 com moonshine-tiny, moonshine-base e whisper-base; 1.3) seguem ABERTOS: pedem download dos modelos e bancada pesada, fora desta rodada [B].
