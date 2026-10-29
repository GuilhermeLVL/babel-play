/**
 * A MINIATURA ESTÁTICA do avatar (192 px), renderizada UMA vez a partir do canvas da prévia viva e guardada no
 * aparelho (`meuAvatar.ts`). As molduras do app mostram essa imagem: nenhuma abre um contexto WebGL.
 */

export const LADO_DA_MINIATURA = 192;

/** Copia o canvas WebGL (logo depois de um quadro desenhado) para 192x192 e devolve um data URL, ou `null`. */
export function capturarMiniatura(origem: HTMLCanvasElement): string | null {
  try {
    if (origem.width <= 0 || origem.height <= 0) return null;
    const c = document.createElement('canvas');
    c.width = LADO_DA_MINIATURA;
    c.height = LADO_DA_MINIATURA;
    const g = c.getContext('2d');
    if (!g) return null;
    // Reduz do quadro da prévia (superamostrado) para 192: suavização de alta qualidade, sem borda serrilhada.
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(origem, 0, 0, LADO_DA_MINIATURA, LADO_DA_MINIATURA);
    // WebP onde o navegador codifica (Chrome, Firefox); o Safari devolve PNG sozinho.
    const url = c.toDataURL('image/webp', 0.85);
    return /^data:image\/(png|webp|jpeg);base64,/.test(url) ? url : null;
  } catch {
    return null;
  }
}
