import React from 'react';
import { Sparkles, Flame, Sprout } from 'lucide-react';
import { compactNumber, type DerivedProgress } from '../../lib/progress';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 shrink-0" title="Babel OS">
      <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shrink-0">
        {/* `text-accent-contrast`, nunca `text-white`: no vercel-dark o accent É branco. */}
        <Sparkles className="w-4 h-4 text-accent-contrast" />
      </div>
      {!compact && <span className="font-display font-black text-lg tracking-tight text-ink leading-none">Babel OS</span>}
    </div>
  );
}

/**
 * Pílula de progresso. Ofensiva e Seeds vêm de `deriveProgress`, ou seja, das métricas reais.
 * Enquanto elas não chegam, mostra-se um esqueleto — nunca um número de enfeite (a versão
 * anterior caía num `480` fixo, que era indistinguível de um dado verdadeiro).
 */
export function StatPill({ progress, full = false }: { progress: DerivedProgress; full?: boolean }) {
  if (!progress.available) {
    return (
      <div
        className={`h-9 rounded-xl bg-surface-hover/40 border border-border-subtle/60 animate-pulse ${full ? 'w-full' : 'w-28'}`}
        aria-hidden
      />
    );
  }

  const streakLabel = `Ofensiva: ${progress.streakDays} ${progress.streakDays === 1 ? 'dia seguido' : 'dias seguidos'} de revisão`;
  const seedsLabel = `Seeds acumuladas: ${progress.seeds}`;

  return (
    <div
      className={`flex items-center gap-2 h-9 px-3 rounded-xl bg-surface-hover/40 border border-border-subtle/60 text-xs font-mono font-bold shrink-0 ${
        full ? 'w-full justify-between' : ''
      }`}
    >
      <span className="flex items-center gap-1.5 text-warn-ink" title={streakLabel}>
        <Flame className="w-3.5 h-3.5 text-warn shrink-0" aria-hidden />
        <span>{progress.streakDays}d</span>
        <span className="sr-only">{streakLabel}</span>
      </span>
      <span aria-hidden className="w-px h-3.5 bg-border-subtle" />
      <span className="flex items-center gap-1.5 text-good-ink" title={seedsLabel}>
        <Sprout className="w-3.5 h-3.5 text-good shrink-0" aria-hidden />
        <span>{compactNumber(progress.seeds)}</span>
        <span className="sr-only">{seedsLabel}</span>
      </span>
    </div>
  );
}
