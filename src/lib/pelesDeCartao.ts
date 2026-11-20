/**
 * PELES DE CARTÃO (recompensas v2, onda 4) — a moldura do cartão de vocabulário acompanha a palavra.
 *
 * Três estados, e NENHUM é calculado aqui:
 *   · nova      → a fase do FSRS que o cartão já carrega (`fsrsState === 'New'`, derivada em
 *                 `data/rotas/vocabulario.ts`);
 *   · dominada  → fase `Review` E a retenção de agora acima do corte de domínio que a fluência já
 *                 usa (`retrievability` do scheduler, `RETENCAO_DE_DOMINIO` de `learning/fluencia`)
 *                 — o mesmo "isto está sustentado" do rótulo de nível;
 *   · aprendida → o resto (Learning, Relearning, Review que está escapando).
 *
 * A pele só troca o desenho de cada estado (`src/styles/cartoes.css`). A padrão é livre; as outras
 * são itens `tipo: 'cartao'` de `src/core/catalogoV2.ts`, só com Seeds.
 */
/* Direto do módulo, e não do barril `@core`: a régua mora em `core/learning/estadoDoCartao.ts` (o
   servidor usa a mesma no histórico da palavra), e o barril traria a wordlist ao arranque. */
import { type EstadoDoCartao, estadoDoCartao as estadoDoCartaoDoNucleo } from '../core/learning/estadoDoCartao';
import type { VocabCard } from '../types';
import { CATALOGO_DA_LOJA, estadoDoItem } from './loja';

export type { EstadoDoCartao };

export interface PeleDeCartao {
  id: string;
  /** A classe de cada estado — o que `cartoes.css` desenha. */
  classes: Record<EstadoDoCartao, string>;
}

export const PELE_PADRAO = 'padrao';

const pele = (id: string): PeleDeCartao => ({
  id,
  classes: {
    nova: `pele-${id} cartao-nova`,
    aprendida: `pele-${id} cartao-aprendida`,
    dominada: `pele-${id} cartao-dominada`,
  },
});

/** As 5 peles de lançamento; nome e preço moram no catálogo. */
export const PELES_DE_CARTAO: readonly PeleDeCartao[] = ['padrao', 'caderno', 'selo', 'vitral', 'constelacao'].map(
  pele,
);

/** O estado do cartão na régua do núcleo (`core/learning/estadoDoCartao.ts`). */
export function estadoDoCartao(
  c: Pick<VocabCard, 'fsrsState'> & Partial<Pick<VocabCard, 'fsrsStability' | 'stability' | 'lastReview'>>,
  agora: number = Date.now(),
): EstadoDoCartao {
  return estadoDoCartaoDoNucleo(c, agora);
}

/** A pessoa pode usar esta pele? A régua da Loja (fora do catálogo = livre). */
export function possuiPeleDeCartao(id: string): boolean {
  const item = CATALOGO_DA_LOJA.find((i) => i.tipo === 'cartao' && i.alvo === id);
  return !item || estadoDoItem(item, 1, 0).estado === 'equipavel';
}

/** A pele que vale: a escolhida, se existir e for sua; senão a padrão. */
export function resolverPeleDeCartao(
  id: string | undefined,
  possui: (id: string) => boolean = possuiPeleDeCartao,
): string {
  return PELES_DE_CARTAO.some((p) => p.id === id) && possui(id!) ? id! : PELE_PADRAO;
}

/** As classes do cartão para uma pele e um estado. */
export function classeDoCartao(
  peleId: string | undefined,
  estado: EstadoDoCartao,
  possui?: (id: string) => boolean,
): string {
  const id = resolverPeleDeCartao(peleId, possui);
  return (PELES_DE_CARTAO.find((p) => p.id === id) ?? PELES_DE_CARTAO[0]).classes[estado];
}

/* ── a pele equipada ── */

const CHAVE = 'babel.pele_cartao';

export function lerPeleDeCartao(): string {
  try {
    return localStorage.getItem(CHAVE) || PELE_PADRAO;
  } catch {
    return PELE_PADRAO;
  }
}

export function equiparPeleDeCartao(id: string): void {
  try {
    localStorage.setItem(CHAVE, id);
  } catch {
    /* sem storage: fica a padrão */
  }
}

/** Atalho da tela: as classes do cartão de uma palavra, com a pele equipada. */
export function classesDaPalavra(c: Parameters<typeof estadoDoCartao>[0], agora?: number): string {
  return classeDoCartao(lerPeleDeCartao(), estadoDoCartao(c, agora));
}
