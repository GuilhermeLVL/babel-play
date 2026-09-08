import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Gem, Check, Flame, Sprout, Lightbulb } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../../lib/profile';
import { play } from '../../../lib/soundFx';
import { speak } from '../../../lib/tts';
import { playJuicedHit, playJuicedError, playJuicedVictory, calculateMultiplier } from '../../../lib/gameFeel';

/**
 * BAO / MANCALA DOS MORFEMAS — Semeadura & Colheita Morfológica (Bao 🌍).
 *
 * Mapeado na Fase 3 de SLA (DeKeyser - automatização da formação de palavras).
 * Tabuleiro harmonizado com o design system do Babel Play, animações lúdicas e botão de dica.
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
  morphHint: string;
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
    morphHint: 'Procuramos um SUFIXO que transforma um verbo em agente de ação (-or / -er)!',
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
    morphHint: 'Procuramos um SUFIXO que significa "cheio de" cuidado (-ful)!',
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
    morphHint: 'Procuramos um SUFIXO nominal de profissão/agente (-er)!',
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
    morphHint: 'Procuramos um PREFIXO que significa "através / mudança radical" (trans-)!',
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
    morphHint: 'Procuramos um SUFIXO que indica "ausência total / sem" (-less)!',
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

export default function BaoGame({ items: _itemsProp, ageProfile: _ageProfile, onFinish, onExit }: BaoGameProps) {
  const [indiceRodada, setIndiceRodada] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [combo, setCombo] = useState(0);
  const [sementesCapturadas, setSementesCapturadas] = useState(0);
  const [covaSelecionada, setCovaSelecionada] = useState<string | null>(null);
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [finalizado, setFinalizado] = useState(false);
  
  // Dicas
  const [dicasRestantes, setDicasRestantes] = useState(3);
  const [dicaAberta, setDicaAberta] = useState(false);
  const [covasEliminadas, setCovasEliminadas] = useState<string[]>([]);

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
    setDicaAberta(false);
    setCovasEliminadas([]);
  }, [indiceRodada]);

  const usarDica = () => {
    if (dicasRestantes <= 0 || dicaAberta) return;
    play('click');
    play('select');
    setDicasRestantes((d) => d - 1);
    setDicaAberta(true);

    const incorreta = rodadaAtual.pits.find((p) => p.id !== rodadaAtual.targetAffixId && !covasEliminadas.includes(p.id));
    if (incorreta) {
      setCovasEliminadas((prev) => [...prev, incorreta.id]);
    }
  };

  const handleSemearCova = (pit: MorphemePit, event: React.MouseEvent) => {
    if (finalizado || covaSelecionada || covasEliminadas.includes(pit.id)) return;

    setCovaSelecionada(pit.id);
    const acertou = pit.id === rodadaAtual.targetAffixId;
    const duracao = Date.now() - inicioRodadaRef.current;

    outcomesRef.current.push({
      itemRef: `${rodadaAtual.root} + ${pit.affix}`,
      correct: acertou,
      attempts: 1,
      ms: duracao,
    });

    if (acertou) {
      const novoCombo = combo + 1;
      setCombo(novoCombo);
      const mult = calculateMultiplier(novoCombo);

      const sementesGanhas = pit.seedsCount + 3;
      setSementesCapturadas((s) => s + sementesGanhas);
      const pts = (200 + (sementesGanhas * 25)) * mult;
      setPontos((p) => p + pts);

      const rect = event.currentTarget.getBoundingClientRect();
      playJuicedHit(
        novoCombo,
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        `COLHEITA +${sementesGanhas}! ${mult}x`
      );

      setSucessoMsg(`Colheita Perfeita! Formou: ${pit.resultWord} (${pit.resultMeaning})`);

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
      setCombo(0);
      setErroMsg(
        pit.validWithRoot
          ? `O afixo "${pit.affix}" existe com "${rodadaAtual.root}" (${pit.resultWord}), mas não atende à pista!`
          : `O afixo "${pit.affix}" não combina com a raiz "${rodadaAtual.root}"!`
      );
      playJuicedError(tabuleiroRef.current, undefined, 'AFIXO INCORRETO');

      setTimeout(() => {
        setCovaSelecionada(null);
      }, 1200);
    }
  };

  const concluirJogo = (venceu = true) => {
    setFinalizado(true);
    if (venceu) {
      playJuicedVictory();
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
      {/* Header Limpo */}
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
              <span className="font-display font-black text-xl tracking-wide uppercase text-accent">
                Bao Mancala dos Morfemas
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent-soft text-accent-ink font-bold border border-accent/20">
                🌍 Swahili · África Oriental
              </span>
            </div>
            <p className="text-xs text-ink-muted hidden sm:block">
              Semeadura rítmica da raiz lexical para capturar as covas de afixos morfológicos!
            </p>
          </div>
        </div>

        {/* Status & Dica */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={usarDica}
            disabled={dicasRestantes <= 0 || dicaAberta}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover font-bold text-xs text-ink transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            title="Receber dica morfológica"
          >
            <Lightbulb className="w-4 h-4 text-accent" />
            <span>Dica ({dicasRestantes})</span>
          </button>

          {combo > 1 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-accent-contrast font-black text-xs shadow-md animate-pulse">
              <Flame className="w-4 h-4 fill-current" />
              <span>{combo}x KULA COMBO</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Gem className="w-4 h-4 text-accent" />
            <span className="font-mono font-black text-base">{sementesCapturadas} sementes</span>
          </div>

          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl border border-border-subtle bg-surface shadow-sm">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="font-mono font-black text-base">{pontos} pts</span>
          </div>
        </div>
      </header>

      {/* Arena do Tabuleiro */}
      <main className="flex-1 p-4 sm:p-8 flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
        <div className="w-full bg-surface border-2 border-border-subtle rounded-3xl p-6 sm:p-10 shadow-card flex flex-col items-center space-y-6" ref={tabuleiroRef}>
          
          {/* PISTA SEMÂNTICA */}
          <div className="w-full max-w-xl text-center space-y-2">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2 text-xs font-mono">
              <span className="text-accent font-bold uppercase tracking-wider">Desafio Morfológico</span>
              <span className="text-ink-muted">Rodada {indiceRodada + 1} de 5</span>
            </div>

            <div className="p-4 rounded-2xl bg-surface-hover border border-border-subtle text-ink">
              <p className="text-xs font-mono uppercase font-bold tracking-wider text-accent mb-1">
                Pista do Significado Desejado:
              </p>
              <h3 className="font-display font-black text-xl sm:text-2xl text-ink">
                "{rodadaAtual.clue}"
              </h3>
            </div>
          </div>

          {/* DICA MORFOLÓGICA */}
          {dicaAberta && (
            <div className="w-full max-w-xl p-4 rounded-2xl bg-accent-soft/40 border border-accent/30 text-ink text-xs sm:text-sm font-medium flex items-center gap-3 animate-fadeIn">
              <Lightbulb className="w-5 h-5 text-accent shrink-0" />
              <div>
                <strong className="text-accent-ink block font-bold">Pista Morfológica:</strong>
                <span>{rodadaAtual.morphHint}</span>
              </div>
            </div>
          )}

          {/* O TABULEIRO LIMPO DO BAO MANCALA */}
          <div className="w-full max-w-2xl rounded-3xl border-2 border-border-subtle bg-surface-hover/70 p-6 sm:p-8 shadow-sm relative text-ink">
            {/* Raiz Lexical Central com Animação Saltitante */}
            <div className="flex flex-col items-center justify-center py-3 border-b border-border-subtle mb-6">
              <span className="text-[10px] font-mono uppercase tracking-widest text-accent font-bold mb-1 flex items-center gap-1">
                <Sprout className="w-3.5 h-3.5" /> Raiz Lexical (Stem)
              </span>
              <div className="flex items-center justify-center gap-2">
                <span className="text-3xl animate-bounce">🌱</span>
                <div className="font-display font-black text-5xl sm:text-6xl tracking-widest text-ink">
                  {rodadaAtual.root}
                </div>
              </div>
              <span className="text-xs text-ink-muted font-bold mt-1">({rodadaAtual.rootMeaning})</span>
            </div>

            {/* As Covas Morfológicas de Afixos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {rodadaAtual.pits.map((pit) => {
                const selecionada = covaSelecionada === pit.id;
                const eCorreta = pit.id === rodadaAtual.targetAffixId;
                const eliminada = covasEliminadas.includes(pit.id);

                if (eliminada) {
                  return (
                    <div
                      key={pit.id}
                      className="p-4 rounded-2xl border-2 border-border-subtle bg-surface/30 opacity-40 flex flex-col items-center justify-center text-center cursor-not-allowed"
                    >
                      <span className="text-xs line-through font-bold text-ink-muted">{pit.affix}</span>
                      <span className="text-[9px] text-error font-mono mt-1">Eliminada ❌</span>
                    </div>
                  );
                }

                return (
                  <button
                    key={pit.id}
                    onClick={(e) => handleSemearCova(pit, e)}
                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center relative cursor-pointer shadow-sm ${
                      selecionada && eCorreta
                        ? 'border-good bg-good-soft/80 scale-105 shadow-md text-good-ink'
                        : selecionada && !eCorreta
                        ? 'border-error bg-error/10 text-error'
                        : 'border-border-subtle bg-surface hover:border-accent hover:bg-accent-soft/20 text-ink'
                    }`}
                  >
                    <span className="text-[10px] font-mono uppercase text-ink-muted font-bold mb-1">
                      {pit.type === 'prefix' ? 'Prefixo' : 'Sufixo'}
                    </span>
                    <span className="font-display font-black text-2xl sm:text-3xl tracking-wider text-ink group-hover:text-accent group-hover:scale-110 transition-transform">
                      {pit.affix}
                    </span>

                    {/* Sementes dentro da Cova */}
                    <div className="flex items-center gap-1 mt-2">
                      {Array.from({ length: pit.seedsCount }).map((_, sIdx) => (
                        <span key={sIdx} className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse" />
                      ))}
                      <span className="text-[10px] font-mono font-bold text-ink-muted ml-1">
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
            <div className="p-4 rounded-2xl bg-good-soft/80 border border-good/30 text-good-ink font-bold text-center text-sm sm:text-base animate-scaleIn flex items-center gap-2 justify-center">
              <Check className="w-5 h-5 text-good" />
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
