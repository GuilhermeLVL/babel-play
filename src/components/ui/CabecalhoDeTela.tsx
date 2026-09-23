import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * CABEÇALHO DE TELA — sobrancelha com ícone, o único `<h1>` da tela, subtítulo, ações e abas.
 *
 * A marcação é a do protótipo aprovado, o "Figma" do app (`Cabecalho()` em
 * `docs/prototipos/consistencia-telas.html`): `.cab` > `.voltar`, `.cab-linha` > `.cab-texto`
 * (`.sobrancelha`, `h1`, `.sub`) e `.cab-acoes`, e as abas embaixo. O CSS é o dele
 * (`src/styles/prototipo.css`), então a tela fica idêntica.
 */
interface CabecalhoDeTelaProps {
  titulo: ReactNode;
  /** O rótulo curto acima do título (ex.: "Seu estudo"). */
  sobrancelha?: ReactNode;
  icone?: LucideIcon;
  sub?: ReactNode;
  /** Botões à direita do título (quebram para baixo em telas estreitas). */
  acoes?: ReactNode;
  /** As abas da tela, logo abaixo do cabeçalho. */
  abas?: ReactNode;
  /** Volta para a tela de origem (sub-telas: sessão, revisão, rodada). */
  voltar?: { rotulo: string; aoClicar: () => void };
  className?: string;
}

export default function CabecalhoDeTela({
  titulo,
  sobrancelha,
  icone: Icone,
  sub,
  acoes,
  abas,
  voltar,
  className = '',
}: CabecalhoDeTelaProps) {
  return (
    <header className={`cab ${className}`}>
      {voltar && (
        <button type="button" className="voltar" onClick={voltar.aoClicar}>
          <ArrowLeft aria-hidden /> {voltar.rotulo}
        </button>
      )}
      <div className="cab-linha">
        <div className="cab-texto">
          {sobrancelha && (
            <span className="sobrancelha">
              {Icone && <Icone aria-hidden />}
              <span>{sobrancelha}</span>
            </span>
          )}
          <h1>{titulo}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {acoes && <div className="cab-acoes">{acoes}</div>}
      </div>
      {abas}
    </header>
  );
}
