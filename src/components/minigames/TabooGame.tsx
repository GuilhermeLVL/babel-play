import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ShieldAlert, Sparkles, Check, AlertTriangle, Eye, Flame, ArrowRight } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, flashDeTela } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';

/**
 * TABOO GAME — Forja da Circunlocução e Paráfrase.
 *
 * Inspirado no clássico jogo Taboo. O jogador recebe uma palavra-alvo e uma lista
 * de termos proibidos (tabus). Para pontuar, o jogador precisa identificar e formular
 * descrições conceituais sem jamais acionar as palavras tabu.
 */

interface TabooCardData {
  id: string;
  itemRef: string;
  targetWord: string;
  translation: string;
  forbiddenWords: string[];
  options: {
    text: string;
    valid: boolean; // se é válida ou se cometeu infração de tabu
    reason?: string;
  }[];
}

interface TabooGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const TABOO_CARDS_DEFAULT: TabooCardData[] = [
  {
    id: 'tb1',
    itemRef: 'Airport',
    targetWord: 'Airport',
    translation: 'Aeroporto',
    forbiddenWords: ['Plane', 'Fly', 'Terminal', 'Luggage'],
    options: [
      { text: 'A place where people take a plane to fly on vacation.', valid: false, reason: 'Usou "plane" e "fly" (proibidas!)' },
      { text: 'A large facility with concrete runways where travelers board aircraft after passport control.', valid: true },
      { text: 'A station with luggage bags everywhere.', valid: false, reason: 'Usou "luggage" (proibida!)' },
    ],
  },
  {
    id: 'tb2',
    itemRef: 'Hospital',
    targetWord: 'Hospital',
    translation: 'Hospital',
    forbiddenWords: ['Doctor', 'Nurse', 'Sick', 'Medicine'],
    options: [
      { text: 'A building where patients receive emergency medical treatment and surgical care.', valid: true },
      { text: 'A clinic full of sick people waiting for a doctor.', valid: false, reason: 'Usou "doctor" e "sick" (proibidas!)' },
      { text: 'Where you go to get medicine from a nurse.', valid: false, reason: 'Usou "nurse" e "medicine" (proibidas!)' },
    ],
  },
  {
    id: 'tb3',
    itemRef: 'Restaurant',
    targetWord: 'Restaurant',
    translation: 'Restaurante',
    forbiddenWords: ['Food', 'Eat', 'Menu', 'Waiter'],
    options: [
      { text: 'A commercial establishment where customers order prepared meals cooked by professional chefs.', valid: true },
      { text: 'A shop to eat fast food quickly.', valid: false, reason: 'Usou "food" e "eat" (proibidas!)' },
      { text: 'Where the waiter brings the menu to your table.', valid: false, reason: 'Usou "waiter" e "menu" (proibidas!)' },
    ],
  },
  {
    id: 'tb4',
    itemRef: 'Library',
    targetWord: 'Library',
    translation: 'Biblioteca',
    forbiddenWords: ['Book', 'Read', 'Quiet', 'Study'],
    options: [
      { text: 'A place full of books where you must be quiet.', valid: false, reason: 'Usou "book" e "quiet" (proibidas!)' },
      { text: 'A peaceful municipal archive where citizens borrow literature and research materials.', valid: true },
      { text: 'A room where students study and read together.', valid: false, reason: 'Usou "study" e "read" (proibidas!)' },
    ],
  },
];

export default function TabooGame({ items: itemsProp, ageProfile, onFinish, onExit }: TabooGameProps) {
  const cards = useMemo<TabooCardData[]>(() => {
    if (itemsProp && itemsProp.length >= 4) {
      return itemsProp.map((it, idx) => ({
        id: it.cardId || `taboo-${idx}`,
        itemRef: it.answer,
        targetWord: it.answer,
        translation: it.prompt,
        forbiddenWords: ['Easy', 'Common', 'Word', 'Translate'],
        options: [
          { text: `A descriptive definition explaining ${it.prompt} without naming it directly.`, valid: true },
          { text: `An easy common word that translates to ${it.prompt}.`, valid: false, reason: 'Usou termos proibidos!' },
          { text: `A direct synonym used in daily conversation for ${it.prompt}.`, valid: false, reason: 'Circunlocução imprecisa.' },
        ],
      }));
    }
    return TABOO_CARDS_DEFAULT;
  }, [itemsProp]);

  const [indice, setIndice] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [combo, setCombo] = useState(0);
  const [tempo, setTempo] = useState(25);
  const [infracaoMsg, setInfracaoMsg] = useState<string | null>(null);
  const [finalizado, setFinalizado] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioCardRef = useRef(Date.now());
  const cardRef = useRef<HTMLDivElement>(null);

  const cardAtual = cards[indice];

  useEffect(() => {
    inicioCardRef.current = Date.now();
    setTempo(25);
    setInfracaoMsg(null);
  }, [indice]);

  // Timer
  useEffect(() => {
    if (finalizado) return;
    const timer = setInterval(() => {
      setTempo((prev) => {
        if (prev <= 1) {
          tratarEscolha(false, 'Tempo esgotado!');
          return 25;
        }
        if (prev <= 4) play('tick');
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [indice, finalizado]);

  const tratarEscolha = (valida: boolean, motivo?: string, event?: React.MouseEvent) => {
    const duracao = Date.now() - inicioCardRef.current;
    outcomesRef.current.push({
      itemRef: cardAtual.targetWord,
      correct: valida,
      attempts: 1,
      ms: duracao,
    });

    if (valida) {
      play('success');
      setCombo((c) => c + 1);
      const pts = 200 + (combo * 40);
      setPontos((p) => p + pts);

      if (event) {
        const rect = event.currentTarget.getBoundingClientRect();
        emitBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 'combo');
      }

      avancarCard();
    } else {
      play('error');
      setCombo(0);
      if (cardRef.current) tremor(cardRef.current);
      setInfracaoMsg(motivo || 'Infração de Taboo!');

      setTimeout(() => {
        setInfracaoMsg(null);
        avancarCard();
      }, 1400);
    }
  };

  const avancarCard = () => {
    if (indice + 1 >= cards.length) {
      setFinalizado(true);
      play('fanfarra');
      comemorar('rodadaBoa');
      const duracaoTotal = Date.now() - inicioPartidaRef.current;
      const report: RoundReport = {
        gameId: 'blitz' as any,
        items: outcomesRef.current,
        score: pontos,
        durationMs: duracaoTotal,
      };
      setTimeout(() => {
        onFinish(report);
      }, 1800);
    } else {
      setIndice((prev) => prev + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden" ref={cardRef}>
      {/* Barra de Topo */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors"
            title="Sair do Taboo"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Taboo Arena</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-error-soft text-error-ink font-semibold">Circunlocução</span>
            </div>
            <p className="text-xs text-ink-muted">Identifique a melhor paráfrase sem usar nenhuma palavra proibida!</p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-4">
          {combo > 1 && (
            <div className="flex items-center gap-1 px-3 py-1 rounded-xl bg-accent text-accent-contrast font-black text-sm shadow-sm">
              <Flame className="w-4 h-4 fill-current" />
              <span>{combo}x STREAK</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-mono font-bold text-base">{pontos} pts</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <span className={`font-mono font-black ${tempo <= 4 ? 'text-error animate-pulse' : 'text-ink'}`}>
              {tempo}s
            </span>
          </div>
        </div>
      </header>

      {/* Arena Central */}
      <main className="flex-1 p-6 flex flex-col items-center justify-center max-w-3xl mx-auto w-full">
        {cardAtual && (
          <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-8 shadow-card flex flex-col items-center">
            {/* Palavra Alvo */}
            <div className="w-full flex flex-col items-center border-b border-border-subtle pb-6 mb-6">
              <span className="text-xs uppercase font-mono tracking-widest text-ink-muted mb-1">CONCEITO ALVO</span>
              <h2 className="font-display font-black text-3xl sm:text-4xl text-accent uppercase tracking-wide">
                {cardAtual.targetWord}
              </h2>
              <span className="text-sm font-medium text-ink-muted mt-1">({cardAtual.translation})</span>
            </div>

            {/* As Palavras Proibidas (TABOO) */}
            <div className="w-full bg-error-soft/40 border border-error/30 rounded-2xl p-4 mb-6">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-error-ink mb-3 justify-center">
                <ShieldAlert className="w-4 h-4" />
                <span>PALAVRAS PROIBIDAS (TABOO) — NUNCA USE:</span>
              </div>
              <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                {cardAtual.forbiddenWords.map((word) => (
                  <span
                    key={word}
                    className="px-3 py-1 rounded-xl bg-surface border border-error/40 font-mono font-black text-sm text-error uppercase shadow-sm"
                  >
                    ✕ {word}
                  </span>
                ))}
              </div>
            </div>

            {/* Infração em destaque */}
            {infracaoMsg && (
              <div className="w-full p-3 mb-4 rounded-xl bg-error text-white font-bold text-center text-sm flex items-center justify-center gap-2 animate-shake">
                <AlertTriangle className="w-4 h-4" />
                <span>{infracaoMsg}</span>
              </div>
            )}

            {/* O Desafio de Circunlocução: Escolha a melhor descrição sem tabus */}
            <div className="w-full flex flex-col gap-3">
              <p className="text-xs font-mono uppercase tracking-wider text-ink-muted text-center mb-1">
                Qual destas opções define o conceito SEM violar nenhum Taboo?
              </p>

              {cardAtual.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={(e) => tratarEscolha(opt.valid, opt.reason, e)}
                  className="w-full p-4 rounded-2xl border-2 border-border-subtle bg-surface-hover hover:border-accent hover:bg-accent-soft/30 text-left font-medium text-ink transition-all active:scale-98 shadow-sm flex items-start justify-between gap-3 group"
                >
                  <span className="text-sm sm:text-base leading-relaxed">{opt.text}</span>
                  <ArrowRight className="w-5 h-5 text-ink-muted group-hover:text-accent group-hover:translate-x-1 transition-all shrink-0 mt-0.5" />
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
