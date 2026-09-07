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

import { CATALOGO_DA_LOJA, estadoPorAlvo } from './loja';
import type { TipoDesbloqueavel } from '@core';

// O tipo mudou para `core/loja.ts` (o catálogo é quem o consome); a REGRA de nível continua aqui.
export type { TipoDesbloqueavel };

/**
 * O NÍVEL VEM DO CATÁLOGO, não de uma segunda tabela.
 *
 * Havia aqui um `CATALOGO` próprio com o nível de cada tema, posição e do estúdio — os MESMOS
 * itens que `src/core/loja.ts` já descreve, com o mesmo número escrito de novo. Os dois
 * concordavam por coincidência, e nada os prendia: mudar o preço ou o nível de um tema na Loja
 * deixava o seletor de aparência com o valor antigo (auditoria de 2026-09-07, achado A10).
 */

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
  /* `import.meta as unknown as ...` é o padrão da casa (ver `lib/edicao.ts`): o tsconfig do
     servidor não carrega os tipos do Vite, e `import.meta.env` existe em runtime. */
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  if (!env?.DEV) return false;
  try { return localStorage.getItem(CHAVE_LIBERADO) === '1'; } catch { return false; }
}

export function ativarLiberacaoTotal(ligar = true): void {
  try {
    if (ligar) localStorage.setItem(CHAVE_LIBERADO, '1');
    else localStorage.removeItem(CHAVE_LIBERADO);
  } catch { /* sem storage */ }
}

export function nivelNecessario(tipo: TipoDesbloqueavel, id: string): number {
  return CATALOGO_DA_LOJA.find((i) => i.tipo === tipo && i.alvo === id)?.nivel ?? 1;
}

/**
 * `escolhaAtual`: o que a pessoa JÁ usa — nunca é rebaixado (regra 2).
 */
/**
 * UMA RÉGUA SÓ (achado A10).
 *
 * Esta função decidia por conta própria — nível, mais um mapa local de exclusivos de conquista — e
 * não sabia nada de compra com Seeds nem de posse premium. Quem comprasse o tema Linear por 60
 * Seeds no nível 1 continuava vendo o cadeado aqui: pagou e não pôde equipar.
 *
 * Agora ela delega a `estadoPorAlvo`, que é a MESMA função que a Loja, o Inventário, o Passe e o
 * `equiparItem` usam. O saldo entra como zero de propósito: quem pergunta "está desbloqueado?"
 * quer saber se PODE USAR agora, não se poderia comprar — "compravel" é resposta da Loja, e aqui
 * seria um cadeado disfarçado de permissão.
 */
export function desbloqueado(nivel: number, tipo: TipoDesbloqueavel, id: string, escolhaAtual?: string): boolean {
  if (liberadoTudo()) return true;
  return estadoPorAlvo(tipo, id, nivel, 0, escolhaAtual).estado === 'equipavel';
}

export interface Recompensa { tipo: TipoDesbloqueavel; id: string }

/**
 * O que o nível `n` libera (para o toast de "subiu de nível") — lido do catálogo.
 *
 * Vinha da tabela local, que só conhecia tema, posição e estúdio: subir de nível liberava um
 * cursor ou um pacote de partículas e o toast não dizia nada. Agora o toast fala de tudo que o
 * nível abre, porque pergunta a quem sabe.
 */
export function recompensasDoNivel(n: number): Recompensa[] {
  const TIPOS_DE_APARENCIA: TipoDesbloqueavel[] = ['tema', 'fonte', 'posicao', 'estudio'];
  return CATALOGO_DA_LOJA
    .filter((i) => i.nivel === n && !i.exclusivoDe && TIPOS_DE_APARENCIA.includes(i.tipo as TipoDesbloqueavel))
    .map((i) => ({ tipo: i.tipo as TipoDesbloqueavel, id: i.alvo }));
}

/** Rótulo humano das recompensas (para o toast). */
export function rotuloDaRecompensa(r: Recompensa): string {
  if (r.tipo === 'fonte') return 'fonte Arcade (pixel)';
  if (r.tipo === 'estudio') return 'estúdio de cores e layout';
  if (r.tipo === 'posicao') return r.id === 'right' ? 'menu à direita' : 'menu embaixo';
  const nomes: Record<string, string> = { linear: 'tema Linear Indigo', vercel: 'tema Vercel Geist', mochi: 'tema Mochi Parchment', notion: 'tema Notion Charcoal', premium: 'tema Instrument Premium', custom: 'tema Customizado' };
  return nomes[r.id] ?? r.id;
}
