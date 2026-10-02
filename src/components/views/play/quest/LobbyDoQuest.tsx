import '../../../../styles/questJogar.css';

import { ArrowLeftRight, LayoutGrid } from 'lucide-react';
import React, { useMemo } from 'react';

import { perfilDoDispositivo } from '../../../../lib/dispositivo/perfil';
import { type RecursosDoAparelho, recursosDoAparelho } from '../../../../lib/dispositivo/recursos';
import { t, tp } from '../../../../lib/i18n';
import type { AgeProfileType } from '../../../../lib/profile';
import { descricaoDoJogo, type JogoUI, tituloDoJogo } from '../jogos';
import { type JogoParaOQuest, type TileDoQuest, tilesDoQuest } from './jogosNoQuest';

/** O jogo como `Play.tsx` já o tem: a apresentação (`JOGOS`) mais o estado real dele neste recorte. */
type JogoDoLobby = JogoUI & JogoParaOQuest;

interface LobbyDoQuestProps<J extends JogoDoLobby> {
  /** Na ordem do usuário: os prontos primeiro, depois os que esperam material (`listaDeJogos`). */
  jogos: readonly J[];
  ageProfile: AgeProfileType;
  /** A fonte é a trilha: três jogos mudam de natureza e de descrição (`descricaoNaTrilha`). */
  naTrilha: boolean;
  /** Quantas palavras a fonte escolhida tem prontas. */
  palavras: number;
  /** A fonte em uso, numa linha ("Inglês · Minhas palavras"). */
  fonte: string;
  /** O que falta a um jogo sem material: a mesma frase do pé da carta na tela de sempre. */
  notaDoBloqueio: (jogo: J) => string;
  /** O mesmo clique da carta de sempre: monta a rodada e abre a antessala. */
  aoJogar: (jogo: J) => void;
  /** Abre a escolha da fonte que o app já tem. Ausente quando só há uma fonte. */
  aoTrocarFonte?: () => void;
  /** Mostra a tela de sempre nesta visita: busca, filtros, recordes, mapa e as saídas de cada bloqueio. */
  aoVerTelaCompleta: () => void;
  /** Um aviso curto com, no máximo, uma ação (acervo pequeno demais, baralho que não carregou). */
  aviso?: { texto: string; acao?: string; aoAgir?: () => void };
  /** O que o aparelho tem. Só os testes passam: a tela lê do perfil. */
  recursos?: Pick<RecursosDoAparelho, 'vozDeLeitura' | 'reconhecimentoDoNavegador' | 'tecladoFisico'>;
}

/**
 * JOGAR NO META QUEST (maquete de 01/10/2026, tela 5): uma grade de cartões grandes, com a etiqueta
 * dizendo COMO se joga antes de entrar. Na frente, o que funciona apontando; depois o que usa o áudio
 * da sessão; por último o que pede digitação. O que o headset não consegue abrir aparece apagado, com
 * o motivo, em vez de falhar depois do clique.
 *
 * Só apresentação: quais jogos existem, o nome, a descrição, a ordem do usuário, o que falta a cada
 * um e o clique que abre a rodada vêm todos de `Play.tsx`.
 */
export default function LobbyDoQuest<J extends JogoDoLobby>({
  jogos,
  ageProfile,
  naTrilha,
  palavras,
  fonte,
  notaDoBloqueio,
  aoJogar,
  aoTrocarFonte,
  aoVerTelaCompleta,
  aviso,
  recursos,
}: LobbyDoQuestProps<J>) {
  const doAparelho = useMemo(() => recursos ?? recursosDoAparelho(perfilDoDispositivo()), [recursos]);
  const tiles = tilesDoQuest(jogos, doAparelho, notaDoBloqueio);
  const semMaterial = tiles.filter((tile) => tile.grupo === 'material');
  /* O nome do idioma vem em minúscula (`langLabelNaUI`); abrindo a linha, ganha a maiúscula. */
  const rotuloDaFonte = fonte.charAt(0).toLocaleUpperCase() + fonte.slice(1);

  const cartao = ({ jogo, grupo, tag, apagado, nota }: TileDoQuest<J>) => (
    <button
      key={jogo.chave}
      type="button"
      className={`q-tile${apagado ? ' apagado' : ''}`}
      data-jogo={jogo.id}
      data-grupo={grupo}
      disabled={apagado}
      onClick={() => aoJogar(jogo)}
    >
      <span className={`q-tag${apagado || grupo === 'teclado' ? ' off' : ''}`}>{tag}</span>
      <b>{tituloDoJogo(jogo, ageProfile)}</b>
      <span className="q-d">{nota ?? descricaoDoJogo(jogo, ageProfile, naTrilha)}</span>
    </button>
  );

  return (
    <div className="q-palco quest-jogar" data-testid="lobby-do-quest">
      <div className="q-cab">
        <div>
          <p className="q-sobre">
            {palavras > 0 ? tp(palavras, '{n} palavra pronta', '{n} palavras prontas') : t('Nenhuma palavra pronta')}
          </p>
          <h1>{t('Jogar')}</h1>
        </div>
        {aoTrocarFonte ? (
          <button
            type="button"
            className="q-chip"
            onClick={aoTrocarFonte}
            aria-label={`${t('Trocar')}: ${rotuloDaFonte}`}
          >
            <ArrowLeftRight aria-hidden />
            {rotuloDaFonte}
          </button>
        ) : (
          fonte && <span className="q-chip">{rotuloDaFonte}</span>
        )}
        <button type="button" className="q-ctl" onClick={aoVerTelaCompleta}>
          <LayoutGrid aria-hidden />
          {t('Tela completa')}
        </button>
      </div>

      {aviso && (
        <div className="q-aviso" role="status">
          <span>{aviso.texto}</span>
          {aviso.acao && aviso.aoAgir && (
            <button type="button" className="q-ctl" onClick={aviso.aoAgir}>
              {aviso.acao}
            </button>
          )}
        </div>
      )}

      <div className="q-grade g4">{tiles.filter((tile) => tile.grupo !== 'material').map(cartao)}</div>

      {semMaterial.length > 0 && (
        <>
          <p className="q-rotulo">{t('Precisam de outro material')}</p>
          <div className="q-grade g4">{semMaterial.map(cartao)}</div>
        </>
      )}
    </div>
  );
}
