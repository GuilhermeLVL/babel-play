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
export const usageCounters = sqliteTable('usage_counters', {
  id: text('id').primaryKey(),
  ...meta,
  metric: text('metric').notNull(), // 'stt_seconds' | 'llm_tokens' | 'youtube_imports'
  window: text('window').notNull(), // 'YYYY-MM'
  count: integer('count').notNull().default(0),
}, (t) => [
  unique('uq_usage_user_metric_window').on(t.userId, t.metric, t.window),
])
