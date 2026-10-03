/**
 * FEATURES MEL DO SMART TURN v3 — a entrada do modelo de fim de fala, igual à do `WhisperFeatureExtractor`.
 *
 * O Smart Turn v3 (pipecat-ai/smart-turn, encoder do Whisper tiny) recebe `input_features` [1, 80, 800]: o
 * log-mel de Whisper de EXATAMENTE 8 s de áudio a 16 kHz. O modelo foi treinado com a saída do extrator do
 * transformers, e um desvio pequeno aqui muda a probabilidade em silêncio — por isso a conta repete a de lá, e
 * o teste compara com a saída real do extrator (`tests/fixtures/smartTurnMel.json`):
 *
 *   1. últimos 8 s do áudio; se for menos, ZEROS NO COMEÇO (o áudio fica no fim do vetor);
 *   2. onda normalizada (média 0, variância 1, epsilon 1e-7) — `do_normalize=True`;
 *   3. STFT: janela de Hann periódica de 400, passo de 160, reflexão de 200 amostras nas pontas, potência;
 *   4. filtros mel de Slaney (80 bins, 0–8000 Hz, norma Slaney) sobre os 201 bins de frequência;
 *   5. log10 com piso de 1e-10, descarta o último quadro (801 → 800), limita a 8 abaixo do máximo e
 *      (x + 4) / 4.
 *
 * O FFT de 400 pontos não é potência de 2 (400 = 2⁴·5²): uma FFT genérica de raízes mistas (a mesma ideia do
 * kissfft) dá ~7 mil multiplicações por quadro, contra 160 mil de uma DFT direta. Roda no worker do fim de
 * fala; sem dependências, então a bancada em Node usa o mesmo arquivo.
 */

const TAXA = 16000;
export const JANELA_AMOSTRAS = 8 * TAXA;
export const BINS_MEL = 80;
export const QUADROS_MEL = 800;

const N_FFT = 400;
const PASSO = 160;
const BINS_DE_FREQUENCIA = N_FFT / 2 + 1; // 201

// ───────────────────────────── filtros mel (Slaney) ─────────────────────────────
const F_SP = 200 / 3;
const MEL_MIN_LOG = 1000 / F_SP;
const PASSO_LOG = Math.log(6.4) / 27;
const hzParaMel = (hz: number): number => (hz >= 1000 ? MEL_MIN_LOG + Math.log(hz / 1000) / PASSO_LOG : hz / F_SP);
const melParaHz = (mel: number): number =>
  mel >= MEL_MIN_LOG ? 1000 * Math.exp(PASSO_LOG * (mel - MEL_MIN_LOG)) : F_SP * mel;

/** [80][201], linha por filtro: a mesma conta de `mel_filter_bank(norm="slaney", mel_scale="slaney")`. */
function montarFiltros(): Float64Array[] {
  const melMin = hzParaMel(0);
  const melMax = hzParaMel(TAXA / 2);
  const centros = new Float64Array(BINS_MEL + 2);
  for (let i = 0; i < centros.length; i++) centros[i] = melParaHz(melMin + ((melMax - melMin) * i) / (BINS_MEL + 1));
  const filtros: Float64Array[] = [];
  for (let m = 0; m < BINS_MEL; m++) {
    const f = new Float64Array(BINS_DE_FREQUENCIA);
    const baixo = centros[m];
    const meio = centros[m + 1];
    const alto = centros[m + 2];
    const norma = 2 / (alto - baixo);
    for (let k = 0; k < BINS_DE_FREQUENCIA; k++) {
      const freq = (k * (TAXA / 2)) / (BINS_DE_FREQUENCIA - 1);
      const descida = (alto - freq) / (alto - meio);
      const subida = (freq - baixo) / (meio - baixo);
      f[k] = Math.max(0, Math.min(subida, descida)) * norma;
    }
    filtros.push(f);
  }
  return filtros;
}

// ───────────────────────────── FFT de raízes mistas ─────────────────────────────
interface PlanoDeFft {
  fatores: number[]; // pares [raiz, tamanho do bloco]
  cos: Float64Array;
  sen: Float64Array;
}

function planejar(n: number): PlanoDeFft {
  const fatores: number[] = [];
  let resto = n;
  let p = 4;
  const raiz = Math.floor(Math.sqrt(resto));
  // Mesma ordem do kissfft: 4 primeiro, depois 2, 3, 5…
  for (;;) {
    while (resto % p) {
      if (p === 4) p = 2;
      else if (p === 2) p = 3;
      else p += 2;
      if (p > raiz) p = resto;
    }
    resto /= p;
    fatores.push(p, resto);
    if (resto <= 1) break;
  }
  const cos = new Float64Array(n);
  const sen = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / n);
    sen[i] = Math.sin((-2 * Math.PI * i) / n);
  }
  return { fatores, cos, sen };
}

/** Uma FFT complexa de tamanho `n` (sem normalizar), recursiva por raiz — `entrada` tem passo `passoEntrada`. */
function fftRecursiva(
  saidaRe: Float64Array,
  saidaIm: Float64Array,
  saidaPos: number,
  entradaRe: Float64Array,
  entradaIm: Float64Array,
  entradaPos: number,
  passoDoPlano: number,
  plano: PlanoDeFft,
  indiceDeFator: number,
  n: number,
): void {
  const p = plano.fatores[indiceDeFator];
  const m = plano.fatores[indiceDeFator + 1];
  if (m === 1) {
    for (let i = 0; i < p; i++) {
      saidaRe[saidaPos + i] = entradaRe[entradaPos + i * passoDoPlano];
      saidaIm[saidaPos + i] = entradaIm[entradaPos + i * passoDoPlano];
    }
  } else {
    for (let u = 0; u < p; u++) {
      fftRecursiva(
        saidaRe,
        saidaIm,
        saidaPos + u * m,
        entradaRe,
        entradaIm,
        entradaPos + u * passoDoPlano,
        passoDoPlano * p,
        plano,
        indiceDeFator + 2,
        n,
      );
    }
  }
  // Borboleta genérica de raiz p sobre os p blocos de tamanho m.
  const tmpRe = new Float64Array(p);
  const tmpIm = new Float64Array(p);
  for (let u = 0; u < m; u++) {
    for (let q = 0; q < p; q++) {
      tmpRe[q] = saidaRe[saidaPos + u + q * m];
      tmpIm[q] = saidaIm[saidaPos + u + q * m];
    }
    for (let q1 = 0; q1 < p; q1++) {
      const k = u + q1 * m;
      let re = tmpRe[0];
      let im = tmpIm[0];
      let t = 0;
      for (let q = 1; q < p; q++) {
        t = (t + passoDoPlano * k) % n;
        const c = plano.cos[t];
        const s = plano.sen[t];
        re += tmpRe[q] * c - tmpIm[q] * s;
        im += tmpRe[q] * s + tmpIm[q] * c;
      }
      saidaRe[saidaPos + k] = re;
      saidaIm[saidaPos + k] = im;
    }
  }
}

// ───────────────────────────── o extrator ─────────────────────────────
let filtros: Float64Array[] | null = null;
let plano: PlanoDeFft | null = null;
let janelaDeHann: Float64Array | null = null;

function prepararTabelas(): void {
  if (filtros) return;
  filtros = montarFiltros();
  plano = planejar(N_FFT);
  janelaDeHann = new Float64Array(N_FFT);
  // Hann PERIÓDICA (o `window_function` do transformers): divide por N, não por N − 1.
  for (let i = 0; i < N_FFT; i++) janelaDeHann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);
}

/** Reflexão sem repetir a borda (`np.pad(mode="reflect")`). */
function refletir(i: number, n: number): number {
  if (n === 1) return 0;
  const periodo = 2 * (n - 1);
  let j = ((i % periodo) + periodo) % periodo;
  if (j >= n) j = periodo - j;
  return j;
}

/**
 * O áudio (16 kHz mono, qualquer duração) → `Float32Array` de 80 × 800, linha por bin mel
 * (`[bin * 800 + quadro]`), pronto para `Tensor('float32', dados, [1, 80, 800])`.
 */
export function featuresDoSmartTurn(pcm: Float32Array): Float32Array {
  prepararTabelas();
  const tabelaDeFiltros = filtros!;
  const planoDeFft = plano!;
  const hann = janelaDeHann!;

  // 1. últimos 8 s, ou zeros no começo.
  const onda = new Float64Array(JANELA_AMOSTRAS);
  const usadas = Math.min(pcm.length, JANELA_AMOSTRAS);
  const inicioNaEntrada = pcm.length - usadas;
  const inicioNaOnda = JANELA_AMOSTRAS - usadas;
  for (let i = 0; i < usadas; i++) onda[inicioNaOnda + i] = pcm[inicioNaEntrada + i];

  // 2. média 0 e variância 1 (população), epsilon 1e-7 — sobre a janela inteira, zeros do começo inclusive.
  let soma = 0;
  for (let i = 0; i < JANELA_AMOSTRAS; i++) soma += onda[i];
  const media = soma / JANELA_AMOSTRAS;
  let variancia = 0;
  for (let i = 0; i < JANELA_AMOSTRAS; i++) variancia += (onda[i] - media) ** 2;
  variancia /= JANELA_AMOSTRAS;
  const desvio = Math.sqrt(variancia + 1e-7);
  for (let i = 0; i < JANELA_AMOSTRAS; i++) onda[i] = (onda[i] - media) / desvio;

  // 3 a 5. STFT de potência → mel → log.
  const quadrosDaStft = QUADROS_MEL + 1; // o último é descartado no fim
  const potencia = new Float64Array(quadrosDaStft * BINS_DE_FREQUENCIA);
  const bloco = new Float64Array(N_FFT);
  const blocoIm = new Float64Array(N_FFT);
  const saidaRe = new Float64Array(N_FFT);
  const saidaIm = new Float64Array(N_FFT);
  const meia = N_FFT / 2;
  for (let q = 0; q < quadrosDaStft; q++) {
    const inicio = q * PASSO - meia; // com o preenchimento refletido de 200 amostras nas pontas
    for (let i = 0; i < N_FFT; i++) bloco[i] = onda[refletir(inicio + i, JANELA_AMOSTRAS)] * hann[i];
    blocoIm.fill(0);
    fftRecursiva(saidaRe, saidaIm, 0, bloco, blocoIm, 0, 1, planoDeFft, 0, N_FFT);
    const base = q * BINS_DE_FREQUENCIA;
    for (let k = 0; k < BINS_DE_FREQUENCIA; k++) potencia[base + k] = saidaRe[k] ** 2 + saidaIm[k] ** 2;
  }

  const logmel = new Float64Array(BINS_MEL * QUADROS_MEL);
  let maximo = -Infinity;
  for (let m = 0; m < BINS_MEL; m++) {
    const f = tabelaDeFiltros[m];
    for (let q = 0; q < QUADROS_MEL; q++) {
      const base = q * BINS_DE_FREQUENCIA;
      let acc = 0;
      for (let k = 0; k < BINS_DE_FREQUENCIA; k++) acc += f[k] * potencia[base + k];
      const v = Math.log10(Math.max(1e-10, acc));
      logmel[m * QUADROS_MEL + q] = v;
      if (v > maximo) maximo = v;
    }
  }
  const out = new Float32Array(BINS_MEL * QUADROS_MEL);
  const piso = maximo - 8;
  for (let i = 0; i < out.length; i++) out[i] = (Math.max(logmel[i], piso) + 4) / 4;
  return out;
}
