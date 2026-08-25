import React, { useEffect, useRef, useState } from 'react';
import { Ticket, RefreshCw, X } from 'lucide-react';
import { buildCartela, marcarFala, linhasCompletas, cartelaCheia, LADO_CARTELA, type CasaBingo } from '@core';
import { fetchDeck } from '../../data/api';
import type { AgeProfileType } from '../../lib/profile';
import { comemorar } from '../../lib/juice';

/**
 * BINGO DA ESCUTA — a cartela que acende enquanto você assiste.
 *
 * Vive DENTRO da tela de captura, e não na tela Jogar, porque depende do que está sendo ouvido
 * agora. É o único jogo que não interrompe o uso normal do app: você assiste ao vídeo, e as
 * palavras do seu baralho acendem sozinhas quando aparecem na fala.
 *
 * Recebe as falas já transcritas (o painel não escuta nada por conta própria) — a captura
 * continua sendo a única dona do áudio.
 */

interface BingoPanelProps {
  /** Texto das falas transcritas até agora. O painel reage ao que ENTRA. */
  falas: string[];
  ageProfile: AgeProfileType;
  onClose: () => void;
}

export default function BingoPanel({ falas, ageProfile, onClose }: BingoPanelProps) {
  const [cartela, setCartela] = useState<CasaBingo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [linhas, setLinhas] = useState(0);
  const processadasRef = useRef(0);
  const painelRef = useRef<HTMLElement | null>(null);

  const sortear = async () => {
    setCarregando(true);
    try {
      const deck = await fetchDeck();
      setCartela(buildCartela(deck.filter(c => c.inDeck)));
      setLinhas(0);
      // Falas já ditas antes de a cartela existir NÃO contam — senão a cartela nasceria
      // meio preenchida por acaso, e o jogo perderia a graça.
      processadasRef.current = falas.length;
    } finally {
      setCarregando(false);
    }
  };

  // Sorteia a cartela UMA vez, na montagem. Uma cartela que se refizesse a cada render tiraria
  // da pessoa justamente a que ela estava acompanhando.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void sortear(); }, []);

  // Cada fala NOVA é conferida contra a cartela.
  useEffect(() => {
    if (!cartela.length || falas.length <= processadasRef.current) return;
    const novasFalas = falas.slice(processadasRef.current);
    processadasRef.current = falas.length;
    let atual = cartela;
    let acendeu = false;
    for (const texto of novasFalas) {
      const r = marcarFala(atual, texto);
      atual = r.cartela;
      if (r.novas.length) acendeu = true;
    }
    if (!acendeu) return;
    setCartela(atual);
    comemorar('acerto', painelRef.current);
    const linhasAgora = linhasCompletas(atual);
    if (linhasAgora > linhas) {
      setLinhas(linhasAgora);
      comemorar('subiuNivel', painelRef.current);
    }
  }, [falas, cartela, linhas]);

  const cheia = cartelaCheia(cartela);
  const marcadas = cartela.filter(c => c.ouvidaEm !== null).length;

  return (
    <section ref={painelRef} className="bg-surface border border-border-subtle rounded-2xl p-4 shadow-card">
      <header className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold tracking-wider text-ink-muted uppercase flex items-center gap-2">
          <Ticket className="w-4 h-4 text-accent" aria-hidden />
          {ageProfile === 'kids' ? 'Bingo das palavras' : 'Bingo da escuta'}
        </span>
        <span className="flex items-center gap-1">
          <button onClick={() => void sortear()} className="p-1.5 rounded-lg text-ink-faint hover:text-accent cursor-pointer" title="Sortear outra cartela" aria-label="Sortear outra cartela">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ink-faint hover:text-ink cursor-pointer" title="Fechar o bingo" aria-label="Fechar o bingo">
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      </header>

      <p className="text-[10px] text-ink-faint leading-tight mb-3">
        {cheia
          ? 'Cartela cheia! Sorteie outra para continuar.'
          : ageProfile === 'senior'
            ? 'As palavras acendem sozinhas quando alguém as fala.'
            : 'Assista normalmente — as casas acendem quando a palavra aparece na fala.'}
      </p>

      {carregando ? (
        <div className="grid grid-cols-3 gap-1.5" aria-hidden>
          {Array.from({ length: 9 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-canvas animate-pulse" />)}
        </div>
      ) : cartela.length === 0 ? (
        <p className="text-[12px] text-ink-muted py-4 text-center">
          Salve algumas palavras primeiro — a cartela é feita com as suas.
        </p>
      ) : (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${LADO_CARTELA}, minmax(0, 1fr))` }}>
          {cartela.map((casa, i) => (
            <div
              key={`${casa.cardId}-${i}`}
              className={`h-14 rounded-xl border flex items-center justify-center px-1 text-center transition-all duration-300 ${
                casa.ouvidaEm !== null
                  ? 'bg-good-soft border-good text-good-ink scale-[1.03] shadow-sm'
                  : 'bg-canvas border-border-subtle text-ink-muted'
              }`}
            >
              <span className="text-[11px] font-bold leading-tight break-words">{casa.palavra}</span>
            </div>
          ))}
        </div>
      )}

      {cartela.length > 0 && (
        <p className="text-[11px] font-bold text-ink-muted mt-3 text-center">
          {marcadas}/{cartela.length}
          {linhas > 0 && <span className="text-good-ink"> · {linhas} {linhas === 1 ? 'linha' : 'linhas'}</span>}
        </p>
      )}
    </section>
  );
}
