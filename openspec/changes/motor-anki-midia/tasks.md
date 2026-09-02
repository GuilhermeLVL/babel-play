## 1. Parser lê a mídia (pré-requisito do resto)

- [x] 1.1 Extrair as referências `[sound:]`/`<img>` ANTES de limpar o texto (hoje são apagadas e a
      referência não sobra nem como ponteiro)
- [x] 1.2 Ler o mapa `media` nas DUAS formas: JSON `{"0":"nome"}` (legado) e protobuf `MediaEntries`
      (moderno — traz nome, tamanho e **sha1** por entrada; o índice da entrada é o nome numérico no zip)
- [x] 1.3 Descomprimir mídia **zstd por arquivo** no formato moderno (não é só a coleção que é zstd)
- [x] 1.4 Teto de bytes de mídia por requisição, contado durante o fluxo (mesmo padrão do teto de
      expansão do zip, que foi resposta a uma bomba de razão 1028:1)
- [x] 1.5 Testes com `.apkg` sintético nas duas formas de mapa

## 2. Esquema e armazenamento

- [x] 2.1 `anki_media` — id, user_id, sha256, bytes, content_type, criado, deleted_at; **único
      `(user_id, sha256)`** — dedupe por usuário, nunca global (decisão jurídica, ver design)
- [x] 2.2 `anki_note_media` — note_id, media_id, papel (`audio_palavra|audio_frase|imagem`),
      nome_original (para resolver a referência do campo no render)
- [x] 2.3 Gravar via o seam existente (`armazenamentoDoAmbiente`), objeto `anki-media/<userId>/<sha256>`
      — nome derivado do hash, NUNCA do nome original (que pode conter caminho)
- [x] 2.4 Migração aditiva + `down.sql` manual

## 3. Negociação e upload

- [ ] 3.1 `POST /api/anki/media/faltantes` — cliente manda hashes candidatos, servidor responde
      quais faltam (dedupe antes de trafegar)
- [ ] 3.2 `POST /api/anki/media` — lote (~25 MB), **servidor recalcula o sha256** e é a autoridade;
      tipo por magic bytes (reusar `server/lib/tipoDeArquivo.ts`), allowlist audio/* e image/*
- [ ] 3.3 Reserva de cota ANTES de gravar, com 507 explicativo (reusar `reservarArmazenamento`)
- [ ] 3.4 Cliente: extrair do `.apkg` só a mídia das notas ativadas — evolução de `soAColecao`,
      preservando a compressão de 356× medida
- [ ] 3.5 Caminho declarado para "ativar sem o arquivo em mãos": ativa mesmo assim e diz que a mídia
      depende de reenviar

## 4. Cota — no MESMO change (senão o contador mente)

- [ ] 4.1 `somarBytesEmDisco` passa a somar `anki_media` do usuário (hoje só percorre sessões)
- [ ] 4.2 Purga de baralho libera a cota da mídia órfã (`liberarArmazenamento`/`ajustarArmazenamento`)
- [ ] 4.3 Atualizar o comentário de `server/routes/import.ts:37-40`, cuja premissa literal ("nada
      delas chega ao disco") deixa de valer
- [ ] 4.4 Teste de integração: import com mídia → cota sobe; purga → cota volta

## 5. Servir e usar

- [ ] 5.1 `GET /api/anki/media/:id` com Range/206 via `lerFaixa`; escopado por `userId`
- [ ] 5.2 Auditoria por baralho: referenciados × presentes × faltando
- [ ] 5.3 Degradação: item sem áudio usa TTS se houver voz para o idioma (`hasVoiceFor`), e é
      omitido se não houver — nunca aparece mudo
- [ ] 5.4 Sanitizar o HTML dos campos na ingestão E no render (conteúdo de terceiros)
- [ ] 5.5 Teste: baralho com áudio faltando não gera item mudo em escuta/ditado/karaokê
