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
import { play } from '../../lib/soundFx'
import type { VocabCard } from '../../types'
import { apiFetch } from '../funil'
import { compartilharEmVoo } from '../leituraEmVoo'

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
  /** Quando o cartão entrou no caderno (ms). Opcional: respostas antigas podem não trazer. */
  createdAt?: number | null
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
    createdAtMs: row.createdAt ?? null,
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

/**
 * O ÚLTIMO BARALHO RECEBIDO E O ETag DELE (fix/rotas-caras).
 *
 * O servidor passou a responder 304 sem montar o baralho quando o ETag (a versão dos dados do
 * usuário) não mudou. Mandar o `If-None-Match` explicitamente — em vez de confiar no cache HTTP do
 * navegador, que pode nem guardar a resposta — faz toda revalidação custar uma consulta de chave
 * primária no servidor e zero bytes de baralho na rede. O ETag inclui um resumo do usuário, então
 * o baralho de uma conta nunca é revalidado com o ETag de outra.
 */
let ultimoBaralho: { etag: string; linhas: VocabRow[] } | null = null

async function lerLinhasDoBaralho(): Promise<VocabRow[] | null> {
  const memo = ultimoBaralho
  const res = await apiFetch('/api/vocab', memo ? { headers: { 'If-None-Match': memo.etag } } : undefined)
  if (res.status === 304 && memo) return memo.linhas
  if (!res.ok) return null
  const linhas = (await res.json()) as VocabRow[]
  const etag = res.headers?.get?.('etag')
  ultimoBaralho = etag ? { etag, linhas } : null
  return linhas
}

/* Várias telas pedem o baralho ao montar; quem pede junto recebe a mesma leitura. */
const lerBaralhoCompartilhado = compartilharEmVoo(lerLinhasDoBaralho)

export async function fetchDeck(): Promise<VocabCard[]> {
  const linhas = await lerBaralhoCompartilhado()
  if (!linhas) return []
  /* Cartões NOVOS a cada chamada, como antes: as linhas são compartilhadas (entre quem pediu junto
     e com o memo do ETag), então nenhuma tela pode receber um objeto que outra também segura —
     nem o array de baralhos, o único campo aninhado. */
  return linhas.map((r) => {
    const c = rowToVocabCard(r)
    return c.baralhosAnki ? { ...c, baralhosAnki: [...c.baralhosAnki] } : c
  })
}

/**
 * Edita um cartão pela CURADORIA: a tradução e a presença no baralho.
 * Arquivar (`inDeck: false`) tira das rodadas sem apagar — o cartão continua no banco.
 */
export async function updateCard(
  id: string,
  patch: { translation?: string; inDeck?: boolean; sentence?: string; cefrLevel?: string | null },
): Promise<VocabCard> {
  const body: Record<string, unknown> = {}
  if (typeof patch.translation === 'string') body.back = patch.translation
  if (typeof patch.inDeck === 'boolean') body.inDeck = patch.inDeck
  if (typeof patch.sentence === 'string') body.sentence = patch.sentence
  if (patch.cefrLevel !== undefined) body.cefrLevel = patch.cefrLevel
  const res = await apiFetch(`/api/vocab/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('não consegui salvar a alteração')
  return rowToVocabCard((await res.json()) as VocabRow)
}

/**
 * Apaga o cartão (soft delete no servidor: cartão, ocorrências e revisões saem juntos). O
 * "Excluir" da gaveta da palavra, com os dois cliques do protótipo.
 */
export async function deleteCard(id: string): Promise<boolean> {
  const res = await apiFetch(`/api/vocab/${id}`, { method: 'DELETE' })
  return res.ok
}

/** "Na sua memória": quantas revisões o cartão teve e quantas foram acerto. */
export async function fetchMemoriaDoCartao(id: string): Promise<{ revisoes: number; acertos: number } | null> {
  try {
    const res = await apiFetch(`/api/vocab/${id}/memoria`)
    return res.ok ? ((await res.json()) as { revisoes: number; acertos: number }) : null
  } catch {
    return null
  }
}

/** Uma ocorrência do cartão: de onde ele veio (sessão, trilha, manual…) e a frase daquele encontro. */
export interface OcorrenciaDoCartao {
  originKind: string | null
  /** Para `sessao`, o id da sessão. */
  originRef: string | null
  sentence: string | null
  utteranceId: string | null
  occurredAt: number | null
}

/** Os encontros do cartão, do mais recente ao mais antigo. */
export async function fetchOcorrencias(id: string): Promise<OcorrenciaDoCartao[]> {
  try {
    const res = await apiFetch(`/api/vocab/${id}/ocorrencias`)
    return res.ok ? ((await res.json()) as OcorrenciaDoCartao[]) : []
  } catch {
    return []
  }
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
  /** Nível escolhido à mão (Adicionar palavra). Ausente = o servidor lê da wordlist. */
  cefrLevel?: string | null
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
    const corpo = await res.json().catch(() => null) as { error?: string; code?: unknown; codigo?: unknown } | null
    /* O status e o código vão no erro: o teto sem conta (507 `TETO_ANONIMO`) tem saída ("Criar conta"). */
    const codigo = typeof corpo?.code === 'string' ? corpo.code : typeof corpo?.codigo === 'string' ? corpo.codigo : undefined
    throw Object.assign(new Error(corpo?.error ?? `não consegui salvar as palavras (HTTP ${res.status})`), {
      status: res.status,
      ...(codigo ? { codigo } : {}),
    })
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
export async function reviewCard(id: string, grade: 1 | 2 | 3 | 4, retencao?: number): Promise<VocabCard> {
  const res = await apiFetch(`/api/vocab/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(retencao === undefined ? { grade } : { grade, retencao }),
  })
  if (!res.ok) throw new Error('falha ao revisar o card')
  return rowToVocabCard((await res.json()) as VocabRow)
}

/** O estado do agendador de um cartão ANTES de uma nota — o que "Desfazer" devolve. */
export interface EstadoAntesDaNota {
  box: number
  dueAt: number
  stability: number | null
  difficulty: number | null
  reps: number | null
  lapses: number | null
  lastReview: number | null
}

/** Desfaz a última revisão do cartão (Revisão, tecla Z). */
export async function desfazerRevisao(id: string, antes: EstadoAntesDaNota): Promise<VocabCard> {
  const res = await apiFetch(`/api/vocab/${id}/desfazer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(antes),
  })
  if (!res.ok) throw new Error('não deu para desfazer a revisão')
  return rowToVocabCard((await res.json()) as VocabRow)
}
