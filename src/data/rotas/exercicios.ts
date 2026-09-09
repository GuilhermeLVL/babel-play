/**
 * O CLIENTE DAS ROTAS DE EXERCÍCIO — rodadas, histórico por item e recordes.
 *
 * Espelho de `src/data/efemero/rotas/exercicios.ts`, com as mesmas quatro rotas.
 *
 * Rotas: POST `/api/exercises/rodada`, GET `/api/exercises/results`,
 * GET `/api/exercises/historico`, GET `/api/exercises/recordes`.
 */
import { apiFetch } from '../funil'

export interface ExerciseResultPayload {
  sessionId?: string
  kind?: string
  /** 1 = acertou, 0 = errou. */
  correct?: number
  score?: number
  exerciseKind?: string
  /**
   * Campos abaixo: migração 0001. Antes deles uma rodada de 8 itens virava 8 linhas
   * indistinguíveis no banco (gravadas em `Promise.all`, mesmo milissegundo), e o
   * `ItemOutcome` — que já mede attempts/ms/hinted — tinha isso tudo descartado no POST.
   * Todos opcionais: o servidor aceita o payload antigo sem mudança.
   */
  /** Id da rodada — reagrupa os itens de UMA partida. */
  roundId?: string
  /** A palavra (jogo de baralho) ou o id da fala (jogo de frase). Responde "o que eu já vi". */
  itemRef?: string
  /** Tentativas até acertar (1 = de primeira). */
  attempts?: number
  /** Tempo até responder, em ms. */
  ms?: number
  /** 1 = usou dica/revelação. */
  hinted?: number
  /** 'baralho' | 'sessao:<id>' | 'trilha:<nivel>'. */
  origem?: string
}

export interface ExerciseResultRow extends ExerciseResultPayload {
  id: string
  createdAt: number
}

/**
 * O que aconteceu na gravação. Antes isto era `ExerciseResultRow | null`, e o `null` era MUDO:
 * uma rodada rejeitada pela validação do servidor (o teto de `score`, por anos) era
 * indistinguível de rede caída, e quem chamava não tinha como contar nem avisar. O erro sumia
 * inteiro — foi assim que 53 linhas de duelo relâmpago acabaram com um `round_id` só.
 *
 * Uma FORMA SÓ, e não uma união discriminada: este projeto compila sem `strict`, e sem
 * `strictNullChecks` o TypeScript não estreita `{ok:true}|{ok:false}` — ler `.motivo` depois de
 * um `if (!r.ok)` daria erro de compilação. Campos opcionais custam nada e funcionam aqui.
 */
export interface GravacaoDeExercicio {
  ok: boolean
  row?: ExerciseResultRow
  /** HTTP quando o servidor respondeu; `null` quando nem chegou lá (rede). */
  status?: number | null
  /** O corpo do erro — é ele que diz QUAL campo o zod barrou. */
  motivo?: string
}

/**
 * Persiste uma RODADA inteira em UMA requisição (F3).
 *
 * Substitui o `Promise.all` de N chamadas a `saveExerciseResult`: 20 itens viravam 20 requests e
 * ~60 queries, e a falha parcial deixava a rodada meio gravada. Continua best-effort — quem chama
 * decide o que fazer —, mas agora "gravou" e "não gravou" são estados inteiros, não por item.
 */
export async function salvarRodada(payload: {
  roundId: string
  exerciseKind?: string
  origem?: string
  sessionId?: string
  score?: number
  /** Combo maximo da rodada (vira recorde de combo). */
  melhorSequencia?: number
  itens: Array<{ cardId?: string; itemRef?: string; correct?: number; attempts?: number; ms?: number; hinted?: number; kind?: string }>
}): Promise<GravacaoDeExercicio> {
  try {
    const res = await apiFetch('/api/exercises/rodada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const motivo = await res.text().catch(() => '')
      return { ok: false, status: res.status, motivo: motivo.slice(0, 300) || res.statusText }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: String((e as Error)?.message ?? e).slice(0, 200) }
  }
}


/**
 * `origem` recorta no SERVIDOR. Quem lê isto (a tela de jogos, para remontar a última rodada de
 * cada jogo) já descartava as outras fontes no cliente — mas depois de baixá-las. Com uma corrente
 * de rodadas em curso, esta chamada acontece a cada rodada e a tabela cresce a cada rodada.
 */
export async function fetchExerciseResults(
  sessionId?: string,
  opts: { origem?: string } = {},
): Promise<ExerciseResultRow[]> {
  const qs = new URLSearchParams()
  if (sessionId) qs.set('sessionId', sessionId)
  else if (opts.origem) qs.set('origem', opts.origem)
  const q = qs.toString()
  const res = await apiFetch(`/api/exercises/results${q ? `?${q}` : ''}`)
  if (!res.ok) return []
  return (await res.json()) as ExerciseResultRow[]
}

/** Uma linha do histórico agregado por item. Chave = `itemRef`. */
export interface HistoricoDeItem {
  itemRef: string
  vezes: number
  erros: number
  ultimaEm: number
  ultimoAcerto: boolean
  /**
   * A régua de retorno do erro (`core/learning/memoriaDeItens`) lê estes dois. Os DOIS servidores
   * os calculam — o efêmero desde sempre, o real desde que a ausência foi rastreada até o efeito:
   * sem eles `estadoDoItem` trava em 1 erro seguido (nenhum leech) e `prontoParaVoltar` devolve
   * sempre `true` (nenhum espaçamento). Continuam opcionais no tipo só para uma resposta antiga
   * em cache não quebrar a tela.
   */
  errosSeguidos?: number
  rodadasDesdeUltimoErro?: number
}

/**
 * O que já apareceu, agregado por item — a leitura que permite dizer o que vem, repetir uma
 * rodada e evitar repetir o que já foi acertado. Defensiva como `fetchMetrics`/`fetchDeck`:
 * devolve `[]` em erro de rede ou status ruim, porque um histórico ausente deve degradar para
 * "nunca vi nada" e não derrubar a tela do jogo.
 */
export async function fetchHistoricoDeItens(
  opts: { origem?: string; desde?: number } = {},
): Promise<HistoricoDeItem[]> {
  try {
    const qs = new URLSearchParams()
    if (opts.origem) qs.set('origem', opts.origem)
    if (typeof opts.desde === 'number') qs.set('desde', String(opts.desde))
    const q = qs.toString()
    const res = await apiFetch(`/api/exercises/historico${q ? `?${q}` : ''}`)
    if (!res.ok) return []
    return (await res.json()) as HistoricoDeItem[]
  } catch {
    return []
  }
}

/* `RecordeDoJogo` era declarado no funil e outra vez em
   `server/db/repositories/exerciseResults.ts`, com campos diferentes: esta cópia tinha
   `melhorCombo`, a do servidor não — e o servidor era quem respondia. Agora o tipo é um só, no
   core, e as duas pontas o importam. */
export type { RecordeDoJogo } from '../../core/learning/contract'
import type { RecordeDoJogo } from '../../core/learning/contract'

/**
 * Os recordes por jogo. Mesma postura defensiva de `fetchHistoricoDeItens`: `[]` em qualquer
 * falha, porque recorde ausente deve degradar para "ainda não há recorde" — nunca impedir de
 * jogar nem derrubar a tela de fim de rodada, onde ele é exibido.
 */
export async function fetchRecordes(opts: { origem?: string } = {}): Promise<RecordeDoJogo[]> {
  try {
    const q = opts.origem ? `?origem=${encodeURIComponent(opts.origem)}` : ''
    const res = await apiFetch(`/api/exercises/recordes${q}`)
    if (!res.ok) return []
    return (await res.json()) as RecordeDoJogo[]
  } catch {
    return []
  }
}
