/**
 * ÍCONES PIXEL DOS MINIJOGOS — a linguagem da marca (9B) aplicada aos nove jogos.
 *
 * Antes cada jogo usava um ícone genérico do lucide; agora cada um tem um glifo próprio em pixel
 * art (crispEdges, mesmas cores por tokens do tema), o que dá identidade de fliperama à grade do
 * Jogar e à antessala. Tamanho via `className` (w-x h-x), como os ícones do lucide.
 */
import type { MinigameId } from '@core';

function Px({ className = 'w-5 h-5', children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} shapeRendering="crispEdges" aria-hidden>
      {children}
    </svg>
  );
}

const ICONES: Record<MinigameId, (className?: string) => React.ReactNode> = {
  // Memória: dois cartões, um virado.
  memory: (c) => (
    <Px className={c}>
      <rect x="2" y="4" width="9" height="12" fill="var(--accent)" />
      <rect x="4" y="6" width="5" height="3" fill="#fff" />
      <rect x="13" y="8" width="9" height="12" fill="var(--warn)" />
      <rect x="15" y="10" width="5" height="8" fill="var(--accent-soft)" />
    </Px>
  ),
  // Caça-palavras: grade com trilha acesa.
  wordsearch: (c) => (
    <Px className={c}>
      <rect x="3" y="3" width="18" height="18" fill="var(--surface-hover)" />
      {[6, 11, 16].map((y) => <rect key={y} x="3" y={y} width="18" height="1" fill="var(--border-subtle)" />)}
      {[8, 13, 18].map((x) => <rect key={x} x={x} y="3" width="1" height="18" fill="var(--border-subtle)" />)}
      <rect x="4" y="7" width="4" height="4" fill="var(--accent)" />
      <rect x="9" y="7" width="4" height="4" fill="var(--accent)" />
      <rect x="14" y="7" width="4" height="4" fill="var(--accent)" />
    </Px>
  ),
  // Termo: fileira de casas com veredito.
  termo: (c) => (
    <Px className={c}>
      <rect x="2" y="9" width="5" height="6" fill="var(--good)" />
      <rect x="8" y="9" width="5" height="6" fill="var(--warn)" />
      <rect x="14" y="9" width="5" height="6" fill="var(--surface-hover)" />
      <rect x="20" y="9" width="2" height="6" fill="var(--surface-hover)" />
    </Px>
  ),
  // Embaralhada: letras trocando de lugar.
  scramble: (c) => (
    <Px className={c}>
      <rect x="3" y="4" width="7" height="7" fill="var(--accent)" />
      <rect x="14" y="13" width="7" height="7" fill="var(--warn)" />
      <rect x="14" y="4" width="7" height="7" fill="var(--surface-hover)" />
      <rect x="3" y="13" width="7" height="7" fill="var(--surface-hover)" />
      <rect x="10" y="7" width="4" height="1.5" fill="var(--ink-muted)" />
      <rect x="10" y="15" width="4" height="1.5" fill="var(--ink-muted)" />
    </Px>
  ),
  // Karaokê: microfone pixel.
  karaoke: (c) => (
    <Px className={c}>
      <rect x="9" y="3" width="6" height="9" fill="var(--accent)" />
      <rect x="7" y="9" width="2" height="4" fill="var(--ink-muted)" />
      <rect x="15" y="9" width="2" height="4" fill="var(--ink-muted)" />
      <rect x="11" y="13" width="2" height="5" fill="var(--ink-muted)" />
      <rect x="8" y="19" width="8" height="2" fill="var(--ink-muted)" />
    </Px>
  ),
  // Escuta: fone com onda.
  escuta: (c) => (
    <Px className={c}>
      <rect x="4" y="8" width="3" height="8" fill="var(--accent)" />
      <rect x="17" y="8" width="3" height="8" fill="var(--accent)" />
      <rect x="6" y="5" width="12" height="3" fill="var(--ink-muted)" />
      <rect x="10" y="11" width="1.5" height="4" fill="var(--warn)" />
      <rect x="12.5" y="9" width="1.5" height="8" fill="var(--warn)" />
    </Px>
  ),
  // Ditado: lápis sobre linhas.
  ditado: (c) => (
    <Px className={c}>
      <rect x="3" y="16" width="18" height="2" fill="var(--border-subtle)" />
      <rect x="3" y="20" width="12" height="2" fill="var(--border-subtle)" />
      <rect x="13" y="4" width="4" height="10" fill="var(--warn)" transform="rotate(45 15 9)" />
      <rect x="7" y="13" width="3" height="3" fill="var(--accent)" />
    </Px>
  ),
  // Conectores: dois elos.
  conectores: (c) => (
    <Px className={c}>
      <rect x="3" y="9" width="9" height="6" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <rect x="12" y="9" width="9" height="6" fill="none" stroke="var(--warn)" strokeWidth="2.5" />
    </Px>
  ),
  // Duelo relâmpago: o raio.
  blitz: (c) => (
    <Px className={c}>
      <path d="M13 2 5 13h5l-2 9 9-12h-5l1-8z" fill="var(--warn)" />
    </Px>
  ),
};

export function IconePixel({ id, className }: { id: MinigameId; className?: string }) {
  const desenho = ICONES[id];
  return desenho ? <>{desenho(className)}</> : null;
}
