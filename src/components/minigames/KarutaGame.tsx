import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Volume2, Sparkles, Award, Timer as TimerIcon, Zap, RotateCcw } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, tremor, flashDeTela, multiplicador } from '../../lib/juice';
import { emitBurst } from '../../lib/effects';
import { speak } from '../../lib/tts';

/**
 * KARUTA GAME — Reflexo auditivo e pareamento áudio-visual em alta velocidade.
 *
 * Inspirado no Kyōgi Karuta tradicional japonês. O narrador/áudio recita a palavra ou
 * frase alvo. O jogador deve golpear a carta correspondente na mesa antes que o tempo
 * se esgote. Se acertar nas primeiras sílabas (Kimariji), ganha bônus de 3x pontos.
 */

interface KarutaCardState {
  id: string;
  itemIndex: number;
  targetText: string;
  prompt: string;
  lang: string;
  rotation: number;
  color: string;
  status: 'active' | 'correct' | 'wrong' | 'collected';
}

interface KarutaGameProps {
  items?: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

const PALETA_CARTAS = [
  '#2C2D35', '#243447', '#1F3A2E', '#3D2826', '#34263E',
  '#2B3942', '#363426', '#3A2834', '#28363D', '#323428'
];

/** Mock inteligente caso o baralho do usuário tenha poucos itens no teste */
const MOCK_ITEMS_KARUTA: MinigameItem[] = [
  { prompt: 'Água', answer: 'Water', lang: 'en-US', sentence: 'Fresh cold water' },
  { prompt: 'Livro', answer: 'Book', lang: 'en-US', sentence: 'An old leather book' },
  { prompt: 'Noite', answer: 'Night', lang: 'en-US', sentence: 'A silent dark night' },
  { prompt: 'Coração', answer: 'Heart', lang: 'en-US', sentence: 'Listen to your heart' },
  { prompt: 'Sol', answer: 'Sun', lang: 'en-US', sentence: 'The sun rises in the east' },
  { prompt: 'Lua', answer: 'Moon', lang: 'en-US', sentence: 'The moon shines bright' },
  { prompt: 'Fogo', answer: 'Fire', lang: 'en-US', sentence: 'A warm winter fire' },
  { prompt: 'Tempo', answer: 'Time', lang: 'en-US', sentence: 'Time flies so fast' },
];

export default function KarutaGame({ items: itemsProp, ageProfile, onFinish, onExit }: KarutaGameProps) {
  const items = useMemo(() => {
    if (itemsProp && itemsProp.length >= 4) return itemsProp;
    return MOCK_ITEMS_KARUTA;
  }, [itemsProp]);

  const tempoPorRodada = ageProfile === 'senior' ? 12 : ageProfile === 'kids' ? 10 : 7;
  const [cartas, setCartas] = useState<KarutaCardState[]>([]);
  const [indiceAtual, setIndiceAtual] = useState(0);
  const [pontos, setPontos] = useState(0);
  const [combo, setCombo] = useState(0);
  const [tempoRestante, setTempoRestante] = useState(tempoPorRodada);
  const [estaFalando, setEstaFalando] = useState(false);
  const [kimarijiAtivo, setKimarijiAtivo] = useState(true);
  const [jogoFinalizado, setJogoFinalizado] = useState(false);

  const outcomesRef = useRef<ItemOutcome[]>([]);
  const inicioPartidaRef = useRef(Date.now());
  const inicioCartaRef = useRef(Date.now());
  const tentativasCartaRef = useRef(0);
  const arenaRef = useRef<HTMLDivElement>(null);

  // Inicializa a mesa de cartas
  useEffect(() => {
    const novasCartas: KarutaCardState[] = items.map((it, idx) => ({
      id: `karuta-${idx}`,
      itemIndex: idx,
      targetText: it.answer,
      prompt: it.prompt,
      lang: it.lang || 'en-US',
      rotation: (Math.random() * 8) - 4, // leve inclinação realista de mesa de cartas
      color: PALETA_CARTAS[idx % PALETA_CARTAS.length],
      status: 'active',
    }));
    setCartas(novasCartas);
    setIndiceAtual(0);
    setPontos(0);
    setCombo(0);
    outcomesRef.current = [];
    inicioPartidaRef.current = Date.now();
    inicioCartaRef.current = Date.now();
  }, [items]);

  const itemAlvoAtual = items[indiceAtual];

  // Dispara a leitura em voz alta da palavra/frase atual
  const tocarVoz = (item: MinigameItem) => {
    if (!item) return;
    setEstaFalando(true);
    setKimarijiAtivo(true);
    play('speak');
    try {
      speak(item.answer, { lang: item.lang || 'en-US' });
    } catch {
      // Degradação graciosa caso speech synthesis esteja bloqueada
    }
    // Janela de Kimariji: nos primeiros 1.8 segundos o acerto dá bônus triplo!
    setTimeout(() => {
      setKimarijiAtivo(false);
      setEstaFalando(false);
    }, 1800);
  };

  // Quando muda de carta alvo
  useEffect(() => {
    if (!itemAlvoAtual || jogoFinalizado) return;
    inicioCartaRef.current = Date.now();
    tentativasCartaRef.current = 0;
    setTempoRestante(tempoPorRodada);
    tocarVoz(itemAlvoAtual);
  }, [indiceAtual, itemAlvoAtual, jogoFinalizado, tempoPorRodada]);

  // Loop do relógio
  useEffect(() => {
    if (jogoFinalizado) return;
    const timer = setInterval(() => {
      setTempoRestante((prev) => {
        if (prev <= 1) {
          // Tempo esgotou para esta carta
          tratarErroOuTimeout(true);
          return tempoPorRodada;
        }
        if (prev <= 3) play('tick');
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [indiceAtual, jogoFinalizado, tempoPorRodada]);

  const tratarErroOuTimeout = (timeout = false) => {
    tentativasCartaRef.current += 1;
    play('error');
    if (arenaRef.current) tremor(arenaRef.current);
    setCombo(0);

    outcomesRef.current.push({
      cardId: itemAlvoAtual?.cardId,
      itemRef: itemAlvoAtual?.answer,
      correct: false,
      attempts: tentativasCartaRef.current,
      ms: Date.now() - inicioCartaRef.current,
      revealed: timeout,
    });

    avancarProximaCarta();
  };

  const avancarProximaCarta = () => {
    if (indiceAtual + 1 >= items.length) {
      finalizarPartida();
    } else {
      setIndiceAtual((prev) => prev + 1);
    }
  };

  const finalizarPartida = () => {
    setJogoFinalizado(true);
    play('fanfarra');
    comemorar('rodadaPerfeita');
    const duracaoTotal = Date.now() - inicioPartidaRef.current;
    const report: RoundReport = {
      gameId: 'blitz' as any, // Mapeado para relatório compatível
      items: outcomesRef.current,
      score: pontos,
      durationMs: duracaoTotal,
    };
    setTimeout(() => {
      onFinish(report);
    }, 1800);
  };

  // Manipulador do toque / "Slap" na carta
  const handleSlapCarta = (carta: KarutaCardState, event: React.MouseEvent) => {
    if (jogoFinalizado || carta.status === 'collected') return;

    const tempoResposta = Date.now() - inicioCartaRef.current;
    tentativasCartaRef.current += 1;

    if (carta.itemIndex === indiceAtual) {
      // ACERTOU! "SLAP!"
      const acertouNoKimariji = kimarijiAtivo;
      const multiplicadorPontos = acertouNoKimariji ? 3 : 1;
      const pts = (100 + (combo * 20)) * multiplicadorPontos;

      setPontos((p) => p + pts);
      setCombo((c) => c + 1);
      play('success');

      if (acertouNoKimariji) {
        play('levelUp');
        flashDeTela();
      }

      // Emite partículas de impacto exatamente onde a carta foi tocada
      const rect = event.currentTarget.getBoundingClientRect();
      emitBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 'combo');

      // Marca carta como recolhida
      setCartas((prev) =>
        prev.map((c) =>
          c.id === carta.id ? { ...c, status: 'collected' } : c
        )
      );

      outcomesRef.current.push({
        cardId: itemAlvoAtual.cardId,
        itemRef: itemAlvoAtual.answer,
        correct: true,
        attempts: tentativasCartaRef.current,
        ms: tempoResposta,
        hinted: !acertouNoKimariji,
      });

      avancarProximaCarta();
    } else {
      // ERROU! Tocou na carta errada
      setCartas((prev) =>
        prev.map((c) =>
          c.id === carta.id ? { ...c, status: 'wrong' } : c
        )
      );
      play('error');
      if (arenaRef.current) tremor(arenaRef.current);
      setCombo(0);

      setTimeout(() => {
        setCartas((prev) =>
          prev.map((c) => (c.id === carta.id ? { ...c, status: 'active' } : c))
        );
      }, 600);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden" ref={arenaRef}>
      {/* Barra de Topo do Jogo */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors"
            title="Sair do Karuta"
            aria-label="Sair"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg tracking-wide uppercase text-accent">Karuta</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink font-semibold">Audio-Slap</span>
            </div>
            <p className="text-xs text-ink-muted">Ouça o chamado e golpeie a carta correta!</p>
          </div>
        </div>

        {/* Status de Pontos, Combo e Kimariji */}
        <div className="flex items-center gap-4">
          {kimarijiAtivo && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30 text-xs font-bold animate-pulse">
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>BÔNUS KIMARIJI (3x)</span>
            </div>
          )}

          {combo > 1 && (
            <div className="flex items-center gap-1 px-3 py-1 rounded-xl bg-accent text-accent-contrast font-black text-sm shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{combo}x COMBO</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <Award className="w-4 h-4 text-accent" />
            <span className="font-mono font-bold text-base">{pontos}</span>
          </div>

          {/* Anel do Cronômetro */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface">
            <TimerIcon className={`w-4 h-4 ${tempoRestante <= 3 ? 'text-error animate-spin' : 'text-ink-muted'}`} />
            <span className={`font-mono font-bold ${tempoRestante <= 3 ? 'text-error font-black' : 'text-ink'}`}>
              {tempoRestante}s
            </span>
          </div>
        </div>
      </header>

      {/* Faixa Central do Chamador (O "Cantor" do Karuta) */}
      <div className="px-6 py-4 bg-surface/50 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => itemAlvoAtual && tocarVoz(itemAlvoAtual)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-accent-contrast font-bold shadow-card hover:opacity-95 active:scale-95 transition-all"
            aria-label="Repetir áudio da palavra"
          >
            <Volume2 className={`w-5 h-5 ${estaFalando ? 'animate-bounce' : ''}`} />
            <span>Repetir Áudio</span>
          </button>
          <div className="text-sm">
            <span className="text-ink-muted">Pista conceitual: </span>
            <span className="font-bold text-ink underline decoration-accent decoration-2 underline-offset-4">
              {itemAlvoAtual?.prompt}
            </span>
          </div>
        </div>

        <div className="text-xs font-mono text-ink-muted">
          Carta {indiceAtual + 1} de {items.length}
        </div>
      </div>

      {/* Arena / Tatame de Cartas */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto flex items-center justify-center">
        <div className="w-full max-w-5xl grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-6 justify-items-center">
          {cartas.map((carta) => {
            const ehColetada = carta.status === 'collected';
            const ehErro = carta.status === 'wrong';

            return (
              <button
                key={carta.id}
                onClick={(e) => handleSlapCarta(carta, e)}
                disabled={ehColetada || jogoFinalizado}
                style={{
                  transform: `rotate(${carta.rotation}deg)`,
                }}
                className={`group relative w-full aspect-[4/3] max-w-[220px] rounded-2xl p-4 flex flex-col justify-between items-center text-center transition-all duration-200 border-2 shadow-card select-none
                  ${ehColetada 
                    ? 'opacity-0 scale-75 pointer-events-none' 
                    : ehErro 
                    ? 'border-error bg-error-soft text-error-ink animate-shake' 
                    : 'border-border-subtle bg-surface hover:border-accent hover:-translate-y-1 active:scale-95'
                  }`}
              >
                {/* Marcador decorativo estilo carta japonesa tradicional */}
                <div className="w-full flex justify-between items-center text-[10px] text-ink-muted uppercase font-mono tracking-widest">
                  <span>KARUTA</span>
                  <span className="w-2 h-2 rounded-full bg-accent/40 group-hover:bg-accent transition-colors" />
                </div>

                {/* Texto Central da Carta (Palavra no idioma de aprendizado) */}
                <div className="font-display font-black text-xl sm:text-2xl text-ink group-hover:text-accent transition-colors">
                  {carta.targetText}
                </div>

                {/* Indicador de rodapé */}
                <div className="text-[10px] text-ink-faint font-sans">
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
