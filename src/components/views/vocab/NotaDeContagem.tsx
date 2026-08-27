/**
 * NOTA DE INÍCIO DA CONTAGEM (Z2) — a declaração que já existia no código e não chegava à tela.
 *
 * A migração da F2b não teve histórico de ocorrências para reconstruir: cada cartão nasceu com
 * **uma** ocorrência de origem `legado`, datada de `added_at`. Isso está escrito no comentário da
 * migração e no relatório — e o usuário, que é quem olha o número, não sabia.
 *
 * Sem esta nota, "1×" ao lado de uma palavra vista dezenas de vezes parece dado, e é limitação.
 *
 * As três distinções que a tela precisa fazer, e que esta nota sustenta:
 *   1. ocorrências ANTES da migração  → não medidas, e dito;
 *   2. "sem ocorrências registradas ainda" (`legado`, contagem não começou para ela);
 *   3. "zero ocorrências medidas" — que não existe: todo cartão tem ao menos a de legado.
 */
import React from 'react'
import { Info } from 'lucide-react'

/** Data em que a contagem passou a ser real. Vem do banco (menor `occurred_at` não-legado). */
export function formatarInicio(inicioEm: number | null): string | null {
  if (!inicioEm) return null
  return new Date(inicioEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function NotaDeContagem({
  inicioEm, totalLegado, total,
}: {
  /** epoch-ms do início da contagem real. `null` = nenhuma ocorrência nova ainda. */
  inicioEm: number | null
  /** Quantos cartões só têm a ocorrência de legado. */
  totalLegado: number
  total: number
}) {
  if (!total) return null
  const data = formatarInicio(inicioEm)
  const pctLegado = Math.round((totalLegado / total) * 100)

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-3 flex items-start gap-2">
      <Info className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
      <div className="text-[12px] text-ink-muted leading-relaxed">
        {data ? (
          <>
            A contagem de <strong className="text-ink">quantas vezes</strong> você encontra cada palavra
            começou em <strong className="text-ink">{data}</strong>.
          </>
        ) : (
          <>A contagem de <strong className="text-ink">quantas vezes</strong> você encontra cada palavra começa agora.</>
        )}
        {totalLegado > 0 && (
          <>
            {' '}
            {pctLegado >= 99 ? 'Todas' : `${totalLegado} de ${total}`} as palavras do seu acervo vêm de antes disso,
            elas aparecem como <strong className="text-ink">1×</strong> porque os encontros anteriores
            não foram registrados, não porque só aconteceram uma vez.
          </>
        )}
      </div>
    </div>
  )
}

/** Rótulo honesto para a contagem de uma palavra. Distingue "não medido" de "medido uma vez". */
export function rotuloDeOcorrencias(occurrences: number, apenasLegado: boolean): string {
  if (apenasLegado) return 'sem contagem anterior'
  return occurrences === 1 ? '1 encontro' : `${occurrences} encontros`
}
