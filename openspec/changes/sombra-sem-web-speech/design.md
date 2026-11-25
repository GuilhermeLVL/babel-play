## Contexto

A prática chama o reconhecimento do navegador DURANTE a gravação (`SombraDaFala.gravar`, `KaraokeDoPrototipo`,
`Gravador`). O app já tem o necessário para transcrever DEPOIS, no aparelho: `WhisperLocalStt.transcribePcm(pcm, 16000,
{ languageHint })` (inclusive o Moonshine, pelo mesmo worker), `modeloLocalDaImportacao(idioma)` (en -> moonshine-base),
`moonshineDoAparelho(p)` (tiny no celular fraco, Quest e economia de dados), o VAD em Worker, a pré-carga/cura dos
modelos e `scorePronunciation`/`conferirDitado` (puros). Uma frase de 3 a 6 s decodifica de uma vez em ~0,5 a 2 s em WASM
no desktop (a medir).

## Decisão

1. **Um módulo, três consumidores.** `src/lib/fala/ouvirFraseNoAparelho.ts` expõe `ouvirUmaFrase({ lang, aoNivel })` ->
   `{ parar(): Promise<{ texto, duracaoMs, semFala }>, cancelar() }`. Por dentro: `getUserMedia` + AudioWorklet que
   entrega PCM Float32 a 16 kHz; o VAD marca `semFala` (nada de decodificar silêncio); `transcribePcm` com `languageHint`;
   buffers soltos ao terminar. Sem MediaRecorder para a transcrição (decodificar Opus/WebM em PCM custa mais e falha no
   Safari); o `MediaRecorder` segue só para "Ouvir minha gravação".
2. **Escolha do motor em função pura** `src/core/fala/motorDaSombra.ts`: entrada `{ webSpeechLocal, webSpeechNuvem,
perfilProtegido, idioma, aparelho, economiaDeDados, flag }` -> `'web-speech' | 'local-moonshine-tiny' |
'local-moonshine-base' | 'local-whisper-base' | 'nenhum'` mais o motivo. Regras: perfil protegido nunca escolhe nuvem;
   Web Speech local ou de adulto continua preferido (zero download); sem ele e com flag, o local.
3. **Nota idêntica** (`scorePronunciation`) e feedback no tom da `leitura-ativa-voz-alta` (pontilhado neutro, "o aparelho
   não entendeu bem", nunca "errado"); "palpite" fixo na tela.
4. **Flag** `sombra_local` em `src/core/planos.ts`, migração PG e SQLite, desligada, sem regra de plano. Entra em
   `FLAGS_SENSIVEIS` do painel (liga microfone para menores). O e2e liga por `page.route('**/api/flags')`.
5. **Só uma fatia por vez, a mais arriscada primeiro**: inglês no Moonshine em Firefox e Quest (a combinação sem alternativa
   hoje); depois pt/es/fr no Whisper base.

## Alternativa descartada

**Mandar o áudio da tentativa a um STT de nuvem barato (Groq/OpenRouter)**: acerta mais (Whisper large) e não baixa
modelo, mas viola a retenção zero para menores, exige consentimento de nuvem, custa por tentativa e não funciona sem
internet. Só seria discutível para adultos pagos, e aí a prática vira IA paga (precisa de custo declarado e cota em
`planos.ts`): não é o objetivo desta change.

## Plano de medição (método rápido, skill `ciclo-rapido`)

Réguas combinadas antes: WER <= 20% (en), alucinação em silêncio <= 1%, concordância Spearman >= 0,8 com o Web Speech.

1. **Simular antes** (offline, sem aparelho): reaproveitar `scripts/eval-fala/bancada/stt.mjs` e o leitor em Node
   (`tests/harness/`) com 100 frases do acervo da leitura ativa lidas por TTS e degradadas (ruído, 0,8x/1,2x de ritmo, corte
   de bordas); medir WER de moonshine-tiny, moonshine-base e whisper-base, e a nota resultante contra a nota-alvo conhecida
   (frase igual = 100). Descartar modelo que reprova a régua antes de gastar aparelho.
2. **Triagem curta**: 20 gravações reais de 3 pessoas (adulto, e uma frase com erro proposital de 5 palavras) em Chromium
   desktop, comparando nota local com nota Web Speech. Parar na primeira régua reprovada.
3. **Só a finalista na medição longa**: Firefox desktop e Quest 3 (**[R]**), 20 frases cada, com pré-voo (modelo em cache,
   permissão do microfone, bateria e tampa aberta), medindo tempo da nota e memória.

Pergunta aberta que o plano responde: o tiny basta no Quest ou a nota fica injusta? Se o tiny reprovar, a saída é nota
desligada no Quest com a gravação comparável de hoje, não nota ruim.
