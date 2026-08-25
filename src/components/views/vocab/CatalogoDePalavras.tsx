/**
 * CATÁLOGO DE PALAVRAS (F5) — o que a tela `metrics` deveria ter sido.
 *
 * A lista antiga ocupava 33 linhas de `Metrics.tsx` e renderizava `vocabCards.map()` sobre os
 * 2.116 cartões medidos, dentro de um scroller de 320 px: sem busca, sem filtro, sem ordenação,
 * sem paginação, sem estado de erro e sem estado de carregando.
 *
 * Aqui: busca, filtros e ordenação resolvidos NO SERVIDOR (`/api/vocab/pagina`), lista
 * VIRTUALIZADA (decisão tomada pelo volume medido: 2.116 itens e 4,66 ms de query — paginar por
 * página seria fricção), e os três estados que faltavam.
 *
 * Reusa os primitivos existentes: `.card-panel`, `.badge-tag`, `.field-input`, `.kpi-pill`,
 * `.custom-scrollbar`, `.label-mono` (src/index.css). Ícones `lucide-react`. Sem emoji.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, Loader2, AlertTriangle, RotateCw, Inbox, ArrowUpDown } from 'lucide-react'
import { apiFetch } from '../../../data/api'
import NotaDeContagem from './NotaDeContagem'

export interface ItemCatalogo {
  id: string
  word: string
  back: string | null
  cefrLevel: string | null
  cefrSource: string | null
  occurrences: number
  lastSeenAt: number | null
  firstSeenAt: number | null
  difficultyScore: number | null
  dueAt: number | null
}

type Ordem = 'recentes' | 'frequentes' | 'dificuldade' | 'alfabetica'
const ORDENS: Array<{ id: Ordem; rotulo: string }> = [
  { id: 'recentes', rotulo: 'Mais recentes' },
  { id: 'frequentes', rotulo: 'Mais vistas' },
  { id: 'dificuldade', rotulo: 'Mais difíceis' },
  { id: 'alfabetica', rotulo: 'A → Z' },
]
const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'ausente'] as const
const ORIGENS = [
  { id: 'sessao', rotulo: 'Sessão' },
  { id: 'trilha', rotulo: 'Trilha' },
  { id: 'manual', rotulo: 'Manual' },
  { id: 'legado', rotulo: 'Anterior à contagem' },
]

const ALTURA_LINHA = 52
const JANELA_EXTRA = 6

function faixaDe(score: number | null): 'facil' | 'medio' | 'dificil' | null {
  if (score == null) return null
  return score < 0.34 ? 'facil' : score < 0.67 ? 'medio' : 'dificil'
}

/** O marcador de procedência não é enfeite: 88% dos níveis do acervo são AUSENTES. */
function SeloDeNivel({ nivel, fonte }: { nivel: string | null; fonte: string | null }) {
  if (!nivel) return <span className="badge-tag" title="Palavra fora da wordlist — nível desconhecido, não estimado">sem nível</span>
  const curado = fonte === 'curado'
  return (
    <span className={`badge-tag ${curado ? 'ok' : 'acc'}`} title={curado ? 'Nível curado' : 'Nível de wordlist (CEFR-J)'}>
      {nivel}{curado ? ' •' : ''}
    </span>
  )
}

export default function CatalogoDePalavras({ aoAbrirPalavra }: { aoAbrirPalavra?: (id: string) => void }) {
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  const [niveis, setNiveis] = useState<string[]>([])
  const [origens, setOrigens] = useState<string[]>([])
  const [itens, setItens] = useState<ItemCatalogo[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<{ valor: unknown; id: string } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [alturaVisivel, setAlturaVisivel] = useState(400)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [contagem, setContagem] = useState<{ inicioEm: number | null; totalLegado: number; total: number } | null>(null)

  useEffect(() => {
    void apiFetch('/api/vocab/inicio-da-contagem')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setContagem(d))
      .catch(() => setContagem(null))   // a nota é informativa: falhar nela não pode quebrar a tela
  }, [])

  // Debounce da busca: digitar não pode disparar uma requisição por tecla.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300)
    return () => clearTimeout(t)
  }, [busca])

  const carregar = useCallback(async (proximo: boolean) => {
    setErro(null)
    if (!proximo) setCarregando(true)
    try {
      const p = new URLSearchParams({ limite: '200', ordem })
      if (buscaAplicada.trim()) p.set('q', buscaAplicada.trim())
      if (niveis.length) p.set('niveis', niveis.join(','))
      if (origens.length) p.set('origens', origens.join(','))
      if (proximo && cursor) { p.set('cursorValor', String(cursor.valor ?? '')); p.set('cursorId', cursor.id) }

      const res = await apiFetch(`/api/vocab/pagina?${p.toString()}`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const dados = await res.json()
      setItens((antes) => (proximo ? [...antes, ...dados.itens] : dados.itens))
      setTotal(dados.total)
      setCursor(dados.proximoCursor)
    } catch (e) {
      // ESTADO DE ERRO REAL. Antes os três fetches faziam `.catch(() => [])` e rede caída era
      // indistinguível de baralho vazio.
      setErro(String((e as Error)?.message ?? e))
    } finally {
      setCarregando(false)
    }
  }, [ordem, buscaAplicada, niveis, origens, cursor])

  /* `carregar` fica FORA das deps de propósito: ela depende de `cursor`, que esta chamada zera.
     Incluí-la faria o efeito re-disparar a cada página carregada e reiniciar a lista do começo —
     o oposto de paginar. As deps aqui são exatamente o que reinicia a busca. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCursor(null); void carregar(false) }, [ordem, buscaAplicada, niveis, origens])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const medir = () => setAlturaVisivel(el.clientHeight)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Janela virtual: nunca mais de ~20 nós no DOM, por mais que o acervo cresça.
  const { inicio, fim, alturaTotal } = useMemo(() => {
    const i = Math.max(0, Math.floor(scrollTop / ALTURA_LINHA) - JANELA_EXTRA)
    const visiveis = Math.ceil(alturaVisivel / ALTURA_LINHA) + JANELA_EXTRA * 2
    return { inicio: i, fim: Math.min(itens.length, i + visiveis), alturaTotal: itens.length * ALTURA_LINHA }
  }, [scrollTop, alturaVisivel, itens.length])

  const alternar = (lista: string[], set: (v: string[]) => void, v: string) =>
    set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v])

  const limpar = () => { setBusca(''); setNiveis([]); setOrigens([]) }
  const temFiltro = !!busca || niveis.length > 0 || origens.length > 0

  return (
    <div className="card-panel p-4 space-y-3">
      {/* ── filtros ───────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            className="field-input pl-8 w-full"
            placeholder="Buscar palavra ou tradução…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar no vocabulário"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <select className="field-input py-1" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
            {ORDENS.map((o) => <option key={o.id} value={o.id}>{o.rotulo}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label-mono">nível</span>
        {NIVEIS.map((n) => (
          <button key={n} onClick={() => alternar(niveis, setNiveis, n)}
            className={`kpi-pill ${niveis.includes(n) ? 'active' : ''}`} aria-pressed={niveis.includes(n)}>
            {n === 'ausente' ? 'sem nível' : n}
          </button>
        ))}
        <span className="label-mono ml-2">origem</span>
        {ORIGENS.map((o) => (
          <button key={o.id} onClick={() => alternar(origens, setOrigens, o.id)}
            className={`kpi-pill ${origens.includes(o.id) ? 'active' : ''}`} aria-pressed={origens.includes(o.id)}>
            {o.rotulo}
          </button>
        ))}
      </div>

      {contagem && <NotaDeContagem {...contagem} />}

      <div className="flex items-center justify-between text-[11px] text-ink-muted">
        <span>{carregando ? 'carregando…' : `mostrando ${itens.length} de ${total}`}</span>
        {temFiltro && <button onClick={limpar} className="underline cursor-pointer hover:text-ink">limpar filtros</button>}
      </div>

      {/* ── estados ───────────────────────────────────────────────────────────────── */}
      {erro && (
        <div className="rounded-xl border border-error/30 bg-error-soft/10 p-3 text-[13px]">
          <div className="flex items-start gap-2 text-error font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p>Não consegui carregar seu vocabulário.</p>
              <p className="font-normal text-ink-muted text-[12px] mt-0.5">{erro}</p>
            </div>
          </div>
          <button onClick={() => void carregar(false)} className="btn-solid mt-2 px-3 py-1.5 text-[12px] flex items-center gap-1.5 cursor-pointer">
            <RotateCw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
        </div>
      )}

      {!erro && carregando && (
        // Esqueleto, não zeros: mostrar "0" durante o carregamento é afirmar um número falso.
        <div className="space-y-1.5" aria-busy>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[44px] rounded-lg bg-canvas animate-pulse" />
          ))}
        </div>
      )}

      {!erro && !carregando && itens.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <Inbox className="w-6 h-6 text-ink-muted" />
          <p className="text-[13px] font-semibold text-ink">{temFiltro ? 'Nada com esses filtros' : 'Seu vocabulário está vazio'}</p>
          <p className="text-[12px] text-ink-muted max-w-xs">
            {temFiltro ? 'Tente afrouxar o nível ou a origem.' : 'Capture uma sessão ou toque numa palavra durante a leitura para começar.'}
          </p>
        </div>
      )}

      {/* ── catálogo virtualizado ─────────────────────────────────────────────────── */}
      {!erro && !carregando && itens.length > 0 && (
        <div
          ref={scrollerRef}
          onScroll={(e) => {
            const el = e.currentTarget
            setScrollTop(el.scrollTop)
            if (cursor && el.scrollHeight - el.scrollTop - el.clientHeight < 300) void carregar(true)
          }}
          className="custom-scrollbar overflow-y-auto max-h-[420px] rounded-lg border border-border-subtle"
        >
          <div style={{ height: alturaTotal, position: 'relative' }}>
            {itens.slice(inicio, fim).map((c, i) => {
              const faixa = faixaDe(c.difficultyScore)
              return (
                <button
                  key={c.id}
                  onClick={() => aoAbrirPalavra?.(c.id)}
                  style={{ position: 'absolute', top: (inicio + i) * ALTURA_LINHA, height: ALTURA_LINHA, left: 0, right: 0 }}
                  className="w-full px-3 flex items-center gap-3 text-left hover:bg-surface border-b border-border-subtle cursor-pointer"
                >
                  <span className="font-semibold text-[13px] text-ink truncate w-[26%]">{c.word}</span>
                  <span className="text-[12px] text-ink-muted truncate flex-1">{c.back || <span className="opacity-60">sem tradução</span>}</span>
                  <SeloDeNivel nivel={c.cefrLevel} fonte={c.cefrSource} />
                  {faixa && <span className={`badge-tag ${faixa === 'dificil' ? 'err' : faixa === 'medio' ? 'warn' : 'ok'}`}>{faixa}</span>}
                  <span className="text-[11px] text-ink-muted tabular-nums w-[64px] text-right"
                        title={c.occurrences === 1 ? 'encontros anteriores à contagem não foram registrados' : undefined}>
                    {c.occurrences === 1 ? <span className="opacity-60">1× *</span> : `${c.occurrences}×`}
                  </span>
                </button>
              )
            })}
          </div>
          {cursor && <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-ink-muted"><Loader2 className="w-3 h-3 animate-spin" /> carregando mais…</div>}
        </div>
      )}
    </div>
  )
}
