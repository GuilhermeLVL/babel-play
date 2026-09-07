import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Zap, Flame, Check, HelpCircle, ArrowRight, Lightbulb, RotateCcw } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import { comemorar, tremor, pulsoDeZoom } from '../../../lib/juice';
import { emitBurst } from '../../../lib/effects';
import { playJuicedHit, playJuicedError, playJuicedVictory, calculateMultiplier } from '../../../lib/gameFeel';

/**
 * CHOSEONG GAME — Decifrador de Consoantes Iniciais (초성게임).
 *
 * Inspirado no fenômeno da televisão e escolas coreanas.
 * O jogador recebe a estrutura de ataque consonantal e categoria, e preenche
 * os blocos 3D de letras sob pressão de cronômetro regressivo.
 * Inclui Modo Febre (Fever Mode) em sequências e ajuda de revelação de letra.
 */

interface ChoseongPuzzle {
  id: string;
  itemRef: string;
  targetWord: string;
  prompt: string;
  category: string;
  initialLetters: (string | null)[];
}

interface ChoseongGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const MOCK_PUZZLES_CHOSEONG: ChoseongPuzzle[] = [
  { id: 'c1', itemRef: 'Coffee', targetWord: 'COFFEE', prompt: 'Bebida matinal quente ou fria', category: 'Bebidas', initialLetters: ['C', null, 'F', 'F', null, null] },
  { id: 'c2', itemRef: 'Friend', targetWord: 'FRIEND', prompt: 'Companheiro leal e confidente', category: 'Pessoas', initialLetters: ['F', 'R', null, null, 'N', 'D'] },
  { id: 'c3', itemRef: 'Garden', targetWord: 'GARDEN', prompt: 'Espaço com flores, plantas e árvores', category: 'Natureza', initialLetters: ['G', null, 'R', 'D', null, 'N'] },
  { id: 'c4', itemRef: 'Summer', targetWord: 'SUMMER', prompt: 'Estação mais ensolarada e quente', category: 'Estações', initialLetters: ['S', null, 'M', 'M', null, 'R'] },
  { id: 'c5', itemRef: 'Window', targetWord: 'WINDOW', prompt: 'Abertura na parede para luz e ar', category: 'Casa', initialLetters: ['W', null, 'N', 'D', null, 'W'] },
];

export default function ChoseongGame({ items: itemsProp, ageProfile, onFinish, onExit }: ChoseongGameProps) {
  const puzzles = useMemo<ChoseongPuzzle[]>(() => {
    if (itemsProp && itemsProp.length >= 4) {
      return itemsProp.map((it, idx) => {
        const word = it.answer.trim().toUpperCase();
        const vowels = new Set(['A', 'E', 'I', 'O', 'U', 'Á', 'É', 'Í', 'Ó', 'Ú', ' ']);
        const letters = word.split('').map((char) => (vowels.has(char) ? null : char));

        return {
          id: it.cardId || `choseong-${idx}`,
          itemRef: it.answer,
          targetWord: word,
          prompt: it.prompt,
          category: 'Vocabulário',
          initialLetters: letters,
        };
      });
    }
    return MOCK_PUZZLES_CHOSEONG;
  }, [itemsProp]);

  const tempoLimite = ageProfile === 'senior' ? 22 : ageProfile === 'kids' ? 18 : 15;
  const [indice, setIndice] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [combo, setCombo] = useState(0);
  const [tempo, setTempo] = useState(tempoLimite);
  const [letrasUsuario, setLetrasUsuario] = useState<string[]>([]);
  const [finalizado, setFinalizado] = useState(false);
  const [dicasRestantes, setDicasRestantes] = useState(3);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioPuzzleRef = useRef(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);

  const puzzleAtual = puzzles[indice];

  // Letras disponíveis para clicar na bandeja
  const letrasTeclado = useMemo(() => {
    if (!puzzleAtual) return [];
    const targetLetters = puzzleAtual.targetWord.split('');
    const decoys = ['A', 'E', 'I', 'O', 'U', 'S', 'T', 'R', 'N', 'L'];
    const pool = Array.from(new Set([...targetLetters, ...decoys]));
    return pool.sort();
  }, [puzzleAtual]);

  // Inicializa o puzzle atual
  useEffect(() => {
    if (!puzzleAtual) return;
    inicioPuzzleRef.current = Date.now();
    setTempo(tempoLimite);

    // Pré-preenche os slots que já têm consoante revelada
    const inicial = puzzleAtual.initialLetters.map((char) => char || '');
    setLetrasUsuario(inicial);
  }, [indice, puzzleAtual, tempoLimite]);

  // Cronômetro
  useEffect(() => {
    if (finalizado) return;
    const timer = setInterval(() => {
      setTempo((prev) => {
        if (prev <= 1) {
          tratarTentativa(false);
          return tempoLimite;
        }
        if (prev <= 3) play('tick');
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [indice, finalizado, tempoLimite]);

  // Escuta teclado físico para preenchimento imediato
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (finalizado || !puzzleAtual) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        apagarUltimaLetra();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        verificarResposta();
      } else if (/^[a-zA-ZáéíóúÁÉÍÓÚ]$/.test(e.key)) {
        e.preventDefault();
        inserirLetra(e.key.toUpperCase());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [letrasUsuario, puzzleAtual, finalizado]);

  const inserirLetra = (char: string) => {
    if (!puzzleAtual) return;
    // Encontra o primeiro slot vazio
    const indexVazio = letrasUsuario.findIndex((l) => !l);
    if (indexVazio !== -1) {
      play('click');
      const novas = [...letrasUsuario];
      novas[indexVazio] = char;
      setLetrasUsuario(novas);

      // Se preencheu todos os slots, verifica automaticamente
      if (!novas.some((l) => !l)) {
        checarSolucao(novas.join(''));
      }
    }
  };

  const apagarUltimaLetra = () => {
    // Procura a última letra mutável inserida pelo usuário
    for (let i = letrasUsuario.length - 1; i >= 0; i--) {
      // Se não era fixa originalmente
      if (puzzleAtual.initialLetters[i] === null && letrasUsuario[i]) {
        play('click');
        const novas = [...letrasUsuario];
        novas[i] = '';
        setLetrasUsuario(novas);
        break;
      }
    }
  };

  const checarSolucao = (palavraMontada: string) => {
    const correta = palavraMontada.toUpperCase() === puzzleAtual.targetWord.toUpperCase();
    if (correta) {
      tratarTentativa(true);
    } else {
      play('error');
      if (containerRef.current) tremor(containerRef.current);
      // Limpa os slots preenchidos pelo usuário
      const reset = puzzleAtual.initialLetters.map((c) => c || '');
      setLetrasUsuario(reset);
    }
  };

  const verificarResposta = () => {
    checarSolucao(letrasUsuario.join(''));
  };

  const usarDicaRevelarUmaLetra = () => {
    if (!puzzleAtual || dicasRestantes <= 0) return;
    const indexOculto = letrasUsuario.findIndex((l, i) => !l && puzzleAtual.initialLetters[i] === null);
    if (indexOculto !== -1) {
      setDicasRestantes((d) => d - 1);
      play('timeBonus');
      const novas = [...letrasUsuario];
      novas[indexOculto] = puzzleAtual.targetWord[indexOculto];
      setLetrasUsuario(novas);

      if (!novas.some((l) => !l)) {
        checarSolucao(novas.join(''));
      }
    }
  };

  const tratarTentativa = (sucesso: boolean) => {
    const duracaoMs = Date.now() - inicioPuzzleRef.current;
    outcomesRef.current.push({
      itemRef: puzzleAtual.targetWord,
      correct: sucesso,
      attempts: 1,
      ms: duracaoMs,
    });

    if (sucesso) {
      const novoCombo = combo + 1;
      setCombo(novoCombo);
      const mult = calculateMultiplier(novoCombo);
      const pts = (140 + (novoCombo * 30)) * mult;
      setPontos((p) => p + pts);

      playJuicedHit(
        novoCombo,
        { x: window.innerWidth / 2, y: window.innerHeight * 0.45 },
        `초성 DECIFRADO! ${mult}x`
      );
    } else {
      setCombo(0);
      playJuicedError(containerRef.current, undefined, 'INCORRETO');
    }

    if (indice + 1 >= puzzles.length) {
      concluirPartida();
    } else {
      setIndice((prev) => prev + 1);
    }
  };

  const concluirPartida = () => {
    setFinalizado(true);
    playJuicedVictory();
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

  const ehModoFebre = combo >= 3;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden" ref={containerRef}>
      {/* Topo */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            title="Sair do Choseong"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Choseong Arena</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink font-semibold">초성 퀴즈 🇰🇷</span>
            </div>
            <p className="text-xs text-ink-muted">Decifre as palavras completas preenchendo os blocos 3D de letras!</p>
          </div>
        </div>

        {/* Status de Pontos, Streak / Fever, Dica e Timer */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={usarDicaRevelarUmaLetra}
            disabled={dicasRestantes <= 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            title="Revelar uma letra oculta"
          >
            <Lightbulb className="w-3.5 h-3.5 text-accent" />
            <span>Dica ({dicasRestantes})</span>
          </button>

          {ehModoFebre && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs shadow-md animate-bounce">
              <Flame className="w-4 h-4 fill-current" />
              <span>FEVER MODE ({combo}x)</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-mono font-bold text-base">{pontos} pts</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <span className={`font-mono font-black text-base ${tempo <= 3 ? 'text-error animate-pulse' : 'text-ink'}`}>
              {tempo}s
            </span>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 p-6 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
        {puzzleAtual && (
          <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-8 shadow-card flex flex-col items-center text-center">
            {/* Mascote Saltitante e Categoria */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-3xl animate-bounce">🧩</span>
              <div className="px-3.5 py-1 rounded-full bg-surface-hover border border-border-subtle text-xs font-mono uppercase tracking-wider text-ink-muted">
                Categoria: <strong className="text-accent">{puzzleAtual.category}</strong>
              </div>
            </div>

            {/* Pista Semântica */}
            <p className="text-sm sm:text-base text-ink font-bold mb-4">
              "{puzzleAtual.prompt}"
            </p>

            {/* SLOTS 3D DE LETRAS (ESTILO GAME SHOW / WORDLE) */}
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3 my-4">
              {puzzleAtual.targetWord.split('').map((_, idx) => {
                const letra = letrasUsuario[idx] || '';
                const eraFixa = puzzleAtual.initialLetters[idx] !== null;

                return (
                  <div
                    key={idx}
                    className={`w-12 h-14 sm:w-14 sm:h-16 rounded-2xl flex items-center justify-center font-display font-black text-2xl sm:text-3xl transition-all duration-200 border-2 shadow-card ${
                      letra
                        ? eraFixa
                          ? 'border-accent bg-accent-soft text-accent-ink'
                          : 'border-good bg-surface text-ink scale-105 shadow-md animate-fadeIn'
                        : 'border-dashed border-border-subtle bg-surface-hover/50 text-ink-muted'
                    }`}
                  >
                    {letra}
                  </div>
                );
              })}
            </div>

            {/* Ações e Botões de Apoio */}
            <div className="flex gap-3 my-3">
              <button
                onClick={usarDicaRevelarUmaLetra}
                disabled={dicasRestantes <= 0}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle text-xs font-bold text-ink transition-colors cursor-pointer disabled:opacity-40"
              >
                <Lightbulb className="w-4 h-4 text-amber-500 animate-bounce" />
                <span>Revelar uma letra ({dicasRestantes})</span>
              </button>

              <button
                onClick={apagarUltimaLetra}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle text-xs font-bold text-ink-muted hover:text-ink transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-rose-500" />
                <span>Apagar letra</span>
              </button>
            </div>

            {/* Teclado Virtual de Letras Clicáveis */}
            <div className="w-full mt-4 pt-4 border-t border-border-subtle">
              <p className="text-xs font-mono uppercase tracking-wider text-ink-muted mb-2">
                Clique nas letras ou digite diretamente pelo teclado:
              </p>
              <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                {letrasTeclado.map((letra) => (
                  <button
                    key={letra}
                    onClick={() => inserirLetra(letra)}
                    className="w-10 h-11 sm:w-11 sm:h-12 rounded-xl border border-border-subtle bg-surface hover:border-accent hover:bg-accent-soft hover:text-accent-ink font-display font-black text-lg shadow-sm active:scale-95 transition-all cursor-pointer"
                  >
                    {letra}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
