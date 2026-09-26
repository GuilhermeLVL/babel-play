/**
 * Manifesto de modelo baixado — a resposta honesta para "isto já está em cache?".
 *
 * O QUE ISTO SUBSTITUI: `modelCache.ts` respondia `true` quando UMA entrada qualquer do Cache
 * Storage continha o id do modelo (`urls.some(u => u.includes(id))`). Medido em produção: com 12
 * entradas / 62,38 MB e só 1 dos 4 pesos `.onnx` presentes, a resposta foi `true` e a UI afirmou
 * "nada é baixado de novo" com ~113 MB ainda por baixar. Ver A-P0-4 em
 * docs/discovery/A-model-download.md.
 *
 * COMO FUNCIONA: ao terminar uma carga com sucesso, gravamos a lista real de arquivos daquele
 * modelo — lida do próprio Cache Storage, não adivinhada — com o tamanho de cada um. "Está em
 * cache" passa a significar: existe manifesto para este (modelo, dtype, device) E todo arquivo
 * dele está presente com o tamanho certo.
 *
 * A chave inclui dtype e device de propósito: o fallback q8 do Whisper e o cascade int8→fp16 do
 * opus-mt baixam ARQUIVOS DIFERENTES, e a versão antiga classificava tudo isso como "em cache".
 */

const PREFIXO = 'babel.modelManifest.';

export interface ArquivoDoModelo {
  url: string;
  bytes: number;
}

export interface ManifestoDeModelo {
  modelId: string;
  dtype: string;
  device: string;
  arquivos: ArquivoDoModelo[];
  /** Soma do que REALMENTE ficou no Cache Storage no momento do registro. */
  bytesTotais: number;
  /**
   * Bytes que o download entregou, segundo o agregado da lib (`progress_total.total`).
   *
   * Existe porque o manifesto é montado a partir do que está NO CACHE, e sob quota estourada o
   * `cache.put` falha em parte dos arquivos — o manifesto então descrevia o estado parcial como
   * se fosse o total, e a checagem seguinte respondia "completo". Achado pela suíte de mecanismo
   * (cenário 11/quota reduzida). Ausente em manifestos legados, onde a checagem degrada para o
   * comportamento anterior.
   */
  bytesEsperados?: number;
  gravadoEm: number;
  /**
   * O commit do repositório no Hugging Face (`sha` da API pública de modelos do Hub) quando a cópia foi
   * gravada — a VERSÃO baixada. É com ele que "Procurar atualização" compara. Ausente em
   * manifestos antigos: aí a comparação cai para a data da última mudança do repositório.
   */
  revisao?: string;
}

/** A versão publicada de um modelo no Hugging Face: o commit e a data da última mudança. */
export interface RevisaoPublicada {
  sha: string;
  ultimaMudanca: number;
}

type Buscar = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;

/**
 * Consulta a versão PUBLICADA do modelo (`GET huggingface.co/api/models/:id`, com CORS aberto).
 * `null` sem rede ou resposta estranha — quem chama diz "não deu para conferir", nunca "atualizado".
 */
export async function consultarRevisao(modelId: string, buscar: Buscar = fetch): Promise<RevisaoPublicada | null> {
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
    const r = await buscar(`https://huggingface.co/api/models/${modelId}`, ctl ? { signal: ctl.signal } : undefined);
    if (t) clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { sha?: unknown; lastModified?: unknown };
    const ultimaMudanca = typeof j.lastModified === 'string' ? Date.parse(j.lastModified) : NaN;
    if (typeof j.sha !== 'string' || !j.sha || Number.isNaN(ultimaMudanca)) return null;
    return { sha: j.sha, ultimaMudanca };
  } catch {
    return null;
  }
}

/** A cópia gravada mais recente deste modelo (qualquer dtype/device). */
function manifestoMaisNovo(modelId: string): ManifestoDeModelo | null {
  let melhor: ManifestoDeModelo | null = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIXO) || !k.includes(modelId)) continue;
      const m = JSON.parse(localStorage.getItem(k) ?? 'null') as ManifestoDeModelo | null;
      if (m?.gravadoEm && (!melhor || m.gravadoEm > melhor.gravadoEm)) melhor = m;
    }
  } catch {
    return melhor;
  }
  return melhor;
}

export type SituacaoDaVersao = 'atual' | 'desatualizado' | 'sem-copia' | 'sem-rede';

/**
 * "Procurar atualização": a cópia no navegador é a versão publicada agora?
 *
 * Com a revisão guardada no download, compara o commit. Em cópias antigas (sem revisão), a
 * pergunta vira "o repositório mudou DEPOIS que este navegador baixou?" — a data da última
 * mudança contra a data da gravação. As duas são fatos; nenhuma é palpite.
 */
export async function situacaoDaVersao(modelId: string, buscar: Buscar = fetch): Promise<SituacaoDaVersao> {
  const m = manifestoMaisNovo(modelId);
  if (!m) return 'sem-copia';
  const pub = await consultarRevisao(modelId, buscar);
  if (!pub) return 'sem-rede';
  if (m.revisao) return m.revisao === pub.sha ? 'atual' : 'desatualizado';
  return pub.ultimaMudanca > m.gravadoEm ? 'desatualizado' : 'atual';
}

export function chaveDoManifesto(modelId: string, dtype: string, device: string): string {
  return `${PREFIXO}${modelId}|${dtype}|${device}`;
}

/** Tipo da mensagem que um Web Worker manda para a janela gravar o manifesto (ver abaixo). */
export const MENSAGEM_DO_MANIFESTO = 'manifesto-do-modelo';

/**
 * Grava o manifesto no localStorage da JANELA.
 *
 * Quem registra o download são os Web Workers do Whisper e do tradutor, e Worker NÃO tem
 * localStorage: a gravação lançava `ReferenceError`, o `catch` engolia, e manifesto nenhum era
 * gravado — a Captura dizia "baixa na primeira captura" com o modelo inteiro no cache, sem "baixado
 * em" e com o "Liberar espaço" apagado. Dentro de um Worker, o manifesto vai por `postMessage` e o
 * adaptador na janela chama esta mesma função de lá.
 */
export function gravarManifesto(m: ManifestoDeModelo): void {
  if (typeof localStorage === 'undefined') {
    const g = globalThis as { postMessage?: (msg: unknown) => void; document?: unknown };
    if (typeof g.document === 'undefined' && typeof g.postMessage === 'function') {
      g.postMessage({ type: MENSAGEM_DO_MANIFESTO, manifesto: m });
    }
    return;
  }
  try {
    localStorage.setItem(chaveDoManifesto(m.modelId, m.dtype, m.device), JSON.stringify(m));
  } catch {
    // localStorage cheio ou indisponível — degrada para "não está em cache", que é o lado seguro.
  }
  void pedirArmazenamentoPersistente();
}

/**
 * PEDE AO NAVEGADOR PARA NÃO DESPEJAR OS MODELOS (Fase 4 da prontidão).
 *
 * O Cache Storage é "best-effort" por padrão: sob pressão de disco o navegador apaga a origem
 * inteira sem avisar, e a próxima captura baixa de novo centenas de MB (o Whisper sozinho passa de
 * 100 MB) — no celular, no plano de dados de quem usa. `persist()` troca para "persistent": só o
 * usuário apaga. No Chrome a decisão é por heurística (sem pergunta); no Firefox aparece um pedido
 * de permissão, e por isso a chamada fica AQUI — logo depois de um download completo que a própria
 * pessoa iniciou —, e não no boot do app.
 *
 * `persist()` só existe na JANELA (a spec o expõe só em `Window`); no Worker `gravarManifesto` já
 * saiu antes, pelo `postMessage`. Best-effort: sem API, recusa ou erro, devolve `null`/`false` e
 * nada muda. Pergunta uma vez por carga de página.
 */
let pedidoDePersistencia: Promise<boolean | null> | null = null;
export function pedirArmazenamentoPersistente(): Promise<boolean | null> {
  pedidoDePersistencia ??= (async () => {
    try {
      const armazenamento = (globalThis as { navigator?: { storage?: StorageManager } }).navigator?.storage;
      if (!armazenamento || typeof armazenamento.persist !== 'function') return null;
      if (typeof armazenamento.persisted === 'function' && (await armazenamento.persisted())) return true;
      return await armazenamento.persist();
    } catch {
      return null;
    }
  })();
  return pedidoDePersistencia;
}

/** Só para teste: esquece o pedido feito nesta carga de página. */
export function _esquecerPedidoDePersistencia(): void {
  pedidoDePersistencia = null;
}

export function lerManifesto(modelId: string, dtype: string, device: string): ManifestoDeModelo | null {
  try {
    const cru = localStorage.getItem(chaveDoManifesto(modelId, dtype, device));
    if (!cru) return null;
    const m = JSON.parse(cru) as ManifestoDeModelo;
    if (!m || !Array.isArray(m.arquivos)) return null;
    return m;
  } catch {
    return null;
  }
}

export interface EstadoDoCache {
  completo: boolean;
  motivo?: 'sem-manifesto' | 'incompleto' | 'gravacao-parcial';
  faltando: string[];
  truncados: string[];
  bytesFaltando: number;
  bytesTotais: number;
}

/** Subconjunto do Cache que usamos — declarado para o teste poder injetar um falso. */
interface CacheLike {
  match(req: string | { url: string }): Promise<{ blob(): Promise<{ size: number }> } | undefined>;
}

/**
 * O modelo está REALMENTE completo no cache?
 *
 * Confere pelo tamanho do corpo (`blob().size`), não pelo header `content-length`: uma resposta
 * truncada gravada no cache pode manter o header original e mentir sobre o tamanho.
 */
export async function modeloEstaCompleto(
  cache: CacheLike,
  modelId: string,
  dtype: string,
  device: string,
): Promise<EstadoDoCache> {
  const m = lerManifesto(modelId, dtype, device);
  if (!m) {
    return { completo: false, motivo: 'sem-manifesto', faltando: [], truncados: [], bytesFaltando: 0, bytesTotais: 0 };
  }

  // A gravação no cache pode ter falhado no meio (quota) e o manifesto registrado menos do que o
  // download entregou. Nesse caso o modelo NÃO está completo, por mais que todo arquivo listado
  // esteja presente — o que falta nem chegou a ser listado.
  if (typeof m.bytesEsperados === 'number' && m.bytesTotais < m.bytesEsperados) {
    return {
      completo: false,
      motivo: 'gravacao-parcial',
      faltando: [],
      truncados: [],
      bytesFaltando: m.bytesEsperados - m.bytesTotais,
      bytesTotais: m.bytesEsperados,
    };
  }

  const faltando: string[] = [];
  const truncados: string[] = [];
  let bytesFaltando = 0;

  for (const arq of m.arquivos) {
    let tamanho: number | null = null;
    try {
      const res = await cache.match(arq.url);
      if (res) tamanho = (await res.blob()).size;
    } catch {
      tamanho = null;
    }
    if (tamanho == null) {
      faltando.push(arq.url);
      bytesFaltando += arq.bytes;
    } else if (tamanho !== arq.bytes) {
      truncados.push(arq.url);
      bytesFaltando += Math.max(0, arq.bytes - tamanho);
    }
  }

  const completo = faltando.length === 0 && truncados.length === 0;
  return {
    completo,
    motivo: completo ? undefined : 'incompleto',
    faltando,
    truncados,
    bytesFaltando,
    bytesTotais: m.bytesTotais,
  };
}

/**
 * Existe ALGUM manifesto completo para este modelo (qualquer dtype/device)?
 *
 * É esta a pergunta que a UI faz antes de dizer "Baixando" vs "Carregando (em cache)": existe uma
 * cópia completa e utilizável no navegador? Varre os manifestos do modelo e valida cada um contra
 * o Cache Storage de verdade.
 *
 * Imprecisão residual assumida: se houver cópia completa de um dtype e o app acabar carregando
 * OUTRO, a barra de download aparece depois de a UI ter dito "em cache". É bem menos frequente que
 * o falso-positivo anterior (uma entrada qualquer bastava) e, com o progresso agora por bytes
 * reais, o usuário vê o que está acontecendo em vez de uma afirmação falsa.
 */
export async function modeloDisponivel(modelId: string, nomeDoCache = 'transformers-cache'): Promise<EstadoDoCache> {
  const vazio: EstadoDoCache = {
    completo: false,
    motivo: 'sem-manifesto',
    faltando: [],
    truncados: [],
    bytesFaltando: 0,
    bytesTotais: 0,
  };
  try {
    if (typeof caches === 'undefined') return vazio;
    const chaves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXO) && k.includes(modelId)) chaves.push(k);
    }
    if (!chaves.length) return vazio;

    const cache = await caches.open(nomeDoCache);
    let melhor: EstadoDoCache = vazio;
    for (const k of chaves) {
      const [, dtype, device] = k.slice(PREFIXO.length).split('|');
      const r = await modeloEstaCompleto(cache as never, modelId, dtype, device);
      if (r.completo) return r;
      // Guarda o mais próximo de completo, para a UI poder dizer quanto falta E por quê.
      // (Incluir 'gravacao-parcial' importa: sem isso o motivo virava 'sem-manifesto' e a UI
      // perdia a informação de que o cache existe, só não coube.)
      if (
        (r.motivo === 'incompleto' || r.motivo === 'gravacao-parcial') &&
        (melhor.motivo === 'sem-manifesto' || r.bytesFaltando < melhor.bytesFaltando)
      )
        melhor = r;
    }
    return melhor;
  } catch {
    return vazio;
  }
}

/**
 * Lê do Cache Storage os arquivos que pertencem a este modelo e grava o manifesto.
 * Chamado UMA vez, depois de a carga concluir com sucesso — antes disso não há verdade a gravar.
 */
export async function registrarModeloBaixado(
  modelId: string,
  dtype: string,
  device: string,
  bytesEsperados?: number,
  nomeDoCache = 'transformers-cache',
): Promise<ManifestoDeModelo | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open(nomeDoCache);
    const arquivos: ArquivoDoModelo[] = [];
    for (const req of await cache.keys()) {
      if (!decodeURIComponent(req.url).includes(modelId)) continue;
      const res = await cache.match(req);
      if (!res) continue;
      arquivos.push({ url: req.url, bytes: (await res.blob()).size });
    }
    if (!arquivos.length) return null;
    const m: ManifestoDeModelo = {
      modelId,
      dtype,
      device,
      arquivos,
      bytesTotais: arquivos.reduce((a, b) => a + b.bytes, 0),
      bytesEsperados,
      gravadoEm: Date.now(),
    };
    gravarManifesto(m);
    // A VERSÃO baixada (o commit publicado agora), para "Procurar atualização" ter com o que
    // comparar. Best-effort e fora do caminho: sem rede, o manifesto fica sem ela.
    void consultarRevisao(modelId).then((pub) => {
      if (pub) gravarManifesto({ ...m, revisao: pub.sha });
    });
    return m;
  } catch {
    return null;
  }
}

/** Quando a cópia mais recente deste modelo foi gravada no navegador (o "baixado em" do protótipo). */
export function baixadoEm(modelId: string): number | null {
  let maisNova: number | null = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIXO) || !k.includes(modelId)) continue;
      const m = JSON.parse(localStorage.getItem(k) ?? 'null') as ManifestoDeModelo | null;
      if (m?.gravadoEm && (maisNova === null || m.gravadoEm > maisNova)) maisNova = m.gravadoEm;
    }
  } catch {
    return maisNova;
  }
  return maisNova;
}

/**
 * "Liberar espaço": apaga do Cache Storage os arquivos deste modelo e os manifestos dele. A próxima
 * captura baixa tudo de novo. Devolve quantos bytes saíram.
 */
export async function apagarModelo(modelId: string, nomeDoCache = 'transformers-cache'): Promise<number> {
  let bytes = 0;
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(nomeDoCache);
    for (const req of await cache.keys()) {
      if (!decodeURIComponent(req.url).includes(modelId)) continue;
      const res = await cache.match(req);
      if (res) bytes += (await res.blob()).size;
      await cache.delete(req);
    }
  }
  try {
    const chaves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIXO) && k.includes(modelId)) chaves.push(k);
    }
    chaves.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* sem localStorage: os manifestos já não valiam */
  }
  return bytes;
}
