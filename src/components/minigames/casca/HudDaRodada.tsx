import type { ItemOutcome, MinigameId } from '@core';
import { pontuarRodada } from '@core';
import { CircleHelp, Flame, type LucideIcon } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';

import { SEQUENCIA_FEVER } from '../../../core/minigames/blitzRegras';
import { multiplicador } from '../../../core/minigames/grade';
import { pontosComBonus } from '../../../core/minigames/regras';
import { celebrar } from '../../../lib/comemoracao';
/* Direto do arquivo, e não do índice: a constante não tem DOM nem áudio. */
import { EVENTO_DA_JOGADA } from '../../../lib/comemoracao/intensidade';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
import { contarAte, tremor } from '../../../lib/juice';
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

/**
 * O nome da sequência, na régua do protótipo (`rotuloSeq`). "FEVER" só para o jogo que TEM a
 * mecânica (o Duelo, onde a partir da sequência 10 o multiplicador dobra): nos outros o nome dizia
 * um modo que não existe, e a sequência longa continua "em chamas".
 */
/** Depois de quantos erros seguidos as ajudas se anunciam. */
export const ERROS_ATE_O_SOCORRO = 2;
/** Quanto o aviso do acerto e os pontos novos esperam um pelo outro, em ms. */
const ESPERA_DO_GANHO = 400;
/** O elemento que o motor do app pôs para tremer agora (`tremor`, em `lib/juice`). */
const TREMENDO = '.palco-jogo [data-tremendo="1"], .palco-jogo[data-tremendo="1"]';

function rotuloDaSequencia(seq: number, comFever: boolean): string {
  return comFever && seq >= SEQUENCIA_FEVER
    ? 'FEVER'
    : seq >= 6
      ? 'em chamas'
      : seq >= 4
        ? 'embalou'
        : seq >= 3
          ? 'combo'
          : 'sequência';
}

/**
 * O QUE CADA AJUDA FAZ, POR ESCRITO (Meta Quest). No computador o efeito e o preço de uma ajuda moram
 * na dica que aparece ao parar o ponteiro (`title`); no headset não há hover. Cada `BotaoDeAjuda` conta
 * ao placar o que faz, e o placar ganha um "?" que abre a lista. Fora do headset o registro é `null` e
 * nada muda.
 */
type RegistroDeAjuda = (id: string, ajuda: { rotulo: string; nota: string } | null) => void;
const AjudasDoPlacar = createContext<RegistroDeAjuda | null>(null);

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
  /** O jogo tem a mecânica FEVER (só o Duelo). Sem isto o HUD não fala em FEVER. */
  comFever?: boolean;
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
  comFever = false,
  tourDoTempo,
  tour,
}: HudDaRodadaProps) {
  const { placar, jogo, nivel } = useRodada();
  const questNovo = useQuestNovo();
  /* No desenho novo o placar mostra o bônus do Difícil: 5 pontos a mais por acerto (`jogos4.js:117-122`).
     O jogo continua mandando os pontos de base; quem soma é a casca (`core/minigames/regras.ts`). */
  const mostrados = questNovo && jogo && nivel ? pontosComBonus(jogo, nivel, pontos, acertos) : pontos;
  placar.current = { pontos: mostrados, acertos };
  const ptsRef = useRef<HTMLElement | null>(null);
  const anterior = useRef(mostrados);
  const comboRef = useRef<HTMLSpanElement | null>(null);
  const ajudasRef = useRef<HTMLDivElement | null>(null);
  const mult = multDoJogo ?? multiplicador(sequencia);
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
    if (!questNovo) {
      void contarAte(ptsRef.current, mostrados, { de, dur: 350 });
      return;
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a mudança dos pontos interessa
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
      if (questNovo) retornoDeCombo(mult, comboRef.current, MOLA);
    } else if (mult !== antes && !questNovo) tremor(comboRef.current, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a mudança do multiplicador interessa
  }, [mult]);

  /* META QUEST: as ajudas se apresentam aqui, e o "?" abre o que cada uma faz e o que custa. */
  const [notasDasAjudas, setNotasDasAjudas] = useState<Record<string, { rotulo: string; nota: string }>>({});
  const [ajudasExplicadas, setAjudasExplicadas] = useState(false);
  const registrarAjuda = useCallback<RegistroDeAjuda>((id, ajuda) => {
    setNotasDasAjudas((antes) => {
      const atual = antes[id];
      if (!ajuda) {
        if (!atual) return antes;
        const semEla = { ...antes };
        delete semEla[id];
        return semEla;
      }
      if (atual && atual.rotulo === ajuda.rotulo && atual.nota === ajuda.nota) return antes;
      return { ...antes, [id]: ajuda };
    });
  }, []);
  const ajudasComNota = Object.entries(notasDasAjudas);

  /* DOIS ERROS SEGUIDOS: as ajudas que ainda dá para usar se anunciam (`data-socorro`, o pulso mora em
     `styles/questMovimento.css`). Elas ficam no canto e quem está errando é justamente quem não olhou
     para lá. O acerto ou o uso de uma ajuda apaga o aviso. Quem conta é o motor de comemoração, que
     todo jogo já chama a cada acerto e a cada erro. */
  const errosSeguidos = useRef(0);
  const [socorro, setSocorro] = useState(false);
  useEffect(() => {
    const aoJogar = (e: Event) => {
      /* O aviso diz só "acerto" ou "erro"; quando trouxer também o elemento da jogada, ele é usado. */
      const detalhe = (e as CustomEvent<string | { tipo: string; el?: Element | null }>).detail;
      const tipo = typeof detalhe === 'string' ? detalhe : detalhe?.tipo;
      const el = typeof detalhe === 'string' ? null : (detalhe?.el ?? null);
      errosSeguidos.current = tipo === 'erro' ? errosSeguidos.current + 1 : 0;
      if (!questNovo) {
        setSocorro(errosSeguidos.current >= ERROS_ATE_O_SOCORRO);
        return;
      }
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
  }, [questNovo]);
  const socorroAtendido = () => {
    errosSeguidos.current = 0;
    setSocorro(false);
  };
  /* No protótipo só o "+10 s" e o "Ver resposta" zeram a conta dos erros seguidos (`jogos4.js:178`). */
  const ajudaGeralUsada = (e: React.MouseEvent) => {
    if ((e.target as Element).closest?.('[data-ajuda="tempo"], [data-ajuda="resposta"]')) errosSeguidos.current = 0;
  };

  const pct = Math.round(Math.max(0, Math.min(1, progresso)) * 100);
  const comTempo = tempo !== undefined;
  /* O PLACAR DO PROTÓTIPO (desenho novo), `cascaDaPartida` em `jogos.js:131-138`: rótulo e relógio numa
     linha, a barra da rodada e, nos jogos com relógio, a barra do tempo logo abaixo. */
  if (questNovo) {
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

  const linhaDoPlacar = (
    <div className="hud" role="group" aria-label="Placar da rodada" data-tour={tour}>
      <div className="hud-bloco">
        <small>Pontos</small>
        <b ref={ptsRef} className="tn">
          {pontos}
        </b>
      </div>
      <div>
        <div className="entre" style={{ fontSize: 12, marginBottom: 5 }}>
          <span className="mut">{rotulo}</span>
          {comTempo && (
            <span className="tn mut" data-tour={tourDoTempo}>
              {Math.ceil(tempo)} s
            </span>
          )}
        </div>
        <div
          className={`hud-progresso ${comTempo ? 'hud-tempo' : ''} ${pouco ? 'pouco' : ''}`}
          role="progressbar"
          aria-label={comTempo ? 'Tempo restante' : 'Progresso da rodada'}
          aria-valuenow={pct}
          aria-valuemax={100}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="hud-ajudas" data-socorro={socorro || undefined} onClickCapture={socorroAtendido}>
        <AjudasDoPlacar.Provider value={questNovo ? registrarAjuda : null}>{ajudas}</AjudasDoPlacar.Provider>
        {questNovo && ajudasComNota.length > 0 && (
          <button
            type="button"
            className="btn btn-outline peq ajuda-jogo"
            aria-expanded={ajudasExplicadas}
            aria-label={t('O que cada ajuda faz')}
            data-ajudas="porque"
            onClick={() => setAjudasExplicadas((v) => !v)}
          >
            <CircleHelp aria-hidden />
          </button>
        )}
      </div>
      <span
        ref={comboRef}
        className={`combo ${mult > 1 ? 'quente' : ''}`}
        aria-label={`Multiplicador ${mult}, ${sequencia} seguidas`}
      >
        {/* A chama da sequência quente: ícone lucide, e não emoji (sem emoji na interface). */}
        {mult > 1 && <Flame className="combo-chama" aria-hidden />}
        <small>×</small>
        {mult}
        <em>{sequencia ? `${sequencia} ${rotuloDaSequencia(sequencia, comFever)}` : ''}</em>
      </span>
    </div>
  );
  if (!questNovo) return linhaDoPlacar;
  return (
    <>
      {linhaDoPlacar}
      {ajudasExplicadas && ajudasComNota.length > 0 && (
        <ul className="qj-ajudas-notas" aria-label={t('O que cada ajuda faz')}>
          {ajudasComNota.map(([id, ajuda]) => (
            <li key={id}>
              <b>{ajuda.rotulo}:</b> {ajuda.nota}
            </li>
          ))}
        </ul>
      )}
    </>
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
  custo,
  ...resto
}: {
  icone: LucideIcon;
  rotulo: string;
  resta?: number;
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  /** O preço da ajuda ("limita a nota"), quando o `title` não o diz. Só o headset o escreve. */
  custo?: string;
  'data-tour'?: string;
  'data-ajuda'?: string;
}) {
  /* No headset o efeito e o preço vão para a lista do "?" do placar (não há hover para o `title`). */
  const registrar = useContext(AjudasDoPlacar);
  const id = useId();
  const nota = [title && title !== rotulo ? title : null, custo].filter(Boolean).join(' · ');
  useEffect(() => {
    if (!registrar || !nota) return;
    registrar(id, { rotulo, nota });
    return () => registrar(id, null);
  }, [registrar, id, rotulo, nota]);
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
