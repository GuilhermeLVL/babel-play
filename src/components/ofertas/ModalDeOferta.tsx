import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { useId, useRef } from 'react';

import { t } from '../../lib/i18n';
import { DialogoBase, IconeEmBloco } from '../ui';

/**
 * O MODAL DE UPGRADE — a mesma casca dos diálogos de "Sua assinatura" (`DialogosDaAssinatura`):
 * `<dialog>` nativo via `DialogoBase` (foco preso, Esc fecha, fundo inerte), cabeçalho `.dlg-cab`
 * com ícone em bloco, corpo `.dlg-corpo` e rodapé `.dlg-pe`.
 *
 * O que ele acrescenta ao diálogo padrão: fecha também com clique FORA da caixa (`fecharNoFundo`),
 * e o rodapé tem as três saídas — "Não mostrar novamente", "Agora não" e a ação. Qualquer
 * fechamento que não seja uma das duas escolhas explícitas (Esc, X, fundo) conta como "agora não".
 *
 * Quem decide QUANDO ele aparece é o motor: nunca durante captura, rodada ou outra celebração.
 */
export interface PropsDoModalDeOferta {
  icone: LucideIcon;
  titulo: string;
  texto: string;
  cta: string;
  selo?: string;
  aoAgir: () => void;
  aoDispensar: () => void;
  aoNaoMostrar: () => void;
}

export default function ModalDeOferta({
  icone,
  titulo,
  texto,
  cta,
  selo,
  aoAgir,
  aoDispensar,
  aoNaoMostrar,
}: PropsDoModalDeOferta) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  /* A escolha feita ANTES de fechar: o `close` nativo chega depois e não pode contá-la de novo. */
  const escolha = useRef<null | (() => void)>(null);
  const escolher = (acao: () => void) => {
    escolha.current = acao;
    ref.current?.close();
  };

  return (
    <DialogoBase
      classe="medio"
      rotuloId={idTitulo}
      refDialogo={ref}
      fecharNoFundo
      aoFechar={() => (escolha.current ?? aoDispensar)()}
    >
      <div className="dlg-cab">
        <IconeEmBloco icone={icone} />
        <div style={{ minWidth: 0 }}>
          <h2 id={idTitulo}>{titulo}</h2>
          {selo && (
            <span className="badge acc" style={{ marginTop: 6 }}>
              {selo}
            </span>
          )}
        </div>
        <button type="button" className="x" aria-label={t('Fechar')} onClick={() => ref.current?.close()}>
          <X aria-hidden />
        </button>
      </div>
      <div className="dlg-corpo">
        <p>{texto}</p>
      </div>
      <div className="dlg-pe" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="link" style={{ marginRight: 'auto' }} onClick={() => escolher(aoNaoMostrar)}>
          {t('Não mostrar novamente')}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => escolher(aoDispensar)}>
          {t('Agora não')}
        </button>
        <button type="button" className="btn btn-solid" data-autofocus onClick={() => escolher(aoAgir)}>
          {cta}
        </button>
      </div>
    </DialogoBase>
  );
}
