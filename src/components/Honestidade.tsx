/**
 * AS DUAS PRIMITIVAS DA HONESTIDADE ESTATÍSTICA.
 *
 * `openspec/project.md` estabelece o mandato: "Toda métrica carrega `source` + `confidence`. A UI
 * não exibe falsa precisão." O mandato estava sendo cumprido — mas por OITO implementações
 * independentes, que divergiram:
 *
 *   confiança:  ConfTag (Metrics.tsx:102, limiar 0,5) · EstimateBadge (MetricsExpandedKpi.tsx:37,
 *               sempre âmbar) · inline em Hub.tsx:75 (0,5) · inline em Analysis.tsx:2017 (0,6)
 *   sem dado:   AiPlaceholder (Metrics.tsx:115) · AiPlaceholder (AnalysisExpandedKpi.tsx:59 —
 *               MESMO NOME, outra assinatura) · NoData (AnalysisExpandedKpi.tsx:76) ·
 *               HonestPlaceholder (MetricsExpandedKpi.tsx:25)
 *
 * O efeito observável era o pior possível para um produto que vende honestidade: uma estimativa
 * de 55% de confiança aparecia rotulada "estimativa" na aba da Sessão e SEM rótulo na tela de
 * Analytics. Quem comparasse as duas concluiria, com razão, que uma delas está errada.
 *
 * O QUE MUDA E O QUE NÃO MUDA:
 *  · o LIMIAR passa a ser um só (0,5 — o já majoritário; o 0,6 era o desvio);
 *  · a REDAÇÃO da confiança passa a ser uma só;
 *  · a COPY de cada estado vazio é PRESERVADA — ela chega por `motivo`, porque o motivo de não
 *    haver dado é diferente em cada tela e apagar essa diferença seria perder informação real.
 *    O que se unifica é o tratamento visual e a garantia final, não a explicação.
 */
import React from 'react'
import { Info } from 'lucide-react'

/**
 * Abaixo disto, o número é frágil o bastante para a UI avisar.
 * Único e exportado de propósito: um limiar que mora em quatro arquivos vira quatro limiares.
 */
export const LIMIAR_CONFIANCA = 0.5

/** `true` quando o número merece aviso. Ausência de confiança conta como baixa — nunca como alta. */
export function ehBaixaConfianca(valor: number): boolean {
  return !Number.isFinite(valor) || valor < LIMIAR_CONFIANCA
}

/** A redação única. Sem confiança conhecida, não inventa percentual. */
export function rotuloDeConfianca(valor: number, estimativa = false): string {
  if (!Number.isFinite(valor)) return 'confiança desconhecida'
  return `${estimativa ? 'estimativa · ' : ''}confiança ${Math.round(valor * 100)}%`
}

/**
 * Selo de confiança. Substitui `ConfTag`, `EstimateBadge` e os dois usos inline.
 * Âmbar abaixo do limiar, verde acima — o mesmo código de cor em todas as telas.
 */
export function Confianca({
  valor,
  estimativa = false,
  className = '',
}: {
  valor: number
  estimativa?: boolean
  className?: string
}) {
  const baixa = ehBaixaConfianca(valor)
  return (
    <span
      className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
        baixa ? 'bg-warn-soft text-warn-ink' : 'bg-good-soft text-good-ink'
      } ${className}`}
      title={
        baixa
          ? 'Confiança baixa: o número existe, mas o volume de dados por trás dele ainda é pequeno.'
          : 'Confiança suficiente para o número ser usado como referência.'
      }
    >
      {rotuloDeConfianca(valor, estimativa)}
    </span>
  )
}

/** Sobre quantos itens a métrica foi calculada. Ver `SemDado` e o campo `base` do contrato. */
export type BaseDeCalculo = { considerados: number; total: number }

/** Formata a base para leitura humana. `1.753 de 1.902 ficaram de fora` é o que o usuário precisa saber. */
export function rotuloDaBase(base: BaseDeCalculo): string {
  const n = new Intl.NumberFormat('pt-BR')
  return `calculado sobre ${n.format(base.considerados)} de ${n.format(base.total)}`
}

/**
 * Estado vazio honesto. Substitui `AiPlaceholder` (×2, com assinaturas diferentes), `NoData` e
 * `HonestPlaceholder`.
 *
 * `motivo` é OBRIGATÓRIO. Um vazio sem explicação é justamente o que este produto se recusa a
 * fazer — e era a diferença entre os quatro componentes que existiam. A garantia final
 * ("Sem dados fabricados.") é invariante e não depende de quem chama.
 */
export function SemDado({
  motivo,
  base,
  compacto = false,
  className = '',
}: {
  motivo: string
  base?: BaseDeCalculo
  compacto?: boolean
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-2 rounded-2xl border border-dashed border-border-subtle bg-surface/50 p-6 ${
        compacto ? 'min-h-[120px]' : 'min-h-[160px]'
      } ${className}`}
    >
      <Info className="w-5 h-5 text-ink-muted opacity-60" aria-hidden />
      <p className="text-[13px] text-ink-muted leading-relaxed max-w-md">{motivo}</p>
      {base && <p className="text-[11.5px] text-ink-faint">{rotuloDaBase(base)}</p>}
      <p className="text-[11px] text-ink-faint">(Sem dados fabricados.)</p>
    </div>
  )
}
