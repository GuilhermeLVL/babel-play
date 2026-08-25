import type { VocabCard } from '../../types';
import { normalizarPalavra } from './wordsearch';

/**
 * BINGO DA ESCUTA — a cartela que acende sozinha enquanto você assiste.
 *
 * É o jogo mais original do conjunto porque usa o CORAÇÃO do app: a captura ao vivo. As palavras
 * do seu baralho ficam numa cartela; quando alguém no vídeo/chamada fala uma delas, a casa acende
 * sozinha. Assistir vira jogo sem exigir nada além do que a captura já faz — e é o único que
 * treina escuta em contexto real, não em áudio preparado.
 *
 * Este módulo é só a REGRA (puro, testável). Quem observa as falas é a tela de captura.
 */

export interface CasaBingo {
  cardId?: string;
  palavra: string;
  /** Forma normalizada usada na comparação (sem acento, maiúscula). */
  chave: string;
  /** Quando foi ouvida (ms epoch). `null` = ainda não. */
  ouvidaEm: number | null;
}

/** Tamanho da cartela — 3×3 é o que cabe num painel lateral sem virar parede. */
export const LADO_CARTELA = 3;
export const CASAS = LADO_CARTELA * LADO_CARTELA;

/**
 * Monta a cartela a partir do baralho. Só palavras de 3+ letras: artigos e preposições
 * apareceriam em toda fala e a cartela fecharia sozinha em segundos, sem mérito nenhum.
 */
export function buildCartela(cards: VocabCard[], opts: { casas?: number; shuffle?: <T>(xs: T[]) => T[] } = {}): CasaBingo[] {
  const casas = opts.casas ?? CASAS;
  const shuffle = opts.shuffle ?? (<T,>(xs: T[]) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  });
  const vistas = new Set<string>();
  const candidatos = cards.filter(c => {
    if (!c.inDeck) return false;
    const chave = normalizarPalavra(c.word ?? '');
    if (chave.length < 3 || vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
  return shuffle(candidatos).slice(0, casas).map(c => ({
    cardId: c.id,
    palavra: c.word.trim(),
    chave: normalizarPalavra(c.word),
    ouvidaEm: null,
  }));
}

/**
 * Marca na cartela as palavras ouvidas num texto de fala.
 *
 * Compara por PALAVRA INTEIRA normalizada, não por "contém": sem isso, "arte" acenderia ao ouvir
 * "partes" e a cartela fecharia por engano. Devolve uma cartela nova (as casas já marcadas ficam
 * com o instante original — a primeira vez é a que vale).
 */
export function marcarFala(cartela: CasaBingo[], texto: string, agora: number = Date.now()): { cartela: CasaBingo[]; novas: CasaBingo[] } {
  const ditas = new Set(
    texto.split(/\s+/).map(normalizarPalavra).filter(p => p.length >= 3)
  );
  const novas: CasaBingo[] = [];
  const atualizada = cartela.map(casa => {
    if (casa.ouvidaEm !== null || !ditas.has(casa.chave)) return casa;
    const marcada = { ...casa, ouvidaEm: agora };
    novas.push(marcada);
    return marcada;
  });
  return { cartela: atualizada, novas };
}

/** Linhas, colunas e diagonais completas — o "bingo" propriamente dito. */
export function linhasCompletas(cartela: CasaBingo[], lado: number = LADO_CARTELA): number {
  const ouvida = (i: number) => cartela[i]?.ouvidaEm !== null && cartela[i] !== undefined;
  let total = 0;
  for (let l = 0; l < lado; l++) {
    if (Array.from({ length: lado }, (_, c) => l * lado + c).every(ouvida)) total++;
  }
  for (let c = 0; c < lado; c++) {
    if (Array.from({ length: lado }, (_, l) => l * lado + c).every(ouvida)) total++;
  }
  if (Array.from({ length: lado }, (_, k) => k * lado + k).every(ouvida)) total++;
  if (Array.from({ length: lado }, (_, k) => k * lado + (lado - 1 - k)).every(ouvida)) total++;
  return total;
}

/** Cartela cheia? */
export function cartelaCheia(cartela: CasaBingo[]): boolean {
  return cartela.length > 0 && cartela.every(c => c.ouvidaEm !== null);
}
