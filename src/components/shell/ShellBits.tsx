import React from 'react';
import { Flame, Sprout } from 'lucide-react';
import { compactNumber, type DerivedProgress } from '../../lib/progress';

/**
 * A MARCA (9B, escolhida pelo dono em 2026-08-27) — balão de fala em PIXEL ART com um play
 * dentro e três "blocos de idioma" caindo embaixo: conversa + jogo retrô + a torre sendo montada.
 * Desenhada em SVG inline para seguir o TEMA (as cores são tokens, não hex): no vercel-dark o
 * gradiente vira o accent do tema, e a marca continua parecendo da casa. O mesmo desenho, com
 * cores fixas, vive em public/favicon.svg.
 */
export function MarcaBabel({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0`} shapeRendering="crispEdges" aria-hidden>
      {/* Balao de fala pixelado com um PLAY dentro; tres blocos de idioma caindo embaixo. */}
      <path d="M12 8h40v6h6v22h-6v6H30l-6 6h-4v-6h-8v-6H6V14h6Z" fill="var(--accent)" />
      <path d="M12 8h40v6H12Z" fill="var(--accent)" opacity="0.72" />
      <path d="M26 17h5v4h5v4h5v4h-5v4h-5v4h-5Z" fill="#fff" />
      <rect x="18" y="50" width="8" height="8" fill="var(--warn)" />
      <rect x="30" y="50" width="8" height="8" fill="var(--warn)" opacity="0.65" />
      <rect x="42" y="50" width="8" height="8" fill="var(--good)" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 shrink-0" title="Babel Play">
      <MarcaBabel />
      {!compact && (
        <span className="font-marca font-bold text-[15px] text-ink leading-none whitespace-nowrap select-none">
          Babel<span className="text-accent">Play</span>
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
