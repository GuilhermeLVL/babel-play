import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { chaveDoTermo, MINIGAMES, scoreRound } from '@core';
import { Award, Flame, Lightbulb, Timer as TimerIcon,X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { comemorar, tremor } from '../../../lib/juice';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';

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

/** Segundos da PRIMEIRA devolução, por perfil. */
const SAQUE: Record<AgeProfileType, number> = { kids: 8, pro: 6, senior: 9 };
/** O rali encurta um segundo por devolução certa, mas nunca abaixo da metade do saque. */
function segundosDaJogada(base: number, rali: number): number {
  return Math.max(Math.ceil(base / 2), base - rali);
}

export default function TenseTennisGame({ items, ageProfile, onFinish, onExit }: TenseTennisGameProps) {
  const suficiente = items.length >= MINIGAMES.tenis.minItems;
  const base = SAQUE[ageProfile];

  const [indice, setIndice] = useState(0);
  const [rali, setRali] = useState(0);
  /* O relógio declara de que bola ele é: sem isso o zero da jogada anterior sobrevive um render à
     troca e dá a bola seguinte por caída na hora, com um outcome de ms zero. */
  const [relogio, setRelogio] = useState({ bola: 0, segundos: base });
  const tempo = relogio.bola === indice ? relogio.segundos : segundosDaJogada(base, rali);
  const [escrito, setEscrito] = useState('');
  const [pontos, setPontos] = useState(0);
  const [dicasRestantes, setDicasRestantes] = useState(2);
  const [fora, setFora] = useState<string | null>(null);
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
    const perfeita = outcomes.length > 0 && outcomes.every(o => o.correct && !o.revealed);
    comemorar(perfeita ? 'rodadaPerfeita' : 'rodadaBoa', quadraRef.current);
    setTimeout(() => onFinish(report), 1100);
  }, [onFinish]);

  const registrar = useCallback((correct: boolean, revealed?: boolean) => {
    if (!item) return;
    outcomesRef.current.push({
      cardId: item.cardId,
      itemRef: item.answer,
      correct,
      attempts: 1,
      ms: Date.now() - inicioJogadaRef.current,
      hinted: comDicaRef.current,
      ...(revealed ? { revealed: true } : {}),
    });
    setPontos(scoreRound('tenis', outcomesRef.current));
  }, [item]);

  const avancar = useCallback(() => {
    if (indice + 1 >= items.length) finalizar();
    else setIndice(i => i + 1);
  }, [indice, items.length, finalizar]);

  // Nova bola: o relógio já entra encurtado pelo rali em curso.
  useEffect(() => {
    if (!item || jaFinalizouRef.current) return;
    inicioJogadaRef.current = Date.now();
    comDicaRef.current = false;
    respondidoRef.current = false;
    setEscrito('');
    setFora(null);
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
      setFora('A bola caiu na quadra. Era: ' + item.answer);
      comemorar('erro', quadraRef.current);
      tremor(quadraRef.current);
      setTimeout(avancar, 1200);
      return;
    }
    if (tempo <= 2) play('tick');
    const t = setTimeout(() => setRelogio(r => (r.bola === indice ? { ...r, segundos: r.segundos - 1 } : r)), 1000);
    return () => clearTimeout(t);
  }, [relogio, tempo, indice, acabou, item, registrar, avancar]);

  const devolver = () => {
    if (acabou || !item || respondidoRef.current || !escrito.trim()) return;
    respondidoRef.current = true;
    const certo = chaveDoTermo(escrito) === chaveDoTermo(item.answer);
    registrar(certo);

    if (certo) {
      setRali(r => r + 1);
      comemorar('acerto', quadraRef.current);
      setTimeout(avancar, 600);
      return;
    }
    setRali(0);
    setFora('Fora! Era: ' + item.answer);
    comemorar('erro', quadraRef.current);
    tremor(quadraRef.current);
    setTimeout(avancar, 1200);
  };

  const usarDica = () => {
    if (acabou || !item || respondidoRef.current || dicasRestantes <= 0) return;
    setDicasRestantes(d => d - 1);
    comDicaRef.current = true;
    play('timeBonus');
    setEscrito(item.answer.slice(0, 1));
    entradaRef.current?.focus();
  };

  if (!suficiente) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink overflow-y-auto">
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            aria-label="Sair do Tênis"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Tênis</span>
            <p className="text-xs text-ink-muted">Devolva escrevendo a palavra antes de a bola cair.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={usarDica}
            disabled={dicasRestantes <= 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Lightbulb className="w-3.5 h-3.5 text-accent" />
            <span>Primeira letra ({dicasRestantes})</span>
          </button>

          {rali > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent text-accent-contrast font-black text-xs">
              <Flame className="w-3.5 h-3.5 fill-current" />
              <span>{rali} no rali</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <Award className="w-4 h-4 text-accent" />
            <span className="font-mono font-bold tabular-nums">{pontos}</span>
          </div>

          <div
            data-tour="relogio"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface"
          >
            <TimerIcon className={`w-4 h-4 ${tempo <= 2 ? 'text-error' : 'text-ink-muted'}`} />
            <span className={`font-mono font-black tabular-nums ${tempo <= 2 ? 'text-error-ink' : 'text-ink'}`}>{tempo}s</span>
          </div>
        </div>
      </header>

      <main ref={quadraRef} className="flex-1 p-6 flex flex-col items-center justify-center gap-6 w-full max-w-2xl mx-auto">
        <div
          data-tour="bola"
          className="w-full rounded-3xl border-2 border-border-subtle bg-surface shadow-card px-6 py-8 text-center"
        >
          <span className="text-xs font-mono uppercase tracking-widest text-ink-muted">Bola em jogo</span>
          <p className="mt-3 font-display font-black text-2xl sm:text-3xl text-ink">{item?.prompt}</p>
        </div>

        <div className="w-full flex flex-col sm:flex-row gap-3">
          <input
            ref={entradaRef}
            value={escrito}
            onChange={e => setEscrito(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); devolver(); } }}
            disabled={acabou || respondidoRef.current}
            dir={direcaoDoTexto(item?.lang)}
            lang={item?.lang}
            autoComplete="off"
            spellCheck={false}
            aria-label="Sua devolução"
            placeholder="escreva a palavra"
            className="flex-1 px-4 py-3 rounded-2xl border-2 border-border-subtle bg-surface text-ink text-lg font-display font-bold placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <button
            onClick={devolver}
            disabled={acabou || !escrito.trim()}
            className="px-6 py-3 rounded-2xl bg-accent text-accent-contrast font-black shadow-card hover:opacity-95 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Devolver
          </button>
        </div>

        {fora && (
          <p
            dir={direcaoDoTexto(item?.lang)}
            className="w-full text-center px-4 py-3 rounded-2xl border border-error bg-error-soft text-error-ink font-bold text-sm"
          >
            {fora}
          </p>
        )}

        <span className="text-xs font-mono text-ink-muted">Bola {indice + 1} de {items.length}</span>
      </main>
    </div>
  );
}
