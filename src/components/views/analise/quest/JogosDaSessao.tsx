import '../../../../styles/questJogarTelas.css';

import type { MinigameId } from '@core';
import { useEffect } from 'react';

import { t } from '../../../../lib/i18n';
import MiniDoJogo from '../../../minigames/polimento/MiniDoJogo';
import type { JogoParaOQuest, TileDoQuest } from '../../play/quest/jogosNoQuest';

/**
 * OS QUATRO JOGOS DA SESSÃO, na ordem, com o nome e a frase do protótipo (`telas3.js:75-80`). A
 * miniatura é a que o protótipo escolhe pelo título (`POR_TITULO`, `minis.js:31-36`).
 */
const JOGOS_DA_SESSAO: readonly { id: MinigameId; nome: () => string; frase: () => string }[] = [
  {
    id: 'memory',
    nome: () => t('Memória: palavra e tradução'),
    frase: () => t('Vire as cartas e feche os pares palavra ↔ tradução'),
  },
  { id: 'scramble', nome: () => t('Frase embaralhada'), frase: () => t('Uma frase real desta sessão, fora de ordem') },
  { id: 'ditado', nome: () => t('Ditado'), frase: () => t('Ouça a fala e escreva o que entendeu') },
  { id: 'escuta', nome: () => t('Qual foi a fala?'), frase: () => t('Ouça o trecho e escolha a frase certa') },
];

/**
 * A ABA "JOGOS" DA SESSÃO NO DESENHO NOVO — a marcação do protótipo (`telas3.js:74-82`): o título, a
 * frase de apoio e quatro ladrilhos com a miniatura do jogo (`vestirJogos()`, `minis.js:37-48`).
 *
 * O dado é o de verdade: quem classifica cada ladrilho é o mesmo `tilesDoQuest` do lobby (a etiqueta
 * de como se joga neste aparelho, e o apagado com o que falta quando o material desta gravação não
 * fecha a rodada). O ladrilho que abre chama a rodada pelo caminho de sempre do `Play`, com as
 * palavras e as falas desta sessão. `tiles` nulo: o baralho ainda está chegando.
 */
export default function JogosDaSessao({
  tiles,
  aoJogar,
  aoContar,
}: {
  tiles: readonly TileDoQuest<JogoParaOQuest>[] | null;
  aoJogar: (id: MinigameId) => void;
  /** Quantos dos quatro abrem: o número da aba "Jogos" (`telas3.js:101`). */
  aoContar?: (n: number) => void;
}) {
  const doJogo = (id: MinigameId) => tiles?.find((tile) => tile.jogo.id === id);
  const abrem = tiles ? JOGOS_DA_SESSAO.filter(({ id }) => doJogo(id) && !doJogo(id)!.apagado).length : null;
  useEffect(() => {
    if (abrem != null) aoContar?.(abrem);
  }, [abrem, aoContar]);

  return (
    <div className="q-secao qs-jogos" data-testid="jogos-da-sessao" aria-busy={tiles ? undefined : true}>
      <header>
        <div>
          <h2>{t('Jogos com esta sessão')}</h2>
          <p>{t('As rodadas usam só as palavras e as falas desta gravação.')}</p>
        </div>
      </header>
      <div className="q-grade g4">
        {JOGOS_DA_SESSAO.map(({ id, nome, frase }) => {
          const tile = doJogo(id);
          const apagado = !tile || tile.apagado;
          return (
            <button
              key={id}
              type="button"
              className={`q-tile px-com-mini${apagado ? ' apagado' : ''}`}
              data-jogo={id}
              disabled={apagado}
              onClick={() => aoJogar(id)}
            >
              <MiniDoJogo jogo={id} />
              <span className="qj-jogo-topo">
                <i className="qj-ponto" aria-hidden />
                <span className={`q-tag${apagado ? ' off' : ''}`}>
                  {tile ? tile.tag : tiles ? t('Falta material') : t('Carregando…')}
                </span>
              </span>
              <b>{nome()}</b>
              <span className="q-d">{tile?.nota ?? frase()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
