## 1. Atribuição correta

- [ ] 1.1 `SpeechSegment.dono` gravado quando a fala nasce; `ModoInterprete.tsx` e `exportarConversa.ts` leem `dono`; a troca limpa as frases das metades. Verificar: teste de unidade de `historicoDoInterprete` com troca no meio (as falas antigas mantêm o autor).
- [ ] 1.2 Trecho guardado com `{lado, de, para, turnoId}` em `pipelineDeFala.ts`; `fimDaFala` de turno antigo não chega à máquina do turno. Verificar: teste do pipeline com o modelo carregando e troca de turno antes do pronto.

## 2. Turno e leitura

- [ ] 2.1 `redencaoMs` de 2500 ms no intérprete por toque e botão "Terminei" que fecha na hora. Verificar: teste do controle do intérprete (pausa de 1,5 s não fecha; toque fecha em até 300 ms).
- [ ] 2.2 A leitura em voz alta espera `microfoneFechado`. Verificar: teste de `interprete.ts` (a leitura nunca começa com o microfone aberto).

## 3. Idioma fora do par

- [ ] 3.1 O worker do Whisper roda `detectarIdiomaDoAudio` no fim do turno (2 s ou mais) no modo por toque e devolve `{idioma, confianca}`. Verificar: teste do worker com áudio de `conversa/falas` (es no lado en).
- [ ] 3.2 Fala `foraDoPar` com o aviso "Não parece … — repetir?", sem tradução e sem leitura. Verificar: teste de componente e portões de i18n da CI.
- [ ] 3.3 Calibrar o limiar (0,8 de partida) no conjunto de teste. Verificar: no máximo 1 falso bloqueio em 20 falas do par.

## 4. Primeiro uso

- [ ] 4.1 Estado `preparando` ("Preparando N%") no lugar de "Ouvindo…" enquanto o modelo não está pronto, com o aviso de fala guardada. Verificar: teste de componente.
- [ ] 4.2 Download antecipado ao entrar em `/app/interprete` com o aceite dado e rede boa. Verificar: teste com o perfil de rede lenta (não baixa) e boa (baixa).

## 5. Celular

- [ ] 5.1 `.int-frase` com ajuste de fonte até 18 px e rolagem de reserva; a casca esconde a barra inferior no Intérprete. Verificar: e2e em 412×915 e 375×667 (sem corte; nenhum microfone fora das metades).
- [ ] 5.2 Montar o conjunto de teste (10 pt e 10 en, 2 vozes; gravações reais se o dono autorizar) em `conversa/falas` e a lista de saídas constrangedoras. Verificar: arquivo versionado em `tests/fixtures/interprete/`.
- [ ] 5.3 Medir whisper-base q8, whisper-small q4 e Parakeet no perfil celular com `conversa/jantar.mjs`: WER, constrangedoras, 1ª tradução p50 e memória. Verificar: relatório em `openspec/audits/` com a tabela.
- [ ] 5.4 Adotar o vencedor em `sttRouter.ts` para o Intérprete no celular, ou ligar a conferência da transcrição. Verificar: rodada `celular-cache-limpo` com WER em pt de no máximo 20% e 0 constrangedoras.
- [ ] 5.5 Diálogo de download com o tamanho do modelo escolhido. Verificar: teste do diálogo nos perfis celular e desktop.

## 6. Verificação ponta a ponta

- [ ] 6.1 Repetir as 8 rodadas de `conversa/jantar.mjs` contra o staging e resumir com `conversa/resumir.mjs`. Verificar: os cenários da spec (pausa, download, troca, fora do par, primeiro uso, celular) passam.
- [ ] 6.2 `npm run typecheck`, `npm run lint` e `npm test` verdes.
