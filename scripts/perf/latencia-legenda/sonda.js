/* global window, performance, Navigator, console, self, AudioContext, URL, Blob, AudioWorkletNode, navigator, DOMException, document, MediaStream, requestAnimationFrame, MutationObserver, setInterval, PerformanceObserver -- código que roda DENTRO da página (page.evaluate / addInitScript) */
/**
 * SONDA DE LATÊNCIA — script injetado na página (Playwright `addInitScript`) pela auditoria de
 * latência da legenda (2026-09-26). NÃO altera o app: só observa, por fora, pontos que já existem.
 *
 * Tudo é carimbado com `performance.now()` da página e vai para `window.__lat`:
 *  - `ev`   : eventos — mensagens de/para os Web Workers (Whisper/Moonshine e opus-mt, pelo wrapper de
 *             `Worker`), chamadas do Chrome Translator, `fetch` de rede, linhas `[cap]`/`[cap:vad]`
 *             do console do app;
 *  - `dom`  : cada mudança visível de um balão `.fala` do Capturar (texto original, tradução, se ainda
 *             é parcial), no callback do MutationObserver (commit do React) e no quadro seguinte (rAF);
 *  - `aud`  : a cada 20 ms, RMS e razão de Goertzel em 2 kHz do MESMO áudio que o app recebe (um
 *             AudioWorklet pendurado no stream do getUserMedia/getDisplayMedia). É daqui que sai a
 *             ÂNCORA do relógio: o bipe de 2 kHz que `montar-audio.mjs` põe antes da primeira fala;
 *  - `loaf` : Long Animation Frames (> 50 ms) com atribuição de script — custo de render no main thread.
 *
 * Configuração (argumento do addInitScript): { modo: 'mic' | 'sistema', semWebGpu: boolean }.
 *  - modo 'mic': `getDisplayMedia` é recusado (NotAllowedError) — a captura do sistema falha e o
 *    microfone segue sozinho, como quando a pessoa fecha a caixa de compartilhamento;
 *  - modo 'sistema': `getDisplayMedia` devolve o áudio do dispositivo falso (sem o DSP de chamada,
 *    como as constraints do app pedem) + uma faixa de vídeo de canvas, no lugar do seletor de tela;
 *  - semWebGpu: esconde `navigator.gpu` da JANELA (não do worker) — o roteador de STT passa a ver
 *    "sem WebGPU", como num computador sem GPU compatível.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- expressão lida como texto por medir.mjs
(cfg) => {
  cfg = cfg || {};
  const L = (window.__lat = { ev: [], dom: [], aud: [], loaf: [], cfg });
  const now = () => performance.now();
  const ev = (k, o) => {
    L.ev.push(Object.assign({ t: now(), k }, o || {}));
  };
  const corta = (s, n = 400) => (typeof s === 'string' ? s.slice(0, n) : undefined);

  if (cfg.semWebGpu) {
    try {
      Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true });
    } catch {}
  }

  // ---------------------------------------------------------------- console do app
  const log0 = console.log;
  console.log = function (...a) {
    try {
      const s = a
        .map((x) => {
          if (typeof x === 'string') return x;
          try {
            return JSON.stringify(x);
          } catch {
            return String(x);
          }
        })
        .join(' ');
      if (s.includes('[cap') || s.includes('[whisper') || s.includes('[mt:'))
        ev('log', {
          s: s
            .replace(/%c/g, '')
            .replace(/color:[^;]+;font-weight:bold/g, '')
            .slice(0, 400),
        });
    } catch {}
    return log0.apply(this, a);
  };
  const warn0 = console.warn;
  console.warn = function (...a) {
    try {
      ev('warn', { s: a.map(String).join(' ').slice(0, 300) });
    } catch {}
    return warn0.apply(this, a);
  };

  // ---------------------------------------------------------------- Web Workers
  const W0 = window.Worker;
  class WorkerSondado extends W0 {
    constructor(url, opts) {
      super(url, opts);
      const nome = String(url).split('/').pop().split('?')[0];
      this.__nome = nome;
      this.__ultProg = 0;
      ev('worker:novo', { nome });
      this.addEventListener('message', (e) => {
        const d = e.data || {};
        if (d.type === 'progress') {
          const t = now();
          if (t - this.__ultProg < 1000 && !(d.progress >= 1)) return;
          this.__ultProg = t;
          ev('w:prog', { nome, p: d.progress, loaded: d.loaded, total: d.total });
          return;
        }
        ev('w:in', {
          nome,
          type: d.type,
          id: d.id,
          model: d.model,
          text: corta(d.text),
          message: corta(d.message, 200),
          descartado: d.descartado,
          manifesto: d.manifesto ? corta(JSON.stringify(d.manifesto), 400) : undefined,
        });
      });
    }
    postMessage(m, tr) {
      try {
        ev('w:out', {
          nome: this.__nome,
          type: m && m.type,
          id: m && m.id,
          n: m && m.pcm ? m.pcm.length : undefined,
          text: corta(m && m.text),
          language: m && m.language,
          model: m && m.model,
          device: m && m.device,
          dtype: m && m.dtype,
          src: m && m.src,
          tgt: m && m.tgt,
        });
      } catch {}
      return super.postMessage(m, tr);
    }
  }
  window.Worker = WorkerSondado;

  // ---------------------------------------------------------------- Chrome Translator
  try {
    if ('Translator' in self && self.Translator && self.Translator.create) {
      const T = self.Translator;
      const create0 = T.create.bind(T);
      const avail0 = T.availability.bind(T);
      T.availability = async (o) => {
        const r = await avail0(o);
        ev('ct:avail', { par: `${o.sourceLanguage}>${o.targetLanguage}`, r });
        return r;
      };
      T.create = async (o) => {
        ev('ct:create', { par: `${o.sourceLanguage}>${o.targetLanguage}` });
        const inst = await create0(o);
        ev('ct:pronto', { par: `${o.sourceLanguage}>${o.targetLanguage}` });
        const tr0 = inst.translate.bind(inst);
        return new Proxy(inst, {
          get(alvo, p) {
            if (p === 'translate')
              return async (x) => {
                ev('ct:out', { text: corta(x) });
                const r = await tr0(x);
                ev('ct:in', { text: corta(String(r)) });
                return r;
              };
            const v = Reflect.get(alvo, p);
            return typeof v === 'function' ? v.bind(alvo) : v;
          },
        });
      };
    }
  } catch {}

  // ---------------------------------------------------------------- rede (fetch)
  const f0 = window.fetch;
  window.fetch = async function (inp, init) {
    const url = typeof inp === 'string' ? inp : inp && inp.url;
    const t0 = now();
    try {
      const r = await f0.call(this, inp, init);
      if (url && !/huggingface|hf\.co|\/assets\/|\.onnx|\.wasm|\.json$/.test(url))
        ev('fetch', { url: String(url).slice(0, 160), ms: now() - t0, st: r.status });
      return r;
    } catch (e) {
      if (url) ev('fetch', { url: String(url).slice(0, 160), ms: now() - t0, erro: String(e).slice(0, 120) });
      throw e;
    }
  };

  // ---------------------------------------------------------------- áudio: âncora do bipe
  const WORKLET = `
class SondaLat extends AudioWorkletProcessor {
  constructor() { super(); this.n = Math.round(sampleRate * 0.02); this.b = new Float32Array(this.n); this.i = 0;
    this.k = 2 * Math.cos(2 * Math.PI * 2000 / sampleRate); }
  process(inputs) { const x = inputs[0] && inputs[0][0];
    if (x) for (let j = 0; j < x.length; j++) { this.b[this.i++] = x[j]; if (this.i === this.n) { this.flush(); this.i = 0; } }
    return true; }
  flush() { let s1 = 0, s2 = 0, e = 0; for (let j = 0; j < this.n; j++) { const v = this.b[j]; e += v * v; const s0 = v + this.k * s1 - s2; s2 = s1; s1 = s0; }
    const p = s1 * s1 + s2 * s2 - this.k * s1 * s2; const rms = Math.sqrt(e / this.n);
    this.port.postMessage([rms, e > 0 ? (2 * p / this.n) / e : 0]); }
}
registerProcessor('sonda-lat', SondaLat);`;
  let sondado = false;
  async function sondar(stream, origem) {
    if (sondado) return;
    sondado = true;
    try {
      const ctx = new AudioContext();
      await ctx.resume().catch(() => {});
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
      await ctx.audioWorklet.addModule(url);
      const no = new AudioWorkletNode(ctx, 'sonda-lat');
      no.port.onmessage = (e) => {
        L.aud.push([Math.round(now() * 10) / 10, Math.round(e.data[0] * 1e4) / 1e4, Math.round(e.data[1] * 1e3) / 1e3]);
      };
      ctx.createMediaStreamSource(stream).connect(no);
      ev('sonda:ok', { origem, sr: ctx.sampleRate, baseLatency: ctx.baseLatency });
    } catch (e) {
      ev('sonda:erro', { s: String(e) });
    }
  }
  const md = navigator.mediaDevices;
  const gum0 = md.getUserMedia.bind(md);
  md.getUserMedia = async (c) => {
    const t0 = now();
    const s = await gum0(c);
    ev('gum', { ms: now() - t0, audio: !!(c && c.audio) });
    if (c && c.audio && cfg.modo === 'mic' && window.__LAT_ARMADO) sondar(s, 'mic');
    return s;
  };
  md.getDisplayMedia = async () => {
    ev('gdm', { modo: cfg.modo });
    if (cfg.modo !== 'sistema') throw new DOMException('recusado pela sonda (modo mic)', 'NotAllowedError');
    const a = await gum0({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 16;
    cv.getContext('2d').fillRect(0, 0, 16, 16);
    const v = cv.captureStream(1).getVideoTracks()[0];
    sondar(new MediaStream(a.getAudioTracks()), 'sistema');
    return new MediaStream([...a.getAudioTracks(), v]);
  };

  // ---------------------------------------------------------------- DOM: balões da legenda
  const ultimo = new WeakMap();
  const varrer = () => {
    const t = now();
    const els = document.querySelectorAll('.fala');
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const o = (el.querySelector('.orig') || {}).textContent || '';
      const tr = (el.querySelector('.trad') || {}).textContent || '';
      const nova = el.classList.contains('nova');
      const chave = o + '\u0001' + tr + '\u0001' + nova;
      if (ultimo.get(el) === chave) continue;
      ultimo.set(el, chave);
      const rec = { t, i, o: o.slice(0, 400), tr: tr.slice(0, 400), nova };
      L.dom.push(rec);
      requestAnimationFrame(() => {
        rec.tf = now();
      });
    }
  };
  const iniciarDom = () =>
    new MutationObserver(varrer).observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  if (document.documentElement) iniciarDom();
  else document.addEventListener('DOMContentLoaded', iniciarDom);

  // ---------------------------------------------------------------- main thread
  // Atraso do laço de eventos: um timer de 50 ms que anota quanto chegou atrasado (> 8 ms).
  L.lag = [];
  L.mut = 0;
  let esperado = now() + 50;
  setInterval(() => {
    const t = now();
    const atraso = t - esperado;
    if (atraso > 8) L.lag.push([Math.round(t), Math.round(atraso)]);
    esperado = t + 50;
  }, 50);
  try {
    new MutationObserver((ms) => {
      L.mut += ms.length;
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
  } catch {}
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        if (e.duration < 50) continue;
        L.loaf.push({
          t: Math.round(e.startTime),
          ms: Math.round(e.duration),
          bloq: Math.round(e.blockingDuration || 0),
          scripts: (e.scripts || []).slice(0, 3).map(
            (s) =>
              `${(s.sourceFunctionName || s.invoker || '?').slice(0, 60)}@${String(s.sourceURL || '')
                .split('/')
                .pop()}:${Math.round(s.duration)}ms`,
          ),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
};
