import { UserRound } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { THEME_OPTIONS } from '../lib/appearance';
import { tocarPreviaDoEfeito } from '../lib/comemoracao';
import { type BurstSpec, emitBurst, type FormaParticula } from '../lib/effects';
import { movimentoReduzido } from '../lib/juice';
import type { ItemDaLoja } from '../lib/loja';
import { estiloDeRastro } from '../lib/rastroDoMouse';
import MiniaturaDoItem from './MiniaturaDoItem';
import { AnelDaMoldura, SeloDoTitulo } from './perfil/pecasDoPerfil';
import PreviaDaLegenda from './PreviaDaLegenda';
import PreviaDoCartao from './PreviaDoCartao';

/**
 * A PRÉVIA REAL DE UMA PEÇA NO MODAL DE RECOMPENSA (spec 10.3): o item como ele aparece de verdade,
 * não um símbolo.
 *
 *  · legenda   → a fala de exemplo vestindo o estilo;
 *  · cartão    → os três estados da pele;
 *  · efeito    → a rajada da receita toca na peça ao abrir;
 *  · tema      → um recorte do app pintado com as quatro cores do tema (fundo, cartão, destaque, tinta);
 *  · moldura   → o anel em volta de um avatar, o mesmo do perfil;
 *  · título    → o selo com a coroa, o mesmo do perfil;
 *  · rastro    → o rastro corre por cima da peça ao abrir (o mesmo resolvedor do cursor);
 *  · partícula → a rajada sai da peça ao abrir, na forma da skin.
 *
 * Rastro e partícula também mostram a miniatura (vetor, na cor que o motor usa): com movimento
 * reduzido, ou com as animações desligadas, é ela que fica.
 */

export const TIPOS_COM_PREVIA_REAL: ReadonlySet<string> = new Set([
  'legenda',
  'cartao',
  'efeito-acerto',
  'efeito-combo',
  'finalizacao',
  'tema',
  'moldura',
  'titulo',
  'rastro',
  'particulas',
]);

/** A forma que a skin de partículas dá às rajadas comuns — a mesma régua do motor. */
const FORMA_DA_SKIN: Record<string, FormaParticula | undefined> = {
  pixel: 'pixel',
  confete: 'confete',
  coracoes: 'coracao',
  estrelas: 'emoji',
  cometa: 'cometa',
};

function centro(el: Element): { x: number; y: number; w: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
}

/** Toca a peça uma vez ao abrir: efeito, rastro ou partícula. Devolve o cancelamento. */
function tocar(item: ItemDaLoja, el: HTMLElement): () => void {
  const timers: number[] = [];
  const depois = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
  if (item.tipo === 'efeito-acerto' || item.tipo === 'efeito-combo' || item.tipo === 'finalizacao') {
    const tipo = item.tipo;
    depois(450, () => tocarPreviaDoEfeito(tipo, item.alvo, el));
  } else if (item.tipo === 'rastro' && !movimentoReduzido()) {
    const estilo = estiloDeRastro(item.alvo);
    if (estilo) {
      // O cursor atravessando a peça: uma rajada a cada 55 ms, da esquerda para a direita.
      for (let i = 0; i < 8; i++) {
        depois(450 + i * 55, () => {
          const c = centro(el);
          emitBurst(c.x - c.w * 0.35 + (c.w * 0.7 * i) / 7, c.y, estilo.kind, estilo.sobrescrever);
        });
      }
    }
  } else if (item.tipo === 'particulas' && !movimentoReduzido()) {
    const forma = FORMA_DA_SKIN[item.alvo];
    const sobrescrever: Partial<BurstSpec> | undefined = forma ? { forma } : undefined;
    depois(450, () => {
      const c = centro(el);
      emitBurst(c.x, c.y, 'xp', sobrescrever);
    });
  }
  return () => timers.forEach((t) => window.clearTimeout(t));
}

/** O tema como ele pinta o app: fundo, um cartão com texto, o botão de destaque. */
function RecorteDoTema({ item }: { item: ItemDaLoja }) {
  const t = THEME_OPTIONS.find((o) => o.id === item.alvo);
  const [canvas, surface, accent, ink] =
    item.previa ?? (t ? [t.swatches.canvas, t.swatches.surface, t.swatches.accent, t.swatches.ink] : []);
  if (!canvas) return <MiniaturaDoItem item={item} tam="grande" />;
  return (
    <span
      aria-hidden
      style={{
        display: 'grid',
        gap: 6,
        width: '100%',
        padding: 10,
        borderRadius: 12,
        background: canvas,
        border: '1px solid var(--border-subtle)',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 9,
          background: surface,
          color: ink,
          boxShadow: '0 1px 2px rgba(0,0,0,.12)',
        }}
      >
        <span style={{ display: 'grid', gap: 3 }}>
          <b style={{ fontSize: 13, lineHeight: 1 }}>Aa</b>
          <span style={{ width: 64, height: 4, borderRadius: 2, background: ink, opacity: 0.35 }} />
        </span>
        <span style={{ width: 46, height: 18, borderRadius: 999, background: accent }} />
      </span>
      <span style={{ height: 6, borderRadius: 3, background: surface, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: '62%', height: '100%', background: accent }} />
      </span>
    </span>
  );
}

function Conteudo({ item }: { item: ItemDaLoja }) {
  switch (item.tipo) {
    case 'legenda':
      return <PreviaDaLegenda estilo={item.alvo} />;
    case 'cartao':
      return <PreviaDoCartao pele={item.alvo} />;
    case 'tema':
      return <RecorteDoTema item={item} />;
    case 'moldura':
      return (
        <AnelDaMoldura
          item={item}
          tamanho={56}
          avatar={<UserRound aria-hidden style={{ width: 28, height: 28, color: 'var(--ink-muted)' }} />}
        />
      );
    case 'titulo':
      return <SeloDoTitulo item={item} />;
    default:
      // Efeito, rastro e partícula: a miniatura vetorial fica, e a peça toca por cima ao abrir.
      return <MiniaturaDoItem item={item} tam="grande" />;
  }
}

export default function PreviaRealDaPeca({ item }: { item: ItemDaLoja }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return tocar(item, ref.current);
  }, [item]);
  return (
    <span
      ref={ref}
      data-previa-da-peca={item.tipo}
      style={{ display: 'grid', placeItems: 'center', width: '100%', minHeight: 44 }}
    >
      <Conteudo item={item} />
    </span>
  );
}
