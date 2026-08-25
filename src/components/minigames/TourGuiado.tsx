import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, MousePointerClick, Hand, Keyboard, ArrowRight } from 'lucide-react';

/**
 * TOUR GUIADO — a explicação que acontece NA TELA, sobre o jogo de verdade.
 *
 * POR QUE ISTO SUBSTITUIU O TEXTÃO. A primeira versão era um diálogo com cinco blocos de texto
 * antes da partida. Estava correta e era inútil: ninguém lê uma parede de texto para começar a
 * jogar — pula, e continua sem saber que existe um radar, uma varinha, um "ouvir devagar". A
 * informação existia e não chegava, que dá no mesmo que não existir.
 *
 * COMO ESTE FUNCIONA. Uma frase por vez, e cada uma APONTA para o elemento de que fala: o resto
 * da tela escurece, o alvo fica aceso e um gesto animado mostra o que fazer ali. A pessoa vê o
 * botão real, na posição real, com o conteúdo real dela.
 *
 * O RECORTE É FEITO COM SOMBRA, não com `clip-path`: um `box-shadow` gigante no retângulo do alvo
 * escurece tudo em volta e deixa o buraco nítido, com uma linha só de CSS e sem custo de
 * composição. `clip-path` daria o mesmo efeito e reflui a cada quadro em telas grandes.
 *
 * O ALVO PODE NÃO EXISTIR — um jogo esconde botões conforme o estado (a dica some quando não há o
 * que revelar). Passo cujo alvo não está na tela é PULADO em silêncio, em vez de destacar o canto
 * superior esquerdo e confundir. É por isso que os passos são declarados por seletor e não por
 * `ref`: o tour não precisa saber quando cada peça monta.
 */

export interface PassoTour {
  /** Seletor do alvo. Convenção: `[data-tour="nome"]`. */
  alvo: string;
  /** UMA frase, no imperativo. Se precisar de duas, o passo está grande demais. */
  texto: string;
  /** O gesto a animar sobre o alvo. */
  gesto?: 'clique' | 'arraste' | 'digite';
  /** Passo que só faz sentido em algumas telas — some sem avisar quando o alvo não existe. */
  opcional?: boolean;
}

interface TourGuiadoProps {
  passos: PassoTour[];
  /** Rótulo do jogo, só para o leitor de tela saber do que se trata. */
  titulo: string;
  onFim: () => void;
}

/** Margem do buraco em volta do alvo: sem folga, o destaque encosta e some no elemento. */
const FOLGA = 8;

export default function TourGuiado({ passos, titulo, onFim }: TourGuiadoProps) {
  const [i, setI] = useState(0);
  const [caixa, setCaixa] = useState<DOMRect | null>(null);
  const cartaoRef = useRef<HTMLDivElement | null>(null);

  const passo = passos[i];

  /** Mede o alvo do passo atual. Devolve `false` quando ele não está na tela. */
  const medir = useCallback(() => {
    if (!passo) return false;
    const el = document.querySelector(passo.alvo);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    setCaixa(r);
    return true;
  }, [passo]);

  // Mede antes de pintar (evita o destaque aparecer um quadro no lugar errado) e pula passo órfão.
  useLayoutEffect(() => {
    if (!passo) { onFim(); return; }
    if (!medir()) {
      // Alvo ausente: passa adiante. Se era o último, encerra.
      if (i + 1 < passos.length) setI(n => n + 1);
      else onFim();
    }
  }, [i, passo, medir, passos.length, onFim]);

  // O alvo se move: rolagem, mudança de tamanho, animação de entrada do próprio jogo.
  useEffect(() => {
    const remedir = () => { medir(); };
    window.addEventListener('resize', remedir);
    window.addEventListener('scroll', remedir, true);
    const t = window.setInterval(remedir, 400); // pega layout que assenta depois (fontes, imagens)
    return () => {
      window.removeEventListener('resize', remedir);
      window.removeEventListener('scroll', remedir, true);
      window.clearInterval(t);
    };
  }, [medir]);

  const avancar = useCallback(() => {
    if (i + 1 < passos.length) setI(n => n + 1);
    else onFim();
  }, [i, passos.length, onFim]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onFim(); return; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); avancar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [avancar, onFim]);

  if (!passo || !caixa) return null;

  const buraco = {
    top: caixa.top - FOLGA,
    left: caixa.left - FOLGA,
    width: caixa.width + FOLGA * 2,
    height: caixa.height + FOLGA * 2,
  };

  /* O CARTÃO vai ABAIXO do alvo quando cabe, e acima quando não cabe — senão ele sai da tela em
     alvos que ficam no pé (o teclado do Termo, o botão de conferir). O mesmo para as laterais. */
  const alturaCartao = cartaoRef.current?.offsetHeight ?? 120;
  const cabeAbaixo = buraco.top + buraco.height + alturaCartao + 16 < window.innerHeight;
  const topoCartao = cabeAbaixo
    ? buraco.top + buraco.height + 12
    : Math.max(12, buraco.top - alturaCartao - 12);
  const larguraCartao = Math.min(340, window.innerWidth - 24);
  const esquerdaCartao = Math.max(
    12,
    Math.min(window.innerWidth - larguraCartao - 12, caixa.left + caixa.width / 2 - larguraCartao / 2),
  );

  const Gesto = passo.gesto === 'arraste' ? Hand : passo.gesto === 'digite' ? Keyboard : MousePointerClick;

  return (
    <div className="fixed inset-0 z-[95]" role="dialog" aria-label={`Como jogar: ${titulo}`}>
      {/* O RECORTE. `pointer-events-none` no buraco para o alvo continuar visível como ele é;
          a captura do clique fica no retângulo, para um toque fora avançar o tour. */}
      <div
        onClick={avancar}
        className="absolute rounded-xl transition-all duration-300 ease-out pointer-events-auto"
        style={{
          ...buraco,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.72)',
          outline: '2px solid var(--accent)',
          outlineOffset: '2px',
        }}
        aria-hidden
      />

      {/* O GESTO — o que fazer ali, animado. É a parte que o texto sozinho não consegue dizer. */}
      <span
        className="absolute pointer-events-none flex items-center justify-center"
        style={{
          top: caixa.top + caixa.height / 2 - 18,
          left: caixa.left + caixa.width / 2 - 18,
          width: 36,
          height: 36,
        }}
        aria-hidden
      >
        <span className="absolute inset-0 rounded-full bg-accent/30 babel-tour-onda" />
        <Gesto className="w-5 h-5 text-accent babel-tour-gesto relative" />
      </span>

      {/* A FRASE */}
      <div
        ref={cartaoRef}
        className="absolute card-panel bg-surface p-4 shadow-card animate-in fade-in duration-200"
        style={{ top: topoCartao, left: esquerdaCartao, width: larguraCartao }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="label-mono">{i + 1} de {passos.length}</span>
          <button
            onClick={onFim}
            className="p-1 -m-1 rounded text-ink-faint hover:text-ink cursor-pointer"
            aria-label="Pular a explicação"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[14px] text-ink leading-snug mb-3">{passo.texto}</p>

        <div className="flex items-center gap-2">
          {/* Os pontinhos dão a noção de "falta pouco" — é o que segura quem ia pular. */}
          <span className="flex items-center gap-1 flex-1" aria-hidden>
            {passos.map((_, n) => (
              <span
                key={n}
                className={`h-1 rounded-full transition-all ${n === i ? 'w-4 bg-accent' : n < i ? 'w-1.5 bg-good' : 'w-1.5 bg-border-subtle'}`}
              />
            ))}
          </span>
          <button
            onClick={avancar}
            className="py-2 px-4 rounded-lg bg-accent hover:bg-accent-ink text-white font-bold text-[13px] cursor-pointer flex items-center gap-1.5"
          >
            {i + 1 < passos.length ? <>Próximo <ArrowRight className="w-3.5 h-3.5" /></> : 'Jogar'}
          </button>
        </div>
      </div>
    </div>
  );
}
