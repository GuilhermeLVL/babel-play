/**
 * Esquemas Zod das rotas que recebiam `req.body` cru (achado da auditoria de segurança).
 * Objetivo: limites de tamanho/quantidade por campo (anti-DoS dentro do teto global de 5mb)
 * e tipos garantidos ANTES de tocar o repositório — sem mudar o contrato do cliente
 * (`src/data/api.ts` é a fonte dos shapes; campos continuam opcionais onde lá são opcionais).
 */
import { z } from 'zod'
import type { Response } from 'express'
import { subtipoDeCapaAceito } from './lib/capaDeSessao'

const shortStr = (max: number) => z.string().max(max).optional()

/**
 * S-13: valida a `imageUrl` de capa da sessão. Só aceitamos `https:` ou `data:image/` — sem isso,
 * o `<img src>` da Biblioteca virava um request de saída para um host arbitrário colado pelo usuário
 * (pixel de rastreamento / sonda). `http:`, `javascript:`, `file:`, etc. são rejeitados.
 */
/**
 * Teto de comprimento da capa. P2-N5: `data:image/` era aceito de QUALQUER tamanho, então o
 * teto efetivo virava o do body (5mb) — gravado na coluna `meta` de cada sessão. 8 KB cobre
 * um ícone/thumbnail em base64 com folga; capa de verdade deve ser https.
 */
export const MAX_IMAGE_URL = 8_192

/**
 * F11-03: a comparação de prefixo (`startsWith('data:image/')`) aceitava `data:image/svg+xml`, e
 * o subtipo seguia verbatim até virar o `Content-Type` da resposta em `sessions.ts:87`. Agora o
 * subtipo é extraído e conferido contra a lista fechada de `lib/capaDeSessao`.
 *
 * A guarda existe nos DOIS lados de propósito: aqui, para a capa hostil não ser gravada; e em
 * `lerCapaEmbutida`, para as que já estão no banco não serem servidas. Consertar só a escrita
 * deixaria as antigas passando.
 */
export function isSafeImageUrl(url: string): boolean {
  const u = url.trim()
  if (u.length > MAX_IMAGE_URL) return false
  const data = /^data:image\/([a-z0-9.+-]+)\s*;/i.exec(u)
  if (data) return subtipoDeCapaAceito(data[1])
  // `data:` que não casa o formato acima (sem subtipo, sem `;`) não é capa válida.
  if (u.toLowerCase().startsWith('data:')) return false
  try { return new URL(u).protocol === 'https:' } catch { return false }
}

/**
 * PATCH /api/sessions/:id/meta — a rota lia `req.body` cru (resto do P2-1). Só as duas
 * chaves conhecidas passam; `imageUrl: null` limpa a capa.
 */
export const patchMetaSchema = z.object({
  pinned: z.boolean().optional(),
  imageUrl: z.string().max(MAX_IMAGE_URL).nullable().optional(),
}).strip()

export const utteranceSchema = z.object({
  idx: z.number().int().min(0).max(1_000_000).optional(),
  source: shortStr(16),
  speakerName: shortStr(120),
  sourceLang: shortStr(20),
  sourceText: shortStr(10_000),
  targetLang: shortStr(20),
  translatedText: shortStr(10_000),
  confidence: z.number().min(0).max(1).optional(),
  engine: shortStr(60),
  tStartMs: z.number().int().min(0).optional(),
  tEndMs: z.number().int().min(0).optional(),
}).strip()

export const createSessionSchema = z.object({
  title: shortStr(200),
  kind: shortStr(30),
  sourceLang: shortStr(20),
  targetLang: shortStr(20),
  status: shortStr(30),
  durationMs: z.number().int().min(0).optional(),
  utterances: z.array(utteranceSchema).max(5_000).optional(),
  /** Migração sem conta → conta: chave de idempotência (ver `sessions.origem_local_id`). */
  origemLocalId: z.string().min(8).max(64).optional(),
}).strip()

export const replaceUtterancesSchema = z.object({
  utterances: z.array(utteranceSchema).max(5_000),
}).strip()

/**
 * `word` com no MÍNIMO 2 caracteres. Aceitar 1 deixava passar pontuação solta e sobra de
 * tokenização — e uma palavra de uma letra não vira exercício de jeito nenhum. A régua de
 * conteúdo (tradução vazia, ruído, duplicata) mora em `core/learning/quality.ts` e é aplicada no
 * repositório: aqui é só a fronteira de FORMATO.
 */
export const bulkAddCardsSchema = z.object({
  cards: z.array(z.object({
    word: z.string().trim().min(2).max(200),
    back: shortStr(2_000),
    sentence: shortStr(4_000),
    srcLang: shortStr(20),
    tgtLang: shortStr(20),
    clozePrompt: shortStr(4_000),
    clozeAnswer: shortStr(400),
    sessionId: shortStr(64),
    /* Nível CEFR vindo de lista curada. Sem estes dois campos o servidor sempre sobrescrevia com
       `estimateCefr`, que é comprimento de palavra — ou seja, um dado medido por linguistas era
       rebaixado a chute na hora de entrar. A confiança distingue os dois: 1 = medido, ~0,3 = chute. */
    cefrLevel: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
    cefrConfidence: z.number().min(0).max(1).optional(),
  }).strip()).max(500),
}).strip()

export const createCredentialSchema = z.object({
  label: shortStr(120),
  kind: shortStr(40),
  baseUrl: z.string().max(500).url().optional(),
  defaultModel: shortStr(120),
  secret: shortStr(4_000),
}).strip()

/**
 * Um item de exercício. Os campos a partir de `roundId` chegaram com a migração 0001: antes,
 * uma rodada de 8 itens virava 8 linhas indistinguíveis e o `ItemOutcome` (attempts/ms/hinted)
 * era medido no cliente e descartado no POST. Todos opcionais — o contrato antigo continua
 * válido e as linhas já gravadas não têm esses dados.
 */
/**
 * Uma RODADA inteira (F3). Substitui N chamadas de `exerciseResultSchema`, uma por item.
 * Teto de 200 itens: o maior jogo tem 20; 200 é folga para não virar campo livre.
 */
export const rodadaSchema = z.object({
  roundId: z.string().min(1).max(64),
  exerciseKind: shortStr(60),
  origem: shortStr(80),
  sessionId: shortStr(64),
  score: z.number().min(0).max(100_000).optional(),
  itens: z.array(z.object({
    cardId: shortStr(64),
    itemRef: shortStr(400),
    correct: z.number().int().min(0).max(1).optional(),
    attempts: z.number().int().min(0).max(1000).optional(),
    ms: z.number().int().min(0).max(3_600_000).optional(),
    hinted: z.number().int().min(0).max(1).optional(),
    kind: shortStr(60),
  })).min(1).max(200),
})

export const exerciseResultSchema = z.object({
  sessionId: shortStr(64),
  kind: shortStr(60),
  correct: z.number().int().min(0).max(1).optional(),
  /**
   * O teto era 100, e isso REJEITAVA rodada boa em silêncio. `scoreRound` do duelo relâmpago
   * multiplica a sequência (`core/minigames/grade.ts`): 5 acertos seguidos já dão 150, e 20 dão
   * 900. Como `saveExerciseResult` engolia o `!res.ok`, a rodada inteira sumia — sem histórico,
   * sem "repetir a última", sem XP de drill. Medido no banco: 53 linhas de blitz, `max(score)`
   * exatamente 90 (o teto do que passou), só 21 com `item_ref` e UM `round_id` distinto.
   *
   * 100.000 é folga deliberada: o pior caso real (duelo, 20 itens, tudo perfeito e rápido) fica
   * na casa do milhar. O teto continua existindo para barrar valor absurdo, não pontuação boa —
   * e `tests/pontuacao.test.ts` amarra os dois lados para não divergirem de novo.
   */
  score: z.number().min(0).max(100_000).optional(),
  exerciseKind: shortStr(60),
  roundId: shortStr(64),
  /* `item_ref` guarda a palavra ou o id da fala; 400 cobre frase de ditado sem virar campo livre. */
  itemRef: shortStr(400),
  attempts: z.number().int().min(0).max(1_000).optional(),
  /* Teto de 1h por item: acima disso é aba esquecida aberta, não tempo de resposta. */
  ms: z.number().int().min(0).max(3_600_000).optional(),
  hinted: z.number().int().min(0).max(1).optional(),
  origem: shortStr(80),
}).strip()

/** Filtros do histórico agregado (`GET /api/exercises/historico`), ambos opcionais. */
export const historicoQuerySchema = z.object({
  origem: shortStr(80),
  desde: z.coerce.number().int().min(0).optional(),
}).strip()

/** Filtro do recorde por jogo (`GET /api/exercises/recordes`). Sem `origem` = todas as fontes. */
export const recordesQuerySchema = z.object({
  origem: shortStr(80),
}).strip()

/**
 * Um gasto de seeds. `spendId` é OBRIGATÓRIO e é a chave da idempotência — sem ele o servidor não
 * teria como distinguir "o usuário comprou duas vezes" de "a mesma compra chegou duas vezes".
 *
 * O teto de `amount` é baixo de propósito: os sinks desta entrega custam dezenas, e um valor
 * absurdo vindo do cliente indica bug ou adulteração, não uma compra grande.
 */
export const seedSpendSchema = z.object({
  spendId: z.string().min(8).max(64),
  amount: z.number().int().min(1).max(10_000),
  reason: z.string().min(1).max(40),
  ref: shortStr(120),
}).strip()

/* ────────────────────────────────────────────────────────────────────────────
 * P2-1 — rotas que liam `req.body`/`req.query` cru, agora com fronteira de formato.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Nota de revisão do FSRS. Era o pior caso do achado: `(req.body?.grade ?? 3) as Grade`,
 * um cast sem checagem — qualquer valor entrava no cálculo do agendador e era persistido
 * em `review_logs.grade`, corrompendo o histórico de aprendizado do usuário.
 * O default 3 preserva o contrato do cliente.
 */
export const reviewGradeSchema = z.object({
  grade: z.number().int().min(1).max(4).default(3),
}).strip()

/**
 * Patch de settings. `ui` ia cru para `JSON.stringify` — um blob de até 5mb (o teto global
 * do body) por usuário, gravado sem limite próprio.
 */
const MAX_UI_BYTES = 64_000
export const settingsPatchSchema = z.object({
  activeProfileId: z.string().max(64).nullable().optional(),
  targetLanguage: z.string().max(20).nullable().optional(),
  ui: z.unknown().refine(
    (v) => v === undefined || v === null || JSON.stringify(v).length <= MAX_UI_BYTES,
    { message: `preferências de UI acima do teto (${MAX_UI_BYTES} caracteres)` },
  ).optional(),
}).strip()

/**
 * Patch do PERFIL do usuário (`PATCH /api/me`).
 *
 * `.strip()` faz o trabalho de segurança aqui, e não é detalhe de estilo: sem ele, `role` e
 * `status` chegariam intactos ao repositório, e um `set(patch)` cru promoveria a si mesmo a admin
 * — OWASP A01, escalada de privilégio pelo caminho mais banal possível. Os dois campos NÃO
 * aparecem neste esquema exatamente por isso; quem os muda é o endpoint de admin.
 *
 * `nullable` em toda parte porque apagar o próprio nome é uma operação legítima, e distinta de
 * "não mandei este campo" (que é `undefined` e não toca a coluna).
 */
export const perfilPatchSchema = z.object({
  displayName: z.string().max(60).nullable().optional(),
  locale: z.string().max(16).nullable().optional(),
  bio: z.string().max(280).nullable().optional(),
  goal: z.string().max(120).nullable().optional(),
  /* O teto de 32 é anti-abuso, não a regra de produto: o repositório corta em `MAX_INTERESSES` (8)
     usando o vocabulário fechado. Aqui só se impede que alguém mande dez mil strings. */
  interests: z.array(z.string().max(40)).max(32).optional(),
}).strip()

/**
 * DELETE /api/me — exclusão da conta (F5-03). `confirmar: true` é OBRIGATÓRIO.
 *
 * Não é cerimônia: a exclusão é DELETE físico em todas as tabelas, então não existe soft delete
 * para desfazer nem lixeira de onde recuperar. Um DELETE disparado por engano (retry de cliente,
 * prefetch, botão duplicado) apagaria a conta inteira sem que ninguém tivesse dito nada.
 */
export const excluirContaSchema = z.object({
  confirmar: z.literal(true),
}).strip()

/**
 * Reetiquetagem em lote: sem teto, virava um UPDATE por item num laço.
 * Dois esquemas porque os repositórios usam nomes diferentes para o mesmo par de idiomas —
 * utterances fala `sourceLang/targetLang`, vocab fala `srcLang/tgtLang`.
 */
const MAX_RELABEL = 5_000
export const relabelUtterancesSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(64),
    sourceLang: z.string().min(1).max(20),
    targetLang: z.string().min(1).max(20),
  }).strip()).max(MAX_RELABEL),
}).strip()

export const relabelVocabSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(64),
    srcLang: z.string().min(1).max(20),
    tgtLang: z.string().min(1).max(20),
  }).strip()).max(MAX_RELABEL),
}).strip()

/** PATCH de uma fala. O POST já limitava a 10.000/120 via `utteranceSchema`; o PATCH não. */
export const patchUtteranceSchema = z.object({
  sourceText: shortStr(10_000),
  translatedText: shortStr(10_000),
  speakerName: shortStr(120),
}).strip()

/** PATCH de sessão: `kind`/`status` sem teto e números negativos passavam. */
export const patchSessionSchema = z.object({
  title: shortStr(200),
  kind: shortStr(30),
  status: shortStr(30),
  durationMs: z.number().int().min(0).optional(),
  wordCount: z.number().int().min(0).optional(),
}).strip()

/** Busca de imagem: `q` sem teto virava chave do cache em memória (200 entradas). */
export const imageSearchQuerySchema = z.object({
  q: z.string().min(1).max(120),
}).strip()

/* ══════════════════ F11-04 · schemas de PARÂMETRO, QUERY e CABEÇALHO ══════════════════
 *
 * Medido antes: 21 dos 42 handlers com entrada do usuário não tinham schema — 50 %. Os dois
 * piores montavam consulta a partir de `req.query` cru e forçavam o tipo com `as never`
 * (`vocab.ts:26,27,50`), o que desliga o typechecker exatamente na fronteira onde ele seria mais
 * útil: o compilador passa a acreditar no que o cliente mandou.
 *
 * O que estes schemas fazem, e o que deliberadamente NÃO fazem: eles fecham enums, impõem tetos e
 * convertem números — sem apertar o contrato do cliente. Todo campo continua opcional onde já era,
 * porque o objetivo é tipar a borda, não recusar quem já funcionava.
 */

/** `:id` de recurso. Os ids são gerados pelo servidor (UUID/nanoid); o teto é folgado de propósito. */
export const idParamSchema = z.object({ id: z.string().min(1).max(128) }).strip()

/** Lista separada por vírgula, com teto de itens e de tamanho por item. */
const csv = (maxItens: number, maxCada = 64) =>
  z.string().max(maxItens * (maxCada + 1)).optional()
    .transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, maxItens) : undefined))

const FAIXAS = ['facil', 'medio', 'dificil'] as const

export const vocabParaJogoQuerySchema = z.object({
  fonte: z.enum(['baralho', 'sessao', 'trilha']).optional(),
  fonteRef: z.string().max(128).optional(),
  // Enum fechado no lugar do `as never`: valor fora da lista vira 400, não uma consulta torta.
  dificuldade: csv(3, 16).pipe(z.array(z.enum(FAIXAS)).max(3).optional()),
  estrategia: z.enum(['equilibrado', 'recentes', 'frequentes', 'em-dificuldade']).optional(),
  // O repositório já faz clamp em 1..200; declarar aqui recusa `limite=1e9` antes da consulta.
  limite: z.coerce.number().int().min(1).max(200).optional(),
  evitar: csv(200),
  lang: z.string().max(16).optional(),
}).strip()

export const vocabPaginaQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(500).optional(),
  cursorValor: z.string().max(128).optional(),
  cursorId: z.string().max(128).optional(),
  q: z.string().max(200).optional(),
  niveis: csv(20),
  origens: csv(20),
  desde: z.coerce.number().int().min(0).optional(),
  ate: z.coerce.number().int().min(0).optional(),
  ordem: z.enum(['recentes', 'frequentes', 'dificuldade', 'alfabetica']).optional(),
}).strip()

/**
 * PATCH de cartão: o handler fazia `typeof` + `slice(0,2000)` à mão.
 *
 * Só `back` e `inDeck`, porque é só isso que a rota aceita hoje — o resto do cartão (agendamento,
 * idioma, frase) tem donos próprios. Um schema mais largo aqui AMPLIARIA o contrato em vez de
 * apenas tipá-lo, que é o oposto do que este achado pede.
 */
export const patchVocabSchema = z.object({
  back: z.string().max(2_000).optional(),
  inDeck: z.boolean().optional(),
}).strip()

export const exerciseResultsQuerySchema = z.object({
  sessionId: z.string().max(128).optional(),
  origem: z.string().max(80).optional(),
}).strip()

export const metricsProfileQuerySchema = z.object({
  sessao: z.string().max(128).optional(),
}).strip()

export const metricsXpQuerySchema = z.object({
  balde: z.enum(['dia', 'semana']).optional(),
  desde: z.coerce.number().int().min(0).optional(),
}).strip()

/**
 * Exportação de baralho: o handler cortava em 5.000/120 depois de já ter o array inteiro na mão.
 *
 * A forma do cartão espelha `CartaoParaExportar` (server/import/ankiExport.ts:26) — o typecheck
 * denunciou a primeira versão, que aceitava `Record<string, unknown>` e teria empurrado objetos
 * sem `frente`/`verso` para dentro do gerador do `.apkg`.
 */
export const ankiExportSchema = z.object({
  cartoes: z.array(z.object({
    frente: z.string().max(2_000),
    verso: z.string().max(2_000),
    exemplo: z.string().max(2_000).optional(),
  }).strip()).min(1).max(5_000),
  nome: z.string().max(120).optional(),
}).strip()

/** Importação por URL (YouTube e web). O `assertPublicUrl` continua sendo a guarda de SSRF. */
export const importUrlSchema = z.object({
  url: z.string().min(1).max(2_048),
}).strip()

/**
 * Cabeçalhos dos uploads brutos. `x-filename` nunca vira caminho (o nome do arquivo é gerado pelo
 * servidor a partir do id da sessão — S-14), mas vira TÍTULO e chega ao banco.
 */
export const uploadHeadersSchema = z.object({
  'x-filename': z.string().max(400).optional(),
  'content-type': z.string().max(200).optional(),
}).strip()

/**
 * Valida e responde 400 com a PRIMEIRA razão legível quando o payload não passa.
 * Devolve `null` nesse caso — o handler deve retornar imediatamente.
 */
export function parseOr400<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const r = schema.safeParse(body ?? {})
  if (r.success) return r.data
  const first = r.error.issues[0]
  res.status(400).json({ error: `payload inválido: ${first?.path?.join('.') || '?'} — ${first?.message || 'malformado'}` })
  return null
}
