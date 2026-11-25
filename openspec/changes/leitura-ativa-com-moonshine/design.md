## Contexto

`ouvinteLocal.ts` já abstrai o motor por `MotorLocal { id, disponivel(), iniciar(lang, cb): SttSession }` e a tela só
conhece `abrirOuvinteLocal` (`parar`, `descartar`, `aoParcial`, `aoFalhar`). Logo, o segundo motor é um `MotorLocal` novo:
a tela, o alinhador e a spec de privacidade não mudam. O Moonshine roda no mesmo worker do Whisper
(`WhisperLocalStt`, `adapters/moonshine.ts`), com `transcribePcm` (final) e `transcribeIfIdle` (parcial descartável quando o
worker está ocupado). A captura tem VAD em Worker (`gateway/capture/vadEmWorker.ts`) e estabilizador de parcial
(`lib/captura/parcialEstavel.ts`, LocalAgreement-2).

## Decisão

1. **Um `MotorLocal` `moonshine-local`** em `MOTORES_LOCAIS`, depois do Web Speech local. `disponivel()` = flag
   `leitura_voz_local` + idioma `en` + `moonshineCabe(aparelho)` + (modelo pronto OU aceite de download já dado). A escolha
   `tiny/base` vem de `moonshineDoAparelho` do roteador, sem regra nova.
2. **Sessão contínua por cima de decodificações curtas.** O capturador entrega PCM 16 kHz; o VAD abre e fecha "trechos de
   fala". Dentro de um trecho, a cada ~0,7 s, se o worker estiver ocioso, decodifica o trecho inteiro até agora
   (`transcribeIfIdle`); o texto passa por `parcialEstavel` e vira `onPartial`. Ao fechar o trecho (pausa de ~400 ms),
   `transcribePcm` final vira `onFinal`. Buffer por trecho com teto (30 s): passou, fecha à força.
3. **O alinhador não muda.** Ele só avança em janela de 6 palavras e nunca recua, então um parcial que reescreve a cauda
   não faz o cursor pular. O estabilizador reduz o piscar e o falso "pulada" por palavra ainda instável.
4. **Falha fechada**: erro do worker ou do modelo -> `onError` fatal -> `aoFalhar('parou')` -> "O microfone parou" com
   "Ligar de novo"/"Seguir em silêncio", como na spec vigente. Nunca cai em nuvem (o motor não recebe a fábrica de nuvem).
5. **Modo "por pausa" como reserva de qualidade**: se o parcial vivo reprovar a régua de atraso no celular fraco, o motor
   entrega só `onFinal` por trecho; o cursor anda a cada pausa, e a tela continua válida (a frase destaca quando acaba).
6. **Flag** `leitura_voz_local` em `src/core/planos.ts` (padrão `FLAG_*`), migração PG e SQLite, desligada, sem regra de
   plano; entra em `FLAGS_SENSIVEIS` como a `leitura_ativa` (liga microfone para menores).

## Alternativa descartada

**Whisper tiny/base multilíngue como segundo motor, para servir outros idiomas**: o acervo é só inglês; o Whisper tiny
alucina em 70,6% dos trechos sem fala (bancada de 24/09) e é 3,6 vezes maior que o Moonshine tiny. Para inglês não há
motivo. A ideia fica para quando houver textos em outro idioma.

## Plano de medição (método rápido, skill `ciclo-rapido`)

Réguas combinadas antes: sensibilidade >= 90%, falso positivo <= 5%, atraso p95 <= 1,5 s (desktop), 2,5 s (fraco).

1. **Simular antes** (offline, em Node, sem navegador): ler os textos do acervo por TTS (com e sem pular uma palavra),
   transcrever em janelas crescentes com o Moonshine pelo leitor de `tests/harness/`, e alimentar o alinhador real
   (`aplicarParcial`). Mede sensibilidade, falso positivo e "travadas" sem aparelho nem pessoa. O ciclo roda em minutos e
   decide `tiny` vs `base` e a cadência (0,5, 0,7 e 1,0 s).
2. **Triagem curta**: 3 textos lidos por 3 pessoas (uma com sotaque forte), em Chromium e Firefox desktop; parar na primeira
   régua reprovada.
3. **Só a finalista na medição longa**: 10 a 20 brasileiros (**[D]**, recrutar) e aparelho real (**[R]**): Safari/iPhone, um
   Android de ~4 GB e Quest 3. Pré-voo: modelo em cache, microfone liberado, bateria, uma rodada por aparelho.
