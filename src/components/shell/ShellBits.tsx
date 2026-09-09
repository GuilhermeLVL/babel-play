import React from 'react';

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
