import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { MINIGAMES, scoreRound } from '@core';
import { Check, PenLine,Shuffle, Volume2, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { vazaResposta } from '../../../core/learning/pistaDeJogo';
import { comemorar } from '../../../lib/juice';
import { direcaoDoTexto } from '../../../lib/languages';
import type { AgeProfileType } from '../../../lib/profile';
import { speak } from '../../../lib/tts';

/**
 * CADAVRE EXQUIS — quatro palavras da leva, UMA frase sua que use as quatro.
 *
 * É produção livre, e por isso `MINIGAMES.cadavre.writesSrs` é `false`: escrever a palavra numa
 * frase não prova que ela foi recuperada da memória — ela está impressa na tela enquanto se
 * escreve. O outcome existe para o histórico saber quais itens apareceram, não para agendar.
 *
 * "Usou a palavra" é medido por `vazaResposta`, a mesma régua que decide se uma pista entrega a
 * resposta: ela reconhece a flexão ("abandoned" conta para "abandon") sem aceitar palavra apenas
 * parecida.
 */

interface CadavreExquisGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** A rodada é exatamente quatro: é o que `MINIGAMES.cadavre` declara nos dois extremos. */
const PALAVRAS = MINIGAMES.cadavre.maxItems;

export default function CadavreExquisGame({ items, ageProfile, onFinish, onExit }: CadavreExquisGameProps) {
  const suficiente = items.length >= PALAVRAS;
  const [leva, setLeva] = useState<MinigameItem[]>(() => items.slice(0, PALAVRAS));
  /** Próximo item de reserva para a troca. Só existe quando a leva chegou com sobra. */
  const [reserva, setReserva] = useState(PALAVRAS);
  const [frase, setFrase] = useState('');
  const [resultado, setResultado] = useState<RoundReport | null>(null);

  const inicioRef = useRef(Date.now());
  const palcoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!suficiente) onExit();
  }, [suficiente, onExit]);

  const usadas = useMemo(
    () => (resultado ? leva.map((it) => vazaResposta(frase, it.answer)) : []),
    [resultado, leva, frase],
  );

  const conferir = () => {
    const ms = Date.now() - inicioRef.current;
    const outcomes: ItemOutcome[] = leva.map((it) => ({
      cardId: it.cardId,
      itemRef: it.answer,
      correct: vazaResposta(frase, it.answer),
      attempts: 1,
      ms,
    }));
    if (outcomes.every((o) => o.correct)) comemorar('rodadaPerfeita', palcoRef.current);
    setResultado({
      gameId: 'cadavre',
      items: outcomes,
      score: scoreRound('cadavre', outcomes),
      durationMs: ms,
    });
  };

  /** Troca uma palavra da leva por uma de reserva. Não custa nota: a leva ainda é da rodada. */
  const trocar = (i: number) => {
    if (reserva >= items.length) return;
    setLeva((atual) => atual.map((it, j) => (j === i ? items[reserva] : it)));
    setReserva((n) => n + 1);
  };

  if (!suficiente) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            title="Sair do Cadavre Exquis"
            aria-label="Sair do jogo"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Frase maluca</span>
            <p className="text-xs text-ink-muted">Uma frase sua com as quatro palavras. Não conta para a revisão.</p>
          </div>
        </div>
      </header>

      <main ref={palcoRef} className="flex-1 flex flex-col items-center justify-center gap-6 p-4 lg:p-8 max-w-2xl mx-auto w-full min-h-0 overflow-y-auto">
        <div data-tour="palavras" className="w-full grid grid-cols-2 gap-3">
          {leva.map((it, i) => {
            const conferida = resultado ? usadas[i] : null;
            return (
              <div
                key={it.answer + i}
                className={`p-4 rounded-2xl border-2 flex flex-col items-start gap-1 ${
                  conferida === null
                    ? 'border-border-subtle bg-surface'
                    : conferida
                      ? 'border-good bg-good-soft'
                      : 'border-border-subtle bg-canvas opacity-70'
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <span dir={direcaoDoTexto(it.lang)} className="font-display font-black text-xl text-ink break-words">
                    {it.answer}
                  </span>
                  {conferida === true && <Check className="w-4 h-4 text-good-ink shrink-0" aria-label="usada na frase" />}
                  <button
                    onClick={() => speak(it.answer, { lang: it.lang })}
                    className="ml-auto p-1 rounded-full hover:bg-surface-hover text-accent cursor-pointer shrink-0"
                    title="Ouvir a palavra"
                    aria-label={`Ouvir ${it.answer}`}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-[12px] text-ink-muted">{it.prompt}</span>
                {!resultado && reserva < items.length && (
                  <button
                    onClick={() => trocar(i)}
                    className="mt-1 flex items-center gap-1 text-[11px] font-bold text-accent-ink hover:underline cursor-pointer"
                  >
                    <Shuffle className="w-3 h-3" aria-hidden />
                    trocar
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!resultado ? (
          <div className="w-full space-y-3">
            <p className="label-mono">
              {ageProfile === 'kids' ? 'Escreva uma frase que use as quatro' : 'Escreva UMA frase que use as quatro palavras'}
            </p>
            <textarea
              data-tour="frase"
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              rows={ageProfile === 'senior' ? 5 : 3}
              placeholder="A sua frase pode ser absurda — só precisa usar as quatro."
              aria-label="Sua frase"
              className="w-full p-4 rounded-2xl border-2 border-border-subtle bg-surface text-ink text-[16px] focus:border-accent focus:outline-none"
            />
            <button
              onClick={conferir}
              disabled={!frase.trim()}
              className="btn-ink w-full justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PenLine className="w-4 h-4" aria-hidden />
              Conferir
            </button>
          </div>
        ) : (
          <div className="w-full card-panel bg-surface p-6 text-center">
            <p className="label-mono mb-2">A sua frase</p>
            <p dir={direcaoDoTexto(leva[0].lang)} className="text-[17px] font-bold text-ink">{frase}</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                onClick={() => speak(frase, { lang: leva[0].lang })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface-hover text-[12px] font-bold text-ink cursor-pointer"
              >
                <Volume2 className="w-4 h-4 text-accent" aria-hidden />
                Ouvir
              </button>
            </div>
            <p className="text-[13px] text-ink-muted mt-4">
              palavras usadas: <b className="text-ink">{resultado.items.filter((o) => o.correct).length}/{resultado.items.length}</b>
            </p>
            <p className="text-[11.5px] text-ink-faint mt-1">Produção livre: esta rodada não agenda revisão.</p>
            <button onClick={() => onFinish(resultado)} className="btn-ink w-full justify-center mt-5 cursor-pointer">
              Continuar
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
