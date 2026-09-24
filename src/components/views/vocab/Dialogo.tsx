import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';

import { IconeEmBloco } from '../../ui';

/**
 * O DIÁLOGO DO PROTÓTIPO — `dlg()` + `cabDlg()` de `docs/prototipos/consistencia-telas.html`.
 *
 * `<dialog>` nativo aberto com `showModal()` (foco preso, Esc fecha, fundo inerte), com a marcação
 * dele: `.dlg-cab` (ícone em bloco, título, subtítulo, fechar), e o corpo e o pé que o chamador
 * escreve (`.dlg-corpo`, `.dlg-pe`). O CSS é o do protótipo (`src/styles/prototipo.css`).
 *
 * Monta aberto e fecha pelo `aoFechar` — quem controla se ele existe é o chamador.
 */
export default function Dialogo({
  icone,
  titulo,
  sub,
  largura = 'medio',
  aoFechar,
  children,
}: {
  icone: LucideIcon;
  titulo: ReactNode;
  sub?: ReactNode;
  largura?: 'medio' | 'largo' | '';
  aoFechar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  // O `aoFechar` mais recente, sem reabrir o diálogo a cada render do pai.
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal?.();
    const aoFecharNativo = () => fechar.current();
    d.addEventListener('close', aoFecharNativo);
    /* Sem `d.close()` aqui, de propósito: o evento `close` é despachado DEPOIS, numa tarefa, e o
       StrictMode desmonta e remonta o efeito na hora — o ouvinte novo o receberia e fecharia o
       diálogo que acabou de abrir. Sair do DOM já tira o diálogo da camada modal. */
    return () => d.removeEventListener('close', aoFecharNativo);
  }, []);

  return (
    // `m-auto`: o preflight do Tailwind zera a margem que centraliza o `<dialog>` modal no navegador.
    <dialog ref={ref} className={`${largura} m-auto`} aria-labelledby={idTitulo}>
      <div className="dlg-cab">
        <IconeEmBloco icone={icone} />
        <div style={{ minWidth: 0 }}>
          <h2 id={idTitulo}>{titulo}</h2>
          {sub && (
            <p className="mut" style={{ fontSize: 13 }}>
              {sub}
            </p>
          )}
        </div>
        <button type="button" className="x" aria-label="Fechar" onClick={() => ref.current?.close()}>
          <X aria-hidden />
        </button>
      </div>
      {children}
    </dialog>
  );
}

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
