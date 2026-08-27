/**
 * DESBLOQUEIOS POR NÍVEL — aparência como recompensa.
 *
 * Decisão do dono (2026-08-27): "travar quase tudo". Temas, posições extras do menu, a fonte
 * Arcade e o estúdio de cores viram prêmios da progressão de XP (o nível vem de
 * `deriveProgress`). Duas regras que NÃO se negociam:
 *
 *   1. PERFIS (kids/pro/sênior) nunca travam: são acessibilidade, não cosmético.
 *   2. Escolha JÁ SALVA nunca é rebaixada: quem chegou usando o tema X continua no tema X
 *      (o cadeado vale para TROCAR para algo ainda não conquistado, nunca para expulsar).
 */

export type TipoDesbloqueavel = 'tema' | 'fonte' | 'posicao' | 'estudio';

/** nível mínimo por item; o que não está aqui é livre desde o início. */
const CATALOGO: Record<TipoDesbloqueavel, Record<string, number>> = {
  tema: {
    linear: 2,
    vercel: 4,
    mochi: 6,
    notion: 7,
    premium: 8,
    custom: 10,
  },
  fonte: {
    pixel: 5,
  },
  posicao: {
    right: 3,
    bottom: 3,
  },
  estudio: {
    abrir: 10,
  },
};

/** Nível necessário para usar o item (1 = livre desde o início). */
export function nivelNecessario(tipo: TipoDesbloqueavel, id: string): number {
  return CATALOGO[tipo]?.[id] ?? 1;
}

/**
 * `escolhaAtual`: o que a pessoa JÁ usa — nunca é rebaixado (regra 2).
 */
export function desbloqueado(nivel: number, tipo: TipoDesbloqueavel, id: string, escolhaAtual?: string): boolean {
  if (escolhaAtual !== undefined && escolhaAtual === id) return true;
  return nivel >= nivelNecessario(tipo, id);
}

export interface Recompensa { tipo: TipoDesbloqueavel; id: string }

/** O que o nível `n` libera (para o toast de "subiu de nível"). */
export function recompensasDoNivel(n: number): Recompensa[] {
  const lista: Recompensa[] = [];
  for (const [tipo, itens] of Object.entries(CATALOGO) as Array<[TipoDesbloqueavel, Record<string, number>]>) {
    for (const [id, nivel] of Object.entries(itens)) if (nivel === n) lista.push({ tipo, id });
  }
  return lista;
}

/** Rótulo humano das recompensas (para o toast). */
export function rotuloDaRecompensa(r: Recompensa): string {
  if (r.tipo === 'fonte') return 'fonte Arcade (pixel)';
  if (r.tipo === 'estudio') return 'estúdio de cores e layout';
  if (r.tipo === 'posicao') return r.id === 'right' ? 'menu à direita' : 'menu embaixo';
  const nomes: Record<string, string> = { linear: 'tema Linear Indigo', vercel: 'tema Vercel Geist', mochi: 'tema Mochi Parchment', notion: 'tema Notion Charcoal', premium: 'tema Instrument Premium', custom: 'tema Customizado' };
  return nomes[r.id] ?? r.id;
}
