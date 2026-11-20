/**
 * APLICA A APARÊNCIA DA RECEITA a um modelo já carregado: recolore pele, cabelo e olhos nos materiais que o modelo
 * separa, e ajusta altura, largura e escala. SEM importar `three`: trabalha sobre a estrutura dos objetos, então
 * este módulo é leve e o `AvatarCanvas` o importa de forma estática.
 *
 * O recolorido é uma MULTIPLICAÇÃO sobre a textura do modelo (`material.color`, e a cor de sombra do MToon),
 * por isso funciona melhor em texturas neutras; cor "padrão" restaura a original, guardada no primeiro uso. Onde o
 * modelo não separa o material (textura única), o controle da paleta é escondido pela UI e nada é recolorido.
 */
import { escalaDaReceita, mapearMateriais, type SuporteDaPaleta, suporteDaPaleta } from '../../core/avatar/aparencia';
import { corDaPaleta, escurecerHex } from '../../core/avatar/paleta';
import type { ReceitaDeAvatar } from '../../core/avatar/receita';

interface CorLike {
  isColor?: boolean;
  set(valor: string): unknown;
  getHexString(): string;
}
interface MaterialLike {
  name?: string;
  color?: CorLike;
  shadeColorFactor?: CorLike;
  userData: Record<string, unknown>;
  needsUpdate?: boolean;
}
interface ObjetoLike {
  isMesh?: boolean;
  material?: MaterialLike | MaterialLike[];
  scale: { set(x: number, y: number, z: number): unknown };
  traverse(f: (o: ObjetoLike) => void): void;
}
export interface AvatarAplicavel {
  objeto: ObjetoLike;
}

const ORIGINAL = '__frasyCorOriginal';
const ORIGINAL_SOMBRA = '__frasyCorSombraOriginal';

/** Os materiais do modelo, na ordem em que aparecem (sem repetir). */
function materiaisDe(raiz: ObjetoLike): MaterialLike[] {
  const vistos = new Set<MaterialLike>();
  const lista: MaterialLike[] = [];
  raiz.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!vistos.has(m)) {
        vistos.add(m);
        lista.push(m);
      }
    }
  });
  return lista;
}

/** Quais controles da paleta ESTE modelo permite, pelo nome dos materiais. */
export function suporteDoModelo(avatar: AvatarAplicavel): SuporteDaPaleta {
  return suporteDaPaleta(mapearMateriais(materiaisDe(avatar.objeto).map((m) => m.name ?? '')));
}

export function aplicarAparencia(avatar: AvatarAplicavel, receita: ReceitaDeAvatar): SuporteDaPaleta {
  const materiais = materiaisDe(avatar.objeto);
  const mapa = mapearMateriais(materiais.map((m) => m.name ?? ''));
  for (const campo of ['pele', 'cabelo', 'olhos'] as const) {
    const cor = corDaPaleta(campo, receita.paleta[campo]);
    for (const i of mapa[campo]) {
      const mat = materiais[i];
      if (!mat.color || typeof mat.color.set !== 'function') continue;
      mat.userData[ORIGINAL] ??= `#${mat.color.getHexString()}`;
      if (mat.shadeColorFactor?.isColor) mat.userData[ORIGINAL_SOMBRA] ??= `#${mat.shadeColorFactor.getHexString()}`;
      const hex = cor?.hex ?? (mat.userData[ORIGINAL] as string);
      mat.color.set(hex);
      if (mat.shadeColorFactor?.isColor) {
        mat.shadeColorFactor.set(cor?.hex ? escurecerHex(cor.hex, 0.7) : (mat.userData[ORIGINAL_SOMBRA] as string));
      }
      mat.needsUpdate = true;
    }
  }
  const e = escalaDaReceita(receita.ajustes);
  avatar.objeto.scale.set(e.x, e.y, e.z);
  return suporteDaPaleta(mapa);
}
