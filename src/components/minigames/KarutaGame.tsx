import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Volume2, Sparkles, Award, Timer as TimerIcon, Zap, RotateCcw, Flame, Lightbulb } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, flashDeTela, multiplicador } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { speak } from '../../lib/tts';
import { playJuicedHit, playJuicedError, playJuicedVictory, calculateMultiplier } from '../../lib/gameFeel';

/**
 * KARUTA GAME — Reflexo auditivo, varredura visual e pareamento áudio-espacial.
 *
 * Inspirado no Kyōgi Karuta tradicional japonês.
 * As cartas são espalhadas e embaralhadas no tatame com cartas distratoras (decoys).
 * O narrador vocaliza a palavra-alvo. O jogador deve varrer a mesa visualmente
 * e golpear a carta certa antes que o tempo esgote.
 *
 * Bônus Kimariji: ao bater nas primeiras sílabas (primeiros 1.8s), ganha combo 3x e fanfarra!
 */

interface TatamiCard {
  id: string;
  itemRef: string;
  text: string;
  prompt: string;
  lang: string;
  isTarget: boolean;
  rotation: number;
  offsetY: number;
  offsetX: number;
  status: 'idle' | 'slapped' | 'wrong' | 'collected';
}

interface KarutaGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const DECOY_POOL: MinigameItem[] = [
  { prompt: 'Vento', answer: 'Wind', lang: 'en-US' },
  { prompt: 'Estrela', answer: 'Star', lang: 'en-US' },
  { prompt: 'Rio', answer: 'River', lang: 'en-US' },
  { prompt: 'Chuva', answer: 'Rain', lang: 'en-US' },
  { prompt: 'Montanha', answer: 'Mountain', lang: 'en-US' },
  { prompt: 'Céu', answer: 'Sky', lang: 'en-US' },
  { prompt: 'Flor', answer: 'Flower', lang: 'en-US' },
  { prompt: 'Pássaro', answer: 'Bird', lang: 'en-US' },
];

const MOCK_TARGETS: MinigameItem[] = [
  { prompt: 'Água', answer: 'Water', lang: 'en-US' },
  { prompt: 'Fogo', answer: 'Fire', lang: 'en-US' },
  { prompt: 'Noite', answer: 'Night', lang: 'en-US' },
  { prompt: 'Sol', answer: 'Sun', lang: 'en-US' },
  { prompt: 'Livro', answer: 'Book', lang: 'en-US' },
  { prompt: 'Coração', answer: 'Heart', lang: 'en-US' },
];

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function KarutaGame({ items: itemsProp, ageProfile, onFinish, onExit }: KarutaGameProps) {
  // Itens alvo da partida
  const targetItems = useMemo<MinigameItem[]>(() => {
    if (itemsProp && itemsProp.length >= 4) {
      return shuffleArray(itemsProp).slice(0, 8);
    }
    return MOCK_TARGETS;
  }, [itemsProp]);

  // Pool expandido com distratores para o tatame
  const allPool = useMemo<MinigameItem[]>(() => {
    const combined = [...targetItems, ...DECOY_POOL];
    const uniqueMap = new Map<string, MinigameItem>();
    combined.forEach((item) => uniqueMap.set(item.answer.toLowerCase(), item));
    return Array.from(uniqueMap.values());
  }, [targetItems]);

  const tempoLimite = ageProfile === 'senior' ? 12 : ageProfile === 'kids' ? 10 : 8;
  const [indiceAlvo, setIndiceAlvo] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [combo, setCombo] = useState(0);
  const [tempo, setTempo] = useState(tempoLimite);
  const [cartasMesa, setCartasMesa] = useState<TatamiCard[]>([]);
  const [kimarijiAtivo, setKimarijiAtivo] = useState(true);
  const [estaNarrando, setEstaNarrando] = useState(false);
  const [finalizado, setFinalizado] = useState(false);

  // Dicas & Ajuda
  const [dicasRestantes, setDicasRestantes] = useState(3);
  const [dicaAberta, setDicaAberta] = useState(false);
  const [dicaTexto, setDicaTexto] = useState<string | null>(null);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioRodadaRef = useRef(Date.now());
  const tentativasRodadaRef = useRef(0);
  const tatamiRef = useRef<HTMLDivElement>(null);

  const itemAlvo = targetItems[indiceAlvo];

  const usarDica = () => {
    if (dicasRestantes <= 0 || dicaAberta || !itemAlvo) return;
    play('click');
    setDicasRestantes((prev) => prev - 1);
    setDicaAberta(true);

    // Elimina 2 distratores incorretos da mesa
    const decoys = cartasMesa.filter((c) => !c.isTarget && c.status === 'idle');
    const toEliminate = shuffleArray(decoys).slice(0, 2).map((c) => c.id);

    setCartasMesa((prev) =>
      prev.map((c) => (toEliminate.includes(c.id) ? { ...c, status: 'wrong' } : c))
    );

    const primeiraLetra = itemAlvo.answer.charAt(0).toUpperCase();
    setDicaTexto(`Pista: A palavra correta em inglês começa com a letra "${primeiraLetra}"!`);
    play('levelUp');
  };

  // Monta a mesa de cartas espalhadas aleatoriamente a cada rodada
  const montarTatame = (alvo: MinigameItem) => {
    if (!alvo) return;
    
    // Pega o alvo + 7 distratores
    const distratores = shuffleArray(allPool.filter((i) => i.answer.toLowerCase() !== alvo.answer.toLowerCase())).slice(0, 7);
    const mesaItens = shuffleArray([alvo, ...distratores]);

    const novasCartas: TatamiCard[] = mesaItens.map((item, idx) => ({
      id: `tatami-${item.answer}-${idx}-${Date.now()}`,
      itemRef: item.answer,
      text: item.answer,
      prompt: item.prompt,
      lang: item.lang || 'en-US',
      isTarget: item.answer.toLowerCase() === alvo.answer.toLowerCase(),
      rotation: (Math.random() * 14) - 7, // leve rotação realista de mesa de cartas japonesa
      offsetX: (Math.random() * 8) - 4,
      offsetY: (Math.random() * 8) - 4,
      status: 'idle',
    }));

    setCartasMesa(novasCartas);
  };

  const narrarAlvo = (item: MinigameItem) => {
    if (!item) return;
    setEstaNarrando(true);
    setKimarijiAtivo(true);
    play('speak');

    try {
      speak(item.answer, { lang: item.lang || 'en-US' });
    } catch {
      // Degradação graciosa
    }

    // Janela do Kimariji: nos primeiros 1.8 segundos o reflexo pontua 3x!
    setTimeout(() => {
      setKimarijiAtivo(false);
      setEstaNarrando(false);
    }, 1800);
  };

  // Início de rodada / troca de alvo
  useEffect(() => {
    if (!itemAlvo || finalizado) return;
    inicioRodadaRef.current = Date.now();
    tentativasRodadaRef.current = 0;
    setTempo(tempoLimite);
    setDicaAberta(false);
    setDicaTexto(null);

    montarTatame(itemAlvo);
    narrarAlvo(itemAlvo);
  }, [indiceAlvo, itemAlvo, finalizado, tempoLimite]);

  // Cronômetro da rodada
  useEffect(() => {
    if (finalizado) return;
    const timer = setInterval(() => {
      setTempo((prev) => {
        if (prev <= 1) {
          tratarTimeout();
          return tempoLimite;
        }
        if (prev <= 3) play('tick');
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [indiceAlvo, finalizado, tempoLimite]);

  const tratarTimeout = () => {
    tentativasRodadaRef.current += 1;
    play('error');
    if (tatamiRef.current) tremor(tatamiRef.current);
    setCombo(0);

    outcomesRef.current.push({
      itemRef: itemAlvo.answer,
      correct: false,
      attempts: tentativasRodadaRef.current,
      ms: Date.now() - inicioRodadaRef.current,
      revealed: true,
    });

    avancarProximoAlvo();
  };

  const avancarProximoAlvo = () => {
    if (indiceAlvo + 1 >= targetItems.length) {
      concluirJogo();
    } else {
      setIndiceAlvo((prev) => prev + 1);
    }
  };

  const concluirJogo = () => {
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

  // Disparo do "Slap" / Golpe na carta
  const handleSlap = (carta: TatamiCard, event: React.MouseEvent) => {
    if (finalizado || carta.status !== 'idle') return;

    tentativasRodadaRef.current += 1;
    const tempoGasto = Date.now() - inicioRodadaRef.current;

    if (carta.isTarget) {
      // ACERTOU! GOLPE CERTEIRO NO TATAME
      const kimarijiHit = kimarijiAtivo;
      const novoCombo = combo + 1;
      const multiplicadorPontos = kimarijiHit ? 3 : calculateMultiplier(novoCombo);
      const pts = (120 + (combo * 25)) * multiplicadorPontos;

      setPontos((p) => p + pts);
      setCombo(novoCombo);

      // Efeito de partícula de impacto e pitch progressivo
      const rect = event.currentTarget.getBoundingClientRect();
      playJuicedHit(
        novoCombo,
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        kimarijiHit ? 'KIMARIJI 3x!' : `SLAP! +${pts}`
      );

      // Animação de Slap: carta voa com rotação e deslize
      setCartasMesa((prev) =>
        prev.map((c) => (c.id === carta.id ? { ...c, status: 'slapped' } : c))
      );

      outcomesRef.current.push({
        itemRef: itemAlvo.answer,
        correct: true,
        attempts: tentativasRodadaRef.current,
        ms: tempoGasto,
        hinted: !kimarijiHit,
      });

      setTimeout(() => {
        avancarProximoAlvo();
      }, 500);
    } else {
      // ERROU! Golpes em cartas erradas geram penalidade e tremor
      setCombo(0);
      playJuicedError(tatamiRef.current, undefined, 'OTETSURI! (FALTA)');

      setCartasMesa((prev) =>
        prev.map((c) => (c.id === carta.id ? { ...c, status: 'wrong' } : c))
      );

      setTimeout(() => {
        setCartasMesa((prev) =>
          prev.map((c) => (c.id === carta.id ? { ...c, status: 'idle' } : c))
        );
      }, 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden" ref={tatamiRef}>
      {/* Header Superior com Status de Jogo */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            title="Sair do Karuta"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Karuta Arena</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink font-semibold">Audio-Slap 競技かるた</span>
            </div>
            <p className="text-xs text-ink-muted">Varra o tatame visualmente e golpeie a carta correta antes do tempo zerar!</p>
          </div>
        </div>

        {/* Indicadores de Pontuação, Combo, Dica e Tempo */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={usarDica}
            disabled={dicasRestantes <= 0 || dicaAberta}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            title="Eliminar 2 cartas incorretas e revelar letra inicial"
          >
            <Lightbulb className="w-3.5 h-3.5 text-accent" />
            <span>Dica ({dicasRestantes})</span>
          </button>

          {kimarijiAtivo && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30 text-xs font-black animate-pulse">
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>KIMARIJI (3x)</span>
            </div>
          )}

          {combo > 1 && (
            <div className="flex items-center gap-1 px-3 py-1 rounded-xl bg-accent text-accent-contrast font-black text-sm shadow-sm">
              <Flame className="w-3.5 h-3.5 fill-current" />
              <span>{combo}x COMBO</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <Award className="w-4 h-4 text-accent" />
            <span className="font-mono font-bold text-base">{pontos}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <TimerIcon className={`w-4 h-4 ${tempo <= 3 ? 'text-error animate-spin' : 'text-ink-muted'}`} />
            <span className={`font-mono font-black ${tempo <= 3 ? 'text-error text-lg' : 'text-ink'}`}>
              {tempo}s
            </span>
          </div>
        </div>
      </header>

      {/* Faixa de Leitura: O "Chamador" do Tatame */}
      <div className="px-6 py-4 bg-surface/80 border-b border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => itemAlvo && narrarAlvo(itemAlvo)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-accent-contrast font-bold text-sm shadow-card hover:opacity-95 active:scale-95 transition-all cursor-pointer"
            aria-label="Repetir áudio do chamado"
          >
            <Volume2 className={`w-5 h-5 ${estaNarrando ? 'animate-bounce text-white' : ''}`} />
            <span>Ouvir Chamado</span>
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-xl animate-bounce">🎴</span>
            <div className="text-sm">
              <span className="text-ink-muted">Significado em português: </span>
              <span className="font-black text-ink text-base underline decoration-accent decoration-2 underline-offset-4">
                {itemAlvo?.prompt}
              </span>
            </div>
          </div>
        </div>

        {dicaTexto && (
          <div className="px-3.5 py-1.5 rounded-xl bg-accent-soft text-accent-ink text-xs font-bold flex items-center gap-2 animate-fadeIn border border-accent/30">
            <Lightbulb className="w-3.5 h-3.5 text-accent animate-bounce" />
            <span>{dicaTexto}</span>
          </div>
        )}

        <div className="text-xs font-mono text-ink-muted">
          Carta {indiceAlvo + 1} de {targetItems.length}
        </div>
      </div>

      {/* Arena do Tatame: Cartas Espalhadas com Física Orgânica */}
      <main className="flex-1 p-6 sm:p-10 overflow-y-auto flex items-center justify-center bg-radial from-surface/20 to-canvas">
        <div className="w-full max-w-5xl grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 justify-items-center">
          {cartasMesa.map((carta) => {
            const ehSlap = carta.status === 'slapped';
            const ehErro = carta.status === 'wrong';

            return (
              <button
                key={carta.id}
                onClick={(e) => handleSlap(carta, e)}
                disabled={ehSlap || finalizado}
                style={{
                  transform: `rotate(${carta.rotation}deg) translate(${carta.offsetX}px, ${carta.offsetY}px) ${
                    ehSlap ? 'scale(1.25) translateY(-30px)' : ''
                  }`,
                }}
                className={`group relative w-full aspect-[4/3] max-w-[210px] rounded-2xl p-4 flex flex-col justify-between items-center text-center transition-all duration-200 border-2 shadow-card select-none cursor-pointer
                  ${
                    ehSlap
                      ? 'border-good bg-good text-white opacity-0 transition-all duration-500 pointer-events-none'
                      : ehErro
                      ? 'border-error bg-error-soft text-error-ink animate-shake'
                      : 'border-border-subtle bg-surface hover:border-accent hover:-translate-y-1.5 active:scale-90 hover:shadow-lg'
                  }`}
              >
                {/* Detalhe de estilo japonês tradicional */}
                <div className="w-full flex justify-between items-center text-[10px] text-ink-muted uppercase font-mono tracking-widest">
                  <span>百人一首</span>
                  <span className="w-2 h-2 rounded-full bg-accent/40 group-hover:bg-accent transition-colors" />
                </div>

                {/* Texto da Carta (Alvo ou Decoy) */}
                <div className="font-display font-black text-xl sm:text-2xl text-ink group-hover:text-accent transition-colors">
                  {carta.text}
                </div>

                {/* Rótulo inferior */}
                <div className="text-[10px] text-ink-faint font-mono">
                  {carta.lang}
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
