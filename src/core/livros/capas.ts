/**
 * CAPAS DO CATÁLOGO (spec `docs/specs/2026-10-28-livros-capas.md`): a regra pura de quando um livro tem
 * imagem de capa. Só a Standard Ebooks (CC0 para o arquivo todo, capa inclusive) entra nesta rodada; sem
 * licença verificada não há `capa`, e a tela cai na capa tipográfica. Sem rede, sem DOM.
 */
import type { CapaDoCatalogo, LivroDoCatalogo } from './tipos';

const BASE_SE = 'https://standardebooks.org/ebooks/';

/** O caminho no Standard Ebooks (`herman-melville/moby-dick`): letras minúsculas, números e hífen em 2 níveis. */
const CAMINHO_SE = /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*){1,3}$/;

/** A miniatura estável (350x525, CORS `*`) de um livro do Standard Ebooks, ou `null` se o caminho não for válido. */
export function capaDoStandardEbooks(fonteId: string): CapaDoCatalogo | null {
  if (!CAMINHO_SE.test(fonteId)) return null;
  return {
    origem: 'standard-ebooks',
    url: `${BASE_SE}${fonteId}/downloads/cover-thumbnail.jpg`,
    licenca: 'CC0',
    credito: 'Capa: Standard Ebooks (CC0)',
  };
}

/**
 * Valida o que veio do JSON: só uma capa conhecida, com licença CC0 e URL `https` do próprio Standard Ebooks,
 * sem credenciais. Qualquer outra coisa (campo malformado, host estranho, licença diferente) vira `null`.
 */
export function capaValida(bruto: unknown): CapaDoCatalogo | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const c = bruto as Record<string, unknown>;
  if (c.origem !== 'standard-ebooks' || c.licenca !== 'CC0') return null;
  if (typeof c.url !== 'string' || typeof c.credito !== 'string' || !c.credito.trim()) return null;
  if (!c.url.startsWith(BASE_SE) || !/^[\x21-\x7e]+$/.test(c.url) || /[@?#\\]/.test(c.url)) return null;
  if (!c.url.endsWith('/downloads/cover-thumbnail.jpg')) return null;
  return { origem: 'standard-ebooks', url: c.url, licenca: 'CC0', credito: c.credito.trim().slice(0, 120) };
}

/** A capa do livro, já validada (o livro pode ter vindo de um catálogo antigo, sem o campo). */
export const capaDoLivro = (l: Pick<LivroDoCatalogo, 'capa'>): CapaDoCatalogo | null => capaValida(l.capa);
