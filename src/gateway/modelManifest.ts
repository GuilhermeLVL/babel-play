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

const PREFIXO = 'babel.modelManifest.'

export interface ArquivoDoModelo {
  url: string
  bytes: number
}

export interface ManifestoDeModelo {
  modelId: string
  dtype: string
  device: string
  arquivos: ArquivoDoModelo[]
  /** Soma do que REALMENTE ficou no Cache Storage no momento do registro. */
  bytesTotais: number
  /**
   * Bytes que o download entregou, segundo o agregado da lib (`progress_total.total`).
   *
   * Existe porque o manifesto é montado a partir do que está NO CACHE, e sob quota estourada o
   * `cache.put` falha em parte dos arquivos — o manifesto então descrevia o estado parcial como
   * se fosse o total, e a checagem seguinte respondia "completo". Achado pela suíte de mecanismo
   * (cenário 11/quota reduzida). Ausente em manifestos legados, onde a checagem degrada para o
   * comportamento anterior.
   */
  bytesEsperados?: number
  gravadoEm: number
}

export function chaveDoManifesto(modelId: string, dtype: string, device: string): string {
  return `${PREFIXO}${modelId}|${dtype}|${device}`
}

export function gravarManifesto(m: ManifestoDeModelo): void {
  try {
    localStorage.setItem(chaveDoManifesto(m.modelId, m.dtype, m.device), JSON.stringify(m))
  } catch {
    // localStorage cheio ou indisponível — degrada para "não está em cache", que é o lado seguro.
  }
}

export function lerManifesto(modelId: string, dtype: string, device: string): ManifestoDeModelo | null {
  try {
    const cru = localStorage.getItem(chaveDoManifesto(modelId, dtype, device))
    if (!cru) return null
    const m = JSON.parse(cru) as ManifestoDeModelo
    if (!m || !Array.isArray(m.arquivos)) return null
    return m
  } catch {
    return null
  }
}

export function apagarManifesto(modelId: string, dtype: string, device: string): void {
  try { localStorage.removeItem(chaveDoManifesto(modelId, dtype, device)) } catch { /* ignora */ }
}

export interface EstadoDoCache {
  completo: boolean
  motivo?: 'sem-manifesto' | 'incompleto' | 'gravacao-parcial'
  faltando: string[]
  truncados: string[]
  bytesFaltando: number
  bytesTotais: number
}

/** Subconjunto do Cache que usamos — declarado para o teste poder injetar um falso. */
interface CacheLike {
  match(req: string | { url: string }): Promise<{ blob(): Promise<{ size: number }> } | undefined>
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
  const m = lerManifesto(modelId, dtype, device)
  if (!m) {
    return { completo: false, motivo: 'sem-manifesto', faltando: [], truncados: [], bytesFaltando: 0, bytesTotais: 0 }
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
    }
  }

  const faltando: string[] = []
  const truncados: string[] = []
  let bytesFaltando = 0

  for (const arq of m.arquivos) {
    let tamanho: number | null = null
    try {
      const res = await cache.match(arq.url)
      if (res) tamanho = (await res.blob()).size
    } catch {
      tamanho = null
    }
    if (tamanho == null) {
      faltando.push(arq.url)
      bytesFaltando += arq.bytes
    } else if (tamanho !== arq.bytes) {
      truncados.push(arq.url)
      bytesFaltando += Math.max(0, arq.bytes - tamanho)
    }
  }

  const completo = faltando.length === 0 && truncados.length === 0
  return {
    completo,
    motivo: completo ? undefined : 'incompleto',
    faltando,
    truncados,
    bytesFaltando,
    bytesTotais: m.bytesTotais,
  }
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
export async function modeloDisponivel(
  modelId: string,
  nomeDoCache = 'transformers-cache',
): Promise<EstadoDoCache> {
  const vazio: EstadoDoCache = { completo: false, motivo: 'sem-manifesto', faltando: [], truncados: [], bytesFaltando: 0, bytesTotais: 0 }
  try {
    if (typeof caches === 'undefined') return vazio
    const chaves: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIXO) && k.includes(modelId)) chaves.push(k)
    }
    if (!chaves.length) return vazio

    const cache = await caches.open(nomeDoCache)
    let melhor: EstadoDoCache = vazio
    for (const k of chaves) {
      const [, dtype, device] = k.slice(PREFIXO.length).split('|')
      const r = await modeloEstaCompleto(cache as never, modelId, dtype, device)
      if (r.completo) return r
      // Guarda o mais próximo de completo, para a UI poder dizer quanto falta E por quê.
      // (Incluir 'gravacao-parcial' importa: sem isso o motivo virava 'sem-manifesto' e a UI
      // perdia a informação de que o cache existe, só não coube.)
      if ((r.motivo === 'incompleto' || r.motivo === 'gravacao-parcial') &&
          (melhor.motivo === 'sem-manifesto' || r.bytesFaltando < melhor.bytesFaltando)) melhor = r
    }
    return melhor
  } catch {
    return vazio
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
    if (typeof caches === 'undefined') return null
    const cache = await caches.open(nomeDoCache)
    const arquivos: ArquivoDoModelo[] = []
    for (const req of await cache.keys()) {
      if (!decodeURIComponent(req.url).includes(modelId)) continue
      const res = await cache.match(req)
      if (!res) continue
      arquivos.push({ url: req.url, bytes: (await res.blob()).size })
    }
    if (!arquivos.length) return null
    const m: ManifestoDeModelo = {
      modelId,
      dtype,
      device,
      arquivos,
      bytesTotais: arquivos.reduce((a, b) => a + b.bytes, 0),
      bytesEsperados,
      gravadoEm: Date.now(),
    }
    gravarManifesto(m)
    return m
  } catch {
    return null
  }
}
