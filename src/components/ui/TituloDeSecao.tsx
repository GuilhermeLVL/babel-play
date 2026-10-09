import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * TÍTULO DE SEÇÃO — ícone + título, descrição opcional e algo à direita (um botão, uma contagem).
 *
 * Marcação do protótipo aprovado (`TituloDeSecao()`): `.tsec` > `.tsec-l` > `.tsec-t` (ícone +
 * título) e `.desc`, e o que vai à direita. `nivel` só existe para manter a hierarquia de
 * cabeçalhos correta dentro de um bloco que já tem `h2`.
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
    <div className={`tsec ${className}`}>
      <div className="tsec-l">
        <div className="tsec-t">
          {Icone && <Icone aria-hidden />}
          <Tag>{titulo}</Tag>
        </div>
        {desc && <p className="desc">{desc}</p>}
      </div>
      {direita}
    </div>
  );
}
