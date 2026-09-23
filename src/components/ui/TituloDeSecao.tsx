import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * TÍTULO DE SEÇÃO — ícone + título, descrição opcional e algo à direita (um botão, uma contagem).
 *
 * O DEFEITO QUE ISTO CONSERTA. Os títulos de seção variavam de `text-sm` a `text-lg`, de `bold` a
 * `extrabold`, com e sem ícone, `h2` numa tela e `h3` na vizinha para o mesmo papel. Aqui o papel
 * decide a forma, e `nivel` só existe para manter a hierarquia de cabeçalhos correta dentro de um
 * bloco que já tem `h2`.
 */
interface TituloDeSecaoProps {
  titulo: ReactNode;
  icone?: LucideIcon;
  desc?: ReactNode;
  direita?: ReactNode;
  nivel?: 'h2' | 'h3';
  className?: string;
}

export default function TituloDeSecao({
  titulo,
  icone: Icone,
  desc,
  direita,
  nivel = 'h2',
  className = '',
}: TituloDeSecaoProps) {
  const Tag = nivel;
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 mb-4 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-ink">
          {Icone && <Icone className="w-[18px] h-[18px] shrink-0 text-accent-ink" aria-hidden />}
          <Tag className="font-display font-extrabold text-lg leading-tight">{titulo}</Tag>
        </div>
        {desc && <p className="text-[13px] text-ink-muted mt-1 max-w-[70ch]">{desc}</p>}
      </div>
      {direita}
    </div>
  );
}
