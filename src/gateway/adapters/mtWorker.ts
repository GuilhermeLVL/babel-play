/**
 * Web Worker de TRADUÇÃO local (opus-mt via Transformers.js), rodando em WASM (CPU) de
 * propósito: mantém a GPU livre para o Whisper (sem contenção) e elimina a latência de rede
 * do MyMemory (que medimos em ~476ms p50 / ~1900ms p95). Modelos pequenos, carregados sob
 * demanda por direção. Espelha o padrão do whisperWorker.
 */
import { env, pipeline, Tensor } from '@huggingface/transformers';

import { juntarFrases, separarEmFrases } from '../../core/texto/frases';
import { registrarModeloBaixado } from '../modelManifest';
import { FilaSerial, processadorDeCancelamento, type SinalDeCancelamento } from './filaDoWorker';
import { LruDePipes, type ReservaDePipe } from './lruDePipes';
import { criarRastreadorDeProgresso, rotuloDeBytes } from './modelProgress';
import { configureModelDelivery } from './transformersEnv';

// Entrega dos pesos: cache do navegador (padrão) ou self-host same-origin (VITE_SELF_HOST_MODELS).
configureModelDelivery();

/**
 * THREADS DO ORÇAMENTO GLOBAL (`lib/dispositivo/orcamentoDeThreads.ts`), espelho do `definirThreads`
 * do whisperWorker. Antes este worker não escolhia nada e ficava o padrão do ORT — `min(4, ⌈núcleos/2⌉)`
 * com isolamento: 4 num desktop de 8 núcleos, somadas às 4 do Whisper. O adapter manda a parte do
 * tradutor em cada `preload`/`translate`; vale a PRIMEIRA — o ORT lê o número ao abrir a primeira
 * sessão, e depois dela mudar não teria efeito.
 */
let threadsDefinidas = false;
function definirThreads(threads: unknown): void {
  if (threadsDefinidas || typeof threads !== 'number' || !Number.isFinite(threads) || threads < 1) return;
  threadsDefinidas = true;
  try {
    const wasm = env.backends.onnx.wasm;
    if (wasm) wasm.numThreads = Math.min(4, Math.floor(threads));
  } catch {
    // sem o campo: fica o padrão do runtime
  }
}

/**
 * Progresso de download do opus-mt (~113 MB no int8).
 *
 * A versão anterior tratava `progress` (percentual DO ARQUIVO) e `progress_total` (o agregado)
 * no mesmo ramo, e `done` (que é por arquivo e nem carrega `total`) como 100%. Resultado medido:
 * a barra oscilava para trás continuamente — 46, 52, 47, 53, 47, 54… — e batia 100% aos 0,75 s.
 * Ver docs/discovery/A-model-download.md (A-P0-2) e tests/modelProgress.test.ts.
 *
 * Estado por carga: cada dtype do cascade tem arquivos e total diferentes.
 */
function novoProgresso(rotulo: string) {
  // Ver whisperWorker: o total agregado vira `bytesEsperados` do manifesto.
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

// Direção → (modelo opus-mt, token de idioma-alvo do grupo ROMANCE quando aplicável).
// ids verificados no HF Hub. Os modelos *-ROMANCE cobrem PT/ES/FR/IT/... via prefixo >>xx<<.
interface DirCfg {
  model: string;
  langToken?: string;
  langTokenId?: number;
}
/**
 * Direção → modelo. Pares com modelo DEDICADO da Xenova (en↔es/fr/it/de) usam o dedicado: melhor
 * qualidade e sem token de alvo. en→pt não tem dedicado pequeno (só o tc-big, sem ONNX): usa o
 * *-en-ROMANCE com o token `>>pt_br<<`.
 *
 * MEDIDO na hospedada (2026-08-26): o tokenizer do Transformers.js NÃO trata `>>pt<<` como token
 * especial (o pré-tokenizador o parte em pedaços) — o modelo ecoava ">>pt<<" e respondia em
 * espanhol/francês misturado. Por isso o token é inserido pelo ID do vocabulário (ver translate),
 * não pelo texto.
 */
const DEDICADOS = new Set(['es', 'fr', 'it', 'de']);
const ROMANCE = new Set(['pt', 'es', 'fr', 'it', 'ro', 'ca', 'gl']);
function dirConfig(src: string, tgt: string): DirCfg | null {
  const s = src.toLowerCase().split('-')[0];
  const t = tgt.toLowerCase().split('-')[0];
  if (s === t) return null;
  if (s === 'en' && DEDICADOS.has(t)) return { model: `Xenova/opus-mt-en-${t}` };
  if (DEDICADOS.has(s) && t === 'en') return { model: `Xenova/opus-mt-${s}-en` };
  // en→pt: ROMANCE com o token `>>pt_br<<` (id 51 no vocab.json do repo — o tokenizer.json que o
  // Transformers.js usa NÃO tem esses tokens, medido: convert_tokens_to_ids devolve <unk>). Os demais
  // alvos ROMANCE sem dedicado (ro/ca/gl) ficam de fora: sem o ID certo o modelo responde em qualquer
  // língua latina, e isso é pior do que cair no MyMemory.
  if (s === 'en' && t === 'pt') return { model: 'Xenova/opus-mt-en-ROMANCE', langToken: '>>pt_br<<', langTokenId: 51 };
  if (ROMANCE.has(s) && t === 'en') return { model: 'Xenova/opus-mt-ROMANCE-en' };
  return null; // par não coberto → o gateway cai para o próximo adapter (MyMemory)
}

/**
 * OS DOIS TRADUTORES MAIS RECENTES (`lruDePipes.ts`, plano "Grátis sem travar", A7). Era um `Map` sem
 * fim: trocar de par numa sessão longa empilhava ~113 MB por modelo no heap do worker. A conversa usa
 * dois sentidos; o terceiro despeja o menos usado (com `dispose`, que solta as sessões do ORT) e o
 * adapter é avisado (`descarregado`) para voltar a pedir a carga em vez de mandar tradução.
 */
const pipes = new LruDePipes<any>(2, (modelo) => self.postMessage({ type: 'descarregado', model: modelo }));
// Modelos que JÁ falharam a criação de sessão nesta máquina/navegador (ex.: o erro real observado
// em produção: "Can't create a session … qdq_actions.cc:137" — o ORT não consegue criar a sessão
// ONNX do opus-mt quantizado neste ambiente). Sem este cache, cada tradução re-tentava o download
// + o cascade de dtypes e falhava de novo, inundando o console e gastando ciclos. Falhou uma vez →
// falha rápido para sempre → o gateway cai limpo para o próximo adapter (Chrome/Edge Translator).
const failedModels = new Map<string, string>();
// Ordem de dtype: int8 (menor, ~113MB) → q4. MEDIDO em 2026-08: os repos Xenova/opus-mt-* só
// publicam `int8` e `q4` — o `fp16` que ficava aqui como "sempre funciona" dava 404, então quando
// o int8 falhava no ORT (`qdq_actions.cc`) o opus-mt morria para a sessão e a legenda caía no
// MyMemory. O q4 do opus-mt carrega no ORT atual (o "MatMulNBits" que se temia era de outra
// família de quantização). WASM (CPU) p/ não disputar a GPU com o Whisper.
// MEDIDO na versão hospedada (2026-08-26, Chrome/Windows, onnxruntime-web atual): `int8` E `q4`
// dos Xenova/opus-mt-* falham na criação da sessão ("qdq_actions.cc: Missing required scale …
// MatMulNBits") — o opus-mt NUNCA chegou a traduzir na hospedada; tudo caía no MyMemory e na
// cota dele. O `q8` (os `_quantized.onnx` clássicos, ~80 MB por lado) é o formato que o ORT
// aceita: vai primeiro. int8/q4 ficam como reserva para ambientes onde carreguem.
const MT_DTYPES = ['q8', 'int8', 'q4'] as const;
// MEDIDO (2026-08-26): com a otimização de grafo padrão o ORT nem cria a sessão (o erro qdq acima);
// em 'basic' carrega e traduz. Não é preferência, é o único nível que funciona hoje.
const ORT_GRAPH_OPT = 'basic';
/* DECODE: antes ia sem opção nenhuma (greedy, sem teto) — o candidato mais literal e, em frase
   longa, sem freio. Beam 2 é o menor que já melhora a escolha de expressão sem dobrar o tempo no
   WASM; `no_repeat_ngram_size` mata o "the the" do greedy; `max_length` é o freio. */
const GERACAO = { num_beams: 2, max_length: 256, no_repeat_ngram_size: 3, early_stopping: true } as const;
// `diag` (só diagnóstico, via mensagem): força a lista de dtypes e o nível de otimização do ORT.
let diag: { dtypes?: string[]; graphOpt?: string } = {};
async function getPipe(model: string): Promise<any> {
  const pronto = pipes.obter(model);
  if (pronto) return pronto;
  const prevFail = failedModels.get(model);
  if (prevFail) {
    // Fail-fast: já sabemos que este modelo não carrega aqui — não re-tenta o cascade.
    throw new Error(`opus-mt indisponível neste ambiente (falha anterior: ${prevFail})`);
  }
  /* UMA CARGA DE CADA VEZ, e uma só por modelo. Dois preloads (os dois sentidos da conversa) abriam
     duas sessões de ~113 MB ao mesmo tempo — o pico de memória somava as duas. Agora vão numa fila
     SÓ DE CARGA: a tradução de um sentido já pronto não passa por ela (sai no `obter` acima) e não
     espera o download do outro. O mesmo modelo pedido de novo durante a carga espera a mesma. */
  const emVoo = cargasEmVoo.get(model);
  if (emVoo) return emVoo;
  const carga = filaDeCarga.then(() => carregarPipe(model));
  filaDeCarga = carga.catch(() => undefined);
  cargasEmVoo.set(model, carga);
  carga
    .finally(() => cargasEmVoo.delete(model))
    .catch(() => {
      /* quem pediu recebe o erro pela própria promessa */
    });
  return carga;
}

/** A fila das cargas (ver `getPipe`) e a carga em andamento de cada modelo. */
let filaDeCarga: Promise<unknown> = Promise.resolve();
const cargasEmVoo = new Map<string, Promise<any>>();

/**
 * O pipe para UMA tradução, RESERVADO até o `soltar`: o cache não o descarta no meio do uso (uma carga
 * que termina durante a tradução despeja outro). Se ele sair do cache entre a carga e a reserva,
 * carrega de novo — no máximo três voltas.
 */
async function reservarPipe(model: string): Promise<ReservaDePipe<any>> {
  for (let volta = 0; volta < 3; volta++) {
    const reserva = pipes.reservar(model);
    if (reserva) return reserva;
    await getPipe(model);
  }
  throw new Error(`opus-mt: ${model} saiu do cache enquanto carregava`);
}

/** O cascade de dtypes de UM modelo — só roda pela fila de carga (`getPipe`). */
async function carregarPipe(model: string): Promise<any> {
  const pronto = pipes.obter(model);
  if (pronto) return pronto;
  // Despeja ANTES de carregar: a memória solta pelo menos usado é reusada por este (pico de 2, não 3).
  await pipes.abrirEspaco();
  let lastErr: unknown = null;
  for (const dtype of (diag.dtypes ?? MT_DTYPES) as readonly string[]) {
    try {
      const progresso = novoProgresso('Tradutor (opus-mt)');
      const p = await pipeline('translation', model, {
        device: 'wasm',
        dtype: dtype as any,
        progress_callback: progresso,
        session_options: { graphOptimizationLevel: diag.graphOpt ?? ORT_GRAPH_OPT },
      } as any);
      await pipes.guardar(model, p);
      console.log(`[mt:worker] ${model} carregado (dtype=${dtype})`);
      // Manifesto com o dtype que REALMENTE venceu o cascade (int8 ou fp16 baixam arquivos
      // diferentes — a versao antiga classificava os dois como "em cache").
      void registrarModeloBaixado(model, dtype, 'wasm', progresso.bytesEsperados);
      return p;
    } catch (e) {
      lastErr = e;
      console.warn(`[mt:worker] dtype ${dtype} falhou: ${String((e as Error)?.message || e).slice(0, 80)}`);
    }
  }
  const msg = String((lastErr as Error)?.message || lastErr).slice(0, 120);
  failedModels.set(model, msg);
  console.warn(`[mt:worker] ${model} DESATIVADO nesta sessão (todos os dtypes falharam), usando tradutor de fallback.`);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Traduções passam por UMA fila serial (ver `filaDoWorker.ts`): antes, `onmessage = async` deixava a
 * tradução do parcial e a do final da mesma fala se intercalarem, e a do final (a que a pessoa espera)
 * saía mais lenta — a MT do final variava de 0,24 a 1,67 s, e as lentas eram as intercaladas
 * (auditoria de latência 2026-09-26). Agora a do final passa na frente, e a do parcial que ficou
 * velha é descartada ou parada no meio. A CARGA (preload) fica fora desta fila — vai na fila SÓ DE
 * CARGA de `getPipe`: um download de 113 MB de uma direção não pode segurar a tradução da outra, que
 * já está pronta.
 */
const fila = new FilaSerial();

async function traduzir(dados: any, sinal: SinalDeCancelamento): Promise<void> {
  const { id, text, src, tgt } = dados;
  const cancelado = () => self.postMessage({ type: 'cancelado', id });
  // O pipe fica RESERVADO do começo ao fim desta tradução: o cache de dois não o descarta no meio.
  let reserva: ReservaDePipe<any> | null = null;
  try {
    const cfg = dirConfig(src, tgt);
    if (!cfg) {
      self.postMessage({ type: 'error', id, message: `par ${src}->${tgt} não suportado pelo opus-mt` });
      return;
    }
    reserva = await reservarPipe(cfg.model);
    const pipe = reserva.valor;
    if (sinal.cancelado) return cancelado();
    let tokenId: number | undefined;
    if (cfg.langToken) {
      const tm = pipe.tokenizer?.model;
      const viaMap = tm?.tokens_to_ids?.get?.(cfg.langToken);
      const viaFn =
        typeof tm?.convert_tokens_to_ids === 'function' ? tm.convert_tokens_to_ids([cfg.langToken])?.[0] : undefined;
      const cand = typeof viaMap === 'number' ? viaMap : typeof viaFn === 'number' ? viaFn : undefined;
      tokenId = cand !== undefined && cand !== tm?.unk_token_id ? cand : cfg.langTokenId;
      if (tokenId === undefined)
        console.warn(
          '[mt:worker] token de alvo',
          cfg.langToken,
          'não resolvido pelo tokenizer; caindo para o prefixo em texto',
        );
    }
    // Parar no meio: força o fim da sequência no próximo passo do `generate` (ver filaDoWorker.ts).
    const proc = processadorDeCancelamento(sinal, pipe.model?.generation_config?.eos_token_id);
    const geracao = proc ? { ...GERACAO, logits_processor: [proc] } : GERACAO;
    /** Traduz UMA frase. Extraído do laço porque o opus-mt só sabe traduzir uma (ver abaixo). */
    const traduzirFrase = async (trecho: string): Promise<string> => {
      if (cfg.langToken && typeof tokenId === 'number') {
        // Token de idioma-alvo pelo ID (o texto seria partido pelo pré-tokenizador — ver dirConfig).
        const enc = pipe.tokenizer(trecho);
        const ids = [BigInt(tokenId), ...Array.from(enc.input_ids.data as BigInt64Array)];
        const input_ids = new Tensor('int64', BigInt64Array.from(ids), [1, ids.length]);
        const attention_mask = new Tensor('int64', BigInt64Array.from(ids.map(() => BigInt(1))), [1, ids.length]);
        const gen = await pipe.model.generate({ input_ids, attention_mask, ...geracao });
        return pipe.tokenizer.batch_decode(gen, { skip_special_tokens: true })[0] ?? '';
      }
      const out = await pipe(cfg.langToken ? `${cfg.langToken} ${trecho}` : trecho, geracao);
      return (Array.isArray(out) ? out[0]?.translation_text : out?.translation_text) ?? '';
    };

    /**
     * UMA CHAMADA POR FRASE. O opus-mt é treinado em pares de uma sentença: diante de duas ele
     * emite o token de fim depois da primeira e a segunda SOME. Medido em
     * `docs/auditoria/eval-traducao-baseline-v1.md`: segmentar levou o chrF++ de 51,4% para 56,6%,
     * com +17,6 em pronome e +15,5 em gênero — e zero movimento nas categorias de frase única,
     * que é a assinatura de uma correção causal e não de ruído.
     *
     * Não é teto de tokens: com `max_length` 128 e 256 a saída é idêntica, em 9 tokens. O `GERACAO`
     * acima (beam 2) melhora cada frase, mas não faz a segunda existir — as duas coisas somam.
     */
    const partes: string[] = [];
    for (const frase of separarEmFrases(text)) {
      if (sinal.cancelado) return cancelado();
      partes.push(await traduzirFrase(frase));
    }
    if (sinal.cancelado) return cancelado();
    self.postMessage({ type: 'result', id, text: juntarFrases(partes) });
  } catch (err) {
    console.error('[mt:worker] ERRO:', err instanceof Error ? err.stack || err.message : String(err));
    self.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : String(err) });
  } finally {
    void reserva?.soltar();
  }
}

self.onmessage = (e: MessageEvent): Promise<void> => {
  const { type, id, src, tgt } = e.data;
  if (type === 'diag') {
    diag = e.data.diag ?? {};
    failedModels.clear();
    void pipes.limpar();
    return Promise.resolve();
  }
  if (type === 'cancelar') {
    fila.cancelar(id);
    return Promise.resolve();
  }
  // Antes de qualquer sessão: a primeira mensagem com modelo decide as threads (ver `definirThreads`).
  if (type === 'preload' || type === 'translate') definirThreads(e.data.threads);

  // PRELOAD: carrega o modelo da direção em background (o adapter só roteia p/ cá quando 'ready').
  if (type === 'preload') {
    return (async () => {
      const cfg = dirConfig(src, tgt);
      if (!cfg) {
        self.postMessage({ type: 'loadError', model: `${src}->${tgt}` });
        return;
      }
      try {
        await getPipe(cfg.model);
        self.postMessage({ type: 'ready', model: cfg.model });
      } catch (err) {
        self.postMessage({
          type: 'loadError',
          model: cfg.model,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }

  if (type !== 'translate') return Promise.resolve();
  return fila.enfileirar({
    id,
    prioridade: e.data.prioridade === 'parcial' ? 'parcial' : 'final',
    executar: (sinal) => traduzir(e.data, sinal),
    aoDescartar: () => self.postMessage({ type: 'cancelado', id }),
  });
};
