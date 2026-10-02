import '../../../styles/questConta.css';

import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { useId } from 'react';

import { t } from '../../../lib/i18n';

/**
 * A OFERTA QUE NÃO BLOQUEIA, NO META QUEST: o banner e o aviso de cota de `CartaoDeOferta`, embaixo e
 * ao centro, com as três saídas de sempre em alvos de 60 px (a ação, "Agora não", "Não mostrar
 * novamente") e o fechar de 56.
 *
 * Continua sem prender o foco e sem escurecer a tela: é um `status`. No headset de janela estreita o
 * trilho deita embaixo, e o cartão sobe para não ficar atrás dele (`questConta.css`).
 *
 * Só apresentação: quando aparece, o Esc e o que cada saída registra continuam em `CartaoDeOferta` e
 * no `HostDeOfertas`, que carregam este arquivo sob demanda (eles moram no pacote inicial).
 */
export default function CartaoDeOfertaDoQuest({
  aoMontar,
  tom,
  icone: Icone,
  titulo,
  texto,
  cta,
  selo,
  aoAgir,
  aoDispensar,
  aoNaoMostrar,
}: {
  /** Entrega o elemento a `CartaoDeOferta`, que escuta o Esc nele. */
  aoMontar: (el: HTMLElement | null) => void;
  tom: 'acento' | 'alerta';
  icone: LucideIcon;
  titulo: string;
  texto: string;
  cta: string;
  selo?: string;
  aoAgir: () => void;
  aoDispensar: () => void;
  aoNaoMostrar: () => void;
}) {
  const idTitulo = useId();
  return (
    <section
      ref={aoMontar}
      role="status"
      aria-labelledby={idTitulo}
      data-testid="cartao-de-oferta"
      className={tom === 'alerta' ? 'qc-oferta qc-alerta' : 'qc-oferta'}
    >
      <span className="q-ic" aria-hidden>
        <Icone />
      </span>
      <div className="qc-oferta-texto">
        <b id={idTitulo}>{titulo}</b>
        <p>{texto}</p>
        {selo && <span className="q-tag qc-livre">{selo}</span>}
      </div>
      <button type="button" className="qc-fechar" aria-label={t('Dispensar aviso')} onClick={aoDispensar}>
        <X aria-hidden />
      </button>
      <div className="q-acoes">
        <button type="button" className="q-ctl pri" onClick={aoAgir}>
          {cta}
        </button>
        <button type="button" className="q-ctl" onClick={aoDispensar}>
          {t('Agora não')}
        </button>
        <button type="button" className="q-ctl" onClick={aoNaoMostrar}>
          {t('Não mostrar novamente')}
        </button>
      </div>
    </section>
  );
}
