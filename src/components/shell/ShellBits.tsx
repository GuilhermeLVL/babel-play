import React from 'react';
import { Flame, Sprout } from 'lucide-react';
import { compactNumber, type DerivedProgress } from '../../lib/progress';

/**
 * A MARCA — balão de fala com um play dentro: "aperte o play em outra língua".
 * Desenhada em SVG inline para seguir o TEMA (as cores são tokens, não hex): no vercel-dark o
 * gradiente vira o accent do tema, e a marca continua parecendo da casa. O mesmo desenho, com
 * cores fixas, vive em public/favicon.svg.
 */
export function MarcaBabel({ className = 'w-8 h-8' }: { className?: string }) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--warn)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill={`url(#${id})`} />
      {/* Balão de fala com rabinho, branco. */}
      <path d="M12 6.5h8a5 5 0 0 1 5 5v3.5a5 5 0 0 1-5 5h-4.6l-4.1 4.4c-.55.6-1.55.2-1.55-.6V20a5 5 0 0 1-2.75-4.45V11.5a5 5 0 0 1 5-5Z" fill="#fff" />
      {/* O play, apontando adiante. */}
      <path d="M14.2 9.9c0-.62.66-1 1.2-.7l5.1 2.9c.54.3.54 1.08 0 1.4l-5.1 2.9c-.54.3-1.2-.1-1.2-.7Z" fill="var(--accent)" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 shrink-0" title="Babel Play">
      <MarcaBabel />
      {!compact && (
        <span className="font-marca font-extrabold text-[19px] tracking-tight text-ink leading-none whitespace-nowrap">
          Babel<span className="text-accent"> Play</span>
        </span>
      )}
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
