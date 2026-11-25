/**
 * PCM da prática de fala no aparelho (openspec `sombra-sem-web-speech`). Puro: sem DOM, sem rede, sem modelo.
 * O capturador (`lib/fala/ouvirFraseNoAparelho.ts`) junta os blocos do AudioWorklet, reamostra para 16 kHz (o contexto
 * roda na taxa nativa porque o Firefox recusa ligar o microfone a um contexto de outra taxa), decide se houve fala e
 * apara o silêncio das bordas ANTES de decodificar (silêncio decodificado é onde o modelo inventa texto).
 */

export const TAXA_DO_MODELO = 16_000;
/** Teto de uma tentativa: 30 s de PCM Float32 a 16 kHz (~1,9 MB). Passou, para de acumular. */
export const TETO_DE_SEGUNDOS = 30;

const QUADRO_MS = 30;
/** Piso absoluto de energia (~ -50 dBFS): abaixo disso é sala, não voz. */
const PISO_RMS = 0.003;
/** Quanto o quadro precisa passar do ruído de fundo (os 20% mais quietos) para ser fala. */
const FATOR_SOBRE_O_RUIDO = 3;
/** Menos que isto de fala (quadros de 30 ms) é um estalo ou uma tosse, não uma frase. */
const MIN_QUADROS_DE_FALA = 5;
/** Folga mantida em cada borda ao aparar (o começo e o fim de uma palavra são fracos). */
const FOLGA_MS = 200;

export function juntarBlocos(blocos: readonly Float32Array[]): Float32Array {
  let n = 0;
  for (const b of blocos) n += b.length;
  const out = new Float32Array(n);
  let o = 0;
  for (const b of blocos) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

/** Reamostra por média de janela (ao descer) ou interpolação linear (ao subir). */
export function reamostrarPara16k(pcm: Float32Array, taxaDeOrigem: number): Float32Array {
  if (!pcm.length || !(taxaDeOrigem > 0) || taxaDeOrigem === TAXA_DO_MODELO) return pcm;
  const razao = taxaDeOrigem / TAXA_DO_MODELO;
  const n = Math.floor(pcm.length / razao);
  const out = new Float32Array(n);
  if (razao > 1) {
    for (let i = 0; i < n; i++) {
      const ini = Math.floor(i * razao);
      const fim = Math.min(pcm.length, Math.max(ini + 1, Math.floor((i + 1) * razao)));
      let soma = 0;
      for (let j = ini; j < fim; j++) soma += pcm[j]!;
      out[i] = soma / (fim - ini);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const pos = i * razao;
      const a = Math.floor(pos);
      const b = Math.min(pcm.length - 1, a + 1);
      out[i] = pcm[a]! + (pcm[b]! - pcm[a]!) * (pos - a);
    }
  }
  return out;
}

const QUADRO = Math.round((TAXA_DO_MODELO * QUADRO_MS) / 1000);

function rmsDosQuadros(pcm: Float32Array): number[] {
  const rms: number[] = [];
  for (let i = 0; i + QUADRO <= pcm.length; i += QUADRO) {
    let s = 0;
    for (let j = i; j < i + QUADRO; j++) s += pcm[j]! * pcm[j]!;
    rms.push(Math.sqrt(s / QUADRO));
  }
  return rms;
}

export interface AnaliseDeFala {
  semFala: boolean;
  /** Quadros de 30 ms com fala. */
  quadrosDeFala: number;
  /** PCM sem o silêncio das bordas (com folga). O de entrada quando não há fala. */
  aparado: Float32Array;
  /** Duração do trecho aparado, em ms (0 sem fala). */
  duracaoMs: number;
}

/**
 * VAD por energia, adaptativo ao ruído da sala. É o degrau LEVE do desenho: o Silero em Worker (que a captura ao vivo
 * já tem) é a troca prevista se a medição [B] mostrar alucinação acima da régua (`docs/auditoria/2026-11-25-sombra-local-reguas.md`).
 */
export function analisarFala(pcm16k: Float32Array): AnaliseDeFala {
  const sem = (quadrosDeFala: number): AnaliseDeFala => ({
    semFala: true,
    quadrosDeFala,
    aparado: pcm16k,
    duracaoMs: 0,
  });
  const rms = rmsDosQuadros(pcm16k);
  if (rms.length < MIN_QUADROS_DE_FALA) return sem(0);
  const ordenado = [...rms].sort((a, b) => a - b);
  const ruido = ordenado[Math.floor(ordenado.length * 0.2)] ?? 0;
  const limiar = Math.max(PISO_RMS, ruido * FATOR_SOBRE_O_RUIDO);
  const fala = rms.map((v) => v >= limiar);
  const total = fala.filter(Boolean).length;
  if (total < MIN_QUADROS_DE_FALA) return sem(total);
  const folga = Math.round(FOLGA_MS / QUADRO_MS);
  const de = Math.max(0, fala.indexOf(true) - folga) * QUADRO;
  const ate = Math.min(pcm16k.length, (fala.lastIndexOf(true) + 1 + folga) * QUADRO);
  const aparado = pcm16k.slice(de, ate);
  return {
    semFala: false,
    quadrosDeFala: total,
    aparado,
    duracaoMs: Math.round((aparado.length / TAXA_DO_MODELO) * 1000),
  };
}
