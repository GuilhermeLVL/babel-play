/**
 * O PNG DO DESENHO: fundo transparente, só os traços com as cores escolhidas.
 * A altura cobre todos os traços (mesmo os que passam do fim do canvas atual).
 */
import type { Quadro } from './persistencia';
import { alturaQueCobre, desenharTudo, type Traco } from './tracos';

export interface PngDoDesenho {
  png: string;
  largura: number;
  altura: number;
}

/** `null` quando não há canvas (teste sem DOM, navegador sem 2D) ou quando não há traço. */
export function gerarPng(tracos: readonly Traco[], largura: number, altura: number): PngDoDesenho | null {
  if (typeof document === 'undefined' || tracos.length === 0 || largura <= 0) return null;
  try {
    const h = alturaQueCobre(tracos, altura);
    const c = document.createElement('canvas');
    c.width = Math.round(largura);
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    desenharTudo(ctx, tracos);
    const png = c.toDataURL('image/png');
    return png.startsWith('data:image/png') ? { png, largura: c.width, altura: c.height } : null;
  } catch {
    return null;
  }
}

export const gerarPngDoQuadro = (q: Quadro): PngDoDesenho | null => gerarPng(q.tracos, q.largura, q.altura);
