import type { ReactNode } from 'react';

/**
 * O diálogo do protótipo mora em `src/components/ui/Dialogo.tsx` (várias telas o usam). Aqui ficam
 * só as peças de formulário dos diálogos do Vocabulário e da Revisão.
 */
export { default } from '../../ui/Dialogo';

/** `campoLinha()` do protótipo: rótulo e descrição à esquerda, o controle à direita. */
export function CampoLinha({ rotulo, desc, children }: { rotulo: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="op-linha">
      <div style={{ minWidth: 0 }}>
        <b>{rotulo}</b>
        {desc && <small>{desc}</small>}
      </div>
      <div className="op-ctrl">{children}</div>
    </div>
  );
}

/** `sw()` do protótipo: o interruptor (`role="switch"`). */
export function Interruptor({ ligado, aoTrocar, rotulo }: { ligado: boolean; aoTrocar: () => void; rotulo: string }) {
  return (
    <button
      type="button"
      className={`interruptor ${ligado ? 'on' : ''}`}
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={aoTrocar}
    >
      <span />
    </button>
  );
}

/** `segDe()` do protótipo: o seletor segmentado (`.seg`, `role="radiogroup"`). */
export function Segmentos<T extends string>({
  atual,
  opcoes,
  aoTrocar,
  rotulo,
}: {
  atual: T;
  opcoes: Array<[T, ReactNode]>;
  aoTrocar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([v, r]) => (
        <button key={v} type="button" role="radio" aria-checked={atual === v} onClick={() => aoTrocar(v)}>
          {r}
        </button>
      ))}
    </div>
  );
}
