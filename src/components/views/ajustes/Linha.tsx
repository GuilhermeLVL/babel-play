import type { ReactNode } from 'react';

/**
 * As duas peças que as abas de Ajustes repetem, na marcação do protótipo aprovado:
 * a linha `.ajuste.ajuste-l` (texto à esquerda, controle à direita) e o `.interruptor`
 * (`interruptor()` em `docs/prototipos/consistencia-telas.html`).
 */
export function Linha({ titulo, desc, children }: { titulo: ReactNode; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ajuste ajuste-l">
      <div>
        <h3>{titulo}</h3>
        {desc !== undefined && <p className="mut">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function Interruptor({
  ligado,
  rotulo,
  aoTrocar,
  desabilitado,
}: {
  ligado: boolean;
  rotulo: string;
  aoTrocar: (ligado: boolean) => void;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      className={`interruptor ${ligado ? 'on' : ''}`}
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => aoTrocar(!ligado)}
    >
      <span />
    </button>
  );
}
