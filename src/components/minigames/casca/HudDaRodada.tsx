import type { ItemOutcome, MinigameId } from '@core';
import { pontuarRodada } from '@core';
import { CircleHelp, Flame, type LucideIcon } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';

import { SEQUENCIA_FEVER } from '../../../core/minigames/blitzRegras';
import { multiplicador } from '../../../core/minigames/grade';
import { celebrar } from '../../../lib/comemoracao';
/* Direto do arquivo, e não do índice: a constante não tem DOM nem áudio. */
import { EVENTO_DA_JOGADA } from '../../../lib/comemoracao/intensidade';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
import { contarAte, tremor } from '../../../lib/juice';
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
  pouco,
  ajudas,
  mult: multDoJogo,
  comFever = false,
  tourDoTempo,
  tour,
}: HudDaRodadaProps) {
  const { placar } = useRodada();
  placar.current = { pontos, acertos };
  const ptsRef = useRef<HTMLElement | null>(null);
  const anterior = useRef(pontos);
  const comboRef = useRef<HTMLSpanElement | null>(null);
  const mult = multDoJogo ?? multiplicador(sequencia);
  const multAnterior = useRef(mult);

  // O número sobe do valor anterior até o novo, em vez de saltar.
  useEffect(() => {
    const de = anterior.current;
    anterior.current = pontos;
    if (de !== pontos) void contarAte(ptsRef.current, pontos, { de, dur: 350 });
  }, [pontos]);
  /* O multiplicador SUBIU de degrau: é o evento `combo` do motor de comemoração, disparado aqui —
     o único lugar que vê o multiplicador de todos os jogos — em vez de cada jogo repetir a conta.
     Caiu (errou, usou ajuda): só o tranco, sem festa. */
  useEffect(() => {
    const antes = multAnterior.current;
    multAnterior.current = mult;
    if (mult > antes && mult > 1) celebrar({ tipo: 'combo', multiplicador: mult, el: comboRef.current });
    else if (mult !== antes) tremor(comboRef.current, 3);
  }, [mult]);

  /* META QUEST: as ajudas se apresentam aqui, e o "?" abre o que cada uma faz e o que custa. */
  const questNovo = useQuestNovo();
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
      errosSeguidos.current = (e as CustomEvent<string>).detail === 'erro' ? errosSeguidos.current + 1 : 0;
      setSocorro(errosSeguidos.current >= ERROS_ATE_O_SOCORRO);
    };
    window.addEventListener(EVENTO_DA_JOGADA, aoJogar);
    return () => window.removeEventListener(EVENTO_DA_JOGADA, aoJogar);
  }, []);
  const socorroAtendido = () => {
    errosSeguidos.current = 0;
    setSocorro(false);
  };

  const pct = Math.round(Math.max(0, Math.min(1, progresso)) * 100);
  const comTempo = tempo !== undefined;
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
