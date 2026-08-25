/**
 * Reamostragem do loopback WASAPI: Int16 estéreo 48 kHz → Int16 mono 16 kHz.
 * Módulo separado do router para ser testável (vitest) sem carregar Express/binário nativo.
 */

export const NATIVE_RATE = 48000;
export const TARGET_RATE = 16000;
export const DECIM = NATIVE_RATE / TARGET_RATE; // 3

/**
 * Média L/R por frame e média de cada 3 frames (decimação com box-filter — suficiente para fala;
 * não é um low-pass ideal). Mantém o resto entre chunks para nunca quebrar um grupo de frames no meio.
 */
export function makeDownsampler() {
  let carry: Buffer = Buffer.alloc(0);
  const GROUP_BYTES = DECIM * 4; // 3 frames × (2 canais × 2 bytes)
  return (chunk: Buffer): Buffer => {
    const data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    const groups = Math.floor(data.length / GROUP_BYTES);
    carry = data.subarray(groups * GROUP_BYTES);
    const out = Buffer.alloc(groups * 2);
    for (let g = 0; g < groups; g++) {
      let acc = 0;
      const base = g * GROUP_BYTES;
      for (let f = 0; f < DECIM; f++) {
        const l = data.readInt16LE(base + f * 4);
        const r = data.readInt16LE(base + f * 4 + 2);
        acc += (l + r) / 2;
      }
      out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(acc / DECIM))), g * 2);
    }
    return out;
  };
}
