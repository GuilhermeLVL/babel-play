/**
 * EDIÇÃO DE PEÇAS NA RECEITA (Estúdio). Cada função devolve uma receita NOVA e sempre válida; quando o pedido não
 * cabe (peça desconhecida, mesmo lugar, orçamento), devolve a MESMA receita e o motivo. Núcleo puro.
 *
 * Quem grava (v2) é o Estúdio: uma receita v1 sobe para v2 na primeira edição de peça (`migrarReceitaParaV2`).
 */
import { ehCorDePeca, LIMITE_DE_PECAS, type LugarDaPeca, pecaPorId, TOKEN_DE_COR_PADRAO, validarPecas } from './pecas';
import type { ReceitaDeAvatar } from './receita';
import { migrarReceitaParaV2 } from './receitaArquivo';

export type MotivoDaNegativa = 'desconhecida' | 'incompativel' | 'lugar' | 'limite' | 'orcamento' | 'bloqueada';
export interface ResultadoDaEdicao {
  receita: ReceitaDeAvatar;
  /** Presente quando o pedido não foi aplicado. */
  negado?: { motivo: MotivoDaNegativa; com?: string };
}

const emV2 = (r: ReceitaDeAvatar): ReceitaDeAvatar => migrarReceitaParaV2(r).receita;

function motivoDe(erro: string): MotivoDaNegativa {
  if (erro.includes('desconhecida')) return 'desconhecida';
  if (erro.includes('não combina')) return 'incompativel';
  if (erro.includes('mesmo lugar')) return 'lugar';
  if (erro.includes('triângulos')) return 'orcamento';
  return 'limite';
}

/**
 * Liga a peça. Se ela divide o lugar com outra já ligada, a outra SAI (trocar um chapéu por outro é um toque só).
 * `liberada(id)` diz se a pessoa pode usar a peça (posse da loja); omitido, todas valem.
 */
export function ligarPeca(
  r: ReceitaDeAvatar,
  id: string,
  liberada: (id: string) => boolean = () => true,
): ResultadoDaEdicao {
  const p = pecaPorId(id);
  if (!p) return { receita: r, negado: { motivo: 'desconhecida' } };
  if (!liberada(id)) return { receita: r, negado: { motivo: 'bloqueada' } };
  const base = emV2(r);
  if (base.pecas.includes(id)) return { receita: r };
  const ocupados = new Set<LugarDaPeca>(p.lugares);
  const ficam = base.pecas.filter((o) => !pecaPorId(o)?.lugares.some((l) => ocupados.has(l)));
  const proxima = [...ficam, id];
  const erros = validarPecas(proxima, { origem: base.base.origem });
  if (erros.length > 0) {
    const motivo = proxima.length > LIMITE_DE_PECAS ? 'limite' : motivoDe(erros[0]);
    return { receita: r, negado: { motivo } };
  }
  const cores = Object.fromEntries(Object.entries(base.coresDasPecas ?? {}).filter(([k]) => proxima.includes(k)));
  return { receita: { ...base, pecas: proxima, coresDasPecas: cores } };
}

export function desligarPeca(r: ReceitaDeAvatar, id: string): ReceitaDeAvatar {
  if (!r.pecas.includes(id)) return r;
  const base = emV2(r);
  const cores = { ...(base.coresDasPecas ?? {}) };
  delete cores[id];
  return { ...base, pecas: base.pecas.filter((o) => o !== id), coresDasPecas: cores };
}

/** Sobe (`-1`) ou desce (`+1`) a peça na ordem de desenho. */
export function moverPeca(r: ReceitaDeAvatar, id: string, passo: -1 | 1): ReceitaDeAvatar {
  const i = r.pecas.indexOf(id);
  const j = i + passo;
  if (i < 0 || j < 0 || j >= r.pecas.length) return r;
  const base = emV2(r);
  const lista = [...base.pecas];
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return { ...base, pecas: lista };
}

/** Cor da parte principal da peça; o padrão (`padrao`) some do mapa para a receita ficar enxuta. */
export function corDaPeca(r: ReceitaDeAvatar, id: string, cor: string): ReceitaDeAvatar {
  if (!r.pecas.includes(id) || !ehCorDePeca(cor)) return r;
  const base = emV2(r);
  const cores = { ...(base.coresDasPecas ?? {}) };
  if (cor === TOKEN_DE_COR_PADRAO) delete cores[id];
  else cores[id] = cor;
  return { ...base, coresDasPecas: cores };
}

/** Tira todas as peças e cores (o "Restaurar" do Estúdio); o resto da receita fica. */
export function limparPecas(r: ReceitaDeAvatar): ReceitaDeAvatar {
  if (r.pecas.length === 0 && Object.keys(r.coresDasPecas ?? {}).length === 0) return r;
  return { ...emV2(r), pecas: [], coresDasPecas: {} };
}
