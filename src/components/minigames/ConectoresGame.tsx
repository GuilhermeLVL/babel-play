import React, { useRef, useState } from 'react';
import { X, Check, Link2, Flame } from 'lucide-react';
import type { ItemOutcome, RoundReport, RodadaConectores } from '@core';
import { notaConectores, scoreRound } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar, multiplicador } from '../../lib/juice';
import { playJuicedHit, playJuicedError, playJuicedVictory, triggerHaptic } from '../../lib/gameFeel';
import { emitBurst } from '../../lib/effects';

/**
 * CAÇA-CONECTORES — marcar as palavras que amarram as ideias da frase.
 */

interface ConectoresGameProps {
  rodadas: RodadaConectores[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

export default function ConectoresGame({ rodadas, ageProfile, onFinish, onExit }: ConectoresGameProps) {
  const [indice, setIndice] = useState(0);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [conferido, setConferido] = useState<ReturnType<typeof notaConectores> | null>(null);
  const [pontos, setPontos] = useState(0);
  const [sequencia, setSequencia] = useState(0);

  const resultadosRef = useRef<ItemOutcome[]>([]);
  const inicioItemRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const encerradoRef = useRef(false);
  const palcoRef = useRef<HTMLDivElement | null>(null);

  const rodada = rodadas[indice];
  const LIMIAR = 70;

  const alternar = (i: number) => {
    if (conferido) return;
    triggerHaptic('soft');
    setMarcados(prev => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  };

  const conferir = () => {
    if (!rodada || conferido) return;
    const n = notaConectores([...marcados], rodada.alvos);
    setConferido(n);
    const certo = n.f1 >= LIMIAR;

    resultadosRef.current.push({
      ...(rodada.fala.id ? { itemRef: rodada.fala.id } : {}),
      correct: certo,
      attempts: 1,
      ms: Date.now() - inicioItemRef.current,
    });

    if (certo) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      const ganho = 10 * mult;
      setSequencia(nova);
      setPontos(p => p + ganho);
      triggerHaptic('success');
      if (typeof window !== 'undefined') {
        emitBurst(window.innerWidth / 2, window.innerHeight * 0.4, 'confete');
      }
      playJuicedHit(nova, undefined, `+${ganho}${mult > 1 ? ` ×${mult}` : ''}`);
    } else {
      setSequencia(0);
      triggerHaptic('error');
      playJuicedError(palcoRef.current, undefined, 'Revise os conectores');
    }

    setTimeout(() => {
      if (indice + 1 >= rodadas.length) {
        if (encerradoRef.current) return;
        encerradoRef.current = true;
        const todos = resultadosRef.current;
        const impecavel = todos.every(o => o.correct);
        if (impecavel) playJuicedVictory();
        setTimeout(() => onFinish({
          gameId: 'conectores',
          items: todos,
          score: scoreRound('conectores', todos),
          durationMs: Date.now() - inicioRodadaRef.current,
        }), 900);
        return;
      }
      setIndice(i => i + 1);
      setMarcados(new Set());
      setConferido(null);
      inicioItemRef.current = Date.now();
    }, certo ? 1300 : 2600);
  };

  if (!rodada) return null;
  const mult = multiplicador(sequencia);
  const progressoPct = rodadas.length > 0 ? Math.round((indice / rodadas.length) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col items-center p-4 lg:p-8 animate-in fade-in duration-200 overflow-y-auto custom-scrollbar">
      <header className="w-full max-w-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display font-black text-lg text-ink">
              {ageProfile === 'kids' ? 'Ache as palavras que ligam' : 'Caça-conectores'}
            </h2>
            {mult > 1 && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-warn/20 text-warn-ink font-black text-xs border border-warn/40 animate-pulse">
                <Flame className="w-3.5 h-3.5 text-warn fill-current" /> ×{mult}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex-1 max-w-[200px] h-2 rounded-full bg-border-subtle/60 overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${progressoPct}%` }}
              />
            </div>
            <p className="text-[12px] text-ink-muted tabular-nums">
              frase {indice + 1} de {rodadas.length}
              {pontos > 0 && <span className="text-accent-ink font-bold"> · {pontos} pts</span>}
            </p>
          </div>
        </div>
        <button
          onClick={onExit}
          className="p-2 rounded-xl text-ink-muted hover:bg-surface-hover hover:text-ink cursor-pointer border border-border-subtle transition-colors self-end sm:self-auto"
          aria-label="Sair do jogo"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div ref={palcoRef} className="w-full max-w-2xl flex flex-col items-center gap-5 my-auto">
        <p className="flex items-center gap-2 text-[13px] text-ink-muted text-center">
          <Link2 className="w-4 h-4 text-accent shrink-0" aria-hidden />
          {ageProfile === 'senior'
            ? 'Toque nas palavras que ligam uma ideia à outra.'
            : 'Marque as palavras que amarram as ideias, as que mudam o rumo da frase.'}
        </p>

        {/* A FRASE, palavra por palavra clicável. */}
        <p data-tour="frase-conectores" className="flex flex-wrap justify-center gap-x-1.5 gap-y-2 text-center">
          {rodada.tokens.map((t, i) => {
            const marcado = marcados.has(i);
            const eraAlvo = rodada.alvos.includes(i);
            return (
              <button
                key={i}
                onClick={() => alternar(i)}
                disabled={!!conferido}
                className={`px-2.5 py-1.5 rounded-lg font-display font-bold text-[16px] transition-all ${
                  conferido
                    // Depois de conferir: verde no que era, vermelho no que foi marcado à toa,
                    // contorno no que passou despercebido. Os três casos precisam ser visíveis.
                    ? eraAlvo && marcado ? 'bg-good text-white'
                      : eraAlvo ? 'border-2 border-good text-good-ink'
                      : marcado ? 'bg-error-soft text-error-ink line-through'
                      : 'text-ink-faint'
                    : marcado ? 'bg-accent text-white cursor-pointer'
                      : 'text-ink hover:bg-surface-hover cursor-pointer'
                }`}
              >
                {t}
              </button>
            );
          })}
        </p>

        {rodada.fala.translation && (
          <p className="text-[12px] text-ink-muted text-center max-w-[52ch]">{rodada.fala.translation}</p>
        )}

        {conferido ? (
          <div className="flex flex-col items-center gap-1 animate-in fade-in">
            <p className="font-display font-black text-lg text-ink">{conferido.f1} pontos de precisão</p>
            <p className="text-[12px] text-ink-muted">
              {conferido.certos} {conferido.certos === 1 ? 'certo' : 'certos'}
              {conferido.falsos > 0 && ` · ${conferido.falsos} marcado à toa`}
              {conferido.perdidos > 0 && ` · ${conferido.perdidos} passou batido`}
            </p>
          </div>
        ) : (
          <button
            data-tour="conferir"
            onClick={conferir}
            className="py-3 px-6 rounded-xl bg-accent hover:bg-accent-ink text-white font-bold text-[14px] shadow-btn cursor-pointer flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> Conferir
          </button>
        )}
      </div>
    </div>
  );
}
