import type { MinigameId } from '@core';
import { Layers, Mic } from 'lucide-react';
import { type CSSProperties, type ReactNode, useRef } from 'react';

import { t, tp } from '../../../../lib/i18n';
import { sentir } from '../../../../lib/polimento/sentidos';
import type { TipoDePratica } from '../../../../lib/revisao/enxuta';
import { PRATICA_CONTA_COMO_REVISAO } from '../../../../lib/revisao/pratica';
import MiniDoJogo from '../../../minigames/polimento/MiniDoJogo';
import FolhaDeBaixo from '../../captura/celular/FolhaDeBaixo';
import { CabecalhoDaFolha, SeloDaPratica } from './pecas';

/** Se a prática pode rodar sobre este recorte; quando não, o motivo vai escrito no ladrilho. */
export type PraticasDisponiveis = Record<TipoDePratica, { ok: boolean; motivo?: string }>;

/** As miniaturas dos jogos que cada ladrilho usa (`CX_PR`, `cartoes4.js:399-402`). */
const MINI: Partial<Record<TipoDePratica, MinigameId>> = { ditado: 'ditado', completar: 'vitendawili', jogo: 'memory' };

/** As barras da miniatura de "Falar" (`barras(7)` de `minis.js:10`), com a fase de cada uma fixa. */
const barras = (fases: number[]) => (
  <span className="mm-eq">
    {fases.map((f, i) => (
      <i key={i} style={{ '--i': f } as CSSProperties} />
    ))}
  </span>
);

/**
 * A FOLHA "PRATICAR DE OUTRO JEITO" — porte de `cxAbrirPraticar()` (`cartoes4.js:423-459`): uma folha
 * só, com o recorte recebido e as práticas. O selo de cada uma diz o que ela faz com a agenda
 * (`lib/revisao/pratica.ts`).
 *
 * NÃO ENTRARAM, e por isso não há botão: "Treinar o ouvido" (pede pares de som parecido, que o app não
 * tem), "Desafiar um amigo" (pede servidor de convite), o "Bônus de hoje" e "Ver todos os jogos" (o
 * saguão do Jogar não recebe um recorte).
 *
 * Carregada só quando abre (`React.lazy`).
 */
export default function FolhaPraticar({
  rotulo,
  quantos,
  disponiveis,
  aoEscolher,
  aoFechar,
}: {
  rotulo: string;
  quantos: number;
  disponiveis: PraticasDisponiveis;
  aoEscolher: (tipo: TipoDePratica) => void;
  aoFechar: () => void;
}) {
  const folha = useRef<HTMLDialogElement>(null);
  const depois = useRef<(() => void) | null>(null);
  const PRATICAS: Array<[TipoDePratica, string, string, ReactNode]> = [
    [
      'falar',
      t('Falar'),
      t('Diga a frase e compare a sua voz com a fala original.'),
      <span key="m" className="px-mini" data-mini="falar" aria-hidden>
        <span className="mm-som grande">
          <Mic aria-hidden />
        </span>
        <span className="cx-mini-ondas">
          {barras([0, 3, 1, 4, 2, 0, 3])}
          {barras([2, 0, 4, 1, 3, 2, 1])}
        </span>
      </span>,
    ],
    ['ditado', t('Ouvir e escrever'), t('A fala original toca. Você escreve o que ouviu.'), null],
    ['completar', t('Completar'), t('A fala toca até a lacuna. Você completa a frase.'), null],
    ['jogo', t('Jogo rápido'), t('Um jogo de palavras com estes cartões.'), null],
  ];
  return (
    <FolhaDeBaixo
      titulo={t('Praticar de outro jeito: {rotulo}', { rotulo })}
      doPrototipo
      classe="cx-folha cx-folha-praticar"
      refDaFolha={folha}
      aoFechar={() => {
        const acao = depois.current;
        depois.current = null;
        aoFechar();
        if (acao) window.setTimeout(acao, 260);
      }}
    >
      <CabecalhoDaFolha aoFechar={() => folha.current?.close()}>
        <p className="folha-pal">{t('Praticar de outro jeito')}</p>
        <p className="cx-recorte">
          <span className="q-tag">
            <Layers aria-hidden /> {rotulo}
          </span>
          <span>{tp(quantos, '{n} cartão', '{n} cartões')}</span>
        </p>
      </CabecalhoDaFolha>
      <div className="cx-ladrilhos">
        {PRATICAS.map(([tipo, nome, desc, mini]) => {
          const d = disponiveis[tipo];
          const jogo = MINI[tipo];
          return (
            <button
              key={tipo}
              type="button"
              className="q-tile px-com-mini cx-ladrilho"
              data-pratica={tipo}
              disabled={!d.ok}
              onClick={() => {
                sentir('nav');
                depois.current = () => aoEscolher(tipo);
                folha.current?.close();
              }}
            >
              {mini ?? (jogo && <MiniDoJogo jogo={jogo} />)}
              <b>{nome}</b>
              <span className="q-d">{d.ok ? desc : (d.motivo ?? desc)}</span>
              <SeloDaPratica conta={PRATICA_CONTA_COMO_REVISAO[tipo]} />
            </button>
          );
        })}
      </div>
    </FolhaDeBaixo>
  );
}
