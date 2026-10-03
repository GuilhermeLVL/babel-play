/**
 * WORKER DO FIM DE FALA — roda o Smart Turn v3 (ONNX, ~8 MB) fora da thread principal.
 *
 * Recebe `carregar` (a URL do modelo) e `consultar` (os últimos 8 s a 16 kHz) e devolve a probabilidade de a fala
 * estar COMPLETA. A saída do modelo já é probabilidade (0..1): não se aplica sigmoid de novo. O mel (JS puro,
 * `melDoSmartTurn.ts`) e a inferência ficam aqui para a thread principal — onde mora o VAD — não sentir o custo.
 *
 * Uma thread de WASM: o orçamento global (`orcamentoDeThreads.ts`) já reparte os núcleos entre Whisper, tradutor
 * e voz, e o modelo roda uma vez por pausa, não por quadro. O runtime (wasm + loader) é o mesmo que o app serve
 * de `/` para o VAD (`scripts/copiar-assets-runtime.mjs`).
 */
import * as ort from 'onnxruntime-web/wasm';

import type { MensagemDoWorker, MensagemParaOWorker } from './fimDeFala';
import { BINS_MEL, featuresDoSmartTurn, QUADROS_MEL } from './melDoSmartTurn';

let sessao: ort.InferenceSession | null = null;

const responder = (m: MensagemDoWorker): void => (self as unknown as Worker).postMessage(m);

async function carregar(url: string): Promise<void> {
  ort.env.wasm.wasmPaths = '/';
  ort.env.wasm.numThreads = 1;
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`modelo de turno: HTTP ${resposta.status}`);
  sessao = await ort.InferenceSession.create(new Uint8Array(await resposta.arrayBuffer()), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

self.onmessage = async (e: MessageEvent<MensagemParaOWorker>) => {
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
  try {
    if (!sessao) throw new Error('modelo de turno não carregado');
    const t0 = performance.now();
    const entrada = new ort.Tensor('float32', featuresDoSmartTurn(m.pcm), [1, BINS_MEL, QUADROS_MEL]);
    const saida = await sessao.run({ input_features: entrada });
    const p = (saida[sessao.outputNames[0]].data as Float32Array)[0];
    if (!Number.isFinite(p)) throw new Error('probabilidade inválida');
    responder({ tipo: 'resultado', id: m.id, p, ms: performance.now() - t0 });
  } catch (err) {
    responder({ tipo: 'erro', id: m.id, mensagem: String((err as Error)?.message ?? err) });
  }
};
