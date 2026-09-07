/**
 * Schema do banco (Drizzle, dialeto SQLite via libsql) — Fase 0.
 *
 * Regra de PORTABILIDADE (governada por `web-foundations`): só tipos de coluna
 * portáveis — `text` para ids/JSON, `integer` para timestamps epoch-ms e flags,
 * `real` para floats. A troca para Postgres/Supabase mexe só no driver + JSON→jsonb;
 * o schema lógico permanece.
 *
 * Toda tabela carrega colunas de sync-readiness: created_at, updated_at,
 * user_id (nullable, p/ multiusuário futuro) e deleted_at (soft-delete).
 *
 * FOREIGN KEY (F0-04): as 10 relações reais são declaradas com `.references()`. Todas SEM
 * `onDelete` — ou seja, `NO ACTION`, o default do SQLite. A remoção do app é SOFT (`deleted_at`),
 * então o único DELETE físico é `contaRepo.excluir`, que apaga a árvore inteira num `db.batch`
 * com os filhos antes dos pais. `CASCADE` faria um erro num repositório apagar a árvore em
 * silêncio; `SET NULL` apagaria a procedência. `NO ACTION` (e não `RESTRICT`) porque é o único
 * que admite ser adiado para o fim da transação (`PRAGMA defer_foreign_keys`) se algum dia um
 * lote precisar ser reordenado — `RESTRICT` recusa mesmo assim.
 */
import { sqliteTable, text, integer, real, index, unique, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/** Colunas comuns a toda tabela de domínio (sync-ready). */
const meta = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  userId: text('user_id'),
  deletedAt: integer('deleted_at'),
}

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  ...meta,
  title: text('title'),
  kind: text('kind'), // 'audio' | 'video' | 'document' | 'live'
  startedAt: integer('started_at'),
  endedAt: integer('ended_at'),
  sourceLang: text('source_lang'),
  targetLang: text('target_lang'),
  durationMs: integer('duration_ms'),
  wordCount: integer('word_count'),
  status: text('status'),
  meta: text('meta'), // JSON
  /**
   * Id da sessão no NAVEGADOR de onde ela migrou (modo sem conta → conta). É a chave de
   * idempotência da migração: reenviar a mesma sessão devolve a que já existe em vez de duplicar.
   * Mesmo desenho de `seed_spends.spend_id`.
   */
  origemLocalId: text('origem_local_id'),
}, (t) => [
  uniqueIndex('uq_sessions_user_origem_local').on(t.userId, t.origemLocalId)
    .where(sql`${t.deletedAt} is null and ${t.origemLocalId} is not null`),
  /**
   * F3-01 da auditoria. `EXPLAIN QUERY PLAN` de `WHERE user_id = ? AND deleted_at IS NULL`
   * devolvia `SCAN sessions` — varredura completa. É a consulta da TELA INICIAL, e sob carga
   * contra o container ela deu **p95 de 790 ms com o banco praticamente vazio** (F6-01).
   *
   * O custo de uma varredura cresce com a BASE INTEIRA, não com o dono dos dados: com 1.000
   * usuários, responder sobre um exige percorrer os mil — inclusive os inativos.
   *
   * `deleted_at` entra como segunda coluna porque toda leitura de domínio filtra por ela; assim
   * o índice cobre o predicado inteiro em vez de mandar o SQLite buscar a linha para conferir.
   */
  index('idx_sessions_user').on(t.userId, t.deletedAt),
])

export const utterances = sqliteTable('utterances', {
  id: text('id').primaryKey(),
  ...meta,
  sessionId: text('session_id').notNull().references(() => sessions.id),
  idx: integer('idx'),
  tStartMs: integer('t_start_ms'),
  tEndMs: integer('t_end_ms'),
  speakerId: text('speaker_id'),
  speakerName: text('speaker_name'),
  source: text('source'), // 'mic' | 'tab'
  sourceLang: text('source_lang'),
  sourceText: text('source_text'),
  targetLang: text('target_lang'),
  translatedText: text('translated_text'),
  status: text('status'),
  engine: text('engine'),
  confidence: real('confidence'),
}, (t) => [
  /** Chave de junção óbvia e sem índice: `computeProfile` fazia full scan por pageview. */
  index('idx_utt_session').on(t.sessionId, t.idx),
  /**
   * F3-01. O índice acima cobre "as falas DESTA sessão"; não cobre "todas as falas DESTE
   * usuário", que é o que a tela de métricas pede — e ali dava `SCAN utterances`. É a maior
   * tabela do banco (3.593 linhas com UM usuário; ~3,6 milhões projetados para 1.000).
   */
  index('idx_utt_user').on(t.userId, t.deletedAt),
])

export const vocabCards = sqliteTable('vocab_cards', {
  id: text('id').primaryKey(),
  ...meta,
  sessionId: text('session_id').references(() => sessions.id),
  word: text('word').notNull(),
  back: text('back'),
  phonetics: text('phonetics'),
  sentence: text('sentence'),
  srcLang: text('src_lang'),
  tgtLang: text('tgt_lang'),
  /** @deprecated nunca foi escrito (0 de 2.126 linhas). Substituído por `occurrences`. */
  frequency: integer('frequency'),
  inDeck: integer('in_deck'), // 0/1
  box: integer('box'),
  dueAt: integer('due_at'),
  stability: real('stability'),
  difficulty: real('difficulty'),
  reps: integer('reps'),
  lapses: integer('lapses'),
  lastReview: integer('last_review'),
  clozePrompt: text('cloze_prompt'),
  clozeAnswer: text('cloze_answer'),
  cefrLevel: text('cefr_level'),
  cefrConfidence: real('cefr_confidence'),
  addedAt: integer('added_at'),

  // ── F2b ────────────────────────────────────────────────────────────────────────────────────
  /** Chave de dedup normalizada (`lang|palavra-sem-acento-sem-caixa`). Base do UNIQUE e do upsert. */
  normKey: text('norm_key'),
  /** Quantas vezes o usuário encontrou esta palavra. `frequency` nunca foi escrito; este é. */
  occurrences: integer('occurrences').notNull().default(0),
  firstSeenAt: integer('first_seen_at'),
  lastSeenAt: integer('last_seen_at'),
  /** Procedência do nível CEFR: 'curado' | 'wordlist' | 'ausente'. Nível sem procedência é chute. */
  cefrSource: text('cefr_source'),
  /** Dificuldade calculada (0..1) — materializada, nunca no caminho de leitura. Ver F4. */
  difficultyScore: real('difficulty_score'),
  difficultyAt: integer('difficulty_at'),

  /**
   * Base ISO-639-1 de `src_lang` ('en-US' → 'en'), SARGÁVEL — a mesma normalização que
   * `selecionarParaJogo` já fazia em SQL (`LOWER(SUBSTR(src_lang,1,2))`), agora como coluna.
   *
   * VIRTUAL, não STORED: SQLite só aceita coluna gerada em `ALTER TABLE ADD COLUMN` quando ela é
   * VIRTUAL (STORED exige reconstruir a tabela, o que violaria a política aditivo-somente desta
   * migração). Uma coluna virtual não ocupa disco por linha, mas o ÍNDICE sobre ela é uma
   * estrutura real e sargável — confirmado com `EXPLAIN QUERY PLAN` (ver relato da migração):
   * `SEARCH vocab_cards USING INDEX idx_vocab_src_lang_base (src_lang_base=?)`. Zero backfill:
   * o valor é recalculado a cada leitura, então não há linha "desatualizada" possível.
   */
  srcLangBase: text('src_lang_base').generatedAlwaysAs(
    sql`(lower(substr(coalesce(src_lang,''),1,2)))`, { mode: 'virtual' },
  ),
}, (t) => [
  /* UNIQUE que destrava o upsert atômico. Parcial (`deleted_at is null`) porque um cartão
     removido não pode bloquear o recadastro da mesma palavra. Sem ele, a dedup ficava 100% em
     JS e já havia falhado 213 vezes neste banco. */
  uniqueIndex('uq_vocab_user_norm').on(t.userId, t.normKey).where(sql`deleted_at is null`),
  /* A listagem da tela: `where user_id and deleted_at is null order by added_at desc`.
     Antes: SCAN da tabela inteira + TEMP B-TREE para o ORDER BY, 45,3 ms com 2.116 linhas. */
  index('idx_vocab_user_added').on(t.userId, t.addedAt),
  index('idx_vocab_user_occ').on(t.userId, t.occurrences),
  index('idx_vocab_user_cefr').on(t.userId, t.cefrLevel),
  index('idx_vocab_user_due').on(t.userId, t.dueAt),
  index('idx_vocab_session').on(t.userId, t.sessionId),
  index('idx_vocab_user_dificuldade').on(t.userId, t.difficultyScore),
  /**
   * O eixo idioma do filtro facetado (tarefa 1). Antes o predicado era uma EXPRESSÃO
   * (`LOWER(SUBSTR(src_lang,1,2))=?`) e não podia usar índice — full scan a cada filtro por
   * idioma. `src_lang_base` é gerada (virtual) e este índice é sobre ela: sargável.
   */
  index('idx_vocab_src_lang_base').on(t.srcLangBase),
])

/**
 * OCORRÊNCIAS — a tabela que faltava, e que destrava as telas C e D.
 *
 * Antes, cartão e ocorrência estavam fundidos: a 2ª vez que o usuário via uma palavra era
 * DESCARTADA como 'duplicada' (`vocab.ts:113`), então "quantas vezes vi isto" e "onde vi" não
 * existiam como dado. `frequency` ficou 0 de 2.126 linhas, e `sentence` guardava só a primeira
 * frase. Separar as duas é o que permite contar repetições, listar origens e datar a primeira e a
 * última vez.
 */
export const vocabOccurrences = sqliteTable('vocab_occurrences', {
  id: text('id').primaryKey(),
  /* F3-04: a tabela só tinha `user_id`. Sem `deleted_at` ela não participava do apagamento em
     cascata — apagar o cartão deixava a ocorrência viva; e sem `created_at`/`updated_at` não havia
     como datar a linha independentemente do evento que ela descreve (`occurred_at`). */
  ...meta,
  userId: text('user_id').notNull(),
  cardId: text('card_id').notNull().references(() => vocabCards.id),
  /** Quando ESTA ocorrência aconteceu (epoch-ms). */
  occurredAt: integer('occurred_at').notNull(),
  /** 'sessao' | 'trilha' | 'manual' | 'anki' | 'import' | 'legado'. */
  originKind: text('origin_kind').notNull(),
  /** id da sessão, ou o idioma da trilha ('en'). Resolve a origem que virava NULL. */
  originRef: text('origin_ref'),
  /** A frase DESTA ocorrência — antes só a primeira sobrevivia. */
  sentence: text('sentence'),
  utteranceId: text('utterance_id').references(() => utterances.id),
}, (t) => [
  index('idx_occ_user_card').on(t.userId, t.cardId),
  index('idx_occ_user_time').on(t.userId, t.occurredAt),
  index('idx_occ_origem').on(t.userId, t.originKind, t.originRef),
  /* A SONDA DO FILTRO FACETADO (migração 0020): os EXISTS de `selecionarParaJogo` correlacionam
     por (user_id, card_id) e ainda filtram origin_kind/origin_ref. Sem as quatro colunas em UM
     índice, o planner escolhia `idx_occ_origem` e visitava milhares de ocorrências POR candidato
     — medido em 20k cartões: 2,7–46 s por seleção (docs/pesquisa/medicao-filtro-20k.md). */
  index('idx_occ_probe').on(t.userId, t.cardId, t.originKind, t.originRef),
])

export const reviewLogs = sqliteTable('review_logs', {
  id: text('id').primaryKey(),
  ...meta,
  cardId: text('card_id').notNull().references(() => vocabCards.id),
  reviewedAt: integer('reviewed_at'),
  grade: integer('grade'), // 1..4 (FSRS)
  prevStability: real('prev_stability'),
  newStability: real('new_stability'),
  prevDue: integer('prev_due'),
  newDue: integer('new_due'),
  elapsedDays: real('elapsed_days'),
}, (t) => [
  /** "histórico desta palavra" — usado pela tela de detalhe (F5) e pelo modelo da F4. */
  index('idx_review_card').on(t.cardId, t.reviewedAt),
  /**
   * F3-01. O índice acima responde por CARTÃO; a tela de métricas pergunta por USUÁRIO e caía em
   * `SCAN review_logs`. `reviewed_at` como segunda coluna porque as métricas leem por janela de
   * tempo (streak, evolução semanal) e assim o índice também ordena.
   */
  index('idx_review_user').on(t.userId, t.reviewedAt),
])

/**
 * Resultados de exercício, um item por linha.
 *
 * Até aqui a tabela guardava só `session_id, kind, correct, score, exercise_kind` — sem nenhuma
 * referência ao item jogado e sem id de rodada. Uma partida de 8 itens virava 8 linhas
 * indistinguíveis entre si, gravadas em `Promise.all` (mesmo milissegundo, nem `created_at`
 * desempata). Consequência prática: era impossível responder "quais palavras eu já vi", repetir
 * uma rodada, ou evitar repetição. As colunas abaixo existem para desfazer exatamente isso.
 *
 * Todas ANULÁVEIS de propósito: as ~1.500 linhas já gravadas não têm esses dados e precisam
 * continuar válidas (`ALTER TABLE ADD COLUMN` sem default, nada é reescrito).
 */
export const exerciseResults = sqliteTable('exercise_results', {
  id: text('id').primaryKey(),
  ...meta,
  sessionId: text('session_id').references(() => sessions.id),
  kind: text('kind'),
  correct: integer('correct'), // 0/1
  /**
   * ATENÇÃO — esta coluna carrega o placar DA RODADA, repetido em cada item dela.
   *
   * Não é o ponto daquele item, e "consertar" isso para gravar o ponto do item transformaria o
   * recorde (`listarRecordes`) no melhor ITEM em vez da melhor rodada. A duplicação é intencional.
   *
   * E ela guarda TRÊS unidades diferentes, conforme `exercise_kind`: pontos de rodada nos nove
   * minijogos, 0–100 no `read-aloud` (acurácia de pronúncia) e 0/1 nos exercícios de estudo. Por
   * isso toda leitura agregada precisa filtrar por `exercise_kind`.
   */
  score: real('score'),
  exerciseKind: text('exercise_kind'),
  /** Amarra os itens de UMA rodada. Sem isto, 8 linhas simultâneas não se reagrupam. */
  roundId: text('round_id'),
  /**
   * COMBO MÁXIMO DA RODADA — repetido em cada item dela, como `score`, e pelo mesmo motivo: a
   * linha é o item e o recorde é da rodada.
   *
   * NULL = rodada gravada antes da migração 0025, não combo zero. `listarRecordes` usa `MAX`,
   * que ignora NULL; um `COALESCE(..., 0)` diria que aquelas rodadas tiveram combo zero.
   */
  combo: integer('combo'),
  /**
   * O item jogado: a palavra (jogos de baralho) ou o id da fala (jogos de frase). É a coluna que
   * responde "o que eu já vi". Guardamos a palavra, e não só um `card_id`, porque os cartões da
   * TRILHA nascem em memória e não têm id no banco (ver `ItemOutcome.palavra`).
   */
  itemRef: text('item_ref'),
  /** Tentativas até acertar (1 = de primeira). O `ItemOutcome` já produz e o app descartava. */
  attempts: integer('attempts'),
  /** Tempo até responder, em ms. Idem: era medido e jogado fora. */
  ms: integer('ms'),
  /** Usou dica/revelação (0/1). Um acerto com dica não é o mesmo acerto — separa os dois. */
  hinted: integer('hinted'),
  /** De onde os itens vieram: 'baralho' | 'sessao:<id>' | 'trilha:<nivel>'. */
  origem: text('origem'),
  /* F3: referência POR ID ao cartão. `item_ref` guarda a PALAVRA, e por isso só 14,9% dos 215
     resultados eram correlacionáveis (0 casavam por id). Sem isto, desempenho não realimenta a
     dificuldade. */
  cardId: text('card_id').references(() => vocabCards.id),
}, (t) => [
  // As duas únicas consultas previstas: "o que eu já vi deste conjunto" (item_ref) e
  // "me devolva a rodada X" (round_id). Sem índice viram varredura da tabela inteira.
  index('idx_exercise_results_item_ref').on(t.itemRef),
  index('idx_exercise_results_round_id').on(t.roundId),
  /* O RECORDE POR JOGO (`listarRecordes`): `where exercise_kind in (…) and round_id is not null
     group by exercise_kind`. Sem este índice a consulta varre a tabela toda — e ela cresce rápido
     justamente quando alguém emenda uma corrente de rodadas, que é quando o recorde importa. */
  index('idx_exercise_results_kind_round').on(t.exerciseKind, t.roundId),
  /** F3: "como me saí com esta palavra" — a consulta que a tela C e o modelo da F4 fazem. */
  index('idx_exercise_results_card').on(t.userId, t.cardId, t.createdAt),
])

/**
 * GASTOS DE SEEDS — a metade que faltava para a moeda existir de verdade.
 *
 * Seeds sempre foi uma ESTATÍSTICA: `deriveProgress` a recalculava de `wordsCaptured` e
 * `correctReviews` a cada carregamento. Estatística não se gasta — recalcular devolveria o valor
 * cheio no reload seguinte, e a compra evaporaria. O ganho pode continuar derivado (é função de
 * fatos que só acumulam); o GASTO, não: é um evento, e evento precisa ser gravado.
 *
 * `(user_id, spend_id)` é ÚNICO, e é o que torna o débito idempotente. Sem isso, um duplo-clique
 * (ou o retry de uma rede instável, ou o StrictMode chamando o efeito duas vezes em desenvolvimento)
 * cobraria duas vezes pela mesma ação. O cliente gera o id ANTES de enviar; o servidor ignora a
 * segunda chegada em vez de somar. É a mesma forma do `round_id`, pela mesma razão.
 *
 * O unique é POR USUÁRIO, não global (auditoria P1-5): o `spend_id` é escolhido pelo cliente, então
 * um unique global deixava o usuário A negar o gasto de B só por ter usado o id antes — a busca de
 * idempotência filtra por `(spendId, userId)` mas a constraint barrava pelo id sozinho.
 */
export const seedSpends = sqliteTable('seed_spends', {
  id: text('id').primaryKey(),
  ...meta,
  /** Id gerado pelo CLIENTE. Reenvio do mesmo id pelo MESMO dono = mesma cobrança. */
  spendId: text('spend_id').notNull(),
  /** Quanto custou, em seeds. Sempre positivo — devolução seria outra coisa, com outro nome. */
  amount: integer('amount').notNull(),
  /** O que foi comprado: 'pular-rodada' | … Serve para saber no que a moeda é gasta de verdade. */
  reason: text('reason').notNull(),
  /** Contexto opcional (o jogo, a rodada). Diagnóstico, não regra. */
  ref: text('ref'),
}, (t) => [
  index('idx_seed_spends_spend_id').on(t.spendId),
  // Índice PARCIAL: a unicidade vale só entre linhas VIVAS. Com unique comum, um gasto
  // soft-deletado ocupava o slot para sempre — o INSERT conflitava, o SELECT (que filtra
  // deletedAt) não achava, e o débito estourava sem caminho de recuperação (P2-N2).
  uniqueIndex('uq_seed_spends_user_spend').on(t.userId, t.spendId).where(sql`${t.deletedAt} is null`),
])

/**
 * ECONOMIA v2 — a metade servidor que faltava (A7, 2026-08-30/31).
 *
 * O cliente foi escrito em 2026-08-28 chamando `POST /api/metrics/presenca` e
 * `POST /api/metrics/seeds/creditar` — e as rotas só existiam no servidor EFÊMERO (modo sem
 * conta), então na conta logada as conquistas nunca desbloqueavam: a falha era 404 permanente,
 * não rede. O desenho aqui ESPELHA o efêmero, que é a implementação de referência já em produção:
 * crédito é evento idempotente por (user_id, credito_id) — mesmo argumento de `seed_spends`, um
 * crédito que se recalcula não é crédito — e presença é uma linha por (user_id, dia local).
 */
export const seedCredits = sqliteTable('seed_credits', {
  id: text('id').primaryKey(),
  ...meta,
  /** Id gerado pelo CLIENTE (ex.: 'conquista:primeira-captura'). Reenvio = mesmo crédito. */
  creditoId: text('credito_id').notNull(),
  /** Seeds creditadas. Zero é válido: há conquistas que só dão XP. */
  amount: integer('amount').notNull(),
  /** XP creditado junto (conquistas dão os dois). */
  xp: integer('xp').notNull().default(0),
  /** De onde veio: 'conquista:<id>' | … Diagnóstico e auditoria do saldo. */
  reason: text('reason').notNull(),
}, (t) => [
  index('idx_seed_credits_credito_id').on(t.creditoId),
  // Parcial pelo mesmo motivo de uq_seed_spends_user_spend (P2-N2): unicidade só entre vivas.
  uniqueIndex('uq_seed_credits_user_credito').on(t.userId, t.creditoId).where(sql`${t.deletedAt} is null`),
])

/**
 * CRÉDITOS — a moeda COMPRADA (spec economia-de-creditos + economia-legivel-e-moedas).
 *
 * A regra que separa isto de `seed_credits`: Seeds são GANHAS e o cliente pode calculá-las;
 * Créditos são comprados com dinheiro e por isso vivem SÓ aqui — "nada comprado com dinheiro
 * pode viver em localStorage". O saldo nunca é campo mutável: é `compras pagas − gastos`, do
 * mesmo jeito que o saldo de Seeds, para que reembolso seja um evento inverso e não um UPDATE.
 *
 * `provider_payment_id` é único porque é a chave de idempotência do webhook: o Asaas reentrega
 * o mesmo evento quando não recebe 200, e crédito duplicado é dinheiro de graça.
 */
export const creditPurchases = sqliteTable('credit_purchases', {
  id: text('id').primaryKey(),
  ...meta,
  /** O pacote comprado ('c100' | 'c300' | 'c700' | 'passe-t1'). */
  sku: text('sku').notNull(),
  /** Quantos créditos a compra concede quando confirmar. */
  creditos: integer('creditos').notNull(),
  /** Em CENTAVOS: dinheiro em ponto flutuante é como se perde um centavo por transação. */
  valorCentavos: integer('valor_centavos').notNull(),
  provider: text('provider').notNull().default('asaas'),
  /** Id da cobrança no provedor. É por ele que o webhook encontra esta linha. */
  providerPaymentId: text('provider_payment_id'),
  /** 'pendente' até o webhook confirmar; 'pago' concede; 'cancelado' não concede nada. */
  status: text('status').notNull().default('pendente'),
  paidAt: integer('paid_at'),
}, (t) => [
  index('idx_credit_purchases_user').on(t.userId),
  uniqueIndex('uq_credit_purchases_payment').on(t.providerPaymentId).where(sql`${t.deletedAt} is null`),
])

/** O outro lado: gasto de créditos. Mesmo desenho de `seed_spends` — evento, idempotente por id. */
export const creditSpends = sqliteTable('credit_spends', {
  id: text('id').primaryKey(),
  ...meta,
  /** Id gerado pelo cliente; reenvio do mesmo id pelo mesmo dono não cobra de novo. */
  spendId: text('spend_id').notNull(),
  amount: integer('amount').notNull(),
  reason: text('reason').notNull(),
  ref: text('ref'),
}, (t) => [
  index('idx_credit_spends_spend_id').on(t.spendId),
  uniqueIndex('uq_credit_spends_user_spend').on(t.userId, t.spendId).where(sql`${t.deletedAt} is null`),
])

export const presencas = sqliteTable('presencas', {
  id: text('id').primaryKey(),
  ...meta,
  /** Dia LOCAL do usuário (inteiro de `diaLocal`) — o fuso é o dele, não o do servidor. */
  dia: integer('dia').notNull(),
}, (t) => [
  uniqueIndex('uq_presencas_user_dia').on(t.userId, t.dia).where(sql`${t.deletedAt} is null`),
])

export const analyses = sqliteTable('analyses', {
  id: text('id').primaryKey(),
  ...meta,
  sessionId: text('session_id').notNull().references(() => sessions.id),
  analyzedAt: integer('analyzed_at'),
  providerId: text('provider_id'),
  analysis: text('analysis'), // JSON (SessionAnalysis)
})

/*
 * F1-05: `memory_embeddings` foi REMOVIDA. Estava em 4 migrations com 0 linhas e nenhum leitor ou
 * escritor — provisionada para `openspec/changes/assistant-agent-rag`, que não foi implementada.
 * Schema não é lugar de intenção: a tabela guardaria TEXTO do usuário + vetor e já entrava na
 * exportação/exclusão da conta (LGPD) sem nunca ter tido dado. Quando o RAG existir, ela volta com
 * a change que a define.
 */

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  ...meta,
  name: text('name').notNull(),
  builtin: integer('builtin'), // 0/1
  bindings: text('bindings'), // JSON (capacidade → cadeia de bindings)
  budget: text('budget'), // JSON
  economyMode: integer('economy_mode'), // 0/1
})

export const providerCredentials = sqliteTable('provider_credentials', {
  id: text('id').primaryKey(),
  ...meta,
  label: text('label'),
  kind: text('kind'), // 'anthropic' | 'openai' | 'gemini' | 'groq' | 'openrouter' | 'hf' | 'custom'
  baseUrl: text('base_url'),
  defaultModel: text('default_model'),
  secretRef: text('secret_ref').references(() => secrets.ref), // segredo write-only no server
})

/**
 * F3-04: ganhou `user_id` e `deleted_at`. Sem eles a tabela ficava FORA de toda operação por
 * titular — `backfillNullOwner` a pulava, e um segredo só era alcançável pela `secret_ref` de uma
 * credencial; se a credencial sumisse primeiro, a chave cifrada ficava órfã e inalcançável para
 * sempre. `user_id` continua ANULÁVEL (linhas legadas sem credencial dona) e não é o controle de
 * acesso — este segue sendo o escopo da credencial em `credentialsRepo.getSecret`.
 */
export const secrets = sqliteTable('secrets', {
  ref: text('ref').primaryKey(),
  valueEncrypted: text('value_encrypted').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  userId: text('user_id'),
  deletedAt: integer('deleted_at'),
})

/**
 * Configurações por usuário. `unique(user_id)` é o BACKSTOP do provisionamento: sem ele,
 * `ensure()` (get-then-insert) duplicava linha sob concorrência e `get()` — que usa
 * `limit(1)` sem `ORDER BY` — passava a devolver qualquer uma delas (auditoria P1-4).
 */
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  ...meta,
  activeProfileId: text('active_profile_id'),
  targetLanguage: text('target_language'),
  ui: text('ui'), // JSON
}, (t) => [
  // Parcial pelo mesmo motivo do seed_spends: uma linha soft-deletada travaria o
  // ensure() do usuário para sempre (INSERT conflita, get() não acha).
  uniqueIndex('uq_settings_user').on(t.userId).where(sql`${t.deletedAt} is null`),
])

/**
 * SaaS Fatia 1 — CONTA de usuário (espelho do `sub` do Supabase). NÃO confundir com `profiles`
 * (perfis de IA/persona). `id` É o próprio UserId (o `sub`, ou `LOCAL_OWNER` no self-host); por isso
 * NÃO usa `...meta` (a coluna `user_id` seria redundante) — segue o enxuto de `secrets`.
 * Eixo RBAC: `role` (quem você é) ≠ plano (o que pagou, em `subscriptions`).
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // = UserId (sub do Supabase / LOCAL_OWNER)
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  email: text('email'),
  role: text('role').notNull().default('user'), // 'user' | 'admin' | 'support'
  status: text('status').notNull().default('active'), // 'active' | 'suspended'

  /**
   * PERFIL (migração 0008). Até aqui a conta só tinha id, e-mail, papel e status — a aplicação não
   * sabia o NOME de ninguém, e nenhuma tela mostrava quem estava logado.
   *
   * Todas nulas e sem default, e isso é a decisão: ausente significa **"não perguntamos"**, que é
   * diferente de um valor presumido. Um `locale` com default 'pt-BR' seria indistinguível de uma
   * escolha real do usuário, e o app passaria a afirmar algo que ninguém disse.
   *
   * Sem `avatar_url`: a foto é derivada das INICIAIS do nome. Upload exigiria Supabase Storage, que
   * não é usado em lugar nenhum do projeto, e não há quota de armazenamento por usuário.
   */
  displayName: text('display_name'),
  locale: text('locale'),
  bio: text('bio'),
  /** Para que a pessoa usa o app — o objetivo que o Onboarding nunca chegou a perguntar. */
  goal: text('goal'),
  /** Quando o perfil foi preenchido pela primeira vez. Epoch ms. */
  onboardedAt: integer('onboarded_at'),
})

/**
 * INTERESSES do usuário (migração 0008) — tabela, e não uma coluna JSON.
 *
 * O caminho barato seria enfiar um array no blob `settings.ui`. Três razões contra: aquele blob é
 * read-modify-write NÃO atômico (duas telas gravando se sobrescrevem, defeito já documentado);
 * interesse é um conjunto que se conta e se filtra, e em SQLite isso viraria `json_each`; e a
 * tabela transforma a de-duplicação em CONSTRAINT em vez de código que alguém precisa lembrar de
 * escrever.
 *
 * `slug` vem de um vocabulário FECHADO (`@core/learning/interesses`), não de texto livre: um campo
 * aberto viraria uma lista de mil grafias da mesma coisa, inútil para agrupar ou recomendar.
 *
 * O índice único é PARCIAL (`where deleted_at is null`), o mesmo padrão de `uq_settings_user` e
 * `uq_vocab_user_norm` — senão remover e readicionar um interesse esbarraria no fantasma do antigo.
 */
export const userInterests = sqliteTable('user_interests', {
  id: text('id').primaryKey(),
  ...meta,
  slug: text('slug').notNull(),
}, (t) => [
  uniqueIndex('uq_user_interest').on(t.userId, t.slug).where(sql`${t.deletedAt} is null`),
])

/**
 * SaaS Fatia 1 — ASSINATURA (o "que você pagou"), eixo SEPARADO do `role`. Fonte da verdade do plano
 * server-side (o billing escreve aqui via webhook — Fatia 6). Uma assinatura por usuário.
 */
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  ...meta,
  plan: text('plan').notNull().default('free'), // 'free' | 'pro' | 'selfhost'
  status: text('status').notNull().default('active'), // 'trialing'|'active'|'past_due'|'canceled'
  currentPeriodEnd: integer('current_period_end'),
  cancelAtPeriodEnd: integer('cancel_at_period_end'), // 0/1
  provider: text('provider'), // 'stripe' | 'lemonsqueezy' | null
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id'),
}, (t) => [
  unique('uq_subscriptions_user').on(t.userId),
])

/**
 * SaaS Fatia 1 — CONTADORES de uso de IA gerenciada (fair-use), por janela mensal. O enforcement
 * (bloquear+avisar no teto) entra na Fatia 1b/3; aqui só a estrutura. `unique(user_id, metric, window)`
 * torna o upsert idempotente.
 */
/**
 * E3 — EVENTOS DE BILLING recebidos por webhook. A entrega do provedor é *at-least-once* (a doc do
 * Asaas manda implementar idempotência pelo id do evento): o INSERT nesta tabela é o teste-e-marca
 * atômico — evento repetido conflita na PK e vira 200 sem efeito, nunca uma segunda promoção.
 * `userId` fica NULL quando o evento não aponta usuário (é registro de auditoria mesmo assim).
 */
/**
 * FALHAS DO BOOT — no banco, e nao na memoria do processo (auditoria de 2026-09-07, achado A34).
 *
 * `bootStatus` era um array de modulo. Em cluster, so o primario roda migracao e backfill, entao
 * uma falha ficava registrada NELE e invisivel nos workers: `/api/health` respondia `degraded` ou
 * `ok` conforme o processo que o balanceador escolhesse. Um orquestrador vendo saude alternada nao
 * consegue decidir nada — e a falha que a probe existe para denunciar (linhas com `user_id` NULL,
 * cartoes Leitner nao migrados) e exatamente uma que atravessa os processos, porque esta no dado.
 *
 * Uma linha por passo: gravar de novo atualiza, e o passo que passa a dar certo APAGA a linha. Sem
 * isso a saude ficaria degradada para sempre depois de uma falha transitoria.
 */
export const bootFalhas = sqliteTable('boot_falhas', {
  /** Identificador curto do passo: 'migracao-fsrs' | 'backfill-tenancy'. */
  passo: text('passo').primaryKey(),
  em: integer('em').notNull(),
  /** Qual instancia registrou — hostname:pid. So para diagnostico; a saude nao depende disto. */
  instancia: text('instancia'),
})

export const billingEvents = sqliteTable('billing_events', {
  /** O id do EVENTO no provedor (`evt_…` no Asaas) — a chave da idempotência. */
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  provider: text('provider').notNull(), // 'asaas'
  event: text('event').notNull(), // 'PAYMENT_CONFIRMED' | 'PAYMENT_OVERDUE' | …
  userId: text('user_id'),
  /** Id da cobrança/assinatura no provedor, para auditoria cruzada. */
  providerRef: text('provider_ref'),
  /**
   * O QUE ACONTECEU com o evento (auditoria de 2026-09-07, achado A05). Antes, um pagamento
   * confirmado cuja assinatura divergia da registrada, ou um avulso que não casava com compra
   * nenhuma, caía num `break` e respondia 200: o Asaas não reentrega e o pagante ficava sem o
   * plano, sem trilha para reprocessar. Agora todo evento termina `aplicado` ou `nao-aplicado`
   * com `motivo`, e o payload bruto fica guardado para um administrador reaplicar.
   */
  estado: text('estado').notNull().default('aplicado'), // 'aplicado' | 'nao-aplicado'
  motivo: text('motivo'),
  payload: text('payload'), // JSON do evento como chegou
})

export const usageCounters = sqliteTable('usage_counters', {
  id: text('id').primaryKey(),
  ...meta,
  metric: text('metric').notNull(), // 'stt_seconds' | 'llm_tokens' | 'youtube_imports'
  window: text('window').notNull(), // 'YYYY-MM'
  count: integer('count').notNull().default(0),
}, (t) => [
  unique('uq_usage_user_metric_window').on(t.userId, t.metric, t.window),
])

/**
 * MOTOR ANKI — ACERVO (`openspec/changes/motor-anki-acervo`).
 *
 * Decisão 1 do design: acervo PRÓPRIO, não uma quinta `FonteId`. `vocab_cards` não muda uma
 * vírgula — o vínculo mora em `anki_notes.projected_card_id`, e se a projeção inteira for
 * revertida o app continua de pé. As três tabelas abaixo são ADITIVAS: nenhuma tabela existente
 * é alterada por esta migração.
 *
 * Política de rollback (Decisão 7): o repositório não tem rollback automático (zero `down`
 * existentes). Para tabela nova, reverter é seguro — `down.sql` manual em
 * `openspec/changes/motor-anki-acervo/down.sql` faz só `DROP TABLE`, antes de haver adoção.
 */

/** Um baralho `.apkg` importado. `arquivoOrigem` + `nome` é a chave de idempotência de reimport. */
export const ankiDecks = sqliteTable('anki_decks', {
  id: text('id').primaryKey(),
  ...meta,
  /** Nome exibido no app — pode ser editado pelo usuário. */
  nome: text('nome').notNull(),
  /** Nome do baralho tal como veio de dentro do `.apkg` (auditoria/diagnóstico). */
  nomeNoArquivo: text('nome_no_arquivo'),
  /** Nome do arquivo `.apkg` enviado. Junto com `nome` forma a chave de `criarOuAcharDeck`. */
  arquivoOrigem: text('arquivo_origem').notNull(),
  /** 'ativo' | 'desativado'. Desativado não deleta — as notas viram 'arquivada'. */
  estado: text('estado').notNull().default('ativo'),
  idiomaOrigem: text('idioma_origem'),
  idiomaAlvo: text('idioma_alvo'),
}, (t) => [
  index('idx_anki_decks_user').on(t.userId, t.deletedAt),
])

/**
 * Uma nota Anki — o registro CANÔNICO, sobrevive independente de virar cartão jogável ou não.
 *
 * `guid` é o identificador estável do Anki (sobrevive a reexport); o par `(deck_id, guid)` é
 * ÚNICO e é a chave do upsert de `gravarNotas` — reimportar o mesmo baralho não duplica.
 *
 * `campos_brutos` guarda TODOS os campos da nota como JSON (`{nome: valor}`), íntegros, mesmo os
 * que o app não usa hoje — é o que permite a Decisão 4 (fusão de duas notas no mesmo cartão) não
 * perder nada: a nota original continua inspecionável.
 */
export const ankiNotes = sqliteTable('anki_notes', {
  id: text('id').primaryKey(),
  ...meta,
  deckId: text('deck_id').notNull().references(() => ankiDecks.id),
  /** Id estável do Anki — sobrevive a reexport do mesmo baralho. */
  guid: text('guid').notNull(),
  /** Nome do notetype no Anki ('Basic', 'Cloze', …) — diagnóstico do mapeamento de campos. */
  notetype: text('notetype'),
  /** Hash da ESTRUTURA de campos (nomes+ordem) — detecta notetype que mudou de forma entre imports. */
  estruturaHash: text('estrutura_hash'),
  /** JSON `{nomeDoCampo: valor}` — todos os campos, íntegros. Ver comentário da tabela. */
  camposBrutos: text('campos_brutos'),
  /** Campos mapeados para o jogo (podem ser derivados de `campos_brutos` por heurística/config). */
  frente: text('frente'),
  verso: text('verso'),
  exemplo: text('exemplo'),
  tags: text('tags'),
  /** 'arquivada' (fora da fila) | 'ativa' (projetada em vocab_cards) | 'ausente_no_arquivo'. */
  estado: text('estado').notNull().default('arquivada'),
  /** FK anulável: só existe enquanto a nota está projetada como cartão jogável. */
  projectedCardId: text('projected_card_id').references(() => vocabCards.id),
  /** 'desativacao' | 'manual' | null — decide se um reimport REATIVA o cartão soft-deletado ou
   *  cria um novo (Decisão 4: a aresta perigosa do índice parcial). */
  motivoDaBaixa: text('motivo_da_baixa'),
  /** Por que a nota não é jogável (lixo detectado por `avaliarCartao`), quando aplicável. */
  motivoDescarte: text('motivo_descarte'),
  importId: text('import_id'),
}, (t) => [
  index('idx_anki_notes_user_deck').on(t.userId, t.deckId),
  uniqueIndex('uq_anki_notes_deck_guid').on(t.deckId, t.guid),
  index('idx_anki_notes_deck_estado').on(t.deckId, t.estado),
])

/**
 * LEDGER de importação (Decisão 5): não há scheduler no servidor, então "job" é uma sequência de
 * requisições pequenas dirigidas pelo cliente, e o progresso precisa ser consultável entre elas.
 * `porMotivo` é JSON com a contagem de descarte por `motivoDescarte`, para a tela explicar o total.
 */
export const ankiImports = sqliteTable('anki_imports', {
  id: text('id').primaryKey(),
  ...meta,
  deckId: text('deck_id').notNull().references(() => ankiDecks.id),
  arquivo: text('arquivo'),
  bytes: integer('bytes'),
  hashDoArquivo: text('hash_do_arquivo'),
  /** 'lendo' | 'gravando' | 'concluido' | 'parcial' | 'falhou'. */
  estado: text('estado').notNull().default('lendo'),
  notasLidas: integer('notas_lidas').notNull().default(0),
  notasNovas: integer('notas_novas').notNull().default(0),
  notasAtualizadas: integer('notas_atualizadas').notNull().default(0),
  notasDescartadas: integer('notas_descartadas').notNull().default(0),
  /** JSON `{motivo: contagem}`. */
  porMotivo: text('por_motivo'),
  erro: text('erro'),
}, (t) => [
  index('idx_anki_imports_user_deck').on(t.userId, t.deckId),
])

/**
 * MOTOR ANKI — MÍDIA (`openspec/changes/motor-anki-midia`).
 *
 * `anki_media` é o ARQUIVO físico (gravado pelo seam `armazenamentoDoAmbiente`, nome derivado do
 * hash em `anki-media/<userId>/<sha256>`); `anki_note_media` é a REFERÊNCIA de uma nota a ele.
 * As duas tabelas são separadas porque N notas podem citar o MESMO arquivo (mesma pronúncia
 * reaproveitada entre baralhos, ou entre frente/frase de exemplo da mesma nota) — sem a separação,
 * dedupe por conteúdo não teria onde morar.
 *
 * Índice único `(user_id, sha256)`, NÃO GLOBAL — decisão jurídica, não técnica (ver design.md,
 * Decisão 2): mídia enviada pelo usuário é cópia privada análoga a cloud storage; um arquivo
 * único servido a MUITOS usuários descaracteriza essa cópia privada e se aproxima de distribuição,
 * que é a fronteira que o programa decidiu não cruzar. Dedupe global economizaria mais disco, mas
 * também tornaria arbitrária a atribuição de cota por plano (de quem é o byte de um arquivo
 * compartilhado?) — então cada usuário paga (e dedupe) só a própria cópia.
 */
export const ankiMedia = sqliteTable('anki_media', {
  id: text('id').primaryKey(),
  ...meta,
  /** sha256 CALCULADO NO SERVIDOR (nunca o do cliente) — é o nome do objeto no storage. */
  sha256: text('sha256').notNull(),
  bytes: integer('bytes').notNull(),
  /** Detectado por magic bytes (`tipoDeArquivo.ts`), não pelo Content-Type declarado no upload. */
  contentType: text('content_type').notNull(),
}, (t) => [
  index('idx_anki_media_user').on(t.userId, t.deletedAt),
  uniqueIndex('uq_anki_media_user_sha256').on(t.userId, t.sha256),
])

/**
 * Referência de UMA nota a UM arquivo de mídia. `mediaId` é ANULÁVEL de propósito: a nota (com
 * `frente`/`verso` já preenchidos por `extrairMidia`) pode existir, e a referência ser conhecida
 * pelo `nomeOriginal`, ANTES de o arquivo em si ter sido enviado (Decisão 1: extração/negociação
 * de mídia acontece na ATIVAÇÃO, não no upload da coleção) — uma linha aqui com `mediaId` nulo é
 * "referenciado, mas ainda faltando", exatamente o que a auditoria de baralho (tasks.md §5.2)
 * precisa mostrar.
 */
export const ankiNoteMedia = sqliteTable('anki_note_media', {
  id: text('id').primaryKey(),
  ...meta,
  noteId: text('note_id').notNull().references(() => ankiNotes.id),
  /** Anulável: a referência pode existir sem o arquivo ter chegado (ver comentário da tabela). */
  mediaId: text('media_id').references(() => ankiMedia.id),
  /** 'audio_palavra' | 'audio_frase' | 'imagem'. */
  papel: text('papel').notNull(),
  /** Nome tal como veio de dentro do `.apkg` (`palavra.mp3`) — resolve a referência no render. */
  nomeOriginal: text('nome_original').notNull(),
}, (t) => [
  index('idx_anki_note_media_note').on(t.noteId),
  index('idx_anki_note_media_media').on(t.mediaId),
])
