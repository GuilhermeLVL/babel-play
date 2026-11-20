/**
 * DIMENSÕES DE UMA IMAGEM LIDAS DO CABEÇALHO, sem decodificar nada (PNG, JPEG e WebP).
 *
 * É o que permite recusar uma "bomba de descompressão" (poucos bytes que declaram 20000x20000 pixels) ANTES de
 * qualquer `createImageBitmap`/`Image`. Núcleo puro.
 */

export interface DimensoesDaImagem {
  formato: 'png' | 'jpeg' | 'webp';
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  largura: number;
  altura: number;
}

export function lerDimensoesDaImagem(b: Uint8Array): DimensoesDaImagem | null {
  const u16be = (o: number) => (b[o] << 8) | b[o + 1];
  const u16le = (o: number) => b[o] | (b[o + 1] << 8);
  const u24le = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
  const u32be = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

  if (
    b.length >= 24 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[12] === 0x49 &&
    b[13] === 0x48 &&
    b[14] === 0x44 &&
    b[15] === 0x52
  ) {
    return { formato: 'png', mime: 'image/png', largura: u32be(16), altura: u32be(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    for (let voltas = 0; i + 9 < b.length && voltas < 4096; voltas++) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const m = b[i + 1];
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { formato: 'jpeg', mime: 'image/jpeg', altura: u16be(i + 5), largura: u16be(i + 7) };
      }
      i += 2 + u16be(i + 2);
    }
    return null;
  }
  if (
    b.length >= 30 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
    const webp = (largura: number, altura: number): DimensoesDaImagem => ({
      formato: 'webp',
      mime: 'image/webp',
      largura,
      altura,
    });
    if (tag === 'VP8X') return webp(u24le(24) + 1, u24le(27) + 1);
    if (tag === 'VP8 ') return webp(u16le(26) & 0x3fff, u16le(28) & 0x3fff);
    if (tag === 'VP8L')
      return webp((b[22] | ((b[23] & 0x3f) << 8)) + 1, ((b[23] >> 6) | (b[24] << 2) | ((b[25] & 0x0f) << 10)) + 1);
  }
  return null;
}
