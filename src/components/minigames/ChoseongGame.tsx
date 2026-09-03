import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Zap, Flame, Check, HelpCircle, ArrowRight } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, flashDeTela } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';

/**
 * CHOSEONG GAME — Decifrador de Consoantes Iniciais (초성게임).
 *
 * Inspirado no fenômeno coreano do Choseong. O jogador recebe as consoantes
 * de ataque da palavra (ou as consoantes estruturais com lacunas) e uma categoria
 * semântica, devendo evocar a palavra completa sob cronômetro regressivo.
 */

interface ChoseongPuzzle {
  id: string;
  itemRef: string;
  consonants: string;
  targetWord: string;
  prompt: string;
  category: string;
  missingLetters: string[];
}

interface ChoseongGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const MOCK_PUZZLES: ChoseongPuzzle[] = [
  { id: 'c1', itemRef: 'Coffee', consonants: 'C _ F F _ _', targetWord: 'Coffee', prompt: 'Café matinal', category: 'Bebidas', missingLetters: ['O', 'E', 'A', 'U'] },
  { id: 'c2', itemRef: 'Friend', consonants: 'F R _ _ N D', targetWord: 'Friend', prompt: 'Amigo de infância', category: 'Pessoas', missingLetters: ['I', 'E', 'O', 'A'] },
  { id: 'c3', itemRef: 'Garden', consonants: 'G _ R D _ N', targetWord: 'Garden', prompt: 'Jardim de flores', category: 'Natureza', missingLetters: ['A', 'E', 'O', 'I'] },
  { id: 'c4', itemRef: 'Summer', consonants: 'S _ M M _ R', targetWord: 'Summer', prompt: 'Verão quente', category: 'Estações', missingLetters: ['U', 'E', 'A', 'I'] },
  { id: 'c5', itemRef: 'Window', consonants: 'W _ N D _ W', targetWord: 'Window', prompt: 'Janela de vidro', category: 'Casa', missingLetters: ['I', 'O', 'E', 'A'] },
];

export default function ChoseongGame({ items: itemsProp, ageProfile, onFinish, onExit }: ChoseongGameProps) {
  const puzzles = useMemo<ChoseongPuzzle[]>(() => {
    if (itemsProp && itemsProp.length >= 4) {
      return itemsProp.map((it, idx) => {
        const word = it.answer.trim();
        // Cria máscara das consoantes e vogais
        const vowels = new Set(['a', 'e', 'i', 'o', 'u', 'á', 'é', 'í', 'ó', 'ú']);
        let masked = '';
        const missing: string[] = [];

        for (const char of word) {
          if (vowels.has(char.toLowerCase())) {
            masked += '_ ';
            if (!missing.includes(char.toUpperCase())) missing.push(char.toUpperCase());
          } else {
            masked += char.toUpperCase() + ' ';
          }
        }

        // Adiciona algumas vogais distratoras
        ['A', 'E', 'I', 'O', 'U'].forEach((v) => {
          if (missing.length < 5 && !missing.includes(v)) missing.push(v);
        });

        return {
          id: it.cardId || `choseong-${idx}`,
          itemRef: it.answer,
          consonants: masked.trim(),
          targetWord: word,
          prompt: it.prompt,
          category: 'Vocabulário',
          missingLetters: missing.sort(),
        };
      });
    }
    return MOCK_PUZZLES;
  }, [itemsProp]);

  const tempoInicial = ageProfile === 'senior' ? 20 : ageProfile === 'kids' ? 18 : 14;
  const [indice, setIndice] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [combo, setCombo] = useState(0);
  const [tempo, setTempo] = useState(tempoInicial);
  const [inputTexto, setInputTexto] = useState('');
  const [dicaRevelada, setDicaRevelada] = useState(false);
  const [finalizado, setFinalizado] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioPuzzleRef = useRef(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const puzzleAtual = puzzles[indice];

  // Foca o input ao trocar de puzzle
  useEffect(() => {
    inicioPuzzleRef.current = Date.now();
    setInputTexto('');
    setDicaRevelada(false);
    setTempo(tempoInicial);
    inputRef.current?.focus();
  }, [indice, tempoInicial]);

  // Relógio regressivo
  useEffect(() => {
    if (finalizado) return;
    const timer = setInterval(() => {
      setTempo((prev) => {
        if (prev <= 1) {
          tratarTentativa(false);
          return tempoInicial;
        }
        if (prev <= 3) play('tick');
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [indice, finalizado, tempoInicial]);

  const tratarTentativa = (sucesso: boolean) => {
    const duracaoMs = Date.now() - inicioPuzzleRef.current;
    outcomesRef.current.push({
      itemRef: puzzleAtual.targetWord,
      correct: sucesso,
      attempts: 1,
      ms: duracaoMs,
      hinted: dicaRevelada,
    });

    if (sucesso) {
      play('success');
      setCombo((c) => c + 1);
      const pts = 120 + (combo * 25);
      setPontos((p) => p + pts);
    } else {
      play('error');
      setCombo(0);
      if (containerRef.current) tremor(containerRef.current);
    }

    if (indice + 1 >= puzzles.length) {
      concluirPartida();
    } else {
      setIndice((prev) => prev + 1);
    }
  };

  const concluirPartida = () => {
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
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputTexto.trim()) return;

    const palpite = inputTexto.trim().toLowerCase();
    const alvo = puzzleAtual.targetWord.trim().toLowerCase();

    if (palpite === alvo) {
      tratarTentativa(true);
    } else {
      play('error');
      if (containerRef.current) tremor(containerRef.current);
      setInputTexto('');
    }
  };

  const handleInserirLetra = (letra: string) => {
    setInputTexto((prev) => prev + letra);
    inputRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden" ref={containerRef}>
      {/* Topo */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors"
            title="Sair do Choseong"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Choseong Quiz</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink font-semibold">초성게임</span>
            </div>
            <p className="text-xs text-ink-muted">Decifre a palavra a partir de suas consoantes-âncora!</p>
          </div>
        </div>

        {/* Combo, Pontos e Timer */}
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
            <span className={`font-mono font-black ${tempo <= 3 ? 'text-error animate-pulse' : 'text-ink'}`}>
              {tempo}s
            </span>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 p-6 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
        {puzzleAtual && (
          <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-8 shadow-card flex flex-col items-center text-center">
            {/* Categoria */}
            <div className="px-3 py-1 rounded-full bg-surface-hover border border-border-subtle text-xs font-mono uppercase tracking-wider text-ink-muted mb-4">
              Categoria: {puzzleAtual.category}
            </div>

            {/* As Consoantes / Máscara */}
            <div className="my-4 font-mono font-black text-4xl sm:text-5xl tracking-widest text-accent bg-accent-soft/30 px-6 py-4 rounded-2xl border border-accent/20">
              {puzzleAtual.consonants}
            </div>

            {/* Pista Semântica */}
            <p className="text-sm text-ink-muted font-medium mb-6">
              Pista: <span className="text-ink font-bold">{puzzleAtual.prompt}</span>
            </p>

            {/* Formulário de Digitação */}
            <form onSubmit={handleSubmit} className="w-full max-w-md flex flex-col gap-3">
              <div className="relative flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputTexto}
                  onChange={(e) => setInputTexto(e.target.value)}
                  placeholder="Digite a palavra completa..."
                  className="w-full px-5 py-3.5 rounded-2xl border-2 border-border-subtle bg-surface-hover font-display font-black text-xl text-center text-ink focus:border-accent focus:outline-none transition-all shadow-inner"
                  autoFocus
                />
              </div>

              {/* Botões virtuais de letras/vogais complementares */}
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {puzzleAtual.missingLetters.map((letra) => (
                  <button
                    key={letra}
                    type="button"
                    onClick={() => handleInserirLetra(letra)}
                    className="w-10 h-10 rounded-xl border border-border-subtle bg-surface hover:border-accent hover:bg-accent-soft hover:text-accent-ink font-mono font-bold text-lg shadow-sm active:scale-95 transition-all"
                  >
                    {letra}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setDicaRevelada(true)}
                  className="flex-1 py-3 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle text-xs font-bold text-ink-muted flex items-center justify-center gap-1.5 transition-colors"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Dica ({puzzleAtual.targetWord.length} letras)</span>
                </button>

                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-accent text-accent-contrast font-bold text-sm shadow-card hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <span>Confirmar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
