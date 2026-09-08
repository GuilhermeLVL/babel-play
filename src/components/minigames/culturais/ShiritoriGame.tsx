import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowRight, Timer as TimerIcon, Volume2, Lightbulb, Link2 } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { scoreRound } from '@core';
import { montarCorrente } from '../../../core/minigames/shiritori';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { comemorar } from '../../../lib/juice';
import { play } from '../../../lib/soundFx';
import { speak } from '../../../lib/tts';

/**
 * SHIRITORI — a corrente encadeia pela última letra, e a corrente é O SEU BARALHO.
 *
 * A montagem da rodada (ordenar os itens numa corrente válida e escolher os distratores) mora em
 * `core/minigames/shiritori`, testada fora do React. Aqui só se joga o que ela devolveu; quando
 * ela devolve `null`, o material não fecha corrente e a rodada não nasce.
 */

interface ShiritoriGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Segundos por elo. O sênior tem mais tempo para ler a corrente inteira antes de escolher. */
const SEGUNDOS: Record<AgeProfileType, number> = { kids: 20, pro: 15, senior: 25 };

export default function ShiritoriGame({ items, ageProfile, onFinish, onExit }: ShiritoriGameProps) {
  const corrente = useMemo(() => montarCorrente(items), [items]);

  const [idx, setIdx] = useState(0);
  const [erradas, setErradas] = useState<string[]>([]);
  const [tentativas, setTentativas] = useState(1);
  const [letraVisivel, setLetraVisivel] = useState(false);
  const [restante, setRestante] = useState(SEGUNDOS[ageProfile]);
  const [resultado, setResultado] = useState<RoundReport | null>(null);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioRodadaRef = useRef(Date.now());
  const inicioPassoRef = useRef(Date.now());
  const acabouRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!corrente) onExit();
  }, [corrente, onExit]);

  const finalizar = (outcomes: ItemOutcome[]) => {
    if (acabouRef.current) return;
    acabouRef.current = true;
    const perfeita = outcomes.length > 0 && outcomes.every((o) => o.correct && o.attempts <= 1 && !o.revealed);
    if (perfeita) comemorar('rodadaPerfeita', palcoRef.current);
    setResultado({
      gameId: 'shiritori',
      items: outcomes,
      score: scoreRound('shiritori', outcomes),
      durationMs: Date.now() - inicioRodadaRef.current,
    });
  };

  const avancar = (outcome: ItemOutcome) => {
    const outcomes = outcomesRef.current;
    outcomes.push(outcome);
    if (!corrente || idx + 1 >= corrente.passos.length) {
      finalizar(outcomes);
      return;
    }
    setIdx(idx + 1);
    setErradas([]);
    setTentativas(1);
    setLetraVisivel(false);
    setRestante(SEGUNDOS[ageProfile]);
    inicioPassoRef.current = Date.now();
  };

  // O relógio do elo. Zerou: a corrente foi revelada, e revelação é nota 1.
  useEffect(() => {
    if (!corrente || acabouRef.current || resultado) return;
    if (restante <= 0) {
      const passo = corrente.passos[idx];
      play('error');
      avancar({
        cardId: passo.item.cardId,
        itemRef: passo.item.answer,
        correct: false,
        attempts: tentativas,
        ms: Date.now() - inicioPassoRef.current,
        revealed: true,
      });
      return;
    }
    const t = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restante, idx, resultado, corrente]);

  if (!corrente) return null;

  /* ── TELA DE RESULTADO: o relatório só sai no "Continuar". ─────────────────────────────── */
  if (resultado) {
    const acertos = resultado.items.filter((o) => o.correct).length;
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas text-ink p-6">
        <div className="card-panel bg-surface p-8 w-full max-w-md text-center">
          <p className="label-mono mb-3">Fim da corrente</p>
          <p className="font-display font-black text-5xl tabular-nums text-ink">{resultado.score}</p>
          <p className="text-[12px] text-ink-muted mt-1">pontos</p>
          <p className="text-[13px] text-ink-muted mt-4">
            elos encadeados: <b className="text-ink">{acertos}/{resultado.items.length}</b>
          </p>
          <button onClick={() => onFinish(resultado)} className="btn-ink w-full justify-center mt-6 cursor-pointer">
            Continuar
          </button>
        </div>
      </div>
    );
  }

  const passo = corrente.passos[idx];
  const anterior = idx === 0 ? corrente.inicio : corrente.passos[idx - 1].item;
  const jaNaCorrente = [corrente.inicio, ...corrente.passos.slice(0, idx).map((p) => p.item)];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            title="Sair do Shiritori"
            aria-label="Sair do jogo"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Corrente de palavras</span>
            <p className="text-xs text-ink-muted">Cada palavra começa com a última letra da anterior.</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setLetraVisivel(true)}
            disabled={letraVisivel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Ver a letra exigida (não custa nota)"
          >
            <Lightbulb className="w-3.5 h-3.5 text-warn" />
            <span>Ver a letra</span>
          </button>

          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border ${
            restante <= 5 ? 'border-error bg-error-soft text-error-ink' : 'border-border-subtle bg-surface'
          }`}>
            <TimerIcon className="w-4 h-4" aria-hidden />
            <span className="font-mono font-black text-base tabular-nums">{restante}s</span>
          </span>
        </div>
      </header>

      <main ref={palcoRef} className="flex-1 flex flex-col items-center justify-center gap-7 p-4 lg:p-8 max-w-2xl mx-auto w-full min-h-0 overflow-y-auto">
        <div data-tour="corrente" className="w-full rounded-2xl border border-border-subtle bg-surface p-4">
          <p className="label-mono mb-3">A corrente até aqui ({jaNaCorrente.length} de {corrente.passos.length + 1})</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {jaNaCorrente.map((elo, i) => (
              <React.Fragment key={elo.answer + i}>
                {i > 0 && <ArrowRight className="w-4 h-4 text-ink-faint shrink-0" aria-hidden />}
                <span
                  dir={direcaoDoTexto(elo.lang)}
                  className="shrink-0 px-3 py-1.5 rounded-xl border border-border-subtle bg-canvas font-mono font-bold text-[13px] text-ink"
                >
                  {elo.answer}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="text-center">
          <p className="label-mono mb-2">Palavra na ponta</p>
          <p dir={direcaoDoTexto(anterior.lang)} className="font-display font-black text-4xl sm:text-5xl text-ink tracking-wide">
            {anterior.answer.slice(0, -1)}
            <span className="text-accent underline decoration-4 underline-offset-4">{anterior.answer.slice(-1)}</span>
          </p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-[13px] text-ink-muted">{anterior.prompt}</span>
            <button
              onClick={() => speak(anterior.answer, { lang: anterior.lang })}
              className="p-1.5 rounded-full hover:bg-surface-hover text-accent cursor-pointer"
              title="Ouvir a palavra"
              aria-label="Ouvir a palavra"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          </div>
          {letraVisivel && (
            <p className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent-soft text-accent-ink text-[13px] font-bold">
              <Link2 className="w-4 h-4" aria-hidden />
              A próxima começa com <b className="font-mono text-base">{passo.letra}</b>
            </p>
          )}
        </div>

        <div data-tour="opcoes" className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
          {passo.opcoes.map((op) => {
            const riscada = erradas.includes(op);
            return (
              <button
                key={op}
                onClick={(e) => {
                  if (riscada || acabouRef.current) return;
                  if (op === passo.item.answer) {
                    comemorar('acerto', e.currentTarget);
                    speak(passo.item.answer, { lang: passo.item.lang });
                    avancar({
                      cardId: passo.item.cardId,
                      itemRef: passo.item.answer,
                      correct: true,
                      attempts: tentativas,
                      ms: Date.now() - inicioPassoRef.current,
                    });
                  } else {
                    comemorar('erro', e.currentTarget);
                    setErradas((xs) => [...xs, op]);
                    setTentativas((t) => t + 1);
                  }
                }}
                disabled={riscada}
                dir={direcaoDoTexto(passo.item.lang)}
                className={`py-4 px-4 rounded-2xl border-2 font-bold text-[16px] transition-colors ${
                  riscada
                    ? 'bg-canvas border-border-subtle text-ink-faint line-through opacity-40'
                    : 'bg-surface border-border-subtle text-ink hover:border-accent cursor-pointer'
                }`}
              >
                {op}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
