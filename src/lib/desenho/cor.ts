/**
 * COR DO TRAÇO — conversões entre RGB e HEX para o seletor do desenho livre.
 * Funções puras: o campo de cor nativo, os campos R/G/B e o campo HEX conversam por aqui.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Quanto a pessoa pode digitar: tira o que não é número, limita a 0–255 e arredonda. */
export function limitarCanal(valor: number | string): number {
  const n = typeof valor === 'number' ? valor : parseInt(String(valor).replace(/[^\d-]/g, ''), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(255, Math.max(0, Math.round(n)));
}

const doisDigitos = (n: number) => limitarCanal(n).toString(16).padStart(2, '0');

/** `{ r:255, g:0, b:128 }` → `#ff0080`. */
export function rgbParaHex({ r, g, b }: Rgb): string {
  return `#${doisDigitos(r)}${doisDigitos(g)}${doisDigitos(b)}`;
}

/**
 * Aceita `#abc`, `abc`, `#aabbcc`, `AABBCC` e devolve `#aabbcc` em minúsculas.
 * Texto que não é cor (incompleto, com letra fora de a–f) devolve `null`: quem digita ainda não terminou.
 */
export function normalizarHex(texto: string): string | null {
  const limpo = texto.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(limpo)) {
    return `#${limpo
      .split('')
      .map((c) => c + c)
      .join('')
      .toLowerCase()}`;
  }
  if (/^[0-9a-f]{6}$/i.test(limpo)) return `#${limpo.toLowerCase()}`;
  return null;
}

/** `#ff0080` → `{ r:255, g:0, b:128 }`; `null` se o texto não for uma cor. */
export function hexParaRgb(texto: string): Rgb | null {
  const hex = normalizarHex(texto);
  if (!hex) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** Cor com opacidade para o canvas: `rgba(r, g, b, a)`. */
export function rgba(hex: string, alfa: number): string {
  const c = hexParaRgb(hex) ?? { r: 0, g: 0, b: 0 };
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.min(1, Math.max(0, alfa))})`;
}

/** Mexe só em UM canal e devolve o HEX novo — o que o campo R, G ou B faz ao ser editado. */
export function trocarCanal(hex: string, canal: keyof Rgb, valor: number | string): string {
  const atual = hexParaRgb(hex) ?? { r: 0, g: 0, b: 0 };
  return rgbParaHex({ ...atual, [canal]: limitarCanal(valor) });
}
