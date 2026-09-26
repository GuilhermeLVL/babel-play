/**
 * Web Worker — pipeline ASR (Whisper local), espelho do whisper-server do desktop
 * mas executando off-thread no navegador. Também carrega o MOONSHINE (o STT local de inglês,
 * `moonshine.ts`): mesmo pipeline `automatic-speech-recognition`, mas outro dtype e outras opções
 * de decode — o ramo está marcado com `ehMoonshine` abaixo.
 *
 * Backend PADRÃO = WASM (roda em QUALQUER navegador — Chrome, Edge, Firefox, Safari, celular —
 * e, para modelos pequenos como o whisper-tiny, é medido como MAIS RÁPIDO que WebGPU: o overhead
 * de dispatch da GPU domina em modelos pequenos; ref.: transformers.js issue #894). WebGPU fica
 * opcional via `device: 'webgpu'`. Isso torna a transcrição local UNIVERSAL (antes: só WebGPU).
 *
 * Recebe mensagens { type: 'load' | 'transcribe', ... } e responde com progresso +
 * resultados via postMessage.
 */
import { env, pipeline, Tensor, TextStreamer } from '@huggingface/transformers';

import { filtrarAlucinacao, tokensPorSegundo } from '../alucinacao';
import { registrarModeloBaixado } from '../modelManifest';
import { detectarIdiomaDoAudio } from './idiomaDoWhisper';
import { criarRastreadorDeProgresso, rotuloDeBytes } from './modelProgress';
import {
  DEVICE_MOONSHINE,
  DTYPE_MOONSHINE,
  ehMoonshine,
  moonshineAceita,
  opcoesDeDecodeMoonshine,
  SESSAO_MOONSHINE,
} from './moonshine';
import { configureModelDelivery } from './transformersEnv';
/* `initial_prompt` POR FONTE (contexto das falas anteriores do mic/sistema) foi avaliado e NÃO
   entrou: a versão instalada de @huggingface/transformers não expõe `prompt_ids` no pipeline de
   ASR (conferido no bundle). Quando expuser, o lugar é o objeto de opções abaixo. */

// Entrega dos pesos: cache do navegador (padrão) ou self-host same-origin (VITE_SELF_HOST_MODELS).
configureModelDelivery();

// Threads do runtime WASM do ONNX. Multithread exige SharedArrayBuffer → página cross-origin
// isolada (COOP/COEP). SEM isolamento, o ort cai graciosamente para 1 thread (mais lento, porém
// FUNCIONA). SIMD funciona sem isolamento. Limitamos as threads p/ não saturar a máquina.
try {
  const cores = (self as any).navigator?.hardwareConcurrency || 4;
  // `wasm` é opcional no tipo do runtime; se faltar, o comportamento é o mesmo do catch abaixo
  // (não mexe em nada e usa os defaults do runtime).
  const wasm = env.backends.onnx.wasm;
  if (wasm) {
    wasm.simd = true;
    wasm.numThreads = Math.max(1, Math.min(cores, 4));
  }
} catch {
  // ambiente sem esses campos — ignora (usa defaults do runtime)
}

/**
 * Normaliza o device pedido pelo adapter.
 * `auto` (PADRÃO) = WebGPU se o navegador tiver (decode MEDIDO ~0,48s vs ~5,2s no WASM
 * single-thread nesta classe de hardware) senão WASM (universal — Firefox/Safari/celular).
 * Sem COOP/COEP o WASM roda em 1 thread e é lento; então onde há WebGPU, ele ganha. O WASM
 * continua sendo o fallback que garante transcrição local em QUALQUER navegador.
 */
function resolveDevice(device?: string): 'wasm' | 'webgpu' {
  if (device === 'webgpu') return 'webgpu';
  if (device === 'wasm') return 'wasm';
  const hasWebGpu = !!(self as any).navigator?.gpu;
  return hasWebGpu ? 'webgpu' : 'wasm';
}

let asr: any = null;
let asrModel = '';

// Modelo padrão: whisper-TINY. Cada decode do Whisper processa uma janela interna fixa de
// 30s, então o custo é ~constante por chamada — e o tiny tem esse custo ~4× menor que o base.
// Em áudio contínuo (vídeo/2x), isso é o que faz o decode ser < a duração do trecho e a fila
// DRENAR (senão a latência acumula até dezenas de segundos). O adapter pode passar outro id
// no 'load' (ex.: 'onnx-community/whisper-base' p/ mais precisão).
const DEFAULT_MODEL = 'onnx-community/whisper-tiny';

// dtype padrão HÍBRIDO: o ENCODER do Whisper é sensível a quantização (q8 degrada e propaga
// erro por todo o decode), mas o DECODER tolera bem 4-bit. Então: encoder em precisão alta +
// decoder em q4 → decode mais rápido E mais preciso que o q8 uniforme anterior.
// (Ref.: docs Transformers.js + demo realtime-whisper-webgpu.)
const DTYPE_PRESETS: Record<string, any> = {
  hybrid: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
  'hybrid-fp16': { encoder_model: 'fp16', decoder_model_merged: 'q4' },
  q8: 'q8',
  q4: 'q4',
  fp16: 'fp16',
  fp32: 'fp32',
};

/**
 * Progresso: a lib JÁ agrega por bytes reais e pré-semeia o denominador com TODOS os arquivos
 * antes do primeiro byte. O agregador caseiro que existia aqui descartava esse agregado (exigia
 * `info.file`, que `progress_total` não tem) e travava a barra em 100% assim que os JSON pequenos
 * terminavam — medido: 100% aos 8,75 s com 8,48 MB de ~146 MB baixados. Ver
 * docs/discovery/A-model-download.md (A-P0-1) e tests/modelProgress.test.ts.
 *
 * Estado POR CARGA (era global de módulo e nunca resetado: a 2ª carga nascia travada em 100%).
 */
function novoProgresso(rotulo: string) {
  // Guarda o total agregado que a lib informou. É o que o manifesto usa como `bytesEsperados`:
  // sem ele, uma gravação parcial no cache (quota) produzia um manifesto que se descrevia como
  // completo. Achado pela suíte de mecanismo (cenário 11).
  let bytesEsperados = 0;
  const rastrear = criarRastreadorDeProgresso((p) => {
    if (p.total > 0) bytesEsperados = p.total;
    self.postMessage({
      type: 'progress',
      progress: p.progress,
      loaded: p.loaded,
      total: p.total,
      label: rotuloDeBytes(p.loaded, p.total) ?? rotulo,
    });
  });
  return Object.assign(rastrear, {
    get bytesEsperados() {
      return bytesEsperados;
    },
  });
}

/**
 * Cria o pipeline ASR (lazy) no device pedido (default WASM). Tenta o dtype pedido; se o repo
 * não tiver esses arquivos, cai para q8. Depois faz WARMUP para o 1º decode real não pagar o
 * stall de compilação/JIT (em WebGPU chegava a ~13s compilando shaders; em WASM aquece o JIT).
 */
async function ensurePipeline(model?: string, dtypeKey?: string, device?: string): Promise<void> {
  if (asr) return;
  asrModel = model || DEFAULT_MODEL;
  const moonshine = ehMoonshine(asrModel);
  // Moonshine: WASM sempre (q8 validado só lá — ver `DEVICE_MOONSHINE`).
  const dev = moonshine ? DEVICE_MOONSHINE : resolveDevice(device);
  /* Moonshine: SEMPRE q8, ignorando o preset (inclusive o override `babel.whisperDtype`). O `hybrid`
     é uma decisão sobre o encoder do WHISPER; o q8 é o que a bancada mediu para o moonshine. */
  const chaveDtype = moonshine ? DTYPE_MOONSHINE : dtypeKey || 'hybrid';
  const wantDtype = DTYPE_PRESETS[chaveDtype] ?? DTYPE_PRESETS.hybrid;

  let dtypeEfetivo = chaveDtype;
  let progresso = novoProgresso(moonshine ? 'Moonshine' : 'Whisper');
  try {
    asr = await pipeline('automatic-speech-recognition', asrModel, {
      device: dev,
      dtype: wantDtype,
      // Moonshine: sem isto a sessão do decoder q8 não abre no ORT-web (ver `SESSAO_MOONSHINE`).
      ...(moonshine ? { session_options: { ...SESSAO_MOONSHINE } } : {}),
      progress_callback: progresso,
    });
  } catch (err) {
    // O moonshine já pediu q8: repetir a mesma carga só dobraria a espera antes do erro real.
    if (moonshine) throw err;
    dtypeEfetivo = 'q8';
    // Fallback robusto: repo sem os arquivos do dtype híbrido → usa q8 (no mesmo device).
    // Rastreador NOVO: o dtype mudou, logo os arquivos e o total mudaram. Reaproveitar o anterior
    // faria a barra nascer no percentual da tentativa que falhou.
    console.warn(
      '[whisper:worker] dtype',
      wantDtype,
      'indisponível no repo, caindo para q8:',
      String((err as Error)?.message || err).slice(0, 120),
    );
    self.postMessage({ type: 'progress', progress: 0, loaded: 0, total: 0, label: 'usando formato alternativo (q8)…' });
    progresso = novoProgresso('Whisper (q8)');
    asr = await pipeline('automatic-speech-recognition', asrModel, {
      device: dev,
      dtype: 'q8',
      progress_callback: progresso,
    });
  }

  // Manifesto: só agora existe verdade a gravar — o modelo carregou, com ESTE dtype e ESTE device.
  // É o que permite a UI responder "já está completo?" sem chutar (A-P0-4).
  void registrarModeloBaixado(asrModel, dtypeEfetivo, dev, progresso.bytesEsperados);

  // WARMUP: a 1ª inferência compila shaders (WebGPU) / aquece o JIT (WASM) do laço de decode.
  // Precisa gerar VÁRIOS tokens (não 1) p/ compilar o passo autoregressivo — senão a primeira
  // transcrição real ainda paga o stall. Rodar em silêncio agora esconde isso no "carregando".
  try {
    await asr(
      new Float32Array(16000),
      moonshine
        ? opcoesDeDecodeMoonshine(1)
        : {
            language: 'en',
            task: 'transcribe',
            return_timestamps: false,
            num_beams: 1,
            do_sample: false,
            max_new_tokens: 8,
          },
    );
  } catch {
    // warmup é best-effort
  }
}

/**
 * Processa mensagens do adapter.
 */
self.onmessage = async (e: MessageEvent) => {
  const { type, id, pcm, language, model, dtype, device, maxNewTokens } = e.data;

  try {
    if (type === 'load') {
      await ensurePipeline(model, dtype, device);
      self.postMessage({ type: 'ready' });
    } else if (type === 'transcribe') {
      await ensurePipeline(model, dtype, device);

      // STREAMING token-a-token: em vez de só entregar o texto ao FIM do decode, emitimos
      // mensagens `update` incrementais conforme os tokens saem — a UI vê o texto crescendo
      // durante a fala (sensação de tempo real). Acumulamos aqui e postamos o texto-até-agora.
      // (Padrão do exemplo oficial realtime-whisper-webgpu.)
      let acc = '';
      const streamer = new TextStreamer(asr.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (t: string) => {
          acc += t;
          self.postMessage({ type: 'update', id, text: acc.trim() });
        },
      });

      // TETO DINÂMICO de tokens (anti-alucinação): o Whisper, em silêncio/pausa ou em buffer
      // curto, "continua inventando" até bater o max_new_tokens. Limitar à DURAÇÃO real do áudio
      // (~15 tokens/s é folgado p/ fala — a real mede ~3/s) corta a geração desenfreada sem
      // cortar fala legítima. Ex.: parcial de 1s → 15 tokens; trecho de 6s → 90 (< teto de 128).
      // POR IDIOMA: português/espanhol tokenizam pior que inglês no vocabulário do Whisper —
      // 15 tok/s truncava fala rápida em PT (medido no cenário conversa). Ver alucinacao.ts.
      const audioSec = pcm.length / 16000;

      // MOONSHINE: só inglês, e decode sem as opções do Whisper (o pipeline repassa tudo ao
      // `generate`). O streamer é do `generate` genérico, então as parciais token-a-token seguem
      // funcionando. O filtro de alucinação continua, sempre na régua do inglês.
      if (ehMoonshine(asrModel)) {
        // Guarda de última linha: o roteador não escolhe moonshine fora do inglês e o adapter troca
        // para o whisper-base antes de pedir; se ainda assim chegar outro idioma, ERRO — o gateway
        // passa ao próximo motor — em vez de devolver inglês inventado a partir de outra língua.
        if (!moonshineAceita(language)) throw new Error(`moonshine só transcreve inglês (pedido: ${language})`);
        const out = await asr(pcm, { ...opcoesDeDecodeMoonshine(audioSec), streamer });
        const bruto = (out.text ?? '').trim();
        const filtrado = filtrarAlucinacao(bruto, audioSec, 'en');
        self.postMessage({ type: 'result', id, text: filtrado, descartado: !!bruto && !filtrado });
        return;
      }

      /* "DETECTAR" (sem dica): o idioma é medido AQUI, pelo áudio, antes do decode. Sem isto o
         transformers.js força `<|en|>` e o Whisper TRADUZ a fala para inglês em vez de transcrever
         (ver `idiomaDoWhisper.ts`). O idioma medido volta no resultado — é medição, não a dica
         ecoada — e é com ele que o perfil da sessão converge e passa a mandar a dica. */
      let idioma: string | undefined = language || undefined;
      let confiancaDoIdioma: number | undefined;
      if (!idioma) {
        const det = await detectarIdiomaDoAudio(asr, pcm, Tensor as never);
        if (det) {
          idioma = det.idioma;
          confiancaDoIdioma = det.confianca;
        } else if (asr.model?.generation_config?.is_multilingual !== false) {
          // Multilíngue sem idioma = inglês forçado pela lib. Melhor errar alto que legendar em inglês.
          throw new Error('whisper: não foi possível detectar o idioma do trecho');
        }
      }

      const hardCap = maxNewTokens || (idioma && idioma !== 'en' ? 160 : 128);
      const dynMax = Math.max(8, Math.min(hardCap, Math.round(audioSec * tokensPorSegundo(idioma))));

      // Decode enxuto p/ baixa latência: greedy (sem beam), cache ligado (implícito no grafo
      // merged), idioma SEMPRE explícito (a dica ou o detectado acima), sem timestamps.
      // no_repeat_ngram_size + repetition_penalty MATAM os loops de repetição (palavras repetidas),
      // a assinatura clássica de alucinação do Whisper em decode greedy sem essas travas.
      const out = await asr(pcm, {
        language: idioma,
        // SEMPRE transcrever: `translate` devolveria inglês no lugar da fala original.
        task: 'transcribe',
        return_timestamps: false,
        num_beams: 1,
        do_sample: false,
        max_new_tokens: dynMax,
        no_repeat_ngram_size: 3,
        repetition_penalty: 1.15,
        streamer,
      });

      const bruto = (out.text ?? '').trim();
      const filtrado = filtrarAlucinacao(bruto, audioSec, idioma);
      self.postMessage({
        type: 'result',
        id,
        text: filtrado,
        // Para a telemetria contar descartes: havia texto e o filtro o esvaziou.
        descartado: !!bruto && !filtrado,
        // Só quando MEDIDO (sem dica): devolver a dica seria confundir pergunta com resposta.
        ...(confiancaDoIdioma !== undefined ? { language: idioma, confiancaDoIdioma } : {}),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({
      type: 'error',
      id: id ?? null,
      message,
    });
  }
};
