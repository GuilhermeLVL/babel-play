/**
 * RESUMO DA RODADA (F6) — o passo 2, depois da raspadinha.
 *
 * O `ScratchReward` funciona como recompensa e continua onde está; o defeito era ser o FIM DA
 * LINHA. A informação mais útil da rodada — QUAIS palavras você errou — era gravada
 * (`exercise_results`, uma linha por item) e nunca mostrada.
 *
 * Reusa `.card-panel`, `.badge-tag`, `.btn-solid`, `.btn-outline` (src/index.css). Ícones SVG
 * `lucide-react`, sem emoji.
 */
import React from 'react'
import { Check, X, RotateCw, ArrowUp, Sparkles, ChevronLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'

export interface ItemDaRodada {
  itemRef: string
  cardId?: string | null
  correct: boolean
  attempts: number
  hinted?: boolean
  /** Tradução, quando o item é uma palavra do baralho. */
  back?: string | null
  cefrLevel?: string | null
  cefrSource?: string | null
  /** Quantas vezes o usuário já encontrou esta palavra. */
  occurrences?: number | null
}

export interface TentativaAnterior {
  acertos: number
  total: number
  ms: number
}

export default function ResumoDaRodada({
  jogo, fonte, itens, tempoMs, xp, combo, anterior,
  podeSubirDificuldade, aoRefazerErradas, aoSubirDificuldade, aoMaisUma, aoVoltar,
}: {
  jogo: string
  fonte: string
  itens: ItemDaRodada[]
  tempoMs: number
  xp: number
  combo?: number
  anterior?: TentativaAnterior | null
  podeSubirDificuldade?: boolean
  aoRefazerErradas: (itens: ItemDaRodada[]) => void
  aoSubirDificuldade?: () => void
  aoMaisUma: () => void
  aoVoltar: () => void
}) {
  const erradas = itens.filter((i) => !i.correct)
  const certas = itens.filter((i) => i.correct)
  const acertos = certas.length
  const [verTodas, setVerTodas] = React.useState(false)

  const tempo = (ms: number) => {
    const s = Math.round(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  // Comparação com a tentativa anterior — o histórico já existia em /api/exercises/historico
  // e nunca aparecia na tela de conclusão.
  const delta = anterior ? acertos / itens.length - anterior.acertos / anterior.total : null
  const Tendencia = delta == null ? null : delta > 0.01 ? TrendingUp : delta < -0.01 ? TrendingDown : Minus

  return (
    <div className="card-panel p-5 space-y-4 max-w-xl mx-auto">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display font-extrabold text-[17px] text-ink">Rodada concluída</h2>
        <span className="label-mono">{jogo} · {fonte}</span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div><div className="text-[22px] font-extrabold text-ink tabular-nums">{acertos} de {itens.length}</div><div className="label-mono">acertos</div></div>
        <div><div className="text-[22px] font-extrabold text-ink tabular-nums">{tempo(tempoMs)}</div><div className="label-mono">tempo</div></div>
        <div><div className="text-[22px] font-extrabold text-accent tabular-nums">+{xp}</div><div className="label-mono">XP{combo && combo > 1 ? ` · combo ×${combo}` : ''}</div></div>
      </div>

      {anterior && Tendencia && (
        <div className="flex items-center justify-center gap-2 text-[12px] text-ink-muted">
          <Tendencia className="w-3.5 h-3.5" />
          <span>
            vs. sua última rodada deste jogo: {anterior.acertos}/{anterior.total} · {tempo(anterior.ms)}
            {delta != null && Math.abs(delta) > 0.01 && (
              <strong className={`ml-1.5 ${delta > 0 ? 'text-good' : 'text-error'}`}>
                {delta > 0 ? 'melhorou' : 'caiu'}
              </strong>
            )}
          </span>
        </div>
      )}

      {/* ── O QUE VOCÊ ERROU — a informação que era gravada e nunca mostrada ──────────── */}
      {erradas.length > 0 && (
        <div className="rounded-xl border border-error/25 bg-error-soft/10 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-error">
            <X className="w-3.5 h-3.5" /> Errou ({erradas.length})
          </div>
          {erradas.map((i) => (
            <div key={i.itemRef} className="flex items-center gap-2 text-[13px]">
              <span className="font-semibold text-ink min-w-[28%] truncate">{i.itemRef}</span>
              <span className="text-ink-muted flex-1 truncate">{i.back || <span className="opacity-60">sem tradução</span>}</span>
              {i.cefrLevel
                ? <span className={`badge-tag ${i.cefrSource === 'curado' ? 'ok' : 'acc'}`}>{i.cefrLevel}</span>
                : <span className="badge-tag">sem nível</span>}
              <span className="text-[11px] text-ink-muted tabular-nums whitespace-nowrap">
                {i.attempts > 1 ? `${i.attempts} tentativas` : '1 tentativa'}
                {i.hinted ? ' · com dica' : ''}
                {i.occurrences ? ` · ${i.occurrences}ª vez` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {certas.length > 0 && (
        <div className="rounded-xl border border-border-subtle p-3">
          <button onClick={() => setVerTodas((v) => !v)} className="flex items-center gap-1.5 text-[12px] font-bold text-good cursor-pointer">
            <Check className="w-3.5 h-3.5" /> Acertou ({certas.length}) {verTodas ? '▴' : '▾'}
          </button>
          {verTodas && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {certas.map((i) => <span key={i.itemRef} className="badge-tag ok">{i.itemRef}</span>)}
            </div>
          )}
        </div>
      )}

      {/* ── próxima ação, explícita ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        {erradas.length > 0 && (
          <button onClick={() => aoRefazerErradas(erradas)} className="btn-solid px-3 py-2 text-[13px] flex items-center justify-center gap-1.5 cursor-pointer">
            <RotateCw className="w-3.5 h-3.5" /> Refazer só {erradas.length === 1 ? 'a errada' : `as ${erradas.length} erradas`}
          </button>
        )}
        {/* Só aparece com desempenho bom E recorte suficiente — botão que falha ao clicar é pior que botão ausente. */}
        {podeSubirDificuldade && (
          <button onClick={aoSubirDificuldade} className="btn-outline px-3 py-2 text-[13px] flex items-center justify-center gap-1.5 cursor-pointer">
            <ArrowUp className="w-3.5 h-3.5" /> Subir para difícil
          </button>
        )}
        <button onClick={aoMaisUma} className="btn-outline px-3 py-2 text-[13px] flex items-center justify-center gap-1.5 cursor-pointer">
          <Sparkles className="w-3.5 h-3.5" /> Mais uma · palavras novas
        </button>
        <button onClick={aoVoltar} className="btn-ink px-3 py-2 text-[13px] flex items-center justify-center gap-1.5 cursor-pointer">
          <ChevronLeft className="w-3.5 h-3.5" /> Voltar aos jogos
        </button>
      </div>
    </div>
  )
}
