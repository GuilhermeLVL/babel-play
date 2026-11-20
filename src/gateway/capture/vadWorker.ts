/**
 * WORKER DO SILERO VAD — a inferência ONNX do detector de fala, fora da thread principal.
 *
 * É o `SileroLegacy` do `@ricky0123/vad-web` (mesmo modelo `silero_vad_legacy.onnx`, mesmas entradas
 * `input`/`h`/`c`/`sr`, mesma saída), só que numa thread própria. A máquina de estados da fala (limiares,
 * redenção, pré-pad: o `FrameProcessor`) continua na thread principal, a mesma da biblioteca; aqui só se
 * responde "qual a probabilidade de fala deste quadro?". Os quadros chegam em ordem e são respondidos em
 * ordem (um worker, uma fila), então o estado recorrente (`h`/`c`) avança quadro a quadro como antes.
 *
 * Uma thread de WASM: o orçamento global (`orcamentoDeThreads.ts`) já contava 1 para o VAD. O runtime
 * (wasm + loader) é o mesmo que o app serve de `/` (`scripts/copiar-assets-runtime.mjs`), como no worker
 * do fim de fala.
 */
import * as ort from 'onnxruntime-web/wasm';

import { baseDoWasm } from '../baseDoWasm';
import type { MensagemDoVad, MensagemParaOVad } from './vadEmWorker';

let sessao: ort.InferenceSession | null = null;
let h: ort.Tensor | null = null;
let c: ort.Tensor | null = null;
// O `sr` não muda nunca; no worker não há proxy do ORT a transferi-lo (era o DataCloneError da thread principal).
let sr: ort.Tensor | null = null;

const responder = (m: MensagemDoVad): void => (self as unknown as Worker).postMessage(m);

const zerarEstado = (): void => {
  const zeros = Array(2 * 64).fill(0);
  h = new ort.Tensor('float32', zeros, [2, 1, 64]);
  c = new ort.Tensor('float32', zeros, [2, 1, 64]);
};

async function carregar(url: string): Promise<void> {
  ort.env.logLevel = 'error';
  ort.env.wasm.wasmPaths = baseDoWasm();
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`modelo do VAD: HTTP ${resposta.status}`);
  sessao = await ort.InferenceSession.create(await resposta.arrayBuffer());
  sr = new ort.Tensor('int64', [16000n]);
  zerarEstado();
}

self.onmessage = async (e: MessageEvent<MensagemParaOVad>) => {
  const m = e.data;
  if (m.tipo === 'carregar') {
    try {
      await carregar(m.url);
      responder({ tipo: 'pronto' });
    } catch (err) {
      responder({ tipo: 'erro', mensagem: String((err as Error)?.message ?? err) });
    }
    return;
  }
  if (m.tipo === 'reiniciar') {
    zerarEstado();
    return;
  }
  if (m.tipo === 'liberar') {
    try {
      await sessao?.release();
    } catch {
      /* já liberada */
    }
    sessao = null;
    return;
  }
  try {
    if (!sessao || !h || !c || !sr) throw new Error('modelo do VAD não carregado');
    const entrada = new ort.Tensor('float32', m.pcm, [1, m.pcm.length]);
    const saida = await sessao.run({ input: entrada, h, c, sr });
    h = saida['hn'];
    c = saida['cn'];
    const isSpeech = (saida['output'].data as Float32Array)[0];
    responder({ tipo: 'probabilidade', id: m.id, isSpeech });
  } catch (err) {
    responder({ tipo: 'erro', id: m.id, mensagem: String((err as Error)?.message ?? err) });
  }
};
