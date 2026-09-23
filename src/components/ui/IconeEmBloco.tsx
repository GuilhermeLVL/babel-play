import type { LucideIcon } from 'lucide-react';

/**
 * ÍCONE EM BLOCO — o ícone num quadrado com o tom do tema, a marca visual de cada cartão.
 *
 * O dono reprovou a versão "limpa" que tirava estes ícones ("mata a intuitividade", 22/09/2026):
 * eles ficam, e ficam iguais em todas as telas. `sobreEscuro` é para o cartão escuro de destaque
 * (a ação primária do Início), onde o tom suave sumiria.
 */
export type TomDoIcone = 'accent' | 'good' | 'warn' | 'rare' | 'error' | 'neutro' | 'sobreEscuro';

interface IconeEmBlocoProps {
  icone: LucideIcon;
  tom?: TomDoIcone;
  tamanho?: 'md' | 'lg';
  className?: string;
}

const TOM: Record<TomDoIcone, string> = {
  accent: 'bg-accent-soft text-accent-ink',
  good: 'bg-good-soft text-good-ink',
  warn: 'bg-warn-soft text-warn-ink',
  rare: 'bg-rare-soft text-rare-ink',
  error: 'bg-error-soft text-error-ink',
  neutro: 'bg-surface-hover text-ink-muted',
  sobreEscuro: 'bg-accent/20 text-accent',
};

const TAMANHO = {
  md: 'w-10 h-10 rounded-xl [&>svg]:w-5 [&>svg]:h-5',
  lg: 'w-12 h-12 rounded-2xl [&>svg]:w-6 [&>svg]:h-6',
} as const;

export default function IconeEmBloco({
  icone: Icone,
  tom = 'accent',
  tamanho = 'md',
  className = '',
}: IconeEmBlocoProps) {
  return (
    <span
      aria-hidden
      className={`inline-grid place-items-center shrink-0 ${TAMANHO[tamanho]} ${TOM[tom]} ${className}`}
    >
      <Icone />
    </span>
  );
}
