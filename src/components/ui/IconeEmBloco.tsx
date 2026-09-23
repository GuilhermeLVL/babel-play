import type { LucideIcon } from 'lucide-react';

/**
 * ÍCONE EM BLOCO — o ícone num quadrado com o tom do tema, a marca visual de cada cartão.
 *
 * Marcação do protótipo aprovado (`IconeEmBloco()`): `span.ib` + tom (`good`, `warn`, `rare`; sem
 * tom = acento). Dentro de `.cartao.escuro` o próprio CSS do protótipo troca o tom — não há
 * variante a escolher aqui.
 */
export type TomDoIcone = 'accent' | 'good' | 'warn' | 'rare';

interface IconeEmBlocoProps {
  icone: LucideIcon;
  tom?: TomDoIcone;
  className?: string;
}

export default function IconeEmBloco({ icone: Icone, tom = 'accent', className = '' }: IconeEmBlocoProps) {
  return (
    <span aria-hidden className={`ib ${tom === 'accent' ? '' : tom} ${className}`}>
      <Icone />
    </span>
  );
}
