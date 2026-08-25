import { describe, it, expect } from 'vitest';
import { makeDownsampler, DECIM } from '../server/audio/downsample';

/** Monta um chunk Int16LE estéreo a partir de pares [L, R]. */
function stereoChunk(frames: Array<[number, number]>): Buffer {
  const buf = Buffer.alloc(frames.length * 4);
  frames.forEach(([l, r], i) => {
    buf.writeInt16LE(l, i * 4);
    buf.writeInt16LE(r, i * 4 + 2);
  });
  return buf;
}

describe('makeDownsampler (48kHz estéreo → 16kHz mono)', () => {
  it('decima 3 frames em 1 amostra mono (média L/R e média dos 3 frames)', () => {
    const ds = makeDownsampler();
    // 3 frames: médias L/R = 100, 200, 300 → saída única = 200
    const out = ds(stereoChunk([[100, 100], [200, 200], [300, 300]]));
    expect(out.length).toBe(2);
    expect(out.readInt16LE(0)).toBe(200);
  });

  it('carrega o resto entre chunks sem perder frames', () => {
    const ds = makeDownsampler();
    // 4 frames no 1º chunk → 1 grupo completo + 1 frame de resto
    const out1 = ds(stereoChunk([[30, 30], [30, 30], [30, 30], [90, 90]]));
    expect(out1.length).toBe(2);
    expect(out1.readInt16LE(0)).toBe(30);
    // +2 frames → fecha o 2º grupo com o frame carregado (90+90+90)/3 = 90
    const out2 = ds(stereoChunk([[90, 90], [90, 90]]));
    expect(out2.length).toBe(2);
    expect(out2.readInt16LE(0)).toBe(90);
  });

  it('satura em vez de estourar o Int16', () => {
    const ds = makeDownsampler();
    const max = 32767;
    const out = ds(stereoChunk([[max, max], [max, max], [max, max]]));
    expect(out.readInt16LE(0)).toBe(max);
  });

  it('chunk menor que um grupo devolve saída vazia (tudo vira carry)', () => {
    const ds = makeDownsampler();
    const out = ds(stereoChunk([[10, 10]]));
    expect(out.length).toBe(0);
    expect(DECIM).toBe(3);
  });
});
