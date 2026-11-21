/**
 * NORMALIZAÇÃO DE VOLUME do áudio enviado ao STT de nuvem (openspec `stt-ingles-volume-e-rota`, REQ-014).
 *
 * POR QUE: o OpenRouter manda a transcrição à DeepInfra, que devolve texto cortado (ou vazio) em áudio gravado baixo
 * (inglês do FLEURS, mediana de −60 dBFS): 27,8% de WER. Com o pico levado a −3 dBFS antes do envio, 6,1%
 * (`docs/auditoria/2026-10-09-medicoes-de-nuvem.md`). O cliente é o lugar certo: já tem o PCM e nada novo vai à rede.
 *
 * COMO: o "pico" é o PERCENTIL 99,9 do módulo das amostras, não o máximo — um clique isolado não anula o ganho da fala.
 * O ganho leva esse pico a −3 dBFS, com teto de 40 dB, NUNCA atenua e não amplifica trecho abaixo do piso de silêncio
 * (ruído de fundo viraria "fala" e alimentaria alucinação). As amostras acima do percentil são LIMITADAS a [−1, 1].
 * Devolve uma CÓPIA: o PCM original segue para os motores locais, a reserva local e a gravação.
 *
 * Puro: sem DOM, sem rede, sem React.
 */

export const PICO_ALVO_DBFS = -3;
export const GANHO_MAXIMO_DB = 40;
/** Abaixo disto (pico do trecho) não se amplifica: é silêncio ou ruído de fundo. */
export const PISO_DE_SILENCIO_DBFS = -70;
export const PERCENTIL_DO_PICO = 0.999;

export interface VolumeNormalizado {
  /** Cópia do PCM, com o ganho aplicado e limitada a [−1, 1] quando houve ganho; igual ao original quando não houve. */
  pcm: Float32Array;
  /** Ganho linear aplicado (1 = nenhum). */
  ganho: number;
  /** O mesmo ganho em dB (0 = nenhum). */
  ganhoDb: number;
  /** O pico medido (percentil 99,9 do módulo) em dBFS; −Infinity para trecho vazio ou mudo. */
  picoDbfs: number;
}

const paraDb = (linear: number) => 20 * Math.log10(linear);
const deDb = (db: number) => 10 ** (db / 20);

/** O k-ésimo menor valor (0-based) por quickselect iterativo; reordena `a`. */
function selecionar(a: Float32Array, k: number): number {
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const pivo = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pivo) i++;
      while (a[j] > pivo) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return a[k];
}

/** O percentil `p` (0..1) do módulo das amostras; amostra não finita conta como 0. */
export function picoPorPercentil(pcm: Float32Array, p: number = PERCENTIL_DO_PICO): number {
  const n = pcm.length;
  if (n === 0) return 0;
  const modulos = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = pcm[i];
    modulos[i] = Number.isFinite(v) ? Math.abs(v) : 0;
  }
  return selecionar(modulos, Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1)));
}

export function normalizarVolume(pcm: Float32Array): VolumeNormalizado {
  const pico = picoPorPercentil(pcm);
  const picoDbfs = pico > 0 ? paraDb(pico) : -Infinity;
  const copia = new Float32Array(pcm);
  if (picoDbfs < PISO_DE_SILENCIO_DBFS || picoDbfs >= PICO_ALVO_DBFS) {
    return { pcm: copia, ganho: 1, ganhoDb: 0, picoDbfs };
  }
  const ganho = Math.min(deDb(PICO_ALVO_DBFS) / pico, deDb(GANHO_MAXIMO_DB));
  for (let i = 0; i < copia.length; i++) {
    const v = copia[i] * ganho;
    copia[i] = v > 1 ? 1 : v < -1 ? -1 : v === v ? v : 0; // NaN vira 0
  }
  return { pcm: copia, ganho, ganhoDb: paraDb(ganho), picoDbfs };
}
