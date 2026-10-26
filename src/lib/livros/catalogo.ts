/**
 * O CATÁLOGO NO CLIENTE: o JSON estático (`public/catalogo/livros.json`), baixado SÓ quando a tela Livros
 * abre, uma vez por carga da página, e cacheado pelo CDN como os outros estáticos. Nada aqui vai ao servidor
 * do Frasy além do próprio arquivo.
 *
 * A defesa dupla do filtro legal também mora aqui: livro que passa do `anoLimite` publicado, ou que não tem
 * ano de morte, é descartado na leitura, antes de qualquer tela o ver (`core/livros/filtroLegal`).
 */
import { respeitaOLimite } from '../../core/livros/filtroLegal';
import type { Catalogo } from '../../core/livros/tipos';

const CAMINHO = '/catalogo/livros.json';

let pedido: Promise<Catalogo> | null = null;

function validar(bruto: unknown): Catalogo {
  const c = bruto as Partial<Catalogo> | null;
  if (!c || c.versao !== 1 || !Array.isArray(c.livros) || typeof c.anoLimite !== 'number')
    throw new Error('catálogo de livros em formato desconhecido');
  return {
    versao: 1,
    ano: Number(c.ano),
    anoLimite: c.anoLimite,
    geradoEm: String(c.geradoEm ?? ''),
    livros: c.livros.filter((l) => respeitaOLimite(l, c.anoLimite as number)),
    exclusoes: Array.isArray(c.exclusoes) ? c.exclusoes : [],
  };
}

/** O catálogo (uma vez por carga). Falhou, a próxima chamada tenta de novo. */
export function carregarCatalogo(): Promise<Catalogo> {
  pedido ??= fetch(CAMINHO)
    .then((r) => {
      if (!r.ok) throw new Error(`catálogo indisponível (HTTP ${r.status})`);
      return r.json();
    })
    .then(validar)
    .catch((e) => {
      pedido = null;
      throw e;
    });
  return pedido;
}
