/**
 * EVOLUÇÃO SEMANAL — a série `AppMetrics.vocabByWeek`, num lugar só.
 *
 * Esta série era renderizada por TRÊS implementações independentes:
 *   `Analysis.tsx:67`              (a mais completa — trazia a ressalva de "um ponto não é tendência")
 *   `Metrics.tsx:583-616`          (inline, com transformação própria em `evolutionData`)
 *   `MetricsExpandedKpi.tsx:112`   (inline, "Aquisição por Semana", com `fmtWeek` próprio)
 *
 * O mais revelador: `Analysis.tsx:61-62` já avisava, por escrito, que "duas implementações do
 * mesmo gráfico divergiriam no primeiro ajuste" — e então mais duas nasceram nos outros arquivos.
 * O aviso estava certo: as três divergiram em margem, rótulo de eixo, formato de data e no texto
 * de rodapé.
 *
 * A TRANSFORMAÇÃO MORA AQUI DENTRO, de propósito. Cada chamador fazia a sua (`evolutionData`,
 * `evolucaoSemanal`, o `.map` do drawer), e era justamente aí que o formato da data divergia.
 * Recebendo a série crua do contrato, não há o que divergir.
 */
import React from 'react'
import { TrendingUp } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { AppMetrics } from '../../core/learning/contract'

/** Rótulo curto da semana. Único formato — antes eram dois (`fmtWeek` e um `toLocaleDateString` solto). */
function rotuloDaSemana(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function EvolucaoSemanal({
  serie,
  titulo = 'Evolução ao longo do tempo',
  altura = 200,
  className = '',
}: {
  serie: AppMetrics['vocabByWeek'] | null | undefined
  titulo?: string
  altura?: number
  className?: string
}) {
  const dados = React.useMemo(
    () => (serie ?? []).map((s) => ({ rotulo: rotuloDaSemana(s.weekStart), palavras: s.count })),
    [serie],
  )

  return (
    <div className={`card-panel p-5 ${className}`}>
      <span className="font-display font-extrabold text-[14px] mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-accent" aria-hidden /> {titulo}
      </span>

      {dados.length === 0 ? (
        /* Vazio explicado, não vazio mudo. */
        <div className="flex flex-col justify-center items-center text-center gap-3 text-ink-muted" style={{ height: altura }}>
          <div className="w-12 h-12 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
            <TrendingUp className="w-6 h-6" aria-hidden />
          </div>
          <p className="text-[13px] font-medium max-w-xs leading-relaxed">
            Nenhuma semana com palavras capturadas ainda. Capture ou leia algo e o histórico começa aqui.
          </p>
        </div>
      ) : (
        <>
          <div className="w-full" style={{ height: altura }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="gradEvolucaoSemanal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.5} />
                <XAxis dataKey="rotulo" stroke="var(--ink-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--ink-muted)" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-subtle)', borderRadius: '8px', color: 'var(--ink)' }}
                  formatter={(v: number) => [`${v} palavras`, 'Capturadas']}
                  labelFormatter={(l: string) => `Semana de ${l}`}
                />
                <Area type="monotone" dataKey="palavras" name="Palavras" stroke="var(--accent)" fill="url(#gradEvolucaoSemanal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* A ressalva das poucas amostras: esconder o dado seria mentir por omissão, e traçar
              uma linha com um ponto seria mentir por sugestão. Vinha de uma das três cópias e
              agora vale para todas. */}
          <p className="text-[11px] text-ink-faint mt-2 leading-relaxed">
            {dados.length === 1
              ? 'Uma semana só — é o dado real, mas um ponto não é tendência.'
              : `Palavras adicionadas ao baralho por semana, ${dados.length} semanas do seu histórico.`}
          </p>
        </>
      )}
    </div>
  )
}

export default EvolucaoSemanal
