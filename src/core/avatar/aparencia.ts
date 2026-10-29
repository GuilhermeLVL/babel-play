/**
 * A APARÊNCIA DE UMA RECEITA: o que a paleta e os ajustes pedem ao modelo, em decisões puras. Quem mexe no `three`
 * é `src/lib/avatar/aparencia.ts`; aqui só ficam as regras testáveis sem WebGL.
 *
 *  · `mapearMateriais`: a PALETA só vale onde o modelo permite. Reconhece materiais nomeados à moda do VRoid Studio
 *    (`Face_Skin`, `Body_Skin`, `Hair`, `EyeIris`...). Modelo de textura única "assada" (como os da coleção
 *    100Avatars) não tem material separado de pele, cabelo ou olhos: a UI ESCONDE o controle em vez de fingir.
 *  · `escalaDaReceita`: altura, largura e escala viram o vetor de escala do modelo, dentro das faixas da receita.
 */
import { type CampoDaPaleta, CAMPOS_DA_PALETA } from './paleta';
import { FAIXAS_DE_AJUSTE, type ReceitaDeAvatar } from './receita';

export type MateriaisPorCampo = Record<CampoDaPaleta, number[]>;
export type SuporteDaPaleta = Record<CampoDaPaleta, boolean>;

const OLHOS = /iris|\beye[_\s-]?(color|ball)|olho/i;
const CABELO = /hair|cabelo/i;
const PELE = /skin|^body$|[_\s-]body$|^face$|pele/i;
/** Peças que parecem pele ou cabelo pelo nome mas têm cor própria. */
const NAO_RECOLORIR = /eye[_\s-]?(line|lash|brow|white|highlight)|brow|lash|mouth|teeth|tongue|cloth|hairpin|accessor/i;

export function mapearMateriais(nomes: readonly string[]): MateriaisPorCampo {
  const mapa: MateriaisPorCampo = { pele: [], cabelo: [], olhos: [] };
  nomes.forEach((nome, i) => {
    if (typeof nome !== 'string' || NAO_RECOLORIR.test(nome)) return;
    if (OLHOS.test(nome)) mapa.olhos.push(i);
    else if (CABELO.test(nome)) mapa.cabelo.push(i);
    else if (PELE.test(nome)) mapa.pele.push(i);
  });
  return mapa;
}

export function suporteDaPaleta(mapa: MateriaisPorCampo): SuporteDaPaleta {
  return Object.fromEntries(CAMPOS_DA_PALETA.map((c) => [c, mapa[c].length > 0])) as SuporteDaPaleta;
}

export const SEM_SUPORTE: SuporteDaPaleta = { pele: false, cabelo: false, olhos: false };

const dentro = (v: number | undefined, chave: keyof typeof FAIXAS_DE_AJUSTE) => {
  const { min, max } = FAIXAS_DE_AJUSTE[chave];
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 1;
};

/** Escala final do modelo: `escala` uniforme vezes altura (y) e largura (x e z). */
export function escalaDaReceita(ajustes: ReceitaDeAvatar['ajustes']): { x: number; y: number; z: number } {
  const e = dentro(ajustes.escala, 'escala');
  const larg = dentro(ajustes.largura, 'largura');
  const alt = dentro(ajustes.altura, 'altura');
  return { x: e * larg, y: e * alt, z: e * larg };
}
