import { type ReactNode, type RefObject, useId, useRef } from 'react';

import { t } from '../../../../lib/i18n';
import { DialogoBase } from '../../../ui';

/** Arrastar a pega para baixo mais que isto fecha a folha. */
const ARRASTO_QUE_FECHA_PX = 80;

/**
 * A FOLHA QUE SOBE DE BAIXO — o diálogo do celular (a captura no celular, 2026-09-29).
 *
 * É o mesmo `<dialog>` modal de `Dialogo` (foco preso, Esc fecha, fundo inerte), só que preso à
 * borda de baixo, ao alcance do polegar: a caixa centralizada do computador, num celular, põe o
 * "fechar" no alto da tela, onde o dedo não chega. Fecha pelo toque no fundo, pelo Esc (voltar do
 * Android num teclado) e arrastando a pega para baixo.
 *
 * Monta aberta e fecha pelo `aoFechar` — quem controla se ela existe é o chamador (como `Dialogo`).
 */
export default function FolhaDeBaixo({
  titulo,
  tituloVisivel = true,
  aoFechar,
  classe = '',
  doPrototipo = false,
  refDaFolha,
  children,
}: {
  titulo: ReactNode;
  /** `false`: o título só dá nome à folha (a frase, a palavra já dizem o que ela é). */
  tituloVisivel?: boolean;
  aoFechar: () => void;
  classe?: string;
  /**
   * A folha do protótipo de polimento (`folhaDeBaixo()` de `telas.js:173-188`): a pega é só um traço,
   * o nome vai em `aria-label` e quem anima a subida e a descida é `lib/polimento/dialogos.ts`.
   */
  doPrototipo?: boolean;
  /** O `<dialog>` da folha, para quem precisa animá-lo. */
  refDaFolha?: RefObject<HTMLDialogElement | null>;
  children: ReactNode;
}) {
  const proprio = useRef<HTMLDialogElement>(null);
  const ref = refDaFolha ?? proprio;
  const idTitulo = useId();
  const arrasto = useRef<{ y0: number; dy: number } | null>(null);

  const soltar = () => {
    const a = arrasto.current;
    arrasto.current = null;
    const caixa = ref.current;
    if (!caixa) return;
    caixa.style.transform = '';
    if (a && a.dy > ARRASTO_QUE_FECHA_PX) caixa.close();
  };

  if (doPrototipo) {
    return (
      <DialogoBase
        classe={`folha-de-baixo ${classe}`}
        rotulo={typeof titulo === 'string' ? titulo : t('Ações')}
        aoFechar={aoFechar}
        refDialogo={ref}
        fecharNoFundo
      >
        <span className="folha-pega" aria-hidden />
        <div className="folha-corpo">{children}</div>
      </DialogoBase>
    );
  }

  return (
    <DialogoBase
      classe={`folha-de-baixo ${classe}`}
      rotuloId={idTitulo}
      aoFechar={aoFechar}
      refDialogo={ref}
      fecharNoFundo
    >
      <div
        className="folha-pega"
        role="button"
        tabIndex={-1}
        aria-label={t('Arraste para baixo para fechar')}
        onPointerDown={(e) => {
          arrasto.current = { y0: e.clientY, dy: 0 };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const a = arrasto.current;
          if (!a || !ref.current) return;
          a.dy = Math.max(0, e.clientY - a.y0);
          ref.current.style.transform = `translateY(${a.dy}px)`;
        }}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        <span />
      </div>
      <h2 id={idTitulo} className={tituloVisivel ? 'folha-titulo' : 'sr'}>
        {titulo}
      </h2>
      <div className="folha-corpo">{children}</div>
    </DialogoBase>
  );
}
