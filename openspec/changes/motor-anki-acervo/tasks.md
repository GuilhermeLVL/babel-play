## 0. Pré-requisito (feito)

- [x] 0.1 `origemDe()` reconhece `anki:` e grava `origin_kind='anki'` + `origin_ref` — sem isto a
      procedência morre no primeiro passo (commit `a524f56`)

## 1. Esquema (aditivo; `vocab_cards` não muda)

- [x] 1.1 `anki_decks` — id, user_id, nome, nome_original_no_arquivo, arquivo_origem, estado
      (`ativo|desativado`), idioma_origem, idioma_alvo, criado/atualizado, deleted_at
- [x] 1.2 `anki_notes` — id, user_id, deck_id (FK), `guid` (único por usuário+deck), notetype,
      `estrutura_hash`, `campos_brutos` (JSON com nomes), frente, verso, exemplo, tags,
      `estado` (`arquivada|ativa|ausente_no_arquivo`), `projected_card_id` (FK anulável),
      `motivo_da_baixa` (`desativacao|manual|null` — o que decide reativar vs. criar nova),
      `motivo_descarte` (por que não é jogável), import_id
- [x] 1.3 `anki_imports` — id, user_id, deck_id, arquivo, bytes, hash_do_arquivo, estado
      (`lendo|gravando|concluido|parcial|falhou`), notas_lidas/novas/atualizadas/descartadas,
      contagem por motivo (JSON), erro, criado/atualizado
- [x] 1.4 Índices: `(user_id, deck_id)` em notes; `(user_id, deck_id, guid)` único; `(deck_id, estado)`
- [x] 1.5 Migração drizzle + **`down.sql` manual** no diretório do change (só `DROP TABLE`)
- [x] 1.6 Teste de integração: migração aplica em banco limpo E em banco com dados; `down` derruba
      só as tabelas novas

## 2. Repositório do acervo (`server/db/repositories/anki.ts`)

- [x] 2.1 `criarImport` / `atualizarImport` / `lerImport` — o ledger
- [x] 2.2 `gravarNotas` — upsert por `(deck_id, guid)`; devolve novas/atualizadas/iguais
- [x] 2.3 `marcarAusentes` — nota que não veio no arquivo novo vira `ausente_no_arquivo` (nunca deleção)
- [x] 2.4 `listarBaralhos` / `listarNotas` (cursor + filtros: estado, jogável, idioma, busca)
- [x] 2.5 `desativarBaralho` — notas arquivadas; cartão exclusivo com histórico → `inDeck=0`, sem
      histórico → soft-delete com `motivo_da_baixa='desativacao'`; cartão com outra origem intocado
- [x] 2.6 `purgarBaralho` — apaga notas e vínculos; **`review_logs` nunca é tocado**; confirmação dupla na rota
- [x] 2.7 Teste: desativar → reimportar devolve o MESMO cartão (histórico intacto, sem linha paralela)

## 3. Projeção (nota → cartão jogável)

- [x] 3.1 `vocabRepo.projetarDoAnki(userId, notas)` — upsert por `normKey` (o mesmo do `bulkAdd`),
      ocorrência `origin_kind='anki'` + `origin_ref=<deckId>`, grava `projected_card_id` na nota
- [x] 3.2 Reativação: se o cartão está soft-deletado com `motivo_da_baixa='desativacao'`, limpa
      `deleted_at` em vez de criar linha nova (o índice único é parcial — sem isto o histórico racha)
- [x] 3.3 Deleção manual do usuário é respeitada: cria cartão novo, não ressuscita o apagado
- [x] 3.4 Ativação em lote com teto (`LOTE_DE_ATIVACAO = 300`), idempotente
- [x] 3.5 Teste: 3.600 notas importadas ⇒ **zero** cartões vencidos antes de ativar
- [x] 3.6 Teste: mesma palavra em dois baralhos ⇒ 1 cartão, 2 ocorrências, 2 notas ligadas a ele

## 4. Perfil de qualidade por origem (`src/core/learning/quality.ts`)

- [x] 4.1 `avaliarCartao` aceita `{ origem: 'captura' | 'curado' }`, default `'captura'` — **nenhum
      chamador existente muda de comportamento**
- [x] 4.2 No perfil `curado`, o teto de pista sobe e "no máximo 5 palavras" não se aplica; as regras
      de LIXO (dígito, letra repetida, tradução igual à palavra, sem pista) continuam valendo
- [x] 4.3 As constantes do perfil `curado` saem da medição do corpus (G2), não de palpite
- [x] 4.4 Teste: a definição real que hoje é recusada ("To agree is to have the same opinion…") passa
      no perfil curado e continua recusada no de captura; "Isso é" é recusada nos dois

## 5. Rotas

- [x] 5.1 `POST /api/import/anki` passa a **gravar** o acervo (hoje só lê e devolve) e responde com
      `importId` + resumo
- [x] 5.2 `POST /api/anki/decks/:id/ativar` — projeta o próximo lote; responde saldo (ativadas/total)
- [x] 5.3 `GET /api/anki/imports/:id` — progresso consultável
- [x] 5.4 `GET /api/anki/decks` e `GET /api/anki/decks/:id/notas` (cursor, filtros)
- [x] 5.5 `POST /api/anki/decks/:id/desativar` e `DELETE /api/anki/decks/:id` (purga, exige confirmação)
- [x] 5.6 Schemas Zod em `server/validation.ts`; validação **por item com relatório**, não do lote
      inteiro (o defeito de `bulkAddCardsSchema`, onde uma palavra de 1 letra derruba 500)
- [x] 5.7 Todas as rotas escopadas por `userId` — acervo é privado do importador (decisão jurídica do G0)

## 6. Migração do que já existe

- [x] 6.1 Cartões importados pelo funil antigo (ocorrência `manual`, sem baralho): decidir e
      documentar — proposta é **deixar como estão** (não há dado para reconstruir de qual baralho
      vieram) e o novo funil passa a valer daqui pra frente
- [x] 6.2 O caminho `BaralhoAnki` → `bulkAddCards` direto é substituído pelo acervo (o change
      `motor-anki-mapeador` cuida da tela)
