import { CircleHelp, LayoutDashboard, LifeBuoy, MapPinOff, Search } from 'lucide-react';
import React from 'react';

import { Tela } from '../ui';

/**
 * 404 — a tela do protótipo aprovado (`T.naoencontrado`). Um endereço errado não vira tela em
 * branco nem cai calado no Início: diz o que houve e oferece as três saídas.
 */
export default function NaoEncontrado({
  onChangeView,
  onBuscar,
}: {
  onChangeView: (view: string) => void;
  onBuscar: () => void;
}) {
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
