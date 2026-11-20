/**
 * O WORKER DA VOZ NATURAL NO APARELHO (Kitten TTS 2, openspec `voz-natural-no-aparelho-kitten`). Tudo que pesa fica
 * aqui: o download dos arquivos do idioma para o OPFS (retomável, tamanho e sha256 conferidos, `pesosNoAparelho.ts`), a
 * sessão do `onnxruntime-web` e a síntese (fonetizador do app → ids → modelo → corte do pacote).
 *
 * O mini é UM modelo para os três idiomas; o pico, um por idioma. As sessões ficam por arquivo `.onnx`. O WebGPU só vale
 * se o aquecimento sair em tempo real (RTF < 0,5): o adaptador por software do Chromium sem GPU mediu RTF 17 no spike,
 * e aí cai para o WASM.
 *
 * O protocolo é montado por `criarWorkerDoKitten(deps)`, sem `self`: o teste entra com OPFS, rede e runtime falsos.
 */
import type { IdiomaDeVoz } from '../../core/leitura/prepararTextoParaVoz';
import {
  apararTrecho,
  type ArquivoDoKitten,
  arquivosDoIdioma,
  type ArrayDoNpy,
  bytesDe,
  emendarTrechos,
  estiloParaTokens,
  fonemasParaSintese,
  idiomaDoKitten,
  idsDosFonemas,
  lerNpz,
  modeloDoIdioma,
  TAXA_DO_KITTEN,
  urlDoArquivoDoKitten,
  type VarianteDoKitten,
  velocidadeDoKitten,
  vozDoKitten,
} from '../../core/voz/kitten';
import {
  abrirRuntime,
  baixarArquivoConferido,
  ehCancelamento,
  lerConferido,
  type PastaDaVoz,
  pastaOpfs,
  type RuntimeDaVoz,
  type SessaoDaVoz,
  sha256Hex,
  temWebGpu,
} from './pesosNoAparelho';

/* ───────── protocolo ───────── */

export type MensagemParaOKitten =
  | { tipo: 'baixar'; id: number; raiz: string; variante: VarianteDoKitten; idioma: IdiomaDeVoz }
  | { tipo: 'cancelar' }
  | { tipo: 'carregar'; id: number; variante: VarianteDoKitten; idioma: IdiomaDeVoz; threads: number; webgpu: boolean }
  | {
      tipo: 'sintetizar';
      id: number;
      variante: VarianteDoKitten;
      texto: string;
      idioma: string;
      voz: string;
      velocidade: number;
    }
  | { tipo: 'apagar'; id: number };

export type MensagemDoKitten =
  | { tipo: 'progresso'; id: number; recebidos: number; total: number }
  | { tipo: 'ok'; id: number; backend?: string; pcm?: Float32Array; taxa?: number; ms?: number; trechos?: number }
  | { tipo: 'erro'; id: number; mensagem: string; cancelado?: boolean };

export interface DependenciasDoKitten {
  buscar: (url: string, init: RequestInit) => Promise<Response>;
  abrirPasta: () => Promise<PastaDaVoz>;
  abrirRuntime: (threads: number) => Promise<RuntimeDaVoz>;
  temWebGpu: () => Promise<boolean>;
  sha256: (b: Uint8Array) => Promise<string>;
  enviar: (m: MensagemDoKitten, transferir?: Transferable[]) => void;
  agora?: () => number;
}

/** Nome no disco: `<variante>__<caminho com __>` (o léxico e o vocabulário existem nas duas variantes). */
export const nomeNoDiscoDoKitten = (v: VarianteDoKitten, a: ArquivoDoKitten): string =>
  `${v}__${a.caminho.replace(/\//g, '__')}`;

/** O aquecimento do WebGPU precisa sair pelo menos neste RTF; acima, o WASM é mais rápido. */
export const RTF_MAXIMO_DO_WEBGPU = 0.5;
const FRASE_DE_AQUECIMENTO: Record<IdiomaDeVoz, string> = { pt: 'Olá.', en: 'Hello.', es: 'Hola.' };

interface Carregado {
  backend: 'webgpu' | 'wasm';
  sessao: SessaoDaVoz;
}

export function criarWorkerDoKitten(d: DependenciasDoKitten) {
  const agora = d.agora ?? (() => performance.now());
  let download: AbortController | null = null;
  let rt: RuntimeDaVoz | null = null;
  let vocab: Record<string, number> | null = null;
  let lexicoEn: Record<string, string> | null = null;
  const sessoes = new Map<string, Carregado>(); // por arquivo .onnx
  const vozes = new Map<IdiomaDeVoz, Map<string, ArrayDoNpy>>();

  const arquivo = (v: VarianteDoKitten, caminho: string) => {
    const a = arquivosDoIdioma(v, 'pt')
      .concat(arquivosDoIdioma(v, 'en'), arquivosDoIdioma(v, 'es'))
      .find((x) => x.caminho === caminho);
    if (!a) throw new Error(`arquivo fora da lista: ${caminho}`);
    return a;
  };

  const ler = async (pasta: PastaDaVoz, v: VarianteDoKitten, a: ArquivoDoKitten) =>
    lerConferido(pasta, nomeNoDiscoDoKitten(v, a), a.sha256, `${v}/${a.caminho}`);

  async function baixar(id: number, raiz: string, v: VarianteDoKitten, idioma: IdiomaDeVoz): Promise<void> {
    download?.abort();
    const ctl = new AbortController();
    download = ctl;
    const pasta = await d.abrirPasta();
    const lista = arquivosDoIdioma(v, idioma);
    const total = bytesDe(lista);
    let recebidos = 0;
    let ultimo = 0;
    const somar = (n: number) => {
      recebidos += n;
      const t = agora();
      if (t - ultimo > 100 || recebidos >= total) {
        ultimo = t;
        d.enviar({ tipo: 'progresso', id, recebidos, total });
      }
    };
    try {
      for (const a of lista)
        await baixarArquivoConferido(
          d,
          pasta,
          {
            nome: nomeNoDiscoDoKitten(v, a),
            url: urlDoArquivoDoKitten(raiz, v, a),
            bytes: a.bytes,
            sha256: a.sha256,
            rotulo: `${v}/${a.caminho}`,
          },
          ctl.signal,
          somar,
        );
    } finally {
      if (download === ctl) download = null;
    }
  }

  async function sintetizarFrase(
    v: VarianteDoKitten,
    texto: string,
    idioma: IdiomaDeVoz,
    voz: string,
    velocidade: number,
  ) {
    const carregado = sessoes.get(modeloDoIdioma(v, idioma));
    const pacotes = vozes.get(idioma);
    if (!carregado || !pacotes || !vocab || !rt) throw new Error('modelo não carregado');
    const pacote = pacotes.get(vozDoKitten(v, idioma, voz).chave) ?? pacotes.values().next().value;
    if (!pacote) throw new Error(`sem vozes para ${idioma}`);
    const trechos = fonemasParaSintese(texto, idioma, idioma === 'en' ? (lexicoEn ?? {}) : undefined);
    if (!trechos.length) throw new Error('texto vazio');
    const partes: Float32Array[] = [];
    for (const [i, fon] of trechos.entries()) {
      const ids = idsDosFonemas(fon, vocab);
      const estilo = estiloParaTokens(pacote.dados, pacote.forma[1] ?? 256, ids.length);
      const out = await carregado.sessao.run({
        input_ids: rt.tensor(
          'int64',
          BigInt64Array.from(ids, (x) => BigInt(x)),
          [1, ids.length],
        ),
        style: rt.tensor('float32', Float32Array.from(estilo), [1, estilo.length]),
        speed: rt.tensor('float32', new Float32Array([velocidadeDoKitten(velocidade)]), [1]),
      });
      const [nomeOnda, nomeDur] = carregado.sessao.outputNames ?? ['waveform', 'duration'];
      const onda = (out[nomeOnda] ?? out.waveform).data as Float32Array;
      const dur = (out[nomeDur] ?? out.duration).data as ArrayLike<number | bigint>;
      partes.push(apararTrecho(onda, dur, i === 0));
    }
    return { pcm: emendarTrechos(partes), taxa: TAXA_DO_KITTEN, trechos: trechos.length };
  }

  async function carregar(
    v: VarianteDoKitten,
    idioma: IdiomaDeVoz,
    threads: number,
    webgpu: boolean,
  ): Promise<'webgpu' | 'wasm'> {
    const onnx = modeloDoIdioma(v, idioma);
    const pasta = await d.abrirPasta();
    rt ??= await d.abrirRuntime(threads);
    vocab ??= JSON.parse(new TextDecoder().decode(await ler(pasta, v, arquivo(v, 'vocab.json'))));
    if (idioma === 'en' && !lexicoEn)
      lexicoEn = JSON.parse(new TextDecoder().decode(await ler(pasta, v, arquivo(v, 'g2p/cmu_misaki_us.json'))));
    if (!vozes.has(idioma)) vozes.set(idioma, lerNpz(await ler(pasta, v, arquivo(v, `voices_${idioma}.npz`))));
    const pronto = sessoes.get(onnx);
    if (pronto) return pronto.backend;
    const bytes = await ler(pasta, v, arquivo(v, onnx));
    const tentativas: Array<'webgpu' | 'wasm'> = webgpu && (await d.temWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
    let ultimoErro: unknown = null;
    for (const ep of tentativas) {
      let sessao: SessaoDaVoz | null = null;
      try {
        sessao = await rt.criarSessao(bytes, ep);
        sessoes.set(onnx, { backend: ep, sessao });
        /* aquecimento: o WebGPU que falha, falha aqui; o lento (por software) é medido e trocado */
        const t0 = agora();
        const r = await sintetizarFrase(v, FRASE_DE_AQUECIMENTO[idioma], idioma, '', 1);
        const rtf = (agora() - t0) / 1000 / Math.max(0.05, r.pcm.length / r.taxa);
        if (ep === 'webgpu' && rtf > RTF_MAXIMO_DO_WEBGPU && tentativas.length > 1)
          throw new Error(`WebGPU lento (RTF ${rtf.toFixed(2)})`);
        return ep;
      } catch (e) {
        ultimoErro = e;
        sessoes.delete(onnx);
        await sessao?.release().catch(() => undefined);
      }
    }
    throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
  }

  async function liberarTudo() {
    for (const s of sessoes.values()) await s.sessao.release().catch(() => undefined);
    sessoes.clear();
    vozes.clear();
    vocab = null;
    lexicoEn = null;
  }

  async function receber(m: MensagemParaOKitten): Promise<void> {
    if (m.tipo === 'cancelar') {
      download?.abort();
      return;
    }
    try {
      if (m.tipo === 'baixar') {
        await baixar(m.id, m.raiz, m.variante, m.idioma);
        d.enviar({ tipo: 'ok', id: m.id });
      } else if (m.tipo === 'carregar') {
        d.enviar({ tipo: 'ok', id: m.id, backend: await carregar(m.variante, m.idioma, m.threads, m.webgpu) });
      } else if (m.tipo === 'sintetizar') {
        const idioma = idiomaDoKitten(m.idioma);
        if (!idioma) throw new Error(`idioma fora do motor: ${m.idioma}`);
        const carregado = sessoes.get(modeloDoIdioma(m.variante, idioma));
        if (!carregado) throw new Error('modelo não carregado');
        const t0 = agora();
        const r = await sintetizarFrase(m.variante, m.texto, idioma, m.voz, m.velocidade);
        d.enviar({ tipo: 'ok', id: m.id, ...r, ms: agora() - t0, backend: carregado.backend }, [r.pcm.buffer]);
      } else if (m.tipo === 'apagar') {
        download?.abort();
        await liberarTudo();
        await (await d.abrirPasta()).apagarTudo();
        d.enviar({ tipo: 'ok', id: m.id });
      }
    } catch (e) {
      d.enviar({
        tipo: 'erro',
        id: m.id,
        mensagem: e instanceof Error ? e.message : String(e),
        cancelado: ehCancelamento(e),
      });
    }
  }

  return { receber };
}

/* ───────── o worker de verdade ───────── */

const PASTA = 'voz-natural-kitten2';

declare const WorkerGlobalScope: unknown;
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined') {
  const w = criarWorkerDoKitten({
    buscar: (url, init) => fetch(url, init),
    abrirPasta: () => pastaOpfs(PASTA),
    abrirRuntime,
    temWebGpu,
    sha256: sha256Hex,
    enviar: (m, t) =>
      (self as unknown as { postMessage(m: unknown, t?: Transferable[]): void }).postMessage(m, t ?? []),
  });
  self.onmessage = (e: MessageEvent<MensagemParaOKitten>) => void w.receber(e.data);
}
