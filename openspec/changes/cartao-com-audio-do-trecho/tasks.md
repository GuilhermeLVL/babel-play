Legenda: **[D]** depende do dono; **[R]** pede aparelho real. A mais arriscada vem primeiro.

## 1. Provar que o clipe é pequeno e barato (a premissa de tudo)

- [ ] 1.1 Script `scripts/lab/clipe-do-cartao.mjs`: bytes por segundo e tempo de codificação de Opus 16/24/32 kbps e WAV sobre
      as fixtures de fala; registra a linha de base de "bytes baixados para tocar a fala original" na revisão.
      Verificar: `node scripts/lab/clipe-do-cartao.mjs` imprime a tabela; 24 kbps <= 4 KB/s; a linha de base fica em
      `docs/auditoria/` com a data.
- [ ] 1.2 **[D]** Escuta cega de 10 clipes (16/24/32 kbps).
      Verificar: o dono registra o bitrate vencedor no `design.md`.
- [ ] 1.3 **[R]** Medir no Safari (Mac de 6 GB) e num Android médio: p95 da codificação e `storage.estimate()` após 200 clipes.
      Verificar: números em `docs/auditoria/`; meta p95 < 150 ms atendida, ou WAV como padrão no Safari decidido.

## 2. Guarda local (o padrão, e o único do perfil protegido)

- [ ] 2.1 Flag `cartao_com_audio` desligada (constante em `src/core/planos.ts`, migração de semente PG e SQLite).
      Verificar: teste de flags lê a semente `habilitada = 0`; com a flag desligada nenhuma tela muda (teste de componente).
- [ ] 2.2 `lib/cartoes/audioDoCartao/` com a interface e o adaptador IndexedDB (gravar, abrir, apagar, apagarTudo; teto de 200
      MB com expulsão do mais antigo).
      Verificar: teste de unidade com IndexedDB falso cobre teto, expulsão e troca de conta (`aoMudarIdentidade` apaga tudo).
- [ ] 2.3 Anel de PCM na captura atrás da flag e corte de 1 a 8 s com 150 ms de folga.
      Verificar: teste do pipeline com fala sintética de 3 s produz clipe de 3,3 s +- 50 ms; sem a flag, `guardarAudioDaFala`
      segue só no Quest.
- [ ] 2.4 Toque na revisão: clipe do cartão, sessão, voz.
      Verificar: teste de `falaOriginal` prova que, com clipe, `urlDeAudio` não é chamado e que a ordem de queda funciona.
- [ ] 2.5 Ajustes, Privacidade, "Áudio dos cartões" (Só neste aparelho / Não guardar), aviso da voz de terceiros na primeira
      vez e "Apagar todos os áudios".
      Verificar: teste de componente; perfil protegido não vê "Na minha conta"; textos passam no teste de copy.

## 3. Guarda na conta (adulto declarado com conta)

- [ ] 3.1 Migração aditiva `audio_chave`, `audio_dur_ms` em `vocab_cards` (PG e SQLite) e rotas `PUT/GET/DELETE
/api/vocab/:id/audio` com escopo por `UserId`, teto por clipe e por conta, `reservarArmazenamento`.
      Verificar: teste de integração (outra conta recebe 404; perfil protegido recebe 403; teto excedido recebe 413).
- [ ] 3.2 Exclusão: excluir cartão, sessão e conta apagam o objeto no R2; a exportação de dados inclui os clipes
      (`exclusao-e-exportacao-completas`).
      Verificar: teste de exclusão completa lista o objeto antes e confere que sumiu.
- [ ] 3.3 **[D]** Linha nova no ROPA (`docs/lgpd/ropa.csv`) e parecer sobre voz de terceiros.
      Verificar: a linha existe e o teste que lê o ROPA passa.

## 4. Exportar e recuperar

- [ ] 4.1 `.apkg` com `[sound:]` e mídia quando há clipe (`lib/anki/montarApkg.ts`).
      Verificar: `tests/harness/lerApkgNode.ts` relê o arquivo e acha o áudio.
- [ ] 4.2 "Guardar o áudio deste cartão" para cartões antigos cuja sessão tem áudio.
      Verificar: teste cobre o recorte do áudio da sessão e o aviso quando a sessão não tem áudio.
- [ ] 4.3 **[R]** Abrir o `.apkg` exportado no Anki desktop e no AnkiDroid e tocar o clipe.
      Verificar: captura de tela anexada ao relatório.

## 5. Fechar

- [ ] 5.1 **[D]** Ligar `cartao_com_audio` só para o id do dono no staging, depois rampa 10/50/100%.
      Verificar: decisão datada em `docs/pendencias-do-dono.md`; métricas da proposta lidas antes de cada degrau.
