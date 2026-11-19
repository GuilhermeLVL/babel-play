## 1. Atribuição correta

- [x] 1.1 `SpeechSegment.dono` gravado quando a fala nasce; `ModoInterprete.tsx` e `exportarConversa.ts` leem `dono`; a troca limpa as frases das metades. Verificar: teste de unidade de `historicoDoInterprete` com troca no meio (as falas antigas mantêm o autor).
  - Feito: `direcaoDoLado` devolve `dono`, e o pipeline e a Web Speech o gravam na fala. A lista, o "Como respondo?" e o Markdown usam `dono` (a sessão antiga cai no cálculo pelo lado). A troca guarda os ids de antes e limpa as metades. Testes: `historicoDoInterprete.test.ts` (troca no meio, exportação), `modoInterprete.test.tsx` (lista e Markdown depois da troca). Rodada `desktop-cache-limpo`: 6/6 autores certos.
- [x] 1.2 Trecho guardado com `{lado, de, para, turnoId}` em `pipelineDeFala.ts`; `fimDaFala` de turno antigo não chega à máquina do turno. Verificar: teste do pipeline com o modelo carregando e troca de turno antes do pronto.
  - Feito: o turno está em `EstadoDoInterprete.turno` (sobe a cada abertura do microfone) e vai em `DirecaoDaFala.turno` e `FimDaFala.turno`. O trecho guardado leva a direção inteira. O controle descarta o fim de outro turno, e a máquina ignora o fim de outro lado com o microfone aberto. Testes: `interprete-direcao.test.ts` e `controleDoInterprete.test.ts`. Rodada `desktop-vazio-limpo`: pt1 como "Você"/pt, en1 inteira, `fimDaFalaAteMicFecharMs` de +2388 (era −3013).

## 2. Turno e leitura

- [x] 2.1 `redencaoMs` de 2500 ms no intérprete por toque e botão "Terminei" que fecha na hora. Verificar: teste do controle do intérprete (pausa de 1,5 s não fecha; toque fecha em até 300 ms).
  - Feito: `SILENCIO_DO_TURNO_MS` vale na abertura e em cada reabertura (`setRedencaoMs`; o automático volta ao padrão). "Terminei" entrega a fala em curso (`encerrarFala`) antes do mudo, que a descartaria. Testes: `interprete-direcao.test.ts` (fontes) e `controleDoInterprete.test.ts`. Medido em `desktop-cache-pausa`: 1 fala com "de chocolate", microfone fechado 2,43 s depois do fim. Em `desktop-cache-terminei`: o toque fecha em 35 a 53 ms.
- [x] 2.2 A leitura em voz alta espera `microfoneFechado`. Verificar: teste de `interprete.ts` (a leitura nunca começa com o microfone aberto).
  - Feito: o controle só enfileira com o microfone fechado. Teste: "a leitura nunca começa com o microfone aberto, em nenhuma ordem de eventos" (`controleDoInterprete.test.ts`). Em todas as falas das 9 rodadas, `vozAntesDoMicFechar` foi `false`.

## 3. Idioma fora do par

- [x] 3.1 O worker do Whisper roda `detectarIdiomaDoAudio` no fim do turno (2 s ou mais) no modo por toque e devolve `{idioma, confianca}`. Verificar: teste do worker com áudio de `conversa/falas` (es no lado en).
  - Feito: a opção `conferirIdioma` devolve `SttFinal.idiomaConferido`. Teste do worker com o modelo simulado (`whisperWorker-idioma.test.ts`). O áudio real de `conversa/falas` (es1 e es1.ruido) passou pela bancada (`openspec/audits/2026-11-18-conversa-de-verdade`): small híbrido 0,87 e 0,85 em es.
- [x] 3.2 Fala `foraDoPar` com o aviso "Não parece … — repetir?", sem tradução e sem leitura. Verificar: teste de componente e portões de i18n da CI.
  - Feito: `idiomaForaDoPar.ts`, o pipeline e a tela. Testes: `idiomaForaDoPar.test.ts`, `interprete-direcao.test.ts` e `modoInterprete.test.tsx`. Portões verdes: pseudo, órfãs, cobertura e piso; chaves em en, es e ar. Rodada `desktop-cache-ruido`: "Não parece inglês — repetir?", sem voz.
- [x] 3.3 Calibrar o limiar (0,8 de partida) no conjunto de teste. Verificar: no máximo 1 falso bloqueio em 20 falas do par.
  - 0 falsos bloqueios em 20 falas do par (e em 12 da auditoria) em todo limiar de 0,6 a 0,9. O 0,8 ficou: no desktop pega 5/5 em es. No celular (base q8) pega 1/5 (tabela no relatório).

## 4. Primeiro uso

- [x] 4.1 Estado `preparando` ("Preparando N%") no lugar de "Ouvindo…" enquanto o modelo não está pronto, com o aviso de fala guardada. Verificar: teste de componente.
  - Feito: `preparoDoInterprete` mostra 0 desde o toque, antes do primeiro número. O turno fecha sozinho com o modelo carregando. Testes: `modoInterprete.test.tsx` e `avisoDoPreparo.test.ts`. Rodada `desktop-vazio-limpo`: nenhum "Ouvindo…" antes do pronto, e o microfone fecha 2,43 s depois da fala, sem toque extra.
- [x] 4.2 Download antecipado ao entrar em `/app/interprete` com o aceite dado e rede boa. Verificar: teste com o perfil de rede lenta (não baixa) e boa (baixa).
  - Feito em parte: com o modelo da conversa já no aparelho, ele carrega ao abrir o Intérprete (`downloadDoInterprete.ts`, teste). **Pendente**: baixar pela rede antes do toque. O aceite do download não é guardado entre visitas (a folha "Baixar e iniciar" já começa a conversa), e não existe download do Whisper fora da preparação. Sem o modelo no aparelho, nada sai da rede antes do toque, com rede boa ou lenta.

## 5. Celular

- [x] 5.1 `.int-frase` com ajuste de fonte até 18 px e rolagem de reserva; a casca esconde a barra inferior no Intérprete. Verificar: e2e em 412×915 e 375×667 (sem corte; nenhum microfone fora das metades).
  - Feito: `fonteQueCabe.ts`, `justify-content: safe center` e a barra escondida com a conversa em curso (`data-em-curso`, vence o `!important` do polimento). Medido com o roteiro no Pixel 7 emulado (412×839) e em 375×667: toda frase cabe ou rola, sem corte no topo (fonte de 26 e 18 px), barra escondida e nenhum microfone fora das metades.
- [x] 5.2 Montar o conjunto de teste (10 pt e 10 en, 2 vozes; gravações reais se o dono autorizar) em `conversa/falas` e a lista de saídas constrangedoras. Verificar: arquivo versionado em `tests/fixtures/interprete/`.
  - `tests/fixtures/interprete/{frases.json,constrangedoras.json,gerar.sh,falas/}`: vozes sintéticas do macOS e 3 falas em es. As gravações humanas esperam o dono.
- [x] 5.3 Medir whisper-base q8, whisper-small q4 e Parakeet no perfil celular com `conversa/jantar.mjs`: WER, constrangedoras, 1ª tradução p50 e memória. Verificar: relatório em `openspec/audits/` com a tabela.
  - `openspec/audits/2026-11-18-conversa-de-verdade/README.md`. Foram medidos base q8, small q8 (o dtype que o roteador tem; numa primeira passada o q4 decodificou cerca de 65% mais devagar que o q8 no Mac, sem ganho de WER), small híbrido e Parakeet, na bancada em Node e, com o base q8, no navegador. **Limite**: latência e memória são do Mac, não de um celular.
- [x] 5.4 Adotar o vencedor em `sttRouter.ts` para o Intérprete no celular, ou ligar a conferência da transcrição. Verificar: rodada `celular-cache-limpo` com WER em pt de no máximo 20% e 0 constrangedoras.
  - Nenhum vencedor provado, e a **conferência da transcrição** está ligada: no celular com o base q8, fora do inglês ("Ler a tradução", "Corrigir" ou "Descartar"). O roteador não mudou. Conjunto no navegador: WER pt de 17,5% e 10,0%, 0 da lista. Na `celular-cache-limpo`, o pt2 ainda sai "vir o tinto", mas não é lido sem a conferência. O small q8 (252 MB) fica para a decisão do dono.
- [x] 5.5 Diálogo de download com o tamanho do modelo escolhido. Verificar: teste do diálogo nos perfis celular e desktop.
  - Já estava certo, sem mudança de código: o diálogo usa a rota do aparelho. Medido nas rodadas: celular 224 MB (base q8 e tradutores), desktop 353 MB. A auditoria também registrou 224 MB no celular; o "353 MB no celular" do CONV-11 não se repetiu.

## 6. Verificação ponta a ponta

- [x] 6.1 Repetir as 8 rodadas de `conversa/jantar.mjs` contra o staging e resumir com `conversa/resumir.mjs`. Verificar: os cenários da spec (pausa, download, troca, fora do par, primeiro uso, celular) passam.
  - Rodado contra o **app local**, porque esta branch não está no staging (não houve push): 9 rodadas, entre elas `desktop-cache-terminei`, `celular-375-limpo` e `celular-conjunto`. Os cenários de pausa, download, troca, fora do par, primeiro uso e layout do celular passam. O de pt no celular passa com a conferência (tabela no relatório). `desktop-mic-negado` e `desktop-sem-voz-en` não foram repetidas, porque a mudança não as toca. **Pendente**: repetir no staging depois do merge.
- [x] 6.2 `npm run typecheck`, `npm run lint` e `npm test` verdes.
