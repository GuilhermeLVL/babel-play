/**
 * O CATÁLOGO NO CLIENTE: o JSON estático (`public/catalogo/livros.json`), baixado SÓ quando a tela Livros
 * abre, uma vez por carga da página, e cacheado pelo CDN como os outros estáticos. Nada aqui vai ao servidor
 * do Frasy além do próprio arquivo.
 *
 * A defesa dupla do filtro legal também mora aqui: o livro passa de novo pelo filtro (com o ano-limite mais
 * restritivo entre o publicado e o do relógio do Brasil, e com a regra da tradução) antes de qualquer tela o
 * ver (`core/livros/filtroLegal`). A classificação etária que não for um valor conhecido vira `null` ("a
 * revisar"): nenhum valor estranho no JSON passa como "livre".
 */
import { ehClassificacao } from '../../core/livros/catalogo';
import { passaNaDefesaDoCliente } from '../../core/livros/filtroLegal';
import type { Catalogo, LivroDoCatalogo } from '../../core/livros/tipos';

const CAMINHO = '/catalogo/livros.json';

let pedido: Promise<Catalogo> | null = null;

/**
 * `obra` e `titulosAlternativos` são opcionais (catálogo antigo não os tem). Valor de tipo errado some, e a
 * edição vira uma obra só dela: nunca liga idiomas por um campo malformado.
 */
function comCamposDeObraValidos(l: LivroDoCatalogo): LivroDoCatalogo {
  const { obra, titulosAlternativos, ...resto } = l;
  const alternativos = Array.isArray(titulosAlternativos)
    ? titulosAlternativos.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : [];
  return {
    ...resto,
    ...(typeof obra === 'string' && obra ? { obra } : {}),
    ...(alternativos.length ? { titulosAlternativos: alternativos } : {}),
  };
}

export function validarCatalogo(bruto: unknown, agora: Date = new Date()): Catalogo {
  const c = bruto as Partial<Catalogo> | null;
  if (!c || c.versao !== 1 || !Array.isArray(c.livros) || typeof c.anoLimite !== 'number')
    throw new Error('catálogo de livros em formato desconhecido');
  const limite = c.anoLimite;
  const livros = c.livros
    .filter(
      (l): l is LivroDoCatalogo =>
        !!l && typeof l.id === 'string' && Array.isArray(l.autores) && Array.isArray(l.tradutores),
    )
    .map((l) => (ehClassificacao(l.classificacao) ? l : { ...l, classificacao: null }))
    .map(comCamposDeObraValidos)
    .filter((l) => passaNaDefesaDoCliente(l, limite, agora));
  return {
    versao: 1,
    ano: Number(c.ano),
    anoLimite: limite,
    geradoEm: String(c.geradoEm ?? ''),
    livros,
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
    .then((j) => validarCatalogo(j))
    .catch((e) => {
      pedido = null;
      throw e;
    });
  return pedido;
}
