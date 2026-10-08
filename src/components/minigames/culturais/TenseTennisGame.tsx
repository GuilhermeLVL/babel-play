import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { MINIGAMES, scoreRound } from '@core';
import { Lightbulb } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ajudasDoJogo, segundosDoJogo } from '../../../core/minigames/regras';
import { conferirResposta } from '../../../core/minigames/resposta';
import { celebrar } from '../../../lib/comemoracao';
import { t } from '../../../lib/i18n';
import { useNivelDoJogo } from '../../../lib/jogos/nivelDoJogo';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import AvisoDaJogada from '../casca/AvisoDaJogada';
import { useRodada } from '../casca/CascaDaRodada';
import HudDaRodada, { BotaoDeAjuda, usePlacarDaRodada } from '../casca/HudDaRodada';
import { falarNoJogo as falar, useQuestNovo, useSemTecladoFisico } from '../noQuest';

/**
 * TÊNIS — o rali cronometrado. A bola traz a PISTA, você devolve escrevendo a palavra, e cada
 * devolução certa encurta o tempo da próxima.
 *
 * Não é mais um jogo de conjugação: os seis desafios de espanhol escritos à mão não vinham do
 * baralho de ninguém e não davam nota a cartão nenhum. O que sobrou é a única coisa que o `gradeFor`
 * enxerga aqui — velocidade de recuperação, o mesmo sinal do Duelo.
 */

interface TenseTennisGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** No Meta Quest o saque vale três vezes mais: lá se digita apontando no teclado do sistema. */
const SAQUE_NO_QUEST = 3;
/** O rali encurta um segundo por devolução certa, mas nunca abaixo da metade do saque. */
function segundosDaJogada(base: number, rali: number): number {
  return Math.max(Math.ceil(base / 2), base - rali);
}

export default function TenseTennisGame({ items, ageProfile, onFinish, onExit }: TenseTennisGameProps) {
  /** A casca diz quando a rodada anda (fora da contagem 3-2-1 e da pausa); o placar do HUD sai dos resultados. */
  const { ativo } = useRodada();
  const [placar, recontar] = usePlacarDaRodada('tenis');
  const suficiente = items.length >= MINIGAMES.tenis.minItems;
  /* NO QUEST quem escreve é o teclado do sistema, que sobe quando a pessoa toca no campo. O campo não
     é desligado entre uma bola e outra: desligá-lo tiraria o foco e fecharia o teclado a cada jogada. */
  const questNovo = useQuestNovo();
  /* O RELÓGIO NO HEADSET: apontar letra por letra com o controle leva várias vezes o tempo de um teclado
     físico, e os 6 s do saque não dariam nem para a primeira palavra. O saque triplica ali (18 s no
     perfil padrão, com piso de 9 s no rali); a regra do rali, que encurta a cada devolução, é a mesma.
     É do APARELHO, não do desenho: no computador com o desenho novo há teclado físico e o saque é o de
     sempre. */
  const semTeclado = useSemTecladoFisico();
  const nivel = useNivelDoJogo('tenis');
  const base = (segundosDoJogo('tenis', ageProfile, nivel) ?? 6) * (semTeclado ? SAQUE_NO_QUEST : 1);

  const [indice, setIndice] = useState(0);
  const [rali, setRali] = useState(0);
  /* O relógio declara de que bola ele é: sem isso o zero da jogada anterior sobrevive um render à
     troca e dá a bola seguinte por caída na hora, com um outcome de ms zero. */
  const [relogio, setRelogio] = useState({ bola: 0, segundos: base });
  const tempo = relogio.bola === indice ? relogio.segundos : segundosDaJogada(base, rali);
  const [escrito, setEscrito] = useState('');
  const [dicasRestantes, setDicasRestantes] = useState(() => ajudasDoJogo('tenis', 'letra', nivel));
  /** O que a tela diz da devolução: "Fora! Era…", "Certo! Com acento…", "Também vale…". */
  const [aviso, setAviso] = useState<{ tom: 'erro' | 'certo'; rotulo: string; resposta: string } | null>(null);
  const [acabou, setAcabou] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioJogadaRef = useRef(Date.now());
  const comDicaRef = useRef(false);
  const respondidoRef = useRef(false);
  const jaFinalizouRef = useRef(false);
  const quadraRef = useRef<HTMLDivElement | null>(null);
  const entradaRef = useRef<HTMLInputElement | null>(null);

  const item: MinigameItem | undefined = items[indice];

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  const finalizar = useCallback(() => {
    if (jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    setAcabou(true);
    const outcomes = outcomesRef.current;
    const report: RoundReport = {
      gameId: 'tenis',
      items: outcomes,
      score: scoreRound('tenis', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    };
    setTimeout(() => onFinish(report), 1100);
  }, [onFinish]);

  const registrar = useCallback(
    (correct: boolean, revealed?: boolean) => {
      if (!item) return null;
      outcomesRef.current.push({
        cardId: item.cardId,
        itemRef: item.answer,
        correct,
        attempts: 1,
        ms: Date.now() - inicioJogadaRef.current,
        hinted: comDicaRef.current,
        ...(revealed ? { revealed: true } : {}),
      });
      return recontar(outcomesRef.current);
    },
    [recontar, item],
  );

  const avancar = useCallback(() => {
    if (indice + 1 >= items.length) finalizar();
    else setIndice((i) => i + 1);
  }, [indice, items.length, finalizar]);

  // Nova bola: o relógio já entra encurtado pelo rali em curso.
  useEffect(() => {
    if (!item || jaFinalizouRef.current) return;
    inicioJogadaRef.current = Date.now();
    comDicaRef.current = false;
    respondidoRef.current = false;
    setEscrito('');
    setAviso(null);
    setRelogio({ bola: indice, segundos: segundosDaJogada(base, rali) });
    entradaRef.current?.focus();
    // `rali` fora das dependências de propósito: quem abre a jogada é a TROCA de bola, e relê o
    // rali no valor em que ele estava. Incluí-lo reiniciaria o relógio no meio da jogada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice, item, base]);

  useEffect(() => {
    if (acabou || !item || respondidoRef.current) return;
    if (relogio.bola !== indice) return;
    if (tempo <= 0) {
      respondidoRef.current = true;
      registrar(false, true);
      setRali(0);
      setAviso({ tom: 'erro', rotulo: t('A bola caiu na quadra. Era:'), resposta: item.answer });
      falar(item.answer, item.lang);
      celebrar({ tipo: 'erro', el: quadraRef.current });
      setTimeout(avancar, 1200);
      return;
    }
    if (tempo <= 2) play('tick');
    if (!ativo) return; // o relógio para na contagem e na pausa
    const tique = setTimeout(
      () => setRelogio((r) => (r.bola === indice ? { ...r, segundos: r.segundos - 1 } : r)),
      1000,
    );
    return () => clearTimeout(tique);
  }, [relogio, ativo, tempo, indice, acabou, item, registrar, avancar]);

  const devolver = () => {
    if (acabou || !item || respondidoRef.current || !escrito.trim()) return;
    respondidoRef.current = true;
    /* A régua única de resposta escrita (`core/minigames/resposta`). Antes era `chaveDoTermo` dos
       dois lados, que apaga o acento: "avó" passava por "avô" — e "bedroom" era recusado para
       "quarto" mesmo sendo, no acervo, outra palavra com essa pista. */
    const conferencia = conferirResposta(escrito, item.answer, item.alternativas ?? []);
    const certo = conferencia.aceita;
    const p = registrar(certo);

    if (certo) {
      setRali((r) => r + 1);
      celebrar({ tipo: 'acerto', combo: p?.sequencia ?? 0, el: quadraRef.current, pontos: p?.ganho });
      falar(item.answer, item.lang);
      if (conferencia.veredito === 'sem-acento') {
        setAviso({ tom: 'certo', rotulo: t('Certo! Com acento:'), resposta: conferencia.forma });
      } else if (conferencia.veredito === 'alternativa') {
        setAviso({ tom: 'certo', rotulo: t('Também vale! A palavra desta pista era:'), resposta: item.answer });
      }
      setTimeout(avancar, conferencia.veredito === 'exata' ? 600 : 1300);
      return;
    }
    setRali(0);
    setAviso({ tom: 'erro', rotulo: t('Fora! Era:'), resposta: item.answer });
    falar(item.answer, item.lang);
    celebrar({ tipo: 'erro', el: quadraRef.current });
    setTimeout(avancar, 1200);
  };

  const usarDica = () => {
    if (acabou || !item || respondidoRef.current || dicasRestantes <= 0) return;
    setDicasRestantes((d) => d - 1);
    comDicaRef.current = true;
    play('timeBonus');
    setEscrito(item.answer.slice(0, 1));
    entradaRef.current?.focus();
  };

  if (!suficiente) return null;

  /* A CASCA COMUM desenha o cabeçalho, a pausa e a contagem; aqui ficam o placar comum e o tabuleiro,
     que é deste jogo. */
  return (
    <>
      <HudDaRodada
        pontos={placar.pontos}
        sequencia={rali}
        acertos={placar.acertos}
        rotulo={`Bola ${indice + 1} de ${items.length}${rali > 1 ? ` · ${rali} no rali` : ''}`}
        tempo={tempo}
        progresso={tempo / Math.max(1, segundosDaJogada(base, rali))}
        pouco={tempo <= 2}
        tourDoTempo="relogio"
        ajudas={<BotaoDeAjuda icone={Lightbulb} rotulo="Primeira letra" resta={dicasRestantes} onClick={usarDica} />}
      />

      <div
        ref={quadraRef}
        data-qj="tenis"
        className="flex flex-col items-center justify-center gap-6 w-full max-w-2xl mx-auto"
      >
        <div
          data-tour="bola"
          className="w-full rounded-3xl border-2 border-border-subtle bg-surface shadow-card px-6 py-8 text-center"
        >
          <span className="text-xs font-mono uppercase tracking-widest text-ink-muted">Bola em jogo</span>
          <p data-qp="enunciado" className="mt-3 font-display font-black text-2xl sm:text-3xl text-ink">
            {item?.prompt}
          </p>
        </div>

        <div className="w-full flex flex-col sm:flex-row gap-3" data-qp="linha-de-campo">
          <input
            ref={entradaRef}
            data-qp="campo"
            {...(questNovo ? { enterKeyHint: 'send' as const, autoCapitalize: 'none', autoCorrect: 'off' } : null)}
            value={escrito}
            onChange={(e) => setEscrito(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                devolver();
              }
            }}
            disabled={questNovo ? acabou : acabou || respondidoRef.current}
            dir={direcaoDoTexto(item?.lang)}
            lang={item?.lang}
            autoComplete="off"
            spellCheck={false}
            aria-label="Sua devolução"
            placeholder="escreva a palavra"
            className="flex-1 px-4 py-3 rounded-2xl border-2 border-border-subtle bg-surface text-ink text-lg font-display font-bold placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <button
            data-qp="acao-pri"
            onClick={devolver}
            disabled={acabou || !escrito.trim()}
            className="px-6 py-3 rounded-2xl bg-accent text-accent-contrast font-black shadow-card hover:opacity-95 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Devolver
          </button>
        </div>

        {semTeclado && !aviso && <p data-qp="apoio">{t('Toque no campo para abrir o teclado do headset.')}</p>}

        {aviso && <AvisoDaJogada tom={aviso.tom} rotulo={aviso.rotulo} resposta={aviso.resposta} lang={item?.lang} />}
      </div>
    </>
  );
}
