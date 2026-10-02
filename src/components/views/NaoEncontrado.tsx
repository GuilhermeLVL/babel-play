import '../../styles/questInstitucional.css';

import { CircleHelp, LayoutDashboard, LifeBuoy, MapPinOff, Search } from 'lucide-react';
import React from 'react';

import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../lib/i18n';
import { Tela } from '../ui';

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
  const questNovo = useQuestNovo();

  if (questNovo)
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

  return (
    <Tela largura="estreita">
      <section className="cartao p6 sucesso">
        <div className="selo-ok neutro" aria-hidden>
          <MapPinOff />
        </div>
        <span className="sobrancelha" style={{ justifyContent: 'center' }}>
          <CircleHelp aria-hidden /> Erro 404
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '6px 0 8px' }}>Esta página não existe</h1>
        <p className="mut" style={{ maxWidth: '48ch', margin: '0 auto' }}>
          O endereço pode ter mudado ou estar digitado errado. Nada do seu estudo se perdeu.
        </p>
        <div className="linha" style={{ gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-solid" onClick={() => onChangeView('hub')}>
            <LayoutDashboard aria-hidden /> Ir para o Início
          </button>
          <button type="button" className="btn btn-outline" onClick={onBuscar}>
            <Search aria-hidden /> Buscar
          </button>
          <button type="button" className="btn btn-outline" onClick={() => onChangeView('ajuda')}>
            <LifeBuoy aria-hidden /> Ajuda
          </button>
        </div>
      </section>
    </Tela>
  );
}
