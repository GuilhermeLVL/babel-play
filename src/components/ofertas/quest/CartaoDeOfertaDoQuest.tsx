import '../../../styles/questConta.css';
import '../../../styles/polimentoPlanos.css';

import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { useCallback, useLayoutEffect, useRef } from 'react';

import { t } from '../../../lib/i18n';
import { entrarOferta, sairOferta } from '../../../lib/polimento/planos';
import { toast } from '../../Toast';

/**
 * A OFERTA QUE NÃO BLOQUEIA, NO DESENHO NOVO — `oferta()` do protótipo (`telas.js:495-519`): o
 * `aside.qc-oferta` embaixo e ao centro, com o ícone, o selo do que se sugere acima do título, o
 * fechar e as três saídas de sempre (a ação, "Agora não", "Não mostrar novamente").
 *
 * O MOVIMENTO é o do protótipo: sobe em 680 ms na mola suave, o ícone gira para o lugar e os textos
 * vêm em fila (`entrarOferta`); qualquer saída a desce em 280 ms antes de ela sair da tela
 * (`sairOferta`).
 *
 * Continua sem prender o foco e sem escurecer a tela. No celular o trilho deita embaixo, e o cartão
 * sobe para não ficar atrás dele (`polimento/telas.css`).
 *
 * Só apresentação: QUANDO aparece, o Esc e o que cada saída registra continuam em `CartaoDeOferta` e
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
  const ref = useRef<HTMLElement | null>(null);
  const saindo = useRef(false);
  const guardar = useCallback(
    (el: HTMLElement | null) => {
      ref.current = el;
      aoMontar(el);
    },
    [aoMontar],
  );
  /* A entrada (`telas.js:516-518`), antes da primeira pintura: a oferta não pisca no lugar. */
  useLayoutEffect(() => {
    if (ref.current) entrarOferta(ref.current);
  }, []);
  /* `fecharOferta()` (`telas.js:484-492`): toda saída desce primeiro; só a primeira vale. */
  const sair = (depois: () => void) => () => {
    if (saindo.current) return;
    saindo.current = true;
    sairOferta(ref.current, depois);
  };
  const naoMostrar = () => {
    if (saindo.current) return;
    /* `telas.js:511` */
    toast.info(t('Combinado: esta sugestão não aparece mais.'));
    sair(aoNaoMostrar)();
  };

  return (
    <aside
      ref={guardar}
      role="complementary"
      aria-label={t('Sugestão de plano')}
      data-testid="cartao-de-oferta"
      className={tom === 'alerta' ? 'qc-oferta qc-alerta' : 'qc-oferta'}
    >
      <span className="q-ic" aria-hidden>
        <Icone />
      </span>
      <div className="qc-oferta-texto">
        {selo && <span className="q-tag">{selo}</span>}
        <b>{titulo}</b>
        <p>{texto}</p>
      </div>
      <button type="button" className="q-ctl qc-fechar" aria-label={t('Fechar')} onClick={sair(aoDispensar)}>
        <X aria-hidden />
      </button>
      <div className="q-acoes">
        <button type="button" className="q-ctl pri" onClick={sair(aoAgir)}>
          {cta}
        </button>
        <button type="button" className="q-ctl" onClick={sair(aoDispensar)}>
          {t('Agora não')}
        </button>
        <button type="button" className="q-ctl" onClick={naoMostrar}>
          {t('Não mostrar novamente')}
        </button>
      </div>
    </aside>
  );
}
