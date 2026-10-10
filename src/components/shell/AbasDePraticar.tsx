import { Gamepad2, Layers } from 'lucide-react';

import { t } from '../../lib/i18n';
import { useBarraDeCinco } from '../../lib/polimento/celular';
import { navegarPara } from '../../lib/rotas';

/**
 * "PRATICAR" É UM DESTINO SÓ, COM DUAS ABAS — porte de `ctPraticar` (`cartoes3.js:92-96`).
 *
 * Na barra de cinco do celular, Cartões e Jogar dividem um botão ("Praticar"); as duas abas aparecem
 * no alto das duas telas e levam de uma à outra. No computador cada tela tem o seu item no trilho e
 * as abas não existem (decisão do dono, 10/10/2026: navegação A no computador, "Praticar" no celular).
 *
 * As contagens que o protótipo põe em cada aba ("26", "18") ficaram de fora: a tela Jogar não tem o
 * número do dia dos cartões sem um pedido a mais.
 */
export default function AbasDePraticar({ qual }: { qual: 'cartoes' | 'jogar' }) {
  const cinco = useBarraDeCinco();
  if (!cinco) return null;
  return (
    <div className="q-abas ct-praticar" role="tablist" aria-label={t('Praticar')} data-testid="abas-de-praticar">
      <button
        type="button"
        role="tab"
        className="q-aba"
        aria-selected={qual === 'cartoes'}
        onClick={() => qual !== 'cartoes' && navegarPara({ view: 'cartoes' })}
      >
        <Layers aria-hidden />
        {t('Cartões')}
      </button>
      <button
        type="button"
        role="tab"
        className="q-aba"
        aria-selected={qual === 'jogar'}
        onClick={() => qual !== 'jogar' && navegarPara({ view: 'play' })}
      >
        <Gamepad2 aria-hidden />
        {t('Jogos')}
      </button>
    </div>
  );
}
