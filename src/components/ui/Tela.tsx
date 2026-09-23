import type { ReactNode } from 'react';

/**
 * TELA — a moldura de rolagem e largura de toda view.
 *
 * O protótipo aprovado (`docs/prototipos/consistencia-telas.html`) é o "Figma" do app: a marcação
 * aqui é a MESMA dele (`.rolagem` > `.tela.larga|.estreita.entra`), e o CSS vem gerado dele em
 * `src/styles/prototipo.css`. Duas larguras só: `larga` (1152) para grades, `estreita` (896) para
 * leitura e formulário.
 */
interface TelaProps {
  largura?: 'larga' | 'estreita';
  children: ReactNode;
  className?: string;
}

export default function Tela({ largura = 'larga', children, className = '' }: TelaProps) {
  return (
    <div className="rolagem w-full">
      <div className={`tela ${largura} entra ${className}`}>{children}</div>
    </div>
  );
}
