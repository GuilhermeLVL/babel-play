/* global window, document, performance, navigator, crossOriginIsolated, TextDecoder, fetch, console -- roda no navegador */
/* SPIKE do Kitten TTS 2 no navegador: carrega o .onnx no onnxruntime-web (WebGPU ou WASM) e sintetiza fonemas ou
 * texto (pelo fonetizador do app). Expõe window.spike para o rodar.mjs. */
import * as ort from '/ort/ort.all.min.mjs';
import * as k from '/app/core/voz/kitten.js';
import { fonemasDoTexto } from '/app/core/voz/kitten/fonemas.js';

ort.env.wasm.wasmPaths = '/ort/';

const log = (...a) => {
  document.getElementById('log').textContent += a.join(' ') + '\n';
  console.log(...a);
};

const cache = new Map();
async function bytes(url) {
  if (!cache.has(url)) cache.set(url, new Uint8Array(await (await fetch(url)).arrayBuffer()));
  return cache.get(url);
}

const sessoes = new Map();
async function sessao(variante, idioma, ep, threads) {
  const chave = `${variante}|${idioma}|${ep}|${threads}`;
  if (sessoes.has(chave)) return { s: sessoes.get(chave), cargaMs: 0 };
  ort.env.wasm.numThreads = threads;
  const t0 = performance.now();
  const modelo = await bytes(`/${variante}/${k.modeloDoIdioma(variante, idioma)}`);
  const s = await ort.InferenceSession.create(modelo, {
    executionProviders: [ep],
    graphOptimizationLevel: 'all',
    logSeverityLevel: 3,
  });
  const cargaMs = performance.now() - t0;
  sessoes.set(chave, s);
  return { s, cargaMs };
}

async function lexicoEn(variante) {
  return JSON.parse(new TextDecoder().decode(await bytes(`/${variante}/g2p/cmu_misaki_us.json`)));
}

async function sintetizar({ variante, idioma, voz, ep = 'wasm', threads = 4, fonemas, texto, velocidade = 1 }) {
  const vocab = JSON.parse(new TextDecoder().decode(await bytes(`/${variante}/vocab.json`)));
  const pacotes = k.lerNpz(await bytes(`/${variante}/voices_${idioma}.npz`));
  const pacote = pacotes.get(voz);
  if (!pacote) throw new Error(`voz ${voz} fora do pacote: ${[...pacotes.keys()]}`);
  const tG = performance.now();
  const fon = fonemas ?? fonemasDoTexto(texto, idioma, idioma === 'en' ? await lexicoEn(variante) : undefined);
  const g2pMs = performance.now() - tG;
  const { s, cargaMs } = await sessao(variante, idioma, ep, threads);
  const t0 = performance.now();
  const partes = [];
  const trechos = k.trechosDeFonemas(fon);
  for (const [i, t] of trechos.entries()) {
    const ids = k.idsDosFonemas(t, vocab);
    const estilo = k.estiloParaTokens(pacote.dados, pacote.forma[1], ids.length);
    const out = await s.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      style: new ort.Tensor('float32', Float32Array.from(estilo), [1, estilo.length]),
      speed: new ort.Tensor('float32', new Float32Array([velocidade]), [1]),
    });
    const nomes = s.outputNames;
    partes.push(k.apararTrecho(out[nomes[0]].data, out[nomes[1]].data, i === 0));
  }
  const ms = performance.now() - t0;
  const silencio = Math.floor(k.PAUSA_ENTRE_TRECHOS_KITTEN_S * k.TAXA_DO_KITTEN);
  const n = partes.reduce((a, p) => a + p.length, 0) + silencio * Math.max(0, partes.length - 1);
  const pcm = new Float32Array(n);
  let o = 0;
  partes.forEach((p, i) => {
    if (i) o += silencio;
    pcm.set(p, o);
    o += p.length;
  });
  const audioS = pcm.length / k.TAXA_DO_KITTEN;
  let memoria = null;
  try {
    memoria = (await performance.measureUserAgentSpecificMemory?.())?.bytes ?? null;
  } catch {
    /* sem isolamento */
  }
  const r = {
    fonemas: fon,
    cargaMs,
    g2pMs,
    ms,
    audioS,
    rtf: ms / 1000 / audioS,
    memoria,
    isolado: crossOriginIsolated,
  };
  log(JSON.stringify({ variante, idioma, voz, ep, threads, ...r }));
  return { ...r, pcm: Array.from(pcm) };
}

async function temWebGpu() {
  try {
    return !!(await navigator.gpu?.requestAdapter());
  } catch {
    return false;
  }
}

window.spike = { sintetizar, temWebGpu, fonemasDoTexto };
window.spikePronto = true;
log('pronto; isolado =', crossOriginIsolated);
