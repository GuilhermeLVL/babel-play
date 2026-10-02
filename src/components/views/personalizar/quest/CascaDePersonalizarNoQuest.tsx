import '../../../../styles/questPersonalizar.css';

import { Sprout } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';

import { numero, t } from '../../../../lib/i18n';
import type { ItemDeAba } from '../../../ui';

/**
 * A CASCA DE PERSONALIZAR NO META QUEST (segunda rodada do desenho do headset, 01/10/2026).
 *
 * O cabeçalho do desenho novo (sobrancelha, título, a moldura e o título de perfil, o saldo de Seeds) e as
 * abas em pílulas. O miolo de cada aba é o de sempre: quem monta esta casca (`PersonalizarV2` ou a tela
 * clássica de `Loja.tsx`) continua dono do estado, das compras e de equipar.
 *
 * O miolo leva a classe `tela` de propósito: é o escopo de `questBase.css`, que dá as medidas do headset
 * às peças de sempre que moram dentro das abas (`.cartao`, `.btn`, `.pill`, `.campo`, o piso do texto).
 * O que precisava de OUTRA organização foi refeito em cada parte, com as peças `.q-*`.
 */
export default function CascaDePersonalizarNoQuest({
  saldo,
  moldura,
  abas,
  ativa,
  aoTrocar,
  faixa,
  children,
}: {
  saldo: number;
  /** A moldura e o título de perfil equipados (some sozinha quando não há). */
  moldura?: ReactNode;
  abas: ItemDeAba[];
  ativa: string;
  aoTrocar: (id: string) => void;
  /** O que vale para todas as abas e fica acima delas (o aviso do tema em prévia). */
  faixa?: ReactNode;
  /** O miolo da aba ativa. */
  children: ReactNode;
}) {
  // As setas trocam de aba, como nas abas de sempre (`ui/Abas`): no Quest, é o direcional do controle.
  const aoTeclar = (e: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!passo && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const destino =
      e.key === 'Home' ? 0 : e.key === 'End' ? abas.length - 1 : (indice + passo + abas.length) % abas.length;
    aoTrocar(abas[destino].id);
    (e.currentTarget.parentElement?.children[destino] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="q-palco qp" data-testid="personalizar-no-quest">
      <header className="q-cab">
        <div>
          <p className="q-sobre">{t('Seu visual')}</p>
          <h1>{t('Personalizar')}</h1>
        </div>
        {moldura}
        <span className="q-chip" data-testid="saldo-de-seeds">
          <Sprout aria-hidden />
          <b className="tn">{numero(saldo)}</b> Seeds
        </span>
      </header>

      <div className="q-abas qp-abas" role="tablist" aria-label={t('Seções de Personalizar')}>
        {abas.map((a, i) => {
          const selecionada = a.id === ativa;
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              id={`aba-${a.id}`}
              aria-selected={selecionada}
              aria-controls={`painel-${a.id}`}
              tabIndex={selecionada ? 0 : -1}
              className="q-aba"
              onClick={() => aoTrocar(a.id)}
              onKeyDown={(e) => aoTeclar(e, i)}
            >
              {a.icone}
              {a.rotulo}
              {a.contagem !== undefined && <span className="n">{a.contagem}</span>}
            </button>
          );
        })}
      </div>

      <div className="tela qp-miolo">
        {faixa}
        <div role="tabpanel" id={`painel-${ativa}`} aria-labelledby={`aba-${ativa}`} className="qp-pilha">
          {children}
        </div>
      </div>
    </div>
  );
}
