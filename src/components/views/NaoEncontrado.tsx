import '../../styles/questInstitucional.css';

import { LayoutDashboard, LifeBuoy, MapPinOff, Search } from 'lucide-react';
import React from 'react';

import { t } from '../../lib/i18n';

/**
 * 404 — a tela do protótipo aprovado (`T.naoencontrado`). Um endereço errado não vira tela em
 * branco nem cai calado no Início: diz o que houve e oferece as três saídas.
 *
 * No Quest (telas novas ligadas), o mesmo recado e as mesmas três saídas no estado vazio do headset:
 * um botão principal (o Início) e os outros dois ao lado.
 */
export default function NaoEncontrado({
  onChangeView,
  onBuscar,
}: {
  onChangeView: (view: string) => void;
  onBuscar: () => void;
}) {
  return (
    <div className="q-palco q-inst" data-testid="nao-encontrado-do-quest">
      <section className="q-vazio">
        <span className="q-ic">
          <MapPinOff aria-hidden />
        </span>
        <p className="q-sobre">{t('Erro 404')}</p>
        <h1>{t('Esta página não existe')}</h1>
        <p>{t('O endereço pode ter mudado ou estar digitado errado. Nada do seu estudo se perdeu.')}</p>
        <div className="q-acoes">
          <button type="button" className="q-ctl pri" onClick={() => onChangeView('hub')}>
            <LayoutDashboard aria-hidden /> {t('Ir para o Início')}
          </button>
          <button type="button" className="q-ctl" onClick={onBuscar}>
            <Search aria-hidden /> {t('Buscar')}
          </button>
          <button type="button" className="q-ctl" onClick={() => onChangeView('ajuda')}>
            <LifeBuoy aria-hidden /> {t('Ajuda')}
          </button>
        </div>
      </section>
    </div>
  );
}
