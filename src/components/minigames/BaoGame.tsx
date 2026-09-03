import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Gem, ArrowRight, RotateCcw, Check, Flame, Sprout, Trees, Volume2 } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, pulsoDeZoom, flashDeTela } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { speak } from '../../lib/tts';

/**
 * BAO / MANCALA DOS MORFEMAS — Semeadura & Colheita Morfológica (Bao 🌍).
 *
 * Inspirado no mais sofisticado jogo de mancala da África Oriental (cultura Swahili de Zanzibar e Quênia).
 *
 * Recursos Avançados:
 * 1. Tabuleiro de Madeira entalhada com 2 fileiras de covas e sementes preciosas animadas.
 * 2. Raízes Morfológicas Centrais (ACT, CARE, PLAY, HOPE, FORM, HELP).
 * 3. Semeadura Rítmica: O jogador escolhe a cova do afixo correto para capturar as sementes (Kula no Bao!).
 * 4. Word Tree: Mostra a germinação da raiz gerando a nova palavra derivada.
 */

interface MorphemePit {
  id: string;
  affix: string;
  type: 'prefix' | 'suffix';
  validWithRoot: boolean;
  resultWord: string;
  resultMeaning: string;
  seedsCount: number;
}

interface BaoRound {
  root: string;
  rootMeaning: string;
  targetAffixId: string;
  clue: string;
  pits: MorphemePit[];
}

interface BaoGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const RODADAS_BAO: BaoRound[] = [
  {
    root: 'ACT',
    rootMeaning: 'agir / atuar',
    targetAffixId: 'p-or',
    clue: 'Pessoa que atua profissionalmente em peças de teatro ou filmes de cinema',
    pits: [
      { id: 'p-or', affix: '-OR', type: 'suffix', validWithRoot: true, resultWord: 'ACTOR', resultMeaning: 'Ator', seedsCount: 4 },
      { id: 'p-ion', affix: '-ION', type: 'suffix', validWithRoot: true, resultWord: 'ACTION', resultMeaning: 'Ação', seedsCount: 3 },
      { id: 'p-ive', affix: '-IVE', type: 'suffix', validWithRoot: true, resultWord: 'ACTIVE', resultMeaning: 'Ativo', seedsCount: 2 },
      { id: 'p-re', affix: 'RE-', type: 'prefix', validWithRoot: true, resultWord: 'REACT', resultMeaning: 'Reagir', seedsCount: 3 },
      { id: 'p-less', affix: '-LESS', type: 'suffix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 2 },
      { id: 'p-un', affix: 'UN-', type: 'prefix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 1 },
    ],
  },
  {
    root: 'CARE',
    rootMeaning: 'cuidado / atenção',
    targetAffixId: 'p-ful',
    clue: 'Indivíduo atencioso, que procede com extremo zelo, atenção e cautela',
    pits: [
      { id: 'p-ful', affix: '-FUL', type: 'suffix', validWithRoot: true, resultWord: 'CAREFUL', resultMeaning: 'Cuidadoso', seedsCount: 4 },
      { id: 'p-less', affix: '-LESS', type: 'suffix', validWithRoot: true, resultWord: 'CARELESS', resultMeaning: 'Descuidado', seedsCount: 3 },
      { id: 'p-er', affix: '-ER', type: 'suffix', validWithRoot: true, resultWord: 'CARER', resultMeaning: 'Cuidador', seedsCount: 2 },
      { id: 'p-ly', affix: '-LY', type: 'suffix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 1 },
      { id: 'p-dis', affix: 'DIS-', type: 'prefix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 2 },
      { id: 'p-ion', affix: '-ION', type: 'suffix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 1 },
    ],
  },
  {
    root: 'PLAY',
    rootMeaning: 'jogar / brincar',
    targetAffixId: 'p-er',
    clue: 'Indivíduo participante que compete ou atua ativamente no jogo',
    pits: [
      { id: 'p-er', affix: '-ER', type: 'suffix', validWithRoot: true, resultWord: 'PLAYER', resultMeaning: 'Jogador', seedsCount: 4 },
      { id: 'p-ful', affix: '-FUL', type: 'suffix', validWithRoot: true, resultWord: 'PLAYFUL', resultMeaning: 'Brincalhão', seedsCount: 3 },
      { id: 'p-re', affix: 'RE-', type: 'prefix', validWithRoot: true, resultWord: 'REPLAY', resultMeaning: 'Repetir a jogada', seedsCount: 2 },
      { id: 'p-able', affix: '-ABLE', type: 'suffix', validWithRoot: true, resultWord: 'PLAYABLE', resultMeaning: 'Jogável', seedsCount: 3 },
      { id: 'p-tion', affix: '-TION', type: 'suffix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 1 },
      { id: 'p-anti', affix: 'ANTI-', type: 'prefix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 2 },
    ],
  },
  {
    root: 'FORM',
    rootMeaning: 'forma / moldar',
    targetAffixId: 'p-trans',
    clue: 'Mudar completamente a forma, aspecto ou estrutura de algo',
    pits: [
      { id: 'p-trans', affix: 'TRANS-', type: 'prefix', validWithRoot: true, resultWord: 'TRANSFORM', resultMeaning: 'Transformar', seedsCount: 4 },
      { id: 'p-re', affix: 'RE-', type: 'prefix', validWithRoot: true, resultWord: 'REFORM', resultMeaning: 'Reformar', seedsCount: 3 },
      { id: 'p-ation', affix: '-ATION', type: 'suffix', validWithRoot: true, resultWord: 'FORMATION', resultMeaning: 'Formação', seedsCount: 3 },
      { id: 'p-un', affix: 'UN-', type: 'prefix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 1 },
      { id: 'p-less', affix: '-LESS', type: 'suffix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 2 },
      { id: 'p-ful', affix: '-FUL', type: 'suffix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 1 },
    ],
  },
  {
    root: 'HOPE',
    rootMeaning: 'esperança',
    targetAffixId: 'p-less',
    clue: 'Situação desesperadora, onde não resta nenhuma expectativa de melhora',
    pits: [
      { id: 'p-less', affix: '-LESS', type: 'suffix', validWithRoot: true, resultWord: 'HOPELESS', resultMeaning: 'Sem esperança / Desesperançoso', seedsCount: 4 },
      { id: 'p-ful', affix: '-FUL', type: 'suffix', validWithRoot: true, resultWord: 'HOPEFUL', resultMeaning: 'Esperançoso', seedsCount: 3 },
      { id: 'p-ing', affix: '-ING', type: 'suffix', validWithRoot: true, resultWord: 'HOPING', resultMeaning: 'Esperando', seedsCount: 2 },
      { id: 'p-dis', affix: 'DIS-', type: 'prefix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 1 },
      { id: 'p-anti', affix: 'ANTI-', type: 'prefix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 2 },
      { id: 'p-ment', affix: '-MENT', type: 'suffix', validWithRoot: false, resultWord: '', resultMeaning: '', seedsCount: 1 },
    ],
  },
];

export default function BaoGame({ items: _itemsProp, ageProfile, onFinish, onExit }: BaoGameProps) {
  const [indiceRodada, setIndiceRodada] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [combo, setCombo] = useState(0);
  const [sementesCapturadas, setSementesCapturadas] = useState(0);
  const [covaSelecionada, setCovaSelecionada] = useState<string | null>(null);
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [finalizado, setFinalizado] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const tabuleiroRef = useRef<HTMLDivElement>(null);

  const rodadaAtual = RODADAS_BAO[indiceRodada % RODADAS_BAO.length];

  useEffect(() => {
    inicioRodadaRef.current = Date.now();
    setCovaSelecionada(null);
    setSucessoMsg(null);
    setErroMsg(null);
  }, [indiceRodada]);

  const handleSemearCova = (pit: MorphemePit, event: React.MouseEvent) => {
    if (finalizado || covaSelecionada) return;

    setCovaSelecionada(pit.id);
    const correta = pit.id === rodadaAtual.targetAffixId;
    const duracao = Date.now() - inicioRodadaRef.current;

    outcomesRef.current.push({
      itemRef: `${rodadaAtual.root} + ${pit.affix}`,
      correct: correta,
      attempts: 1,
      ms: duracao,
    });

    if (correta) {
      // CAPTURA DE SEMENTES NO BAO (KULA!)
      play('combo');
      play('select');
      setCombo((c) => c + 1);

      const sementesGanhas = pit.seedsCount + 3;
      setSementesCapturadas((s) => s + sementesGanhas);
      const pts = 200 + (sementesGanhas * 25);
      setPontos((p) => p + pts);

      const rect = event.currentTarget.getBoundingClientRect();
      emitBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 'combo');

      setSucessoMsg(`Colheita Perfeita! Formou: ${pit.resultWord} (${pit.resultMeaning})`);
      pulsoDeZoom();
      flashDeTela();

      // Fala a palavra derivada em inglês
      try {
        speak(pit.resultWord, { lang: 'en-US' });
      } catch {
        // Ignora
      }

      setTimeout(() => {
        if (indiceRodada + 1 >= 5) {
          concluirJogo(true);
        } else {
          setIndiceRodada((r) => r + 1);
        }
      }, 1800);
    } else {
      // SEMEOU NA COVA INCORRETA!
      play('error');
      setCombo(0);
      setErroMsg(
        pit.validWithRoot
          ? `O afixo "${pit.affix}" existe com "${rodadaAtual.root}" (${pit.resultWord}), mas não atende à pista!`
          : `O afixo "${pit.affix}" não combina com a raiz "${rodadaAtual.root}"!`
      );
      if (tabuleiroRef.current) tremor(tabuleiroRef.current);

      setTimeout(() => {
        setCovaSelecionada(null);
      }, 1200);
    }
  };

  const concluirJogo = (venceu = true) => {
    setFinalizado(true);
    if (venceu) {
      play('fanfarra');
      comemorar('rodadaPerfeita');
    } else {
      play('error');
    }

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-md text-ink select-none overflow-y-auto">
      {/* Topo / Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/90 backdrop-blur-lg sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2.5 rounded-2xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95"
            title="Sair do Bao Mancala"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xl tracking-wide uppercase bg-gradient-to-r from-amber-600 to-amber-400 bg-clip-text text-transparent">
                Bao Mancala dos Morfemas
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-bold border border-amber-500/20">
                🌍 Swahili · África Oriental
              </span>
            </div>
            <p className="text-xs text-ink-muted hidden sm:block">
              Semeadura rítmica da raiz lexical para capturar as covas de afixos morfológicos!
            </p>
          </div>
        </div>

        {/* Status de Sementes, Combo e Pontos */}
        <div className="flex items-center gap-3 sm:gap-4">
          {combo > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-600 to-amber-500 text-white font-black text-xs shadow-lg animate-pulse">
              <Flame className="w-4 h-4 fill-current" />
              <span>{combo}x KULA COMBO</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Gem className="w-4 h-4 text-amber-500" />
            <span className="font-mono font-black text-base">{sementesCapturadas} sementes</span>
          </div>

          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-mono font-black text-base">{pontos} pts</span>
          </div>
        </div>
      </header>

      {/* Arena do Tabuleiro de Mancala */}
      <main className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center max-w-5xl mx-auto w-full">
        <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-10 shadow-2xl flex flex-col items-center space-y-6" ref={tabuleiroRef}>
          
          {/* PISTA SEMÂNTICA */}
          <div className="w-full max-w-2xl text-center space-y-2">
            <span className="text-xs font-mono uppercase tracking-widest text-amber-600 font-bold">
              Desafio Morfológico {indiceRodada + 1} de 5
            </span>
            <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-900 dark:text-amber-200">
              <p className="text-xs font-mono uppercase font-bold tracking-wider text-amber-600 mb-1">
                Pista do Significado Desejado:
              </p>
              <h3 className="font-display font-black text-xl sm:text-2xl text-ink">
                "{rodadaAtual.clue}"
              </h3>
            </div>
          </div>

          {/* O TABULEIRO FÍSICO DE MADEIRA DE BAO */}
          <div className="w-full max-w-3xl rounded-3xl border-4 border-amber-950/80 bg-gradient-to-b from-amber-950 to-amber-900 p-6 sm:p-8 shadow-2xl relative text-amber-50">
            {/* Decorações tribais entalhadas */}
            <div className="absolute top-2 left-3 text-amber-600/40 text-xs font-mono">BAO SWAHILI</div>
            <div className="absolute top-2 right-3 text-amber-600/40 text-xs font-mono">MWAMBA</div>

            {/* Raiz Lexical no Centro do Tabuleiro */}
            <div className="flex flex-col items-center justify-center py-4 border-b border-amber-800 mb-6">
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold flex items-center gap-1">
                <Sprout className="w-3.5 h-3.5" /> RAIZ LEXICAL (STEM)
              </span>
              <div className="font-display font-black text-5xl sm:text-6xl tracking-widest text-amber-200 drop-shadow-md">
                {rodadaAtual.root}
              </div>
              <span className="text-xs text-amber-300/80 font-medium mt-1">({rodadaAtual.rootMeaning})</span>
            </div>

            {/* As Covas Morfológicas de Afixos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {rodadaAtual.pits.map((pit) => {
                const selecionada = covaSelecionada === pit.id;
                const eCorreta = pit.id === rodadaAtual.targetAffixId;

                return (
                  <button
                    key={pit.id}
                    onClick={(e) => handleSemearCova(pit, e)}
                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center relative cursor-pointer shadow-inner ${
                      selecionada && eCorreta
                        ? 'border-emerald-400 bg-emerald-950/80 scale-105 shadow-lg'
                        : selecionada && !eCorreta
                        ? 'border-rose-400 bg-rose-950/80'
                        : 'border-amber-700/80 bg-amber-900/60 hover:border-amber-400 hover:bg-amber-800/80'
                    }`}
                  >
                    <span className="text-xs font-mono uppercase text-amber-400 font-bold mb-1">
                      {pit.type === 'prefix' ? 'Prefixo' : 'Sufixo'}
                    </span>
                    <span className="font-display font-black text-2xl text-amber-100 tracking-wider">
                      {pit.affix}
                    </span>

                    {/* Sementes / Pedras Preciosas dentro da Cova */}
                    <div className="flex items-center gap-1 mt-2">
                      {Array.from({ length: pit.seedsCount }).map((_, sIdx) => (
                        <span key={sIdx} className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm animate-pulse" />
                      ))}
                      <span className="text-[10px] font-mono font-bold text-amber-300 ml-1">
                        ({pit.seedsCount})
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* MENSAGENS DE FEEDBACK */}
          {sucessoMsg && (
            <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 font-bold text-center text-sm sm:text-base animate-scaleIn flex items-center gap-2 justify-center">
              <Check className="w-5 h-5" />
              <span>{sucessoMsg}</span>
            </div>
          )}

          {erroMsg && (
            <div className="p-4 rounded-2xl bg-error/15 border border-error/30 text-error font-bold text-center text-xs sm:text-sm animate-shake">
              {erroMsg}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
