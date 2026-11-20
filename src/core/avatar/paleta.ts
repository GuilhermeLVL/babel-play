/**
 * A PALETA DO AVATAR: tons de pele, cabelo e olhos, escolhidos para cobrir a diversidade real (nenhum tom é o
 * "padrão" e nenhum nome é de comida, de gênero ou de estereótipo). A receita guarda só o ID do token, nunca a cor.
 *
 * `padrao` = "as cores do modelo" (sem recolorir). Os nomes que a pessoa lê ficam na UI (`t()`), porque o core não
 * traduz. Núcleo puro.
 */

export const CAMPOS_DA_PALETA = ['pele', 'cabelo', 'olhos'] as const;
export type CampoDaPaleta = (typeof CAMPOS_DA_PALETA)[number];

export const TOKEN_PADRAO = 'padrao';

export interface CorDaPaleta {
  id: string;
  /** `null` = a cor do próprio modelo. */
  hex: string | null;
}

export const PALETA: Record<CampoDaPaleta, readonly CorDaPaleta[]> = {
  pele: [
    { id: TOKEN_PADRAO, hex: null },
    { id: 'muito-claro', hex: '#f6dfd0' },
    { id: 'claro', hex: '#efcdb5' },
    { id: 'claro-quente', hex: '#e8b88f' },
    { id: 'medio', hex: '#d7a074' },
    { id: 'medio-quente', hex: '#c68a5c' },
    { id: 'oliva', hex: '#b07a4c' },
    { id: 'moreno', hex: '#8d5a37' },
    { id: 'escuro', hex: '#6b4129' },
    { id: 'escuro-profundo', hex: '#4d2e1f' },
    { id: 'muito-escuro', hex: '#3a2217' },
  ],
  cabelo: [
    { id: TOKEN_PADRAO, hex: null },
    { id: 'preto', hex: '#1c1a1a' },
    { id: 'castanho-escuro', hex: '#3b2a20' },
    { id: 'castanho', hex: '#5a3a24' },
    { id: 'castanho-claro', hex: '#8a6240' },
    { id: 'loiro', hex: '#d8b46a' },
    { id: 'ruivo', hex: '#a8452a' },
    { id: 'grisalho', hex: '#9a9a9a' },
    { id: 'branco', hex: '#ececec' },
    { id: 'azul', hex: '#2f5fd0' },
    { id: 'verde', hex: '#2f9b5a' },
    { id: 'rosa', hex: '#e0609b' },
    { id: 'roxo', hex: '#7a4bc0' },
  ],
  olhos: [
    { id: TOKEN_PADRAO, hex: null },
    { id: 'castanho-escuro', hex: '#3b2412' },
    { id: 'castanho', hex: '#6a4a2a' },
    { id: 'mel', hex: '#a9792f' },
    { id: 'verde', hex: '#4b8f5a' },
    { id: 'azul', hex: '#4a7fc0' },
    { id: 'cinza', hex: '#7d8794' },
    { id: 'preto', hex: '#101010' },
    { id: 'violeta', hex: '#7a5fb5' },
  ],
};

export function corDaPaleta(campo: CampoDaPaleta, id: string): CorDaPaleta | null {
  return PALETA[campo].find((c) => c.id === id) ?? null;
}

export const ehTokenDaPaleta = (campo: CampoDaPaleta, id: unknown): id is string =>
  typeof id === 'string' && PALETA[campo].some((c) => c.id === id);

/** Escurece `#rrggbb` por um fator (0..1): serve à sombra do material, que acompanha o tom escolhido. */
export function escurecerHex(hex: string, fator: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = Math.min(1, Math.max(0, fator));
  const c = (v: number) =>
    Math.round(v * f)
      .toString(16)
      .padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}
