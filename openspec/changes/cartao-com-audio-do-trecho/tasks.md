Legenda: **[D]** depende do dono; **[R]** pede aparelho real. A mais arriscada vem primeiro.

## 1. Provar que o clipe é pequeno e barato (a premissa de tudo)

- [x] 1.1 Script `scripts/lab/clipe-do-cartao.mjs`: bytes por segundo e tempo de codificação de Opus 16/24/32 kbps e WAV sobre
      as fixtures de fala; registra a linha de base de "bytes baixados para tocar a fala original" na revisão.
      Verificar: `node scripts/lab/clipe-do-cartao.mjs` imprime a tabela; 24 kbps <= 4 KB/s; a linha de base fica em
      `docs/auditoria/` com a data.
      Feito 25/11: `scripts/lab/clipe-do-cartao.mjs`; tabela em `docs/auditoria/2026-11-25-clipe-do-cartao.md` (Opus 24 kbps = 2.565 B/s, 7,5 KB por clipe de 3 s). Tempo medido é do ffmpeg em Node, não do aparelho (vai para 1.3); a linha de base de bytes baixados é estimativa, a real fica na bancada [B].
- [ ] 1.2 **[D]** Escuta cega de 10 clipes (16/24/32 kbps).
      Verificar: o dono registra o bitrate vencedor no `design.md`.
      Aberta [D][B]. Decisão assumida 25/11: 24 kbps (`BITRATE_DO_CLIPE` em `codificar.ts`) até a escuta; trocar é mudar uma constante.
- [ ] 1.3 **[R]** Medir no Safari (Mac de 6 GB) e num Android médio: p95 da codificação e `storage.estimate()` após 200 clipes.
      Verificar: números em `docs/auditoria/`; meta p95 < 150 ms atendida, ou WAV como padrão no Safari decidido.

## 2. Guarda local (o padrão, e o único do perfil protegido)

- [x] 2.1 Flag `cartao_com_audio` desligada (constante em `src/core/planos.ts`, migração de semente PG e SQLite).
      Verificar: teste de flags lê a semente `habilitada = 0`; com a flag desligada nenhuma tela muda (teste de componente).
      Feito 25/11: constante `FLAG_CARTAO_COM_AUDIO` em `src/core/planos.ts`, semente PG 0041 e SQLite 0080 (NÚMEROS PROVISÓRIOS: o integrador renumera), `docs/flags.md`, painel de flags, `tests/cartao-com-audio-flag.test.ts`. Sem flag, `AudioDosCartoes` não renderiza e `abrirClipeDoCartao`/`guardarClipeDoCartao` não fazem nada (`tests/audio-do-cartao.test.ts`).
- [x] 2.2 `lib/cartoes/audioDoCartao/` com a interface e o adaptador IndexedDB (gravar, abrir, apagar, apagarTudo; teto de 200
      MB com expulsão do mais antigo).
      Verificar: teste de unidade com IndexedDB falso cobre teto, expulsão e troca de conta (`aoMudarIdentidade` apaga tudo).
      Feito 25/11: `src/lib/cartoes/audioDoCartao/armazem.ts` (gravar, abrir, apagar, apagarTudo, uso; teto 200 MB com expulsão do mais antigo; `aoMudarIdentidade` apaga tudo). Apagar o cartão (`deleteCard`) apaga o clipe.
- [x] 2.3 Anel de PCM na captura atrás da flag e corte de 1 a 8 s com 150 ms de folga.
      Verificar: teste do pipeline com fala sintética de 3 s produz clipe de 3,3 s +- 50 ms; sem a flag, `guardarAudioDaFala`
      segue só no Quest.
      Feito 25/11 com ressalva: anel atrás da flag em `captura/audioDasFalas.ts` (`ligarAnelDoCartao`; o botão Ouvir do Quest não muda), corte em `recorte.ts` (fala + 150 ms de SILÊNCIO de cada lado, máx. 8 s; o PCM já vem delimitado pelo VAD, então a folga não é áudio de contexto), ligação fala->cartão por texto da frase em `daFala.ts`, chamada pelo `handleAddWordToDeck` da captura. Não há anel no Intérprete (a voz da outra pessoa nunca vira clipe). Fica fora: salvar palavra pela lista da sessão ou pelo "Juntar a cena" (sem PCM em memória; usa o trecho da sessão).
- [x] 2.4 Toque na revisão: clipe do cartão, sessão, voz.
      Verificar: teste de `falaOriginal` prova que, com clipe, `urlDeAudio` não é chamado e que a ordem de queda funciona.
      Feito 25/11: `falaOriginal.original(cena, idioma, velocidade, cartaoId)` toca clipe, depois trecho da sessão, depois voz do aparelho; com clipe `urlDeAudio` não é chamado (`tests/fala-original-clipe.test.ts`). Ligado em Study, Pratica e GavetaDaPalavra.
- [x] 2.5 Ajustes, Privacidade, "Áudio dos cartões" (Só neste aparelho / Não guardar), aviso da voz de terceiros na primeira
      vez e "Apagar todos os áudios".
      Verificar: teste de componente; perfil protegido não vê "Na minha conta"; textos passam no teste de copy.
      Feito 25/11 (sem a opção "Na minha conta", que não existe por decisão): `ajustes/AudioDosCartoes.tsx` em Ajustes > Privacidade, só com a flag ligada: "Guardar o áudio dos cartões neste aparelho" (padrão ligado) e "Apagar todos os áudios". O aviso da voz de terceiros fica fixo no texto da opção (não só na primeira vez). Textos em en/es/ar. Sem teste de componente dedicado.

## 3. Guarda na conta (adulto declarado com conta)

> Decisão assumida (recomendação 1 de `docs/backlog/decisoes-do-dono.md` e retenção zero no servidor, 25/11): esta entrega é SÓ LOCAL. A seção 3 não foi implementada; fica como alternativa futura se o dono quiser o clipe entre aparelhos. 3.1 e 3.2 abertas por decisão, não por falta de tempo.

- [ ] 3.1 Migração aditiva `audio_chave`, `audio_dur_ms` em `vocab_cards` (PG e SQLite) e rotas `PUT/GET/DELETE
/api/vocab/:id/audio` com escopo por `UserId`, teto por clipe e por conta, `reservarArmazenamento`.
      Verificar: teste de integração (outra conta recebe 404; perfil protegido recebe 403; teto excedido recebe 413).
- [ ] 3.2 Exclusão: excluir cartão, sessão e conta apagam o objeto no R2; a exportação de dados inclui os clipes
      (`exclusao-e-exportacao-completas`).
      Verificar: teste de exclusão completa lista o objeto antes e confere que sumiu.
- [ ] 3.3 **[D]** Linha nova no ROPA (`docs/lgpd/ropa.csv`) e parecer sobre voz de terceiros.
      Aberta [D]. Exportação e exclusão com o armazém local: o clipe NUNCA vai ao servidor, então `GET /api/me/exportar` e "Excluir conta" não o veem nem precisam vê-lo (não há o que listar no servidor). Cobertura que o código dá: apagar o cartão apaga o clipe (`deleteCard`), trocar de identidade apaga tudo (`aoMudarIdentidade`) e "Apagar todos os áudios" nos Ajustes. Lacuna a decidir pelo jurídico: "Excluir conta" feita DE OUTRO aparelho não apaga o clipe deste (o servidor não sabe dele); o limite é o teto de 200 MB e o botão de Ajustes. Se o parecer exigir a exportação do clipe, a saída é um botão local "Baixar meus áudios" (não feito). A linha do ROPA deve dizer: armazenamento só no dispositivo, sem operador, art. 7º V, retenção enquanto o cartão existir.
      Verificar: a linha existe e o teste que lê o ROPA passa.

## 4. Exportar e recuperar

- [ ] 4.1 (aberta: fora do recorte local desta entrega; decisão 19 do dono recomenda áudio do baralho só por TTS) `.apkg` com `[sound:]` e mídia quando há clipe (`lib/anki/montarApkg.ts`).
      Verificar: `tests/harness/lerApkgNode.ts` relê o arquivo e acha o áudio.
- [ ] 4.2 "Guardar o áudio deste cartão" para cartões antigos cuja sessão tem áudio.
      Verificar: teste cobre o recorte do áudio da sessão e o aviso quando a sessão não tem áudio.
- [ ] 4.3 **[R]** Abrir o `.apkg` exportado no Anki desktop e no AnkiDroid e tocar o clipe.
      Verificar: captura de tela anexada ao relatório.

## 5. Fechar

- [ ] 5.1 **[D]** Ligar `cartao_com_audio` só para o id do dono no staging, depois rampa 10/50/100%.
      Verificar: decisão datada em `docs/pendencias-do-dono.md`; métricas da proposta lidas antes de cada degrau.
