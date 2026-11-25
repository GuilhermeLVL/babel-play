/**
 * O CORTE DO CLIPE DO CARTÃO (puro; openspec `cartao-com-audio-do-trecho`, tarefa 2.3).
 *
 * O pipeline entrega o PCM da fala já delimitada pelo detector de voz. O clipe é essa fala, no máximo `MAXIMO_MS`
 * (o início fica; uma frase não passa de 8 s), com `FOLGA_MS` de silêncio antes e depois para o corte não soar seco.
 * Fala curta demais (`MINIMO_MS`) é ruído, não clipe.
 */
export const FOLGA_MS = 150;
export const MAXIMO_MS = 8000;
export const MINIMO_MS = 300;

export interface ClipeRecortado {
  pcm: Float32Array;
  sr: number;
  durMs: number;
}

export function recortarClipe(pcm: Float32Array, sr: number): ClipeRecortado | null {
  if (!pcm.length || !(sr > 0)) return null;
  const falaMs = (pcm.length / sr) * 1000;
  if (falaMs < MINIMO_MS) return null;
  const folga = Math.round((FOLGA_MS * sr) / 1000);
  const fala = Math.min(pcm.length, Math.round((MAXIMO_MS * sr) / 1000));
  const saida = new Float32Array(folga + fala + folga);
  saida.set(pcm.subarray(0, fala), folga);
  return { pcm: saida, sr, durMs: Math.round((saida.length / sr) * 1000) };
}
