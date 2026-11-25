/**
 * Simulação OFFLINE e leve do VAD de energia da sombra local (openspec `sombra-sem-web-speech`, 1.2 parcial): sem
 * modelo, sem rede. Gera "fala" sintética (portadora harmônica com envelope silábico de 4 a 6 Hz) com ruído de sala em
 * vários SNRs e ritmos, e silêncio/ruído puro, e confere as réguas de `docs/auditoria/2026-11-25-sombra-local-reguas.md`.
 *
 * Uso: `npx tsx scripts/eval-fala/sombra-vad.ts`. Determinístico (PRNG com semente fixa).
 * NÃO mede WER nem alucinação de modelo: isso é a bancada [B] (moonshine/whisper) e fica aberta.
 */
import { analisarFala, juntarBlocos, TAXA_DO_MODELO as FS } from '../../src/core/fala/pcm';

let semente = 20261125;
const alea = () => {
  semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0;
  return semente / 0x100000000;
};
const gauss = () => Math.sqrt(-2 * Math.log(alea() || 1e-9)) * Math.cos(2 * Math.PI * alea());

function ruido(seg: number, rms: number): Float32Array {
  const o = new Float32Array(Math.round(seg * FS));
  for (let i = 0; i < o.length; i++) o[i] = rms * gauss();
  return o;
}

/** Fala sintética: harmônicos de f0 (100 a 220 Hz) com envelope silábico; amplitude RMS alvo `rms`. */
function fala(seg: number, rms: number, ritmo: number): Float32Array {
  const n = Math.round(seg * FS);
  const o = new Float32Array(n);
  const f0 = 100 + alea() * 120;
  const silabas = (4 + alea() * 2) * ritmo;
  let soma = 0;
  for (let i = 0; i < n; i++) {
    const t = i / FS;
    const env = Math.max(0, Math.sin(Math.PI * silabas * t)) ** 0.6;
    let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    o[i] = v * env;
    soma += o[i]! * o[i]!;
  }
  const g = rms / Math.sqrt(soma / n || 1);
  for (let i = 0; i < n; i++) o[i]! *= g;
  return o;
}
const somar = (a: Float32Array, b: Float32Array) => {
  const o = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i]! + (b[i] ?? 0);
  return o;
};

const RUIDO_DE_SALA = [0, 0.0005, 0.002, 0.005];
const N = 200;
let silencioFalso = 0;
let silencioTotal = 0;
for (let k = 0; k < N; k++) {
  const seg = 0.5 + alea() * 2.5;
  const rms = RUIDO_DE_SALA[k % RUIDO_DE_SALA.length]!;
  silencioTotal++;
  if (!analisarFala(rms === 0 ? new Float32Array(Math.round(seg * FS)) : ruido(seg, rms)).semFala) silencioFalso++;
}

function rodada(duracao: number, snrDb: number) {
  let ok = 0;
  let dentro = 0;
  for (let k = 0; k < N; k++) {
    const ritmo = [0.8, 1, 1.2][k % 3]!;
    const amb = 0.002 + alea() * 0.003;
    const rmsFala = amb * 10 ** (snrDb / 20);
    const antes = 0.4 + alea() * 1.2;
    const depois = 0.4 + alea() * 1.2;
    const f = fala(duracao, rmsFala, ritmo);
    const pcm = juntarBlocos([ruido(antes, amb), somar(f, ruido(duracao, amb)), ruido(depois, amb)]);
    const a = analisarFala(pcm);
    if (!a.semFala) {
      ok++;
      if (Math.abs(a.duracaoMs - duracao * 1000) <= 400 + 400) dentro++; // duração real + a folga de 200 ms por borda
    }
  }
  return { detectada: ok / N, duracaoOk: ok ? dentro / ok : 0 };
}

const linhas: string[] = [];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
linhas.push(`| Caso | Detectada | Duração dentro da folga |`, `| --- | --- | --- |`);
for (const [dur, snr] of [
  [3, 20],
  [3, 10],
  [0.8, 10],
  [3, 6],
  [0.8, 6],
] as const) {
  const r = rodada(dur, snr);
  linhas.push(`| fala ${dur} s, SNR ${snr} dB | ${pct(r.detectada)} | ${pct(r.duracaoOk)} |`);
}
console.log(`Falso "tem fala" em silêncio e ruído de sala (n=${silencioTotal}): ${pct(silencioFalso / silencioTotal)}`);
console.log(linhas.join('\n'));
