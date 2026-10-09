import type { ItemOutcome, MinigameId } from '@core';
import { pontuarRodada } from '@core';
import { Flame, type LucideIcon } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { multiplicador } from '../../../core/minigames/grade';
import { pontosComBonus } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
/* Direto do arquivo, e não do índice: a constante não tem DOM nem áudio. */
import { EVENTO_DA_JOGADA } from '../../../lib/comemoracao/intensidade';
import { eventosCondicionais } from '../../../lib/eventosDeJogo';
import { executarEfeito } from '../../../lib/juice';
import { contar, MOLA, polido } from '../../../lib/polimento/base';
import {
  chamarAjuda,
  ERROS_ATE_O_PULSO,
  flutuar,
  retornoDeCombo,
  retornoDeErro,
  textoDoGanho,
  vinheta,
} from '../../../lib/polimento/jogos';
import { useRodada } from './CascaDaRodada';

/**
 * O PLACAR DA RODADA — `hud()` do protótipo aprovado, a primeira linha do palco em todos os jogos:
 * pontos (o número sobe com `contarAte`), o rótulo e a barra de progresso (ou de tempo, nos jogos
 * com relógio), as ajudas do jogo e o multiplicador da sequência, que esquenta a partir de ×2.
 *
 * Os números são do JOGO: a casca não inventa placar. Quem chama passa os pontos que a própria
 * tela já somava, a sequência que ela já contava e o quanto da rodada já andou.
 */

/** Quanto o aviso do acerto e os pontos novos esperam um pelo outro, em ms. */
const ESPERA_DO_GANHO = 400;
/** O elemento que o motor do app pôs para tremer agora (`tremor`, em `lib/juice`). */
const TREMENDO = '.palco-jogo [data-tremendo="1"], .palco-jogo[data-tremendo="1"]';

interface HudDaRodadaProps {
  pontos: number;
  /** Acertos seguidos agora — é o que decide o multiplicador. */
  sequencia: number;
  /** Acertos na rodada até aqui (vai para a pausa: "120 pontos · 4 acertos"). */
  acertos: number;
  /** "Palavra 2 de 8", "3 de 6 pares"… */
  rotulo: ReactNode;
  /** 0 a 1. Com `tempo`, é o tempo que resta; sem, o quanto da rodada já foi. */
  progresso: number;
  /** Segundos que restam, nos jogos com relógio. */
  tempo?: number;
  /**
   * Quanto da rodada já foi (0 a 1), nos jogos com relógio. No desenho novo o placar tem as DUAS barras
   * do protótipo (`jogos.js:132-136`): a da rodada em cima e a do tempo embaixo.
   */
  feito?: number;
  /** O tempo está acabando (barra vermelha). */
  pouco?: boolean;
  /** Os botões de ajuda do jogo (`BotaoDeAjuda`). */
  ajudas?: ReactNode;
  /** Multiplicador mostrado, quando o jogo tem um próprio (o FEVER do Duelo dobra). */
  mult?: number;
  /** `data-tour` do tempo, quando o tour do jogo aponta para o relógio. */
  tourDoTempo?: string;
  /** `data-tour` do placar inteiro, quando o tour do jogo aponta para ele. */
  tour?: string;
}

export default function HudDaRodada({
  pontos,
  sequencia,
  acertos,
  rotulo,
  progresso,
  tempo,
  feito,
  pouco,
  ajudas,
  mult: multDoJogo,
  tourDoTempo,
  tour,
}: HudDaRodadaProps) {
  const { placar, jogo, nivel } = useRodada();
  /* O placar mostra o bônus do Difícil: 5 pontos a mais por acerto (`jogos4.js:117-122`).
     O jogo continua mandando os pontos de base; quem soma é a casca (`core/minigames/regras.ts`). */
  const mostrados = jogo && nivel ? pontosComBonus(jogo, nivel, pontos, acertos) : pontos;
  placar.current = { pontos: mostrados, acertos };
  const ptsRef = useRef<HTMLElement | null>(null);
  const anterior = useRef(mostrados);
  const comboRef = useRef<HTMLSpanElement | null>(null);
  const ajudasRef = useRef<HTMLDivElement | null>(null);
  const mult = multDoJogo ?? multiplicador(sequencia);
  /* OS EVENTOS DA SEQUÊNCIA (5, 10 e 15 acertos seguidos): antes cada tabuleiro os soltava; com os
     tabuleiros do protótipo quem sabe da sequência é o placar. Sem isto a conquista "Colecionador"
     (ver todos os eventos) deixava de ser alcançável jogando. */
  const sequenciaDeAntes = useRef(sequencia);
  useEffect(() => {
    const subiu = sequencia > sequenciaDeAntes.current;
    sequenciaDeAntes.current = sequencia;
    if (subiu) for (const ev of eventosCondicionais({ combo: sequencia, fever: false })) executarEfeito(ev);
  }, [sequencia]);
  const multAnterior = useRef(mult);
  const multAgora = useRef(mult);
  multAgora.current = mult;

  /* O "+N ×M" QUE SOBE NO ACERTO (`pjAcerto`, `jogos.js:236`). O aviso do acerto e os pontos novos chegam
     por caminhos diferentes (o jogo avisa na hora; os pontos vêm no desenho seguinte), em qualquer ordem:
     quem chegar primeiro espera o outro por um instante. */
  const acertoAEspera = useRef<{ el: Element | null; ate: number } | null>(null);
  const ganhoAEspera = useRef<{ valor: number; ate: number } | null>(null);

  // O número sobe do valor anterior até o novo, em vez de saltar.
  useEffect(() => {
    const de = anterior.current;
    anterior.current = mostrados;
    if (de === mostrados) return;
    /* `pjHud`, `jogos.js:176`: 420 ms na curva cúbica de `contar`. */
    const el = ptsRef.current;
    if (el) {
      if (polido()) contar((v) => (el.textContent = String(v)), de, mostrados, 420);
      else el.textContent = String(mostrados);
    }
    const ganho = mostrados - de;
    if (ganho <= 0) return;
    const agora = performance.now();
    const acerto = acertoAEspera.current;
    acertoAEspera.current = null;
    if (acerto && agora <= acerto.ate) flutuar(acerto.el, textoDoGanho(ganho, multAgora.current), 'good');
    else ganhoAEspera.current = { valor: ganho, ate: agora + ESPERA_DO_GANHO };
  }, [mostrados]);
  /* O multiplicador SUBIU de degrau: é o evento `combo` do motor de comemoração, disparado aqui —
     o único lugar que vê o multiplicador de todos os jogos — em vez de cada jogo repetir a conta.
     Caiu (errou, usou ajuda): só o tranco, sem festa. No desenho novo é o do protótipo
     (`pjHud`, `jogos.js:189-193`): o selo "Combo ×N", a vinheta e o salto do combo; a queda não treme. */
  useEffect(() => {
    const antes = multAnterior.current;
    multAnterior.current = mult;
    if (mult > antes && mult > 1) {
      celebrar({ tipo: 'combo', multiplicador: mult, el: comboRef.current });
      retornoDeCombo(mult, comboRef.current, MOLA);
    }
  }, [mult]);

  /* ERROS SEGUIDOS: quem conta é o motor de comemoração, que todo jogo já chama a cada acerto e a cada
     erro. O acerto zera a conta. */
  const errosSeguidos = useRef(0);
  useEffect(() => {
    const aoJogar = (e: Event) => {
      /* O aviso diz só "acerto" ou "erro"; quando trouxer também o elemento da jogada, ele é usado. */
      const detalhe = (e as CustomEvent<string | { tipo: string; el?: Element | null }>).detail;
      const tipo = typeof detalhe === 'string' ? detalhe : detalhe?.tipo;
      const el = typeof detalhe === 'string' ? null : (detalhe?.el ?? null);
      errosSeguidos.current = tipo === 'erro' ? errosSeguidos.current + 1 : 0;
      /* O RETORNO DO PROTÓTIPO (`pjAcerto` e `pjErro`, `jogos.js:224-250`; `jogos4.js:117-137`). */
      if (tipo === 'acerto') {
        vinheta('acerto');
        const agora = performance.now();
        const ganho = ganhoAEspera.current;
        ganhoAEspera.current = null;
        if (ganho && agora <= ganho.ate) flutuar(el, textoDoGanho(ganho.valor, multAgora.current), 'good');
        else acertoAEspera.current = { el, ate: agora + ESPERA_DO_GANHO };
        return;
      }
      if (tipo !== 'erro') return;
      const seguidos = errosSeguidos.current;
      /* Um instante depois: enquanto o aviso não traz o elemento, quem treme é o que o motor do app acabou
         de marcar como "tremendo" (`lib/juice`), que é o elemento que o jogo apontou. */
      queueMicrotask(() => {
        retornoDeErro(el ?? document.querySelector(TREMENDO));
        /* No segundo erro seguido, e só nele, o jogo aponta uma ajuda (`jogos4.js:127-136`). */
        if (seguidos === ERROS_ATE_O_PULSO) chamarAjuda(ajudasRef.current);
      });
    };
    window.addEventListener(EVENTO_DA_JOGADA, aoJogar);
    return () => window.removeEventListener(EVENTO_DA_JOGADA, aoJogar);
  }, []);
  /* No protótipo só o "+10 s" e o "Ver resposta" zeram a conta dos erros seguidos (`jogos4.js:178`). */
  const ajudaGeralUsada = (e: React.MouseEvent) => {
    if ((e.target as Element).closest?.('[data-ajuda="tempo"], [data-ajuda="resposta"]')) errosSeguidos.current = 0;
  };

  const pct = Math.round(Math.max(0, Math.min(1, progresso)) * 100);
  const comTempo = tempo !== undefined;
  /* O PLACAR DO PROTÓTIPO, `cascaDaPartida` em `jogos.js:131-138`: rótulo e relógio numa linha, a barra
     da rodada e, nos jogos com relógio, a barra do tempo logo abaixo. */
  const daRodada = Math.round(Math.max(0, Math.min(1, comTempo ? (feito ?? 0) : progresso)) * 100);
  return (
    <div className="hud" role="group" aria-label="Placar da rodada" data-tour={tour}>
      <div className="hud-bloco">
        <small>Pontos</small>
        <b ref={ptsRef} className="tn" data-pj="pontos">
          {mostrados}
        </b>
      </div>
      <div>
        <div className="entre" style={{ fontSize: 12, marginBottom: 5 }}>
          <span className="mut" data-pj="rotulo">
            {rotulo}
          </span>
          {comTempo && (
            <span data-pj="relogio" data-tour={tourDoTempo}>
              {Math.ceil(tempo)}s
            </span>
          )}
        </div>
        <div
          className="hud-progresso pj-progresso"
          role="progressbar"
          aria-label="Progresso da rodada"
          aria-valuenow={daRodada}
          aria-valuemax={100}
        >
          <span style={{ width: `${daRodada}%` }} />
        </div>
        {comTempo && (
          <div className={`hud-progresso hud-tempo${pouco ? ' pouco' : ''}`}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div ref={ajudasRef} className="hud-ajudas" onClickCapture={ajudaGeralUsada}>
        {ajudas}
      </div>
      <span
        ref={comboRef}
        className={`combo ${mult > 1 ? 'quente' : ''}`}
        aria-label={`Multiplicador ${mult}, ${sequencia} seguidas`}
      >
        {/* A ordem e o `em` sempre presente são os de `pjHud` (`jogos.js:188`). */}
        <small>×</small>
        {mult}
        <em>{sequencia > 1 ? `${sequencia} seguidas` : ''}</em>
        {mult > 1 && <Flame className="combo-chama" aria-hidden />}
      </span>
    </div>
  );
}

/**
 * O PLACAR A PARTIR DOS RESULTADOS — para os jogos que só guardam a lista de `ItemOutcome`.
 * Recontar usa a MESMA conta do fim da rodada (`pontuarRodada`), então o número do HUD é o que a
 * rodada vai valer, e não um placar paralelo.
 */
export function usePlacarDaRodada(jogo: MinigameId) {
  const [placar, setPlacar] = useState({ pontos: 0, sequencia: 0, acertos: 0 });
  const recontar = useCallback(
    (resultados: readonly ItemOutcome[]) => {
      const p = pontuarRodada(jogo, [...resultados]);
      const novo = {
        pontos: p.total,
        sequencia: p.sequenciaFinal,
        acertos: resultados.filter((o) => o.correct && !o.revealed).length,
      };
      setPlacar(novo);
      /* O que o ÚLTIMO item valeu (o "+N" que sobe no acerto): a mesma conta, sem ele. */
      const ganho = p.total - pontuarRodada(jogo, resultados.slice(0, -1)).total;
      return { ...novo, ganho };
    },
    [jogo],
  );
  return [placar, recontar] as const;
}

/** `botaoAjuda()` do protótipo: um botão pequeno com ícone, rótulo e o que ainda resta. */
export function BotaoDeAjuda({
  icone: Icone,
  rotulo,
  resta,
  disabled,
  onClick,
  title,
  ...resto
}: {
  icone: LucideIcon;
  rotulo: string;
  resta?: number;
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  'data-tour'?: string;
  'data-ajuda'?: string;
}) {
  return (
    <button
      type="button"
      className="btn btn-outline peq ajuda-jogo"
      disabled={disabled || resta === 0}
      title={title ?? rotulo}
      onClick={onClick}
      {...resto}
    >
      <Icone aria-hidden /> {rotulo}
      {resta !== undefined && <span className="n">{resta}</span>}
    </button>
  );
}
