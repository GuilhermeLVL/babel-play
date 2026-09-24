import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useId, useRef } from 'react';

import IconeEmBloco from './IconeEmBloco';

/**
 * O DIÁLOGO DO PROTÓTIPO — `abrirDialogo()`/`dlg()` + `cabDlg()` de `docs/prototipos/consistencia-telas.html`.
 *
 * `<dialog>` nativo aberto com `showModal()` (foco preso, Esc fecha, fundo inerte). O CSS é o do
 * protótipo (`src/styles/prototipo.css`): `dialog`, `.medio`, `.largo`, `.paleta-cmd`, `.dlg-cab`,
 * `.dlg-corpo`, `.dlg-pe`, `.recompensa`.
 *
 * Monta aberto e fecha pelo `aoFechar` — quem controla se ele existe é o chamador.
 */

/**
 * A casca: só o `<dialog>` e o ciclo de vida dele. Para os diálogos que não têm o cabeçalho
 * padrão (busca, recompensa, apresentação).
 *
 * `aoCancelar`: o Esc nativo dispara `cancel` antes de fechar. Quem passa `aoCancelar` decide o que
 * o Esc faz (a apresentação pula para a escolha em vez de sumir); sem ele, o Esc fecha.
 */
export function DialogoBase({
  classe = '',
  rotuloId,
  rotulo,
  aoFechar,
  aoCancelar,
  refDialogo,
  children,
}: {
  classe?: string;
  /** id do título visível (`aria-labelledby`). */
  rotuloId?: string;
  /** Nome acessível quando não há título visível (`aria-label`). */
  rotulo?: string;
  aoFechar: () => void;
  aoCancelar?: () => void;
  refDialogo?: RefObject<HTMLDialogElement | null>;
  children: ReactNode;
}) {
  const proprio = useRef<HTMLDialogElement>(null);
  const ref = refDialogo ?? proprio;
  // Os callbacks mais recentes, sem reabrir o diálogo a cada render do pai.
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const cancelar = useRef(aoCancelar);
  cancelar.current = aoCancelar;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal?.();
    /* O `autofocus` do protótipo: o `showModal()` põe o foco no primeiro focável, e o `autoFocus`
       do React roda antes dele; `data-autofocus` marca quem deve ficar com o foco. */
    d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const aoFecharNativo = () => fechar.current();
    const aoCancelarNativo = (e: Event) => {
      if (!cancelar.current) return;
      e.preventDefault();
      cancelar.current();
    };
    d.addEventListener('close', aoFecharNativo);
    d.addEventListener('cancel', aoCancelarNativo);
    /* Sem `d.close()` aqui, de propósito: o evento `close` é despachado DEPOIS, numa tarefa, e o
       StrictMode desmonta e remonta o efeito na hora — o ouvinte novo o receberia e fecharia o
       diálogo que acabou de abrir. Sair do DOM já tira o diálogo da camada modal. */
    return () => {
      d.removeEventListener('close', aoFecharNativo);
      d.removeEventListener('cancel', aoCancelarNativo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // `m-auto`: o preflight do Tailwind zera a margem que centraliza o `<dialog>` modal no navegador.
    <dialog
      ref={ref}
      className={`${classe} m-auto`}
      aria-labelledby={rotuloId}
      aria-label={rotuloId ? undefined : rotulo}
    >
      {children}
    </dialog>
  );
}

/** Fecha o `<dialog>` que contém o elemento — o `this.closest('dialog').close()` do protótipo. */
export function fecharDialogoDe(el: Element | null): void {
  el?.closest('dialog')?.close();
}

/** O diálogo com o cabeçalho padrão (`.dlg-cab`: ícone em bloco, título, subtítulo, fechar). */
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
  return (
    <DialogoBase classe={largura} rotuloId={idTitulo} aoFechar={aoFechar} refDialogo={ref}>
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
    </DialogoBase>
  );
}
