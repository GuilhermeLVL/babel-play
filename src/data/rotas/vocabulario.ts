/**
 * O CLIENTE DAS ROTAS DE VOCABULÁRIO — o baralho, a revisão FSRS e a saída para o Anki.
 *
 * Espelho de `src/data/efemero/rotas/vocabulario.ts`, com o mesmo recorte. Duas coisas daqui NÃO
 * têm par do outro lado, e a ausência é declarada em `tests/contratos/rotas-espelhadas.test.ts`:
 * `relabelCards` (escrita cruzada no acervo) e `exportarApkg` (o `.apkg` nasce no servidor).
 *
 * Rotas: GET `/api/vocab`, PATCH `/api/vocab/:id`, POST `/api/vocab/bulk-add`,
 * POST `/api/vocab/relabel`, POST `/api/vocab/:id/review`, POST `/api/import/anki/export`.
 */
import type { VocabCard } from '../../types'
import { play } from '../../lib/soundFx'
import { apiFetch } from '../api'

interface VocabRow {
  id: string
  word: string
  back: string | null
  sentence: string | null
  srcLang: string | null
  tgtLang: string | null
  clozePrompt: string | null
  clozeAnswer: string | null
  box: number | null
  dueAt: number | null
  stability: number | null
  difficulty: number | null
  reps: number | null
  /** epoch ms da última revisão FSRS. A coluna sempre existiu (`server/db/schema.ts`); só esta
   *  interface a omitia, então o servidor já mandava o campo e o cliente o descartava aqui. */
  lastReview: number | null
  sessionId: string | null
  inDeck: number | null
  cefrLevel: string | null
  cefrConfidence: number | null
  occurrences?: number | null
  difficultyScore?: number | null
  cefrSource?: string | null
  lastSeenAt?: number | null
}

function fsrsStateOf(row: VocabRow): VocabCard['fsrsState'] {
  if (row.stability == null) return 'New'
  return (row.reps ?? 0) < 2 ? 'Learning' : 'Review'
}

/**
 * A LINHA DO SERVIDOR VIRA CARTÃO — espalhando primeiro, listando depois.
 *
 * A versão anterior enumerava campo a campo o que copiar, e essa é a forma de perder dado em
 * silêncio: `occurrences`, `difficultyScore`, `cefrSource` e `lastSeenAt` foram adicionados no
 * servidor e nunca na lista, então chegavam ao cliente e eram jogados fora aqui (auditoria de
 * 2026-09-07, achado A19). Quem precisava deles lia por `cast` no ponto de uso e recebia
 * `undefined` — o recorte "as que mais escapam" mostrava zero palavras num baralho de 2.818.
 *
 * `...row` primeiro: campo novo do servidor passa a chegar por padrão. As atribuições abaixo
 * continuam sendo a tradução explícita do que MUDA de nome ou de forma (`back` → `translation`,
 * `dueAt` → ISO, `inDeck` 0/1 → boolean).
 */
export function rowToVocabCard(row: VocabRow): VocabCard {
  const dueIso = row.dueAt ? new Date(row.dueAt).toISOString() : ''
  return {
    ...row,
    id: row.id,
    word: row.word,
    phonetics: '',
    translation: row.back ?? '',
    explanation: '',
    sentence: row.sentence ?? undefined,
    // Idiomas REAIS do cartão (o banco já os guardava; a UI os ignorava e assumia en→pt).
    srcLang: row.srcLang ?? undefined,
    tgtLang: row.tgtLang ?? undefined,
    // O nível vem do banco (a lista curada grava `cefrLevel`+`confidence: 1`). Sem isto a trilha
    // não tem como respeitar o nível escolhido.
    cefrLevel: row.cefrLevel ?? undefined,
    cefrConfidence: row.cefrConfidence ?? undefined,
    sourceSessionId: row.sessionId ?? undefined,
    daTrilha: !!(row as { daTrilha?: boolean }).daTrilha,
    /* Sem esta linha o cartão de baralho chega ao cliente sem procedência, e a régua o mede pelo
       teto de fala capturada — 299 cartões importados vira "8 palavras prontas" na tela. */
    daAnki: !!(row as { daAnki?: boolean }).daAnki,
    /** Tarefa 1.3 de motor-anki-jogos: ver docblock de `VocabCard.baralhosAnki`. */
    baralhosAnki: (row as { baralhosAnki?: string[] }).baralhosAnki ?? [],
    leitnerBox: row.box ?? 1,
    leitnerDueAt: dueIso,
    fsrsState: fsrsStateOf(row),
    fsrsStability: row.stability ?? 0,
    fsrsDifficulty: row.difficulty ?? 5,
    fsrsPredictedRetention: 0,
    fsrsDueAt: dueIso,
    // O cru em ms, para o filtro facetado — a string acima é exibição (ver docblock no tipo).
    dueAtMs: row.dueAt ?? null,
    /* LIDO DO BANCO, não mais fixo em `true`.
       Enquanto era constante, TODO `filter(c => c.inDeck)` do app era um no-op, inclusive o da
       tela de jogos, e arquivar um cartão não tinha efeito nenhum. A coluna sempre existiu
       (`schema.ts`); só o cliente é que a ignorava. `?? true` mantém os cartões antigos, gravados
       antes de a coluna ser preenchida, dentro do baralho. */
    inDeck: row.inDeck == null ? true : row.inDeck === 1,
    stability: row.stability ?? undefined,
    /* Segundo insumo da retenção real (`retrievability(dias, estabilidade)`, `@core`). Sem isto a
       UI só tinha a estabilidade, metade da conta, e o painel "Requer Atenção" classificava os
       151 cartões revisados como "nunca revisados", invertendo o próprio diagnóstico. */
    lastReview: row.lastReview ?? undefined,
    reps: row.reps ?? undefined,
  }
}

export async function fetchDeck(): Promise<VocabCard[]> {
  const res = await apiFetch('/api/vocab')
  if (!res.ok) return []
  return ((await res.json()) as VocabRow[]).map(rowToVocabCard)
}

/**
 * Edita um cartão pela CURADORIA: a tradução e a presença no baralho.
 * Arquivar (`inDeck: false`) tira das rodadas sem apagar — o cartão continua no banco.
 */
export async function updateCard(
  id: string,
  patch: { translation?: string; inDeck?: boolean },
): Promise<VocabCard> {
  const body: Record<string, unknown> = {}
  if (typeof patch.translation === 'string') body.back = patch.translation
  if (typeof patch.inDeck === 'boolean') body.inDeck = patch.inDeck
  const res = await apiFetch(`/api/vocab/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('não consegui salvar a alteração')
  return rowToVocabCard((await res.json()) as VocabRow)
}

/** Uma nota lida de um baralho do Anki (ainda NÃO gravada). */
export interface NotaAnki {
  frente: string
  verso: string
  exemplo?: string
  tags: string[]
}

export interface LeituraAnki {
  notas: NotaAnki[]
  formato: string
  campos: string[]
  descartadas: number
  temMidia: boolean
}


/**
 * Gera um `.apkg` no servidor e devolve o arquivo para download.
 *
 * O `.txt` é o caminho garantido (o Anki o importa nativamente e sem plugin); o `.apkg` é o que
 * abre com duplo clique e chega com nome de baralho. A tela oferece os dois de propósito.
 */
export async function exportarApkg(
  cartoes: Array<{ frente: string; verso: string; exemplo?: string }>,
  nome: string,
): Promise<Blob> {
  const res = await apiFetch('/api/import/anki/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cartoes, nome }),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: 'falha ao gerar o baralho' }))
    throw new Error(e.error ?? 'falha ao gerar o baralho')
  }
  return await res.blob()
}

export interface NewCardPayload {
  word: string
  back?: string
  sentence?: string
  srcLang?: string
  tgtLang?: string
  clozePrompt?: string
  clozeAnswer?: string
  sessionId?: string
}

/** Um cartão recusado na entrada, com o motivo — o servidor não engole em silêncio. */
export interface CartaoPulado {
  word: string
  motivo: string
}

/**
 * Resultado real de uma inserção: o que entrou e o que ficou de fora.
 *
 * O servidor passou a aplicar a régua de qualidade e a deduplicar por (palavra, idioma). Sem
 * devolver os pulados, a tela diria "salvei 6" tendo salvo 2 — que é como o baralho chegou a
 * 1.506 cartões com 194 repetições e 72 com a "tradução" igual à palavra.
 */
export interface BulkAddResult {
  cards: VocabCard[]
  skipped: CartaoPulado[]
}

export async function bulkAddCards(cards: NewCardPayload[]): Promise<BulkAddResult> {
  const res = await apiFetch('/api/vocab/bulk-add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cards }),
  })
  /**
   * FALHA TEM DE DOER — devolver vazio aqui era indistinguível de "nada tinha para entrar".
   *
   * MEDIDO importando um baralho de 39 notas: uma delas era a palavra `a`, de uma letra, que a
   * fronteira de formato do servidor recusa (`word: min(2)`). A validação é do LOTE INTEIRO, então
   * o 400 derrubou as 39 — e este `return` transformou a mensagem exata do servidor
   * ("cards.34.word — Too small") em "0 entraram no seu baralho", sem causa e sem culpado.
   *
   * Quem chama já tem `try/catch` e já sabe mostrar erro; o que faltava era o erro existir.
   */
  if (!res.ok) {
    const corpo = await res.json().catch(() => null) as { error?: string } | null
    throw new Error(corpo?.error ?? `não consegui salvar as palavras (HTTP ${res.status})`)
  }
  const body = (await res.json()) as { cards: VocabRow[]; skipped?: CartaoPulado[] }
  const criados = (body.cards ?? []).map(rowToVocabCard)
  /* Som de "guardei" no ponto onde a palavra ENTRA no deck, e so quando entrou de verdade —
     as quatro telas que adicionam vocabulario (Analise, Captura, Vocabulario, menu de pratica)
     passam todas por aqui. Um `add` num botao que falhou seria mentira. */
  if (criados.length) play('add')
  return { cards: criados, skipped: body.skipped ?? [] }
}

/**
 * Corrige o idioma de cartões existentes (Auditoria de idioma). Só grava o que o usuário confirmou;
 * toca exclusivamente `srcLang`/`tgtLang` — o histórico de revisão do cartão fica intacto.
 * Devolve quantos cartões foram de fato alterados (não quantos foram pedidos).
 */
export async function relabelCards(
  items: Array<{ id: string; srcLang: string; tgtLang: string }>,
): Promise<number> {
  if (!items.length) return 0
  const res = await apiFetch('/api/vocab/relabel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  if (!res.ok) throw new Error('falha ao corrigir o idioma dos cartões')
  return ((await res.json()) as { changed: number }).changed
}

/** Revisão SRS: grade 1=Again 2=Hard 3=Good 4=Easy. Persiste o estado FSRS. */
export async function reviewCard(id: string, grade: 1 | 2 | 3 | 4): Promise<VocabCard> {
  const res = await apiFetch(`/api/vocab/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grade }),
  })
  if (!res.ok) throw new Error('falha ao revisar o card')
  return rowToVocabCard((await res.json()) as VocabRow)
}
