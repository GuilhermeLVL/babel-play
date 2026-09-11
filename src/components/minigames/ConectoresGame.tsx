import type { ItemOutcome, RodadaConectores,RoundReport } from '@core';
import { notaConectores, scoreRound } from '@core';
import { Check, Flame, Link2, Sparkles,X } from 'lucide-react';
import React, { useRef, useState } from 'react';

import { emitBurst } from '../../lib/effects';
import { playJuicedError, playJuicedHit, playJuicedVictory, triggerHaptic } from '../../lib/gameFeel';
import { multiplicador } from '../../lib/juice';
import type { AgeProfileType } from '../../lib/profile';

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden animate-in fade-in duration-200">
      {/* Topo unificado */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            title="Sair de Conectores"
            aria-label="Sair do jogo"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Conectores & Sintaxe</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink font-semibold">Coesão Textual 🔗</span>
            </div>
            <p className="text-xs text-ink-muted">Toque nas palavras de transição que amarram as ideias da frase!</p>
          </div>
        </div>

        {/* Status e Pontos */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {mult > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs shadow-md animate-bounce">
              <Flame className="w-4 h-4 fill-current" />
              <span>×{mult}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-mono font-bold text-base">{pontos} pts</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <span className="font-mono font-bold text-base text-ink">
              {indice + 1}/{rodadas.length}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 overflow-y-auto custom-scrollbar">

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
      </main>
    </div>
  );
}
