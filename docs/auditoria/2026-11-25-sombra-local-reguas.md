# Sombra local: réguas (escritas ANTES de medir)

Change `sombra-sem-web-speech`, tarefa 1.1. Data: 25/11/2026. Este arquivo é commitado antes de qualquer resultado; mudar uma régua depois de medir exige nova data e o motivo, no fim do arquivo.

## Réguas do motor (por modelo e idioma)

| Régua                                          | Limite                                     | Onde se mede                                 |
| ---------------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| WER em inglês (frase lida, ruído e ritmo)      | <= 20%                                     | 1.2 (offline, 100 frases, TTS degradado)     |
| Alucinação em silêncio e ruído de sala         | <= 1% das tentativas com texto             | 1.2 e 1.3                                    |
| Concordância da nota com o Web Speech          | Spearman >= 0,8                            | 1.3 (20 gravações reais, Chromium desktop)   |
| Diferença mediana da nota (local - Web Speech) | <= 10 pontos                               | 1.3                                          |
| Tempo da nota (parar até a nota)               | <= 3 s no desktop; <= 6 s no celular/Quest | 3.4 [R] (Firefox desktop e Quest, 20 frases) |

Parar na primeira régua reprovada. Modelo fora da régua sai do desenho; o Quest que reprovar fica só com a gravação comparável (sem nota ruim).

## Réguas do VAD leve (degrau de energia, `src/core/fala/pcm.ts`)

Medidas offline, sem modelo, em `scripts/eval-fala/sombra-vad.ts`:

| Régua                                                            | Limite |
| ---------------------------------------------------------------- | ------ |
| Falso "tem fala" em silêncio digital e ruído de sala (0,5 a 3 s) | <= 1%  |
| Fala sintética detectada (SNR >= 10 dB, ritmo 0,8x a 1,2x)       | >= 95% |
| Fala curta de 0,8 s detectada (SNR >= 10 dB)                     | >= 90% |
| Duração aparada dentro de +-400 ms da fala real                  | >= 95% |

Se o VAD de energia reprovar na rodada real (3.4), a troca prevista é o Silero em Worker, que a captura ao vivo já tem.

## Escopo desta rodada (decisão assumida em 25/11, recomendação 13a)

Só inglês. pt/es/fr (Whisper base) numa segunda fatia, só depois de repetir 1.2 para eles.
