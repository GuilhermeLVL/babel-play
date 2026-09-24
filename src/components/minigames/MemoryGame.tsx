import type { ItemOutcome, MinigameItem, RoundReport } from '@core';
import { scoreRound } from '@core';
import { Eye, X } from 'lucide-react';
import { Flame, Sparkles } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { emitBurst } from '../../lib/effects';
import { playJuicedError, playJuicedHit, playJuicedVictory, triggerHaptic } from '../../lib/gameFeel';
import { multiplicador, pontosDoElemento } from '../../lib/juice';
import { direcaoDoTexto } from '../../lib/languages';
import type { AgeProfileType } from '../../lib/profile';
import { play } from '../../lib/soundFx';
import { speak } from '../../lib/tts';

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

export default function MemoryGame({ items, ageProfile, onFinish, onExit }: MemoryGameProps) {
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

    const [a, b] = novas.map((id) => cartas.find((c) => c.id === id)!);
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
      setPontos((p) => p + ganho);
      triggerHaptic('success');
      if (coords) emitBurst(coords.x, coords.y, 'confete');
      playJuicedHit(nova, coords, `+${ganho}${mult > 1 ? ` ×${mult}` : ''}`);
      setFechados((prev) => new Set([...prev, a.itemIndex]));
      setViradas([]);
      return;
    }
    // Erro: feedback sensorial com tremor e buzzer
    setSequencia(0);
    playJuicedError(mesaRef.current, coords, 'Quase!');
    setTravado(true);
    setTimeout(() => {
      setViradas([]);
      setTravado(false);
    }, 850);
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

  /**
   * QUATRO COLUNAS QUANDO A MESA É GRANDE. O `.tabuleiro` do protótipo tem três colunas porque a
   * rodada dele tem 3 pares; a do app chega a 8 (16 cartas), e em três colunas isso dá seis
   * fileiras que não cabem sem rolar — num jogo de memória, rolar esconde metade da mesa. Com
   * mais de 6 cartas e espaço (≥ 600px) a mesa vira 4 colunas, na mesma proporção de carta
   * (540px para 3 colunas → 720px para 4). No celular continuam as três do protótipo.
   */
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const pai = mesaRef.current?.parentElement;
    if (!pai) return;
    const medir = () => setLargura(pai.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(pai);
    return () => ro.disconnect();
  }, []);
  const quatroColunas = cartas.length > 6 && largura >= 600;
  const estiloDaMesa: React.CSSProperties = {
    // `margin: auto` (e não o `0 auto` do protótipo): centra na vertical quando cabe e não corta o
    // topo quando a mesa passa da altura — é o que `justify-center` faria num container que rola.
    margin: 'auto',
    ...(quatroColunas ? { gridTemplateColumns: 'repeat(4, 1fr)', maxWidth: 720 } : null),
  };

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
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent-soft text-accent-ink font-semibold">
                Pares & Sinapses 🧠
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              Encontre todos os pares combinando termos e significados correspondentes!
            </p>
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

          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-surface"
            data-tour="placar"
          >
            <span className="font-mono font-bold text-base text-ink">
              {fechados.size}/{total} pares
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center p-4 lg:p-8 overflow-y-auto custom-scrollbar">
        {/* A MESA — a marcação do protótipo aprovado (`montarMemoria` em
          docs/prototipos/consistencia-telas.html): `.tabuleiro` > `button.carta`, com o verso "?"
          em `.verso` e os estados `virada` / `par` / `errou` / `espiando`. O CSS é o dele
          (src/styles/prototipo.css): três colunas, cartas 4:3, entrada em cascata por `--i`. */}
        <div ref={mesaRef} data-tour="mesa" className="tabuleiro w-full" style={estiloDaMesa} aria-label="Tabuleiro">
          {cartas.map((carta, n) => {
            const fechada = fechados.has(carta.itemIndex);
            const virada = viradas.includes(carta.id);
            // Espiar abre só as que estavam de costas; as já viradas ou fechadas seguem como estão.
            const espiada = espiando && !virada && !fechada;
            const aberta = virada || fechada || espiada;
            // O par errado fica aberto por 850ms com a marca de erro antes de desvirar.
            const errou = travado && virada;
            const classes = [
              'carta',
              aberta && !fechada ? 'virada' : '',
              fechada ? 'par' : '',
              errou ? 'errou' : '',
              espiada ? 'espiando' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={carta.id}
                type="button"
                onClick={(e) => virar(carta, e.currentTarget)}
                aria-disabled={fechada || undefined}
                aria-label={aberta ? carta.texto : 'Carta virada'}
                className={classes}
                style={{ '--i': n } as React.CSSProperties}
                data-texto={carta.texto}
              >
                {aberta ? (
                  /* A pista pode ter até 160 caracteres (baralho Anki curado): o clamp segura o texto
                   dentro da carta 4:3 e o `title` guarda a string inteira. Acima de 45 caracteres
                   a fonte desce um passo; abaixo vale a do protótipo (800 15px). */
                  <span
                    className={`${carta.texto.length > 45 ? 'text-[11px] line-clamp-4' : 'line-clamp-3'} break-words`}
                    dir={direcaoDoTexto(carta.lang)}
                    title={carta.texto}
                  >
                    {carta.texto}
                  </span>
                ) : (
                  <span className="verso" aria-hidden="true">
                    ?
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
