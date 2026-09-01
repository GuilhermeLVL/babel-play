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

import { conquistasDesbloqueadas } from './conquistasPosse';
import type { TipoDesbloqueavel } from '@core';

// O tipo mudou para `core/loja.ts` (o catálogo é quem o consome); a REGRA de nível continua aqui.
export type { TipoDesbloqueavel };

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
  // Fonte: LIVRE desde o inicio (decisao do dono, 2026-08-27: a troca padrao/arcade e vitrine
  // da identidade do app, nao premio). O registro fica vazio de proposito.
  fonte: {},
  posicao: {
    right: 3,
    bottom: 3,
  },
  estudio: {
    abrir: 10,
  },
};

/** Nível necessário para usar o item (1 = livre desde o início). */
const CHAVE_LIBERADO = 'babel.liberado';

/**
 * LIBERAÇÃO TOTAL (dono/testes): `window.babel.liberarTudo()` no console, ou `?liberar=1` na URL.
 *
 * SÓ EM DESENVOLVIMENTO, desde 01/09. Ela é avaliada ANTES de tudo em `estadoDoItem`
 * (`lib/loja.ts`), então uma chave de localStorage destravava o catálogo inteiro — e o comentário
 * antigo ("não é segredo de segurança, é cosmético") deixou de valer quando a mesma tela passou a
 * vender item com dinheiro. Continua existindo para demonstração e validação; deixa de existir no
 * build que vai ao ar.
 */
export function liberadoTudo(): boolean {
  if (!import.meta.env.DEV) return false;
  try { return localStorage.getItem(CHAVE_LIBERADO) === '1'; } catch { return false; }
}

export function ativarLiberacaoTotal(ligar = true): void {
  try {
    if (ligar) localStorage.setItem(CHAVE_LIBERADO, '1');
    else localStorage.removeItem(CHAVE_LIBERADO);
  } catch { /* sem storage */ }
}

export function nivelNecessario(tipo: TipoDesbloqueavel, id: string): number {
  return CATALOGO[tipo]?.[id] ?? 1;
}

/**
 * `escolhaAtual`: o que a pessoa JÁ usa — nunca é rebaixado (regra 2).
 */
/**
 * EXCLUSIVOS DE CONQUISTA (economia v2): não têm nível nem preço; só a conquista abre.
 * Chave `tipo:id` → id da conquista (catálogo em `@core/learning/conquistas`).
 */
export const EXCLUSIVOS_DE_CONQUISTA: Record<string, string> = {
  'tema:aurora': 'constante',
};

export function desbloqueado(nivel: number, tipo: TipoDesbloqueavel, id: string, escolhaAtual?: string): boolean {
  if (liberadoTudo()) return true;
  if (escolhaAtual !== undefined && escolhaAtual === id) return true;
  const conquista = EXCLUSIVOS_DE_CONQUISTA[`${tipo}:${id}`];
  if (conquista) return conquistasDesbloqueadas().has(conquista);
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
