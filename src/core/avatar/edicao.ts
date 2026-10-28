/**
 * EDITAR UMA RECEITA, sempre devolvendo uma receita NOVA e válida (a antiga nunca é alterada). A tela de
 * personalizar usa isto com uma pilha para o "Desfazer"; "Restaurar padrão" volta paleta e ajustes ao do modelo.
 */
import { type CampoDaPaleta, ehTokenDaPaleta, TOKEN_PADRAO } from './paleta';
import {
  type ChaveDeAjuste,
  FAIXAS_DE_AJUSTE,
  LIMITES_DA_RECEITA,
  type OrigemDaBase,
  type ReceitaDeAvatar,
  validarReceita,
  VERSAO_DA_RECEITA,
} from './receita';

export function receitaNova(base: { origem: OrigemDaBase; id: string }, nome: string, agora: number): ReceitaDeAvatar {
  const r = validarReceita({
    versao: VERSAO_DA_RECEITA,
    base,
    paleta: { pele: TOKEN_PADRAO, cabelo: TOKEN_PADRAO, olhos: TOKEN_PADRAO },
    pecas: [],
    ajustes: {},
    meta: { nome: nome.trim().slice(0, LIMITES_DA_RECEITA.tamanhoDoNome), criadoEm: Math.max(0, Math.floor(agora)) },
  });
  if ('erros' in r) throw new Error(`receita inicial inválida: ${r.erros.join('; ')}`);
  return r.receita;
}

/** Troca a base e mantém só o nome e a data; paleta e ajustes voltam ao padrão (cada modelo é um corpo diferente). */
export function comBase(r: ReceitaDeAvatar, base: { origem: OrigemDaBase; id: string }): ReceitaDeAvatar {
  return receitaNova(base, r.meta.nome, r.meta.criadoEm);
}

export function comPaleta(r: ReceitaDeAvatar, campo: CampoDaPaleta, id: string): ReceitaDeAvatar {
  if (!ehTokenDaPaleta(campo, id)) return r;
  return { ...r, paleta: { ...r.paleta, [campo]: id } };
}

/** Prende o número na faixa; o valor padrão (1) some da receita para ela ficar enxuta. */
export function comAjuste(r: ReceitaDeAvatar, chave: ChaveDeAjuste, valor: number): ReceitaDeAvatar {
  const { min, max } = FAIXAS_DE_AJUSTE[chave];
  if (!Number.isFinite(valor)) return r;
  const v = Math.round(Math.min(max, Math.max(min, valor)) * 100) / 100;
  const ajustes = { ...r.ajustes };
  if (v === 1) delete ajustes[chave];
  else ajustes[chave] = v;
  return { ...r, ajustes };
}

export function comNome(r: ReceitaDeAvatar, nome: string): ReceitaDeAvatar {
  return { ...r, meta: { ...r.meta, nome: nome.trim().slice(0, LIMITES_DA_RECEITA.tamanhoDoNome) } };
}

/** Volta paleta e ajustes ao padrão do modelo. */
export function restaurarPadrao(r: ReceitaDeAvatar): ReceitaDeAvatar {
  return {
    ...r,
    paleta: { pele: TOKEN_PADRAO, cabelo: TOKEN_PADRAO, olhos: TOKEN_PADRAO },
    ajustes: {},
  };
}

export const estaNoPadrao = (r: ReceitaDeAvatar): boolean =>
  r.paleta.pele === TOKEN_PADRAO &&
  r.paleta.cabelo === TOKEN_PADRAO &&
  r.paleta.olhos === TOKEN_PADRAO &&
  Object.keys(r.ajustes).length === 0;

export const receitasIguais = (a: ReceitaDeAvatar, b: ReceitaDeAvatar): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** A pilha do "Desfazer": guarda os estados anteriores, no máximo `max`. */
export interface Historico {
  passado: ReceitaDeAvatar[];
  atual: ReceitaDeAvatar;
}

export const iniciarHistorico = (r: ReceitaDeAvatar): Historico => ({ passado: [], atual: r });

export function aplicar(h: Historico, proxima: ReceitaDeAvatar, max = 50): Historico {
  if (receitasIguais(h.atual, proxima)) return h;
  return { passado: [...h.passado, h.atual].slice(-max), atual: proxima };
}

export function desfazer(h: Historico): Historico {
  const anterior = h.passado[h.passado.length - 1];
  return anterior ? { passado: h.passado.slice(0, -1), atual: anterior } : h;
}
