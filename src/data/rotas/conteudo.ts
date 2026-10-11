/**
 * O CLIENTE DO SELETOR DE CONTEÚDO — uma leitura só: `GET /api/vocab/conteudo`.
 *
 * As contagens por fonte (Tudo, Difíceis, cada sessão com cartões, cada baralho do Anki, a Trilha) no
 * idioma pedido. O contrato é `core/learning/contagensDeConteudo.ts`. Espelho sem conta:
 * `src/data/efemero/rotas/conteudo.ts`, que faz a mesma conta sobre o IndexedDB.
 */
import type { ContagensDeConteudo } from '../../core/learning/contagensDeConteudo';
import { apiFetch } from '../funil';

/**
 * A ÚLTIMA RESPOSTA E O ETag DELA, por idioma. O servidor responde 304 sem ler os cartões quando nada
 * mudou e o minuto é o mesmo; o `If-None-Match` vai explícito, como no resumo dos Cartões
 * (`rotas/cartoes.ts`): não depende de o cache HTTP do navegador ter guardado a resposta.
 */
const ultimas = new Map<string, { etag: string; contagens: ContagensDeConteudo }>();

/**
 * As contagens do catálogo, ou `null` se a leitura falhou (rede, servidor). `idioma` vazio pede o
 * maior idioma da conta. Quem chama trata o objeto como somente leitura.
 */
export async function lerContagensDeConteudo(idioma = ''): Promise<ContagensDeConteudo | null> {
  const base = idioma.toLowerCase().slice(0, 2);
  const memo = ultimas.get(base);
  try {
    const res = await apiFetch(
      `/api/vocab/conteudo${base ? `?idioma=${base}` : ''}`,
      memo ? { headers: { 'If-None-Match': memo.etag } } : undefined,
    );
    if (res.status === 304 && memo) return memo.contagens;
    if (!res.ok) return null;
    const contagens = (await res.json()) as ContagensDeConteudo;
    const etag = res.headers?.get?.('etag');
    if (etag) ultimas.set(base, { etag, contagens });
    else ultimas.delete(base);
    return contagens;
  } catch {
    return null;
  }
}

/** Zera a memória (troca de conta, testes). */
export function esquecerContagensDeConteudo(): void {
  ultimas.clear();
}
