/**
 * Web Worker do BERGAMOT (o motor do Firefox Translations) — a tradução pt→en no aparelho.
 *
 * POR QUE UM WORKER PRÓPRIO, e não o `mtWorker`: o Bergamot não é ONNX. É o Marian compilado para
 * WASM (`@browsermt/bergamot-translator`, MPL-2.0), com o gemm int8 embutido (`*Fallback`; o
 * nativo só existe no Firefox) e uma API síncrona (`BlockingService.translate`). Rodá-lo na thread
 * principal travaria a tela a cada frase; aqui ele bloqueia só este worker.
 *
 * O QUE A BANCADA MEDIU (Etapa 5, `docs/auditoria/eval/bancada-2026-09-etapa5.md`): no pt→en, COMET
 * +0,028 sobre o opus-mt (IC 95% exclui 0) e ~10× mais rápido por frase (14–44 ms em CPU), com 31 MB
 * no lugar de 113. Este arquivo reproduz no navegador o que `scripts/eval-fala/bancada/bergamot.mjs`
 * fazia em Node: a mesma CONFIG do `translator-worker.js` do pacote, o mesmo gemm e o mesmo
 * aquecimento — o número medido é o número servido.
 *
 * THREADS: o WASM do pacote é de UMA thread (`cpu-threads: 0` = o próprio worker). Ele cabe na
 * parte do tradutor no orçamento global (`lib/dispositivo/orcamentoDeThreads.ts`, mt = 1–2) sem
 * pedir nada; não há `numThreads` a acertar.
 *
 * PROTOCOLO (a janela é `bergamotLocal.ts`):
 *   → `carregar {plano}`      baixa (ou lê do Cache Storage) os 3 `.gz`, confere o sha256 do conteúdo
 *                             descomprimido, abre o WASM, monta o modelo e aquece;
 *                             ← `progress` (por bytes, limitado a ~5/s), `ready` ou `loadError {motivo}`
 *   → `traduzir {id, textos}` um LOTE (o motor separa as frases sozinho) ← `result {textos}` | `error`
 *                             Fila serial com o FINAL na frente (`filaDoWorker.ts`), como no opus-mt.
 *   → `cancelar {id}`         tira da fila (o `translate` em curso é síncrono e curto: termina)
 *   → `descartar`             solta o modelo e o serviço do heap do WASM ← `descartado`
 *
 * O `motivo` da falha decide o que a janela lembra: `motor` (o WASM não abre, o modelo não monta,
 * o aquecimento quebra) fica lembrado neste aparelho; `rede` e `integridade` não — a próxima captura
 * tenta de novo. Em qualquer caso a tradução cai no opus-mt (`bergamotLocal.ts`).
 */
import { gravarManifesto, type ManifestoDeModelo } from '../modelManifest';
import type { ArquivoDaCarga, PlanoDeCarga } from './bergamotModelo';
import { FilaSerial, type Prioridade } from './filaDoWorker';
import { criarRastreadorDeProgresso, rotuloDeBytes } from './modelProgress';

export type MotivoDaFalha = 'rede' | 'integridade' | 'motor';

export type MensagemParaOWorker =
  | { type: 'carregar'; plano: PlanoDeCarga }
  | { type: 'traduzir'; id: string; textos: string[]; prioridade?: Prioridade }
  | { type: 'cancelar'; id: string }
  | { type: 'descartar' };

export type MensagemDoWorker =
  | { type: 'progress'; progress: number; loaded: number; total: number; label: string }
  | { type: 'ready'; model: string }
  | { type: 'loadError'; model: string; motivo: MotivoDaFalha; message: string }
  | { type: 'result'; id: string; textos: string[] }
  | { type: 'error'; id: string; message: string }
  | { type: 'cancelado'; id: string }
  | { type: 'descartado' };

/* ── O pedaço do módulo Emscripten (embind) que usamos. O teste o simula; o tipo documenta. ── */
interface Apagavel {
  delete(): void;
}
interface MemoriaAlinhada extends Apagavel {
  getByteArrayView(): Int8Array;
}
interface VetorDe<T> extends Apagavel {
  push_back(x: T): void;
}
interface Respostas extends Apagavel {
  size(): number;
  get(i: number): { getTranslatedText(): string };
}
export interface ModuloBergamot {
  AlignedMemory: new (bytes: number, alinhamento: number) => MemoriaAlinhada;
  AlignedMemoryList: new () => VetorDe<MemoriaAlinhada>;
  TranslationModel: new (
    config: string,
    modelo: MemoriaAlinhada,
    lex: MemoriaAlinhada,
    vocabs: VetorDe<MemoriaAlinhada>,
    qualidade: MemoriaAlinhada | null,
  ) => Apagavel;
  BlockingService: new (opcoes: { cacheSize: number }) => Apagavel & {
    translate(modelo: Apagavel, textos: VetorDe<string>, opcoes: VetorDe<OpcoesDaResposta>): Respostas;
  };
  VectorString: new () => VetorDe<string>;
  VectorResponseOptions: new () => VetorDe<OpcoesDaResposta>;
}
interface OpcoesDaResposta {
  alignment: boolean;
  html: boolean;
  qualityScores: boolean;
}

/** Subconjunto do Cache Storage que usamos (injetável no teste). */
export interface CacheDoWorker {
  match(url: string): Promise<Response | undefined>;
  put(url: string, r: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
}

export interface DependenciasDoWorker {
  buscar: (url: string) => Promise<Response>;
  /** O Cache Storage onde os `.gz` ficam (o mesmo do transformers.js, para o manifesto valer). */
  abrirCache: () => Promise<CacheDoWorker | null>;
  /** Abre o WASM + a cola e devolve o módulo com o runtime inicializado. */
  carregarModulo: (motor: PlanoDeCarga['motor']) => Promise<ModuloBergamot>;
  enviar: (m: MensagemDoWorker) => void;
  registrarManifesto?: (m: ManifestoDeModelo) => void;
}

/**
 * A CONFIG do `translator-worker.js` do pacote (feixe 1, sem custo) mais o que ele força por cima —
 * a mesma da bancada. Mexer aqui é trocar o que foi medido.
 */
export const CONFIG_DO_MODELO = `beam-size: 1
normalize: 1.0
word-penalty: 0
cpu-threads: 0
gemm-precision: int8shiftAlphaAll
skip-cost: true
alignment: soft
quiet: true
quiet-translation: true
max-length-break: 128
mini-batch-words: 1024
workspace: 128
max-length-factor: 2.0
`;

/** As funções do gemm int8 que o WASM importa, ligadas às versões `*Fallback` que ele mesmo exporta. */
export const GEMM_EMBUTIDO: Record<string, string> = {
  int8_prepare_a: 'int8PrepareAFallback',
  int8_prepare_b: 'int8PrepareBFallback',
  int8_prepare_b_from_transposed: 'int8PrepareBFromTransposedFallback',
  int8_prepare_b_from_quantized_transposed: 'int8PrepareBFromQuantizedTransposedFallback',
  int8_prepare_bias: 'int8PrepareBiasFallback',
  int8_multiply_and_add_bias: 'int8MultiplyAndAddBiasFallback',
  int8_select_columns_of_b: 'int8SelectColumnsOfBFallback',
};

/** Frase do aquecimento: a 1ª tradução paga a preparação das matrizes int8 (~10× a seguinte). */
const AQUECIMENTO = 'Bom dia.';

class FalhaDeCarga extends Error {
  constructor(
    readonly motivo: MotivoDaFalha,
    message: string,
  ) {
    super(message);
    this.name = 'FalhaDeCarga';
  }
}

/** Primeiros bytes de um gzip. O servidor pode já ter tirado a compressão (Content-Encoding). */
export const ehGzip = (b: Uint8Array): boolean => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

export async function descomprimirGzip(b: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

export async function sha256Hex(b: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));
  return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Lê o corpo inteiro somando os bytes que chegam (a barra anda por byte, não por arquivo). */
async function lerCorpo(r: Response, somar: (n: number) => void): Promise<Uint8Array> {
  const leitor = r.body?.getReader();
  if (!leitor) {
    const b = new Uint8Array(await r.arrayBuffer());
    somar(b.length);
    return b;
  }
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value);
    total += value.length;
    somar(value.length);
  }
  const b = new Uint8Array(total);
  let i = 0;
  for (const p of pedacos) {
    b.set(p, i);
    i += p.length;
  }
  return b;
}

interface Tradutor {
  M: ModuloBergamot;
  modelo: Apagavel;
  servico: InstanceType<ModuloBergamot['BlockingService']>;
}

/** O protocolo inteiro, sem `self`: o worker real e o teste o montam com dependências diferentes. */
export function criarWorkerDoBergamot(deps: DependenciasDoWorker) {
  const registrar = deps.registrarManifesto ?? gravarManifesto;
  const fila = new FilaSerial();
  let carga: Promise<Tradutor> | null = null;
  let tradutor: Tradutor | null = null;
  let modelId = '';
  /** Sobe a cada `descartar`: uma carga que termina DEPOIS dele solta o que montou, não o instala. */
  let geracao = 0;

  /** Um arquivo: do cache (conferido) ou da rede; só vai ao cache o que passou no sha256. */
  async function obterArquivo(
    a: ArquivoDaCarga,
    cache: CacheDoWorker | null,
    somar: (n: number) => void,
  ): Promise<{ conteudo: Uint8Array; guardado: number | null }> {
    const guardada = cache ? await cache.match(a.url).catch(() => undefined) : undefined;
    if (guardada) {
      let lidos = 0;
      const bruto = await lerCorpo(guardada, (n) => {
        lidos += n;
        somar(n);
      });
      const conteudo = ehGzip(bruto) ? await descomprimirGzip(bruto).catch(() => null) : bruto;
      if (conteudo && (await sha256Hex(conteudo)) === a.sha256) return { conteudo, guardado: bruto.length };
      // Cópia corrompida (ou de outra versão sob a mesma URL): sai do cache e vem da rede.
      await cache!.delete(a.url).catch(() => false);
      somar(-lidos);
    }
    let resposta: Response;
    try {
      resposta = await deps.buscar(a.url);
    } catch (e) {
      throw new FalhaDeCarga('rede', `${a.chave}: ${String((e as Error)?.message ?? e)}`);
    }
    if (!resposta.ok) throw new FalhaDeCarga('rede', `${a.chave}: HTTP ${resposta.status}`);
    let bruto: Uint8Array;
    try {
      bruto = await lerCorpo(resposta, somar);
    } catch (e) {
      throw new FalhaDeCarga('rede', `${a.chave}: download interrompido (${String((e as Error)?.message ?? e)})`);
    }
    let conteudo: Uint8Array;
    try {
      conteudo = ehGzip(bruto) ? await descomprimirGzip(bruto) : bruto;
    } catch {
      throw new FalhaDeCarga('integridade', `${a.chave}: gzip inválido`);
    }
    const hash = await sha256Hex(conteudo);
    if (hash !== a.sha256)
      throw new FalhaDeCarga('integridade', `${a.chave}: sha256 não confere (${hash.slice(0, 12)}…)`);
    let guardado: number | null = null;
    if (cache) {
      try {
        await cache.put(a.url, new Response(bruto as BodyInit, { headers: { 'content-type': 'application/gzip' } }));
        guardado = bruto.length;
      } catch {
        /* sem cota: traduz agora, baixa de novo na próxima (o manifesto diz "gravação parcial") */
      }
    }
    return { conteudo, guardado };
  }

  async function carregar(plano: PlanoDeCarga): Promise<Tradutor> {
    // O WASM compila enquanto o modelo baixa: os dois caminhos não dependem um do outro.
    const modulo = deps.carregarModulo(plano.motor).then(
      (M) => ({ M }),
      (e: unknown) => ({ erro: e }),
    );
    const cache = await deps.abrirCache().catch(() => null);
    const rastrear = criarRastreadorDeProgresso((p) =>
      deps.enviar({
        type: 'progress',
        progress: p.progress,
        loaded: p.loaded,
        total: p.total,
        label: rotuloDeBytes(p.loaded, p.total) ?? 'Tradutor (Bergamot)',
      }),
    );
    let carregados = 0;
    const somar = (n: number) => {
      carregados = Math.max(0, carregados + n);
      rastrear({ status: 'progress_total', loaded: Math.min(carregados, plano.bytesTotais), total: plano.bytesTotais });
    };
    rastrear({ status: 'progress_total', loaded: 0, total: plano.bytesTotais });

    // Um arquivo por vez: o pico de memória é um `.gz` + o descomprimido, não os três de uma vez.
    const conteudos = new Map<string, Uint8Array>();
    const noCache: { url: string; bytes: number }[] = [];
    for (const a of plano.arquivos) {
      const { conteudo, guardado } = await obterArquivo(a, cache, somar);
      conteudos.set(a.chave, conteudo);
      if (guardado !== null) noCache.push({ url: a.url, bytes: guardado });
    }

    const aberto = await modulo;
    if ('erro' in aberto) {
      const e = aberto.erro as Error & { motivo?: MotivoDaFalha };
      throw new FalhaDeCarga(e?.motivo ?? 'motor', `WASM não abriu: ${String(e?.message ?? e)}`);
    }
    const M = aberto.M;
    let t: Tradutor;
    try {
      const memoria = (b: Uint8Array, alinhamento: number) => {
        const m = new M.AlignedMemory(b.byteLength, alinhamento);
        m.getByteArrayView().set(new Int8Array(b.buffer, b.byteOffset, b.byteLength));
        return m;
      };
      const alinhamento = (chave: string) => plano.arquivos.find((a) => a.chave === chave)!.alinhamento;
      const vocabs = new M.AlignedMemoryList();
      vocabs.push_back(memoria(conteudos.get('vocab')!, alinhamento('vocab')));
      const modelo = new M.TranslationModel(
        CONFIG_DO_MODELO,
        memoria(conteudos.get('modelo')!, alinhamento('modelo')),
        memoria(conteudos.get('lex')!, alinhamento('lex')),
        vocabs,
        null,
      );
      conteudos.clear(); // o heap do WASM tem a cópia; o JS solta os ~35 MB
      t = { M, modelo, servico: new M.BlockingService({ cacheSize: 0 }) };
      traduzirLote(t, [AQUECIMENTO]);
    } catch (e) {
      throw new FalhaDeCarga('motor', `modelo não montou: ${String((e as Error)?.message ?? e)}`);
    }
    /* Uma linha por carga (como o `[mt:worker] … carregado`): o heap do WASM depois do aquecimento é
       a memória que este worker segura enquanto estiver vivo — o número que o aparelho fraco sente. */
    const heap = (M as unknown as { HEAP8?: Int8Array }).HEAP8?.length;
    if (heap) console.info(`[bergamot] ${plano.modelId} pronto (heap do WASM ${Math.round(heap / 1e6)} MB)`);

    if (noCache.length) {
      registrar({
        modelId: plano.modelId,
        dtype: 'int8',
        device: 'wasm',
        arquivos: noCache,
        bytesTotais: noCache.reduce((s, a) => s + a.bytes, 0),
        bytesEsperados: plano.bytesTotais,
        gravadoEm: Date.now(),
        revisao: plano.revisao,
      });
    }
    return t;
  }

  function traduzirLote(t: Tradutor, textos: string[]): string[] {
    const entrada = new t.M.VectorString();
    const opcoes = new t.M.VectorResponseOptions();
    let respostas: Respostas | null = null;
    try {
      for (const texto of textos) {
        entrada.push_back(texto);
        opcoes.push_back({ alignment: false, html: false, qualityScores: false });
      }
      respostas = t.servico.translate(t.modelo, entrada, opcoes);
      return textos.map((_, i) => respostas!.get(i).getTranslatedText());
    } finally {
      entrada.delete();
      opcoes.delete();
      respostas?.delete();
    }
  }

  function apagar(t: Tradutor): void {
    try {
      t.servico.delete();
    } catch {
      /* já solto */
    }
    try {
      t.modelo.delete();
    } catch {
      /* já solto */
    }
  }

  function descartar(): void {
    geracao += 1;
    const t = tradutor;
    tradutor = null;
    carga = null;
    if (t) apagar(t);
  }

  async function aoCarregar(plano: PlanoDeCarga): Promise<void> {
    modelId = plano.modelId;
    const minha = geracao;
    if (!carga) {
      const nova = carregar(plano);
      carga = nova;
      nova.then(
        (t) => {
          if (minha === geracao) tradutor = t;
          else apagar(t);
        },
        () => {
          if (carga === nova) carga = null;
        },
      );
    }
    try {
      await carga;
      // Descartado no meio: a janela já esqueceu este worker; um `ready` agora mentiria.
      if (minha === geracao) deps.enviar({ type: 'ready', model: plano.modelId });
    } catch (e) {
      if (minha !== geracao) return;
      const motivo = e instanceof FalhaDeCarga ? e.motivo : 'motor';
      deps.enviar({
        type: 'loadError',
        model: plano.modelId,
        motivo,
        message: String((e as Error)?.message ?? e).slice(0, 200),
      });
    }
  }

  async function aoTraduzir(id: string, textos: string[], sinal: { cancelado: boolean }): Promise<void> {
    try {
      const t = tradutor ?? (carga ? await carga : null);
      if (!t) {
        deps.enviar({ type: 'error', id, message: 'Bergamot não carregado' });
        return;
      }
      if (sinal.cancelado) {
        deps.enviar({ type: 'cancelado', id });
        return;
      }
      deps.enviar({ type: 'result', id, textos: traduzirLote(t, textos) });
    } catch (e) {
      deps.enviar({ type: 'error', id, message: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  }

  return {
    /** Trata UMA mensagem da janela. A promessa resolve quando ela terminou (o teste espera). */
    receber(m: MensagemParaOWorker): Promise<void> {
      switch (m.type) {
        case 'carregar':
          return aoCarregar(m.plano);
        case 'traduzir':
          return fila.enfileirar({
            id: m.id,
            prioridade: m.prioridade === 'parcial' ? 'parcial' : 'final',
            executar: (sinal) => aoTraduzir(m.id, m.textos, sinal),
            aoDescartar: () => deps.enviar({ type: 'cancelado', id: m.id }),
          });
        case 'cancelar':
          fila.cancelar(m.id);
          return Promise.resolve();
        case 'descartar':
          descartar();
          deps.enviar({ type: 'descartado' });
          return Promise.resolve();
        default:
          return Promise.resolve();
      }
    },
    /** Só diagnóstico/teste: o modelo que este worker serve. */
    get modelo(): string {
      return modelId;
    },
  };
}

/* ─────────────────────────────── o worker de verdade ─────────────────────────────── */

type Montar = (Module: Record<string, unknown>) => unknown;

/**
 * Abre o motor: o `.wasm` e a cola do Emscripten, os dois servidos do próprio domínio pelo build
 * (`scripts/baixar-modelos-bergamot.mjs`). A cola é o `bergamot-translator-worker.js` do pacote
 * embrulhado como módulo ES — este worker é módulo, e `importScripts` não existe aqui.
 */
async function abrirMotor(motor: PlanoDeCarga['motor']): Promise<ModuloBergamot> {
  const [wasm, cola] = await Promise.all([
    fetch(motor.wasm).then(
      (r) => {
        if (!r.ok) throw Object.assign(new Error(`wasm: HTTP ${r.status}`), { motivo: 'rede' as const });
        return r.arrayBuffer();
      },
      (e: unknown) => {
        throw Object.assign(new Error(`wasm: ${String((e as Error)?.message ?? e)}`), { motivo: 'rede' as const });
      },
    ),
    /* A cola que não chega é rede (ou deploy incompleto), não "este navegador não roda": não fica
       lembrada como falha do motor. */
    (import(/* @vite-ignore */ motor.cola) as Promise<{ default: Montar }>).catch((e: unknown) => {
      throw Object.assign(new Error(`cola: ${String((e as Error)?.message ?? e)}`), { motivo: 'rede' as const });
    }),
  ]);
  return new Promise<ModuloBergamot>((resolve, reject) => {
    let instancia: WebAssembly.Instance | null = null;
    const Module: Record<string, unknown> = {
      print: () => {},
      printErr: (s: string) => {
        if (/error|fail/i.test(s)) console.warn('[bergamot]', s);
      },
      instantiateWasm(info: WebAssembly.Imports, aceitar: (i: WebAssembly.Instance) => void) {
        const gemm = Object.fromEntries(
          Object.entries(GEMM_EMBUTIDO).map(([k, n]) => [
            k,
            (...a: unknown[]) => (instancia!.exports[n] as (...x: unknown[]) => unknown)(...a),
          ]),
        );
        WebAssembly.instantiate(wasm, { ...info, wasm_gemm: gemm })
          .then((r) => {
            instancia = r.instance;
            aceitar(r.instance);
          })
          .catch(reject);
        return {};
      },
      onRuntimeInitialized: () => resolve(Module as unknown as ModuloBergamot),
      onAbort: (motivo: unknown) => reject(new Error(`abort: ${String(motivo)}`)),
    };
    try {
      cola.default(Module);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

declare const WorkerGlobalScope: unknown;
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined') {
  const worker = criarWorkerDoBergamot({
    buscar: (url) => fetch(url),
    abrirCache: async () => (typeof caches === 'undefined' ? null : caches.open('transformers-cache')),
    carregarModulo: abrirMotor,
    enviar: (m) => self.postMessage(m),
  });
  self.onmessage = (e: MessageEvent<MensagemParaOWorker>) => void worker.receber(e.data);
}
