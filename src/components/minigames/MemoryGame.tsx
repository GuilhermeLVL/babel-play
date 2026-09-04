import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Eye } from 'lucide-react';
import type { MinigameItem, ItemOutcome, RoundReport } from '@core';
import { scoreRound } from '@core';
import { direcaoDoTexto } from '../../lib/languages';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { comemorar, pontosDoElemento, multiplicador } from '../../lib/juice';
import { playJuicedHit, playJuicedError, playJuicedVictory, triggerHaptic } from '../../lib/gameFeel';

import { speak } from '../../lib/tts';
import { emitBurst } from '../../lib/effects';
import { Sparkles, Flame } from 'lucide-react';

interface MemoryGameProps {
  items: MinigameItem[];
  ageProfile: AgeProfileType;
  onFinish: (report: RoundReport) => void;
  onExit: () => void;
}

/** Uma carta na mesa: a frente (palavra) ou o verso (tradução) de um item. */
interface Carta {
  id: string;
  itemIndex: number;
  texto: string;
  lado: 'palavra' | 'traducao';
  lang: string;
}

/** Cores das duplas — a mesma paleta categórica usada para as pessoas na captura. */
const CORES = ['#7C3AED', '#0284C7', '#10B981', '#F59E0B', '#EF4444', '#E91E63', '#14B8A6', '#8B5CF6'];

export default function MemoryGame({ items, ageProfile, onFinish, onExit }: MemoryGameProps) {
  const folgado = ageProfile !== 'pro';

  /** Baralho embaralhado UMA vez (por rodada) — reembaralhar a cada render arruinaria o jogo. */
  const cartas = useMemo<Carta[]>(() => {
    const baralho: Carta[] = [];
    items.forEach((it, i) => {
      // A palavra está no idioma praticado; a pista, no nativo. As direções podem diferir.
      baralho.push({ id: `p${i}`, itemIndex: i, texto: it.answer, lado: 'palavra', lang: it.lang });
      baralho.push({ id: `t${i}`, itemIndex: i, texto: it.prompt, lado: 'traducao', lang: '' });
    });
    for (let i = baralho.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [baralho[i], baralho[j]] = [baralho[j], baralho[i]];
    }
    return baralho;
  }, [items]);

  const [viradas, setViradas] = useState<string[]>([]);
  const [fechados, setFechados] = useState<Set<number>>(new Set());
  const [travado, setTravado] = useState(false);
  /** Pares fechados em seguida, sem nenhum erro no meio — é o que alimenta o multiplicador. */
  const [sequencia, setSequencia] = useState(0);
  const [pontos, setPontos] = useState(0);
  /** Espiada usada: mostra todas as cartas por um instante e marca os itens como "com dica". */
  const [espiando, setEspiando] = useState(false);
  const espiadasRef = useRef(0);
  const comDicaRef = useRef(false);
  /** Tentativas por item — é o que vira a nota (1 de primeira = 3; muitas = 1). */
  const tentativasRef = useRef<Map<number, number>>(new Map());
  const inicioRef = useRef<number>(Date.now());
  const inicioItemRef = useRef<Map<number, number>>(new Map());
  const mesaRef = useRef<HTMLDivElement | null>(null);

  const total = items.length;
  const ESPIADAS = 2; // duas por rodada: ajuda quem travou, sem virar o jogo inteiro

  // Rodada terminada: celebra com confetes 3D e monta o relatório uma única vez.
  const jaFinalizouRef = useRef(false);
  useEffect(() => {
    if (fechados.size !== total || total === 0 || jaFinalizouRef.current) return;
    jaFinalizouRef.current = true;
    const agora = Date.now();
    const outcomes: ItemOutcome[] = items.map((it, i) => ({
      cardId: it.cardId,
      itemRef: it.answer,
      correct: true, // fechar o par É acertar; o QUANTO custou está nas tentativas
      attempts: tentativasRef.current.get(i) ?? 1,
      ms: agora - (inicioItemRef.current.get(i) ?? inicioRef.current),
      hinted: comDicaRef.current,
    }));
    const report: RoundReport = {
      gameId: 'memory',
      items: outcomes,
      score: scoreRound('memory', outcomes),
      durationMs: agora - inicioRef.current,
    };
    // Vitória sensorial completa
    playJuicedVictory();
    setTimeout(() => onFinish(report), 1100);
  }, [fechados, total, items, onFinish]);

  const virar = (carta: Carta, el: HTMLElement | null) => {
    if (travado || espiando || viradas.includes(carta.id) || fechados.has(carta.itemIndex)) return;
    if (!inicioItemRef.current.has(carta.itemIndex)) inicioItemRef.current.set(carta.itemIndex, Date.now());
    
    triggerHaptic('soft');
    play('select');

    // Fala a palavra no idioma original para imersão auditiva instantânea
    if (carta.lado === 'palavra' && carta.lang) {
      speak(carta.texto, { lang: carta.lang });
    }

    const novas = [...viradas, carta.id];
    setViradas(novas);
    if (novas.length < 2) return;

    const [a, b] = novas.map(id => cartas.find(c => c.id === id)!);
    const par = a.itemIndex === b.itemIndex && a.lado !== b.lado;
    // Conta a tentativa nos DOIS itens envolvidos
    for (const idx of new Set([a.itemIndex, b.itemIndex])) {
      tentativasRef.current.set(idx, (tentativasRef.current.get(idx) ?? 0) + 1);
    }

    const rect = el?.getBoundingClientRect();
    const coords = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;

    if (par) {
      const nova = sequencia + 1;
      const mult = multiplicador(nova);
      const ganho = 10 * mult;
      setSequencia(nova);
      setPontos(p => p + ganho);
      triggerHaptic('success');
      if (coords) emitBurst(coords.x, coords.y, 'confete');
      playJuicedHit(nova, coords, `+${ganho}${mult > 1 ? ` ×${mult}` : ''}`);
      setFechados(prev => new Set([...prev, a.itemIndex]));
      setViradas([]);
      return;
    }
    // Erro: feedback sensorial com tremor e buzzer
    setSequencia(0);
    playJuicedError(mesaRef.current, coords, 'Quase!');
    setTravado(true);
    setTimeout(() => { setViradas([]); setTravado(false); }, 850);
  };

  /** ESPIAR: abre a mesa inteira por 1,2s. Cobra a nota de todos os itens (ver `gradeFor`). */
  const espiar = (el: HTMLElement | null) => {
    if (espiando || travado || espiadasRef.current >= ESPIADAS) return;
    espiadasRef.current += 1;
    comDicaRef.current = true;
    setSequencia(0); // a sequência é mérito; com ajuda ela recomeça
    setEspiando(true);
    play('select');
    triggerHaptic('soft');
    pontosDoElemento(`${ESPIADAS - espiadasRef.current} espiadas`, el, 'neutro');
    setTimeout(() => setEspiando(false), 1200);
  };

  const mult = multiplicador(sequencia);
  const progressoPct = total > 0 ? Math.round((fechados.size / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink select-none overflow-hidden animate-in fade-in duration-200">
      {/* Topo unificado */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface/85 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="p-2 rounded-xl border border-border-subtle bg-surface-hover hover:bg-border-subtle transition-colors cursor-pointer"
            title="Sair do Jogo da Memória"
            aria-label="Sair do jogo"
          >
            <X className="w-5 h-5 text-ink" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-lg tracking-wide uppercase text-accent">
                {ageProfile === 'kids' ? 'Ache os Pares' : 'Jogo da Memória'}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink font-semibold">Pares & Sinapses 🧠</span>
            </div>
            <p className="text-xs text-ink-muted">Encontre todos os pares combinando termos e significados correspondentes!</p>
          </div>
        </div>

        {/* Ações, Espiar, Combo, Pontos e Pares */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={(e) => espiar(e.currentTarget)}
            disabled={espiadasRef.current >= ESPIADAS || espiando}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-border-subtle bg-surface hover:bg-surface-hover text-xs font-bold text-ink transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm cursor-pointer"
            data-tour="espiar"
            aria-label="Espiar a mesa"
            title={`Espiar todas as cartas (${ESPIADAS - espiadasRef.current} restantes)`}
          >
            <Eye className="w-3.5 h-3.5 text-warn" />
            <span>Espiar ({ESPIADAS - espiadasRef.current})</span>
          </button>

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

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface" data-tour="placar">
            <span className="font-mono font-bold text-base text-ink">
              {fechados.size}/{total} pares
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 lg:p-8 overflow-y-auto custom-scrollbar">

      {/* A mesa fica no MEIO da área livre */}
      <div ref={mesaRef} data-tour="mesa" className={`grid gap-3 ${total <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-4'} max-w-3xl w-full mx-auto my-auto`}>
        {cartas.map(carta => {
          const aberta = espiando || viradas.includes(carta.id) || fechados.has(carta.itemIndex);
          const fechada = fechados.has(carta.itemIndex);
          const cor = CORES[carta.itemIndex % CORES.length];
          return (
            <button
              key={carta.id}
              onClick={(e) => virar(carta, e.currentTarget)}
              disabled={fechada}
              aria-label={aberta ? carta.texto : 'Carta virada para baixo'}
              className={`carta3d ${aberta ? 'aberta' : ''} ${folgado ? 'min-h-[6.5rem]' : 'min-h-[5.5rem]'} rounded-2xl ${
                fechada ? 'opacity-80 scale-95 ring-2 ring-emerald-500/40' : 'cursor-pointer active:scale-95'
              } ${!aberta ? 'hover:-translate-y-1 hover:shadow-lg transition-all' : ''}`}
            >
              <span className="carta3d-giro block">
                {/* O VERSO (face para baixo) com textura geométrica elegante do Babel Play */}
                <span className="carta3d-frente bg-surface border-2 border-border-subtle hover:border-accent/40 rounded-2xl flex items-center justify-center shadow-sm relative overflow-hidden group" aria-hidden>
                  <div className="absolute inset-0 bg-gradient-to-br from-accent-soft/20 to-transparent opacity-40 group-hover:opacity-100 transition-opacity" />
                  <span className="w-8 h-8 rounded-xl border border-border-subtle bg-canvas/80 flex items-center justify-center font-display font-black text-xs text-ink-muted/50 group-hover:text-accent transition-colors">
                    ✦
                  </span>
                </span>
                <span
                  className={`carta3d-verso bg-surface shadow-md rounded-2xl px-3 py-2 text-center overflow-hidden flex flex-col items-center justify-center transition-all ${
                    fechada ? 'bg-emerald-500/5' : ''
                  }`}
                  style={{ borderColor: cor, borderWidth: 2, borderStyle: 'solid' }}
                >
                  <span
                    className={`${carta.texto.length > 45 ? (folgado ? 'text-[11px]' : 'text-[10px]') : folgado ? 'text-[14px]' : 'text-[13px]'} font-bold leading-tight break-words ${folgado ? 'line-clamp-4' : 'line-clamp-3'}`}
                    style={{ color: carta.lado === 'palavra' ? cor : undefined }}
                    dir={direcaoDoTexto(carta.lang)}
                    title={carta.texto}
                  >
                    {carta.texto}
                  </span>
                  {fechada && (
                    <span className="text-[10px] font-bold text-emerald-600 mt-1 flex items-center gap-1 animate-scaleIn">
                      <Sparkles className="w-3 h-3" /> Par
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-ink-faint text-center mt-5 mb-auto max-w-[52ch] mx-auto">
        {ageProfile === 'senior'
          ? 'Toque em duas cartas: uma com a palavra e outra com o significado dela.'
          : 'Vire duas cartas e feche o par: a palavra e a tradução dela.'}
      </p>
      </main>
    </div>
  );
}
