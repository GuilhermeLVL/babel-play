/**
 * Web Worker do PARAKEET TDT 0.6b v3 (int8, WASM) — o "preciso no aparelho" de português e espanhol.
 *
 * POR QUE UM WORKER PRÓPRIO, e não o `whisperWorker`: o transformers.js 4.2.0 não tem a arquitetura
 * TDT (só `parakeet_ctc`). Aqui o modelo roda no `onnxruntime-web` direto — o MESMO pacote e o mesmo
 * `.wasm` que o app já serve de `/` para o VAD e o fim de fala (`scripts/copiar-assets-runtime.mjs`),
 * nada de CDN — com três sessões (extrator de áudio, encoder, decoder+joint) e o laço de
 * `parakeetTdt.ts`. É o que a bancada mediu (`scripts/eval-fala/bancada/navegador/pagina.html`).
 *
 * PROTOCOLO (a janela é `parakeetLocal.ts`):
 *   → `carregar {plano, threads}`   busca (ou lê do Cache Storage) os 4 arquivos, confere tamanho e
 *                                   sha256 de CADA um, abre as sessões e aquece;
 *                                   ← `progress` (por bytes), `ready` ou `loadError {motivo}`
 *   → `transcrever {id, pcm, idioma}` um trecho FINAL (16 kHz mono) ← `result {text}` | `error`
 *   → `cancelar {id}`               tira da fila, ou para o laço no próximo quadro ← `cancelado`
 *
 * SEM TEXTO PARCIAL: o modelo não é de fluxo, e cada decode roda o encoder inteiro. O parcial da
 * legenda continua vindo de onde vem hoje (`gateway.stt.transcribePartial`), não daqui.
 *
 * TRECHO SEM FALA NÃO VIRA TEXTO: na captura o VAD (Silero) decide o que chega aqui; silêncio digital
 * nem roda o modelo; e a saída passa pelo MESMO filtro de alucinação de produção (`alucinacao.ts`)
 * que o Whisper e a nuvem. Medido em Node (setembro): o Parakeet inventou texto em 7,9% dos trechos
 * sem fala, contra 22,2% do Whisper base — no navegador ainda não foi medido.
 *
 * TRECHO LONGO: a janela do encoder exportado é de ~35 s. Acima de 30 s o trecho é dividido na pausa
 * mais silenciosa (`dividirEmJanelas`) e os textos são juntados; nada é recusado.
 *
 * MEMÓRIA: o encoder tem 652 MB. Os arquivos são carregados UM de cada vez e cada sessão é aberta
 * logo depois do seu arquivo, para o pico ser um arquivo + a cópia dele no heap do WASM, e não os
 * quatro. Medido na bancada: 2,0 GB de RAM somando os processos do Chrome, com o modelo carregado.
 */
import { filtrarAlucinacao } from '../alucinacao';
import { gravarManifesto, type ManifestoDeModelo } from '../modelManifest';
import { FilaSerial, type SinalDeCancelamento } from './filaDoWorker';
import { criarRastreadorDeProgresso, rotuloDeBytes } from './modelProgress';
import type { ArquivoDaCargaDoParakeet, PlanoDeCargaDoParakeet } from './parakeetArquivos';
import { DEVICE_DO_PARAKEET, DTYPE_DO_PARAKEET, JANELA_DO_PARAKEET_S } from './parakeetModelo';
import {
  decodificarTdt,
  destokenizar,
  dividirEmJanelas,
  ehSilencioDigital,
  lerVocabulario,
  type PassoDoJoint,
  type VocabularioDoParakeet,
} from './parakeetTdt';

export type MotivoDaFalhaDoParakeet = 'rede' | 'integridade' | 'motor';

export type MensagemParaOParakeet =
  | { type: 'carregar'; plano: PlanoDeCargaDoParakeet; threads?: number }
  | { type: 'transcrever'; id: string; pcm: Float32Array; idioma?: string }
  | { type: 'cancelar'; id: string };

export type MensagemDoParakeet =
  | { type: 'progress'; progress: number; loaded: number; total: number; label: string }
  | { type: 'ready'; model: string; cargaMs: number }
  | { type: 'loadError'; model: string; motivo: MotivoDaFalhaDoParakeet; message: string }
  | { type: 'result'; id: string; text: string; descartado: boolean; ms: number; audioS: number }
  | { type: 'error'; id: string; message: string }
  | { type: 'cancelado'; id: string };

/** O pedaço de um tensor do ORT que o worker lê. */
export interface TensorDoParakeet {
  data: ArrayLike<number | bigint>;
  dims: readonly number[];
}

export interface SessaoDoParakeet {
  run(entradas: Record<string, unknown>): Promise<Record<string, TensorDoParakeet>>;
}

/** O runtime (onnxruntime-web), injetável: o teste entra com sessões falsas. */
export interface RuntimeDoParakeet {
  criarSessao(bytes: Uint8Array): Promise<SessaoDoParakeet>;
  tensor(
    tipo: 'float32' | 'int32' | 'int64',
    dados: Float32Array | Int32Array | BigInt64Array,
    dims: number[],
  ): unknown;
}

/** Subconjunto do Cache Storage que usamos (injetável no teste). */
export interface CacheDoParakeet {
  match(url: string): Promise<Response | undefined>;
  put(url: string, r: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}

export interface DependenciasDoParakeet {
  buscar: (url: string) => Promise<Response>;
  /** O Cache Storage dos pesos (o mesmo do transformers.js, para o manifesto e o "Liberar espaço" valerem). */
  abrirCache: () => Promise<CacheDoParakeet | null>;
  abrirRuntime: (threads: number) => Promise<RuntimeDoParakeet>;
  enviar: (m: MensagemDoParakeet) => void;
  registrarManifesto?: (m: ManifestoDeModelo) => void;
  agora?: () => number;
}

class FalhaDeCarga extends Error {
  constructor(
    readonly motivo: MotivoDaFalhaDoParakeet,
    message: string,
  ) {
    super(message);
    this.name = 'FalhaDeCarga';
  }
}

export async function sha256Hex(b: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));
  return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Lê o corpo num buffer JÁ do tamanho esperado, somando os bytes que chegam. Sem lista de pedaços:
 * com 652 MB, juntá-los no fim dobraria o pico de memória. Corpo maior ou menor que o esperado é
 * arquivo errado (`null`), sem precisar do sha256 para saber.
 */
async function lerCorpo(r: Response, esperado: number, somar: (n: number) => void): Promise<Uint8Array | null> {
  const leitor = r.body?.getReader();
  if (!leitor) {
    const b = new Uint8Array(await r.arrayBuffer());
    somar(b.length);
    return b.length === esperado ? b : null;
  }
  const b = new Uint8Array(esperado);
  let lidos = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (lidos + value.length > esperado) {
      void leitor.cancel().catch(() => undefined);
      return null;
    }
    b.set(value, lidos);
    lidos += value.length;
    somar(value.length);
  }
  return lidos === esperado ? b : null;
}

interface Modelo {
  rt: RuntimeDoParakeet;
  pre: SessaoDoParakeet;
  encoder: SessaoDoParakeet;
  joint: SessaoDoParakeet;
  vocab: VocabularioDoParakeet;
}

/** Tamanho do estado do decoder do export (`input_states_1/2`: 2 camadas × 1 × 640). */
const FORMA_DO_ESTADO = [2, 1, 640];
/** Até onde, antes do fim da janela, se procura a pausa para cortar um trecho longo. */
const BUSCA_DO_CORTE_S = 5;
/** Abaixo disto (100 ms) não há palavra possível, e o extrator de áudio não tem quadro para montar. */
const MINIMO_DE_AMOSTRAS = 1600;

/** O protocolo inteiro, sem `self`: o worker real e o teste o montam com dependências diferentes. */
export function criarWorkerDoParakeet(deps: DependenciasDoParakeet) {
  const registrar = deps.registrarManifesto ?? gravarManifesto;
  const agora = deps.agora ?? (() => performance.now());
  const fila = new FilaSerial();
  let carga: Promise<Modelo> | null = null;
  let modelo: Modelo | null = null;

  /** Um arquivo: do cache (conferido) ou da rede; só vai ao cache o que passou no sha256. */
  async function obterArquivo(
    a: ArquivoDaCargaDoParakeet,
    cache: CacheDoParakeet | null,
    somar: (n: number) => void,
  ): Promise<{ conteudo: Uint8Array; guardado: boolean }> {
    const guardada = cache ? await cache.match(a.url).catch(() => undefined) : undefined;
    if (guardada) {
      let lidos = 0;
      const conteudo = await lerCorpo(guardada, a.bytes, (n) => {
        lidos += n;
        somar(n);
      }).catch(() => null);
      if (conteudo && (await sha256Hex(conteudo)) === a.sha256) return { conteudo, guardado: true };
      // Cópia truncada, corrompida ou de outra versão sob a mesma URL: sai do cache e vem da rede.
      await cache!.delete(a.url).catch(() => false);
      somar(-lidos);
    }
    let resposta: Response;
    try {
      resposta = await deps.buscar(a.url);
    } catch (e) {
      throw new FalhaDeCarga('rede', `${a.papel}: ${String((e as Error)?.message ?? e)}`);
    }
    if (!resposta.ok) throw new FalhaDeCarga('rede', `${a.papel}: HTTP ${resposta.status}`);
    let conteudo: Uint8Array | null;
    try {
      conteudo = await lerCorpo(resposta, a.bytes, somar);
    } catch (e) {
      throw new FalhaDeCarga('rede', `${a.papel}: download interrompido (${String((e as Error)?.message ?? e)})`);
    }
    if (!conteudo) throw new FalhaDeCarga('integridade', `${a.papel}: tamanho diferente de ${a.bytes} bytes`);
    const hash = await sha256Hex(conteudo);
    if (hash !== a.sha256)
      throw new FalhaDeCarga('integridade', `${a.papel}: sha256 não confere (${hash.slice(0, 12)}…)`);
    let guardado = false;
    if (cache) {
      try {
        await cache.put(
          a.url,
          new Response(conteudo as BodyInit, {
            headers: { 'content-type': 'application/octet-stream', 'content-length': String(conteudo.length) },
          }),
        );
        guardado = true;
      } catch {
        /* sem cota: transcreve agora, baixa de novo na próxima (o manifesto diz "gravação parcial") */
      }
    }
    return { conteudo, guardado };
  }

  /** O trecho inteiro por um pedaço que cabe na janela: extrator, encoder e o laço TDT. `null` = cancelado. */
  async function rodar(m: Modelo, pcm: Float32Array, cancelado: () => boolean): Promise<string | null> {
    const { rt, vocab } = m;
    const p = await m.pre.run({
      waveforms: rt.tensor('float32', pcm, [1, pcm.length]),
      waveforms_lens: rt.tensor('int64', BigInt64Array.from([BigInt(pcm.length)]), [1]),
    });
    if (cancelado()) return null;
    const e = await m.encoder.run({ audio_signal: p.features, length: p.features_lens });
    if (cancelado()) return null;
    const [, dim, quadros] = e.outputs.dims;
    const zeros = () =>
      rt.tensor('float32', new Float32Array(FORMA_DO_ESTADO.reduce((a, b) => a * b, 1)), [...FORMA_DO_ESTADO]);
    const passo: PassoDoJoint<[unknown, unknown]> = async (coluna, tokenAnterior, estado) => {
      const r = await m.joint.run({
        encoder_outputs: rt.tensor('float32', coluna, [1, dim, 1]),
        targets: rt.tensor('int32', Int32Array.from([tokenAnterior]), [1, 1]),
        target_length: rt.tensor('int32', Int32Array.from([1]), [1]),
        input_states_1: estado[0],
        input_states_2: estado[1],
      });
      return { logits: r.outputs.data as ArrayLike<number>, estado: [r.output_states_1, r.output_states_2] };
    };
    const tokens = await decodificarTdt(
      { dados: e.outputs.data as Float32Array, dim, quadros, validos: Number(e.encoded_lengths.data[0]) },
      passo,
      [zeros(), zeros()] as [unknown, unknown],
      { tamanho: vocab.pecas.length, branco: vocab.branco },
      cancelado,
    );
    return tokens ? destokenizar(tokens.map((t) => vocab.pecas[t] ?? '')) : null;
  }

  async function carregar(plano: PlanoDeCargaDoParakeet, threads: number): Promise<Modelo> {
    const cache = await deps.abrirCache().catch(() => null);
    const rastrear = criarRastreadorDeProgresso((p) =>
      deps.enviar({
        type: 'progress',
        progress: p.progress,
        loaded: p.loaded,
        total: p.total,
        label: rotuloDeBytes(p.loaded, p.total) ?? 'Parakeet',
      }),
    );
    let carregados = 0;
    const somar = (n: number) => {
      carregados = Math.max(0, carregados + n);
      rastrear({ status: 'progress_total', loaded: Math.min(carregados, plano.bytesTotais), total: plano.bytesTotais });
    };
    rastrear({ status: 'progress_total', loaded: 0, total: plano.bytesTotais });

    let rt: RuntimeDoParakeet;
    try {
      rt = await deps.abrirRuntime(threads);
    } catch (e) {
      throw new FalhaDeCarga('motor', `runtime não abriu: ${String((e as Error)?.message ?? e)}`);
    }

    // Um arquivo por vez, e a sessão logo em seguida: o JS solta os bytes antes do próximo arquivo.
    const noCache: { url: string; bytes: number }[] = [];
    const sessoes = new Map<string, SessaoDoParakeet>();
    let vocab: VocabularioDoParakeet | null = null;
    for (const a of plano.arquivos) {
      const { conteudo, guardado } = await obterArquivo(a, cache, somar);
      if (guardado) noCache.push({ url: a.url, bytes: a.bytes });
      try {
        if (a.papel === 'vocab') vocab = lerVocabulario(new TextDecoder().decode(conteudo));
        else sessoes.set(a.papel, await rt.criarSessao(conteudo));
      } catch (e) {
        throw new FalhaDeCarga('motor', `${a.papel} não abriu: ${String((e as Error)?.message ?? e)}`);
      }
    }
    const pre = sessoes.get('pre');
    const encoder = sessoes.get('encoder');
    const joint = sessoes.get('decoder');
    if (!pre || !encoder || !joint || !vocab) throw new FalhaDeCarga('motor', 'plano de carga incompleto');
    const m: Modelo = { rt, pre, encoder, joint, vocab };
    try {
      // Aquecimento: 1 s de silêncio pelo caminho inteiro, para o 1º trecho real não pagar a 1ª execução.
      await rodar(m, new Float32Array(16000), () => false);
    } catch (e) {
      throw new FalhaDeCarga('motor', `aquecimento falhou: ${String((e as Error)?.message ?? e)}`);
    }
    if (noCache.length) {
      registrar({
        modelId: plano.modelId,
        dtype: DTYPE_DO_PARAKEET,
        device: DEVICE_DO_PARAKEET,
        arquivos: noCache,
        bytesTotais: noCache.reduce((s, a) => s + a.bytes, 0),
        bytesEsperados: plano.bytesTotais,
        gravadoEm: Date.now(),
        revisao: plano.revisao,
      });
    }
    return m;
  }

  async function aoCarregar(plano: PlanoDeCargaDoParakeet, threads: number): Promise<void> {
    const t0 = agora();
    if (!carga) {
      const nova = carregar(plano, threads);
      carga = nova;
      nova.then(
        (m) => {
          modelo = m;
        },
        () => {
          if (carga === nova) carga = null;
        },
      );
    }
    try {
      await carga;
      deps.enviar({ type: 'ready', model: plano.modelId, cargaMs: agora() - t0 });
    } catch (e) {
      deps.enviar({
        type: 'loadError',
        model: plano.modelId,
        motivo: e instanceof FalhaDeCarga ? e.motivo : 'motor',
        message: String((e as Error)?.message ?? e).slice(0, 300),
      });
    }
  }

  async function aoTranscrever(
    id: string,
    pcm: Float32Array,
    idioma: string | undefined,
    sinal: SinalDeCancelamento,
  ): Promise<void> {
    try {
      const m = modelo ?? (carga ? await carga : null);
      if (!m) {
        deps.enviar({ type: 'error', id, message: 'Parakeet não carregado' });
        return;
      }
      const t0 = agora();
      const audioS = pcm.length / 16000;
      const textos: string[] = [];
      if (pcm.length >= MINIMO_DE_AMOSTRAS && !ehSilencioDigital(pcm)) {
        const pedacos = dividirEmJanelas(pcm, JANELA_DO_PARAKEET_S * 16000, BUSCA_DO_CORTE_S * 16000);
        for (const pedaco of pedacos) {
          const texto = await rodar(m, pedaco, () => sinal.cancelado);
          if (texto === null || sinal.cancelado) {
            deps.enviar({ type: 'cancelado', id });
            return;
          }
          if (texto.trim()) textos.push(texto.trim());
        }
      }
      const bruto = textos.join(' ');
      const filtrado = filtrarAlucinacao(bruto, audioS, idioma);
      deps.enviar({ type: 'result', id, text: filtrado, descartado: !!bruto && !filtrado, ms: agora() - t0, audioS });
    } catch (e) {
      deps.enviar({ type: 'error', id, message: String((e as Error)?.message ?? e).slice(0, 300) });
    }
  }

  return {
    /** Trata UMA mensagem da janela. A promessa resolve quando ela terminou (o teste espera). */
    receber(m: MensagemParaOParakeet): Promise<void> {
      switch (m.type) {
        case 'carregar':
          return aoCarregar(m.plano, m.threads ?? 1);
        case 'transcrever':
          return fila.enfileirar({
            id: m.id,
            prioridade: 'final',
            executar: (sinal) => aoTranscrever(m.id, m.pcm, m.idioma, sinal),
            aoDescartar: () => deps.enviar({ type: 'cancelado', id: m.id }),
          });
        case 'cancelar':
          fila.cancelar(m.id);
          return Promise.resolve();
        default:
          return Promise.resolve();
      }
    },
  };
}

/* ─────────────────────────────── o worker de verdade ─────────────────────────────── */

/** Teto de threads do WASM: o mesmo do worker do Whisper, e o que a bancada mediu. */
const TETO_DE_THREADS = 4;

/**
 * O `onnxruntime-web` de `node_modules`, por `import()`: só é avaliado quando alguém manda carregar.
 * O `.wasm` e o loader vêm de `/` (o que o app já serve para o VAD), nunca de CDN.
 */
async function abrirRuntime(threads: number): Promise<RuntimeDoParakeet> {
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.wasmPaths = '/';
  ort.env.wasm.numThreads = Math.max(1, Math.min(TETO_DE_THREADS, Math.floor(threads) || 1));
  return {
    criarSessao: (bytes) =>
      ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }) as unknown as Promise<SessaoDoParakeet>,
    tensor: (tipo, dados, dims) => new ort.Tensor(tipo, dados as never, dims),
  };
}

declare const WorkerGlobalScope: unknown;
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined') {
  const worker = criarWorkerDoParakeet({
    buscar: (url) => fetch(url),
    abrirCache: async () => (typeof caches === 'undefined' ? null : caches.open('transformers-cache')),
    abrirRuntime,
    enviar: (m) => self.postMessage(m),
  });
  self.onmessage = (e: MessageEvent<MensagemParaOParakeet>) => void worker.receber(e.data);
}
