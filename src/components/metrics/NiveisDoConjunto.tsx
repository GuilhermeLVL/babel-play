/**
 * DISTRIBUIÇÃO DE NÍVEL (CEFR) DE UM CONJUNTO — com a base e a confiança à vista.
 *
 * Nasceu para substituir, na aba de métricas da Sessão, um gráfico de "Evolução ao longo do
 * tempo" que era da CONTA INTEIRA. A legenda dizia, literalmente, "6 semanas do seu histórico"
 * embaixo de um cabeçalho que anunciava uma gravação de hoje (achado D1). E não havia como
 * corrigir apenas o texto: uma gravação única não TEM evolução semanal — a pergunta certa para
 * o escopo de sessão é outra.
 *
 * "Sem nível" não é erro nem lacuna a esconder: são palavras fora da wordlist, cujo nível é
 * desconhecido e — por decisão do produto — não é estimado. Por isso aparece como faixa própria,
 * com o motivo escrito, em vez de ser omitida do gráfico.
 */
import React from 'react'
import { BarChart2 } from 'lucide-react'
import { Confianca, SemDado, rotuloDaBase } from '../Honestidade'
import type { AppMetrics } from '../../core/learning/contract'

const ORDEM = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function NiveisDoConjunto({
  metricas,
  titulo = 'Níveis deste conjunto',
  className = '',
}: {
  metricas: AppMetrics | null | undefined
  titulo?: string
  className?: string
}) {
  const faixas = React.useMemo(() => {
    const d = metricas?.levelDistribution ?? []
    return [...d].sort((a, b) => {
      const ia = ORDEM.indexOf(a.level), ib = ORDEM.indexOf(b.level)
      // O que não está na wordlist ('N/D') vai para o fim, não some.
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  }, [metricas])

  const total = faixas.reduce((n, f) => n + f.count, 0)
  const maior = faixas.reduce((m, f) => Math.max(m, f.count), 0)

  return (
    <div className={`card-panel p-5 ${className}`}>
      <span className="font-display font-extrabold text-[14px] mb-1 flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-accent" aria-hidden /> {titulo}
      </span>

      {total === 0 ? (
        <SemDado
          compacto
          motivo="Nenhuma palavra classificada neste conjunto ainda."
        />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4 mt-1">
            {metricas?.levelConfidence != null && (
              <Confianca valor={metricas.levelConfidence} estimativa />
            )}
            {metricas?.base && (
              <span className="text-[11.5px] text-ink-faint">{rotuloDaBase(metricas.base)} cartões</span>
            )}
          </div>

          <div className="flex items-end gap-2 h-28" role="img" aria-label={`Distribuição por nível: ${faixas.map(f => `${f.level} ${f.count}`).join(', ')}`}>
            {faixas.map((f) => {
              const semNivel = ORDEM.indexOf(f.level) < 0
              return (
                <div key={f.level} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <span className="text-[10px] font-mono text-ink-muted">{f.count}</span>
                  <div
                    className={`w-full rounded-t-lg ${semNivel ? 'bg-warn-soft' : 'bg-accent-soft'}`}
                    style={{ height: `${maior > 0 ? Math.max(4, (f.count / maior) * 100) : 4}%` }}
                  />
                  <span className="text-[10px] font-mono text-ink-muted truncate w-full text-center">
                    {semNivel ? 'sem nível' : f.level}
                  </span>
                </div>
              )
            })}
          </div>

          <p className="text-[11.5px] text-ink-faint mt-3 leading-relaxed">
            "Sem nível" não é erro: são palavras fora da wordlist, cujo nível é desconhecido e não estimado.
          </p>
        </>
      )}
    </div>
  )
}

export default NiveisDoConjunto
