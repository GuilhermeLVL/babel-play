/**
 * A interface `Sintetizador` da bancada de voz e seus adaptadores. Nenhum conhece GPU nem motor: o
 * servidor de cada candidato só precisa honrar o contrato HTTP (`criarSintetizadorHttp`).
 *
 * Voz clonada é VEDADA no projeto: nenhum adaptador aceita áudio de referência.
 *
 * `CAMPOS_DE_CLONAGEM` mora em `server/ai/provedoresDeVoz.ts` (fonte única) e é um `.ts` com imports sem
 * extensão, então este módulo o carrega por `import()` dinâmico SÓ ao criar o adaptador da DeepInfra, e
 * isso exige o `tsx` (como `scripts/job.mjs`). Os demais adaptadores rodam em `node` puro.
 */
import { duracaoDoWav, emendarWavs, taxaDoWav, wavDeSilencio } from './wav.mjs'

/**
 * @typedef {{ wav: Uint8Array, duracaoS: number, taxaHz: number, tempoDeSinteseS: number, memoriaMB?: number }} ClipeDeAudio
 * `memoriaMB`: memória do servidor após o pedido, quando ele informa (cabeçalho `X-Memoria-MB` do contrato HTTP).
 * @typedef {{ voz: string, idioma: string, velocidade?: number }} OpcoesDeSintese
 * @typedef {{
 *   id: string, versao: string, idiomas: string[], limiteDeCaracteres: number,
 *   vozes(): Promise<{ id: string, idioma: string }[]>,
 *   sintetizar(texto: string, o: OpcoesDeSintese): Promise<ClipeDeAudio>,
 *   fechar?(): Promise<void>,
 * }} Sintetizador
 */

const LIMITE_PADRAO = 400
const PAUSA_PADRAO_S = 0.3

/** @param {Uint8Array} wav @param {number} tempoDeSinteseS @returns {ClipeDeAudio} */
function clipeDe(wav, tempoDeSinteseS) {
  return { wav, duracaoS: duracaoDoWav(wav), taxaHz: taxaDoWav(wav), tempoDeSinteseS }
}

/** Lê a resposta como WAV ou lança com o status (sem eco do corpo, que pode trazer dados do pedido). */
async function wavDaResposta(r, quem) {
  if (!r.ok) throw new Error(`${quem}: HTTP ${r.status}`)
  const tipo = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!tipo.startsWith('audio/') && tipo !== 'application/octet-stream') {
    throw new Error(`${quem}: resposta não é áudio WAV: content-type ${tipo || '(ausente)'}`)
  }
  return new Uint8Array(await r.arrayBuffer())
}

/**
 * Adaptador do contrato HTTP: `POST {url}/sintetizar {texto, voz, idioma}` → `audio/wav` + `X-Tempo-Sintese`;
 * `GET {url}/vozes` → `[{id, idioma}]`.
 * @param {{ id: string, versao: string, url: string, limiteDeCaracteres?: number, tokenEnv?: string, idiomas?: string[] }} cfg
 * @param {{ fetch?: typeof fetch }} [deps]
 * @returns {Sintetizador}
 */
export function criarSintetizadorHttp(cfg, deps = {}) {
  const base = cfg.url.replace(/\/+$/, '')
  const cabecalhos = () => {
    const h = { 'content-type': 'application/json' }
    const token = cfg.tokenEnv ? process.env[cfg.tokenEnv] : undefined
    if (token) h.authorization = `Bearer ${token}`
    return h
  }
  return {
    id: cfg.id,
    versao: cfg.versao,
    idiomas: cfg.idiomas ?? [],
    limiteDeCaracteres: cfg.limiteDeCaracteres ?? LIMITE_PADRAO,
    async vozes() {
      const r = await (deps.fetch ?? fetch)(`${base}/vozes`, { headers: cabecalhos() })
      if (!r.ok) throw new Error(`${cfg.id}: /vozes HTTP ${r.status}`)
      return await r.json()
    },
    async sintetizar(texto, o) {
      const inicio = performance.now()
      const r = await (deps.fetch ?? fetch)(`${base}/sintetizar`, {
        method: 'POST',
        headers: cabecalhos(),
        body: JSON.stringify({ texto, voz: o.voz, idioma: o.idioma, velocidade: o.velocidade }),
      })
      const wav = await wavDaResposta(r, `${cfg.id}: /sintetizar`)
      const medido = (performance.now() - inicio) / 1000
      const cab = Number.parseFloat(r.headers.get('x-tempo-sintese') ?? '')
      const clipe = clipeDe(wav, Number.isFinite(cab) ? cab : medido)
      const memoria = Number.parseFloat(r.headers.get('x-memoria-mb') ?? '')
      if (Number.isFinite(memoria) && memoria >= 0) clipe.memoriaMB = memoria
      return clipe
    },
  }
}

/**
 * Campos de clonagem do projeto, carregados sob demanda (ver o cabeçalho do arquivo).
 * @returns {Promise<readonly string[]>}
 */
async function carregarCamposDeClonagem() {
  const m = await import('../../server/ai/provedoresDeVoz.ts')
  return m.CAMPOS_DE_CLONAGEM
}

/**
 * NÃO VERIFICADO: a URL, o formato do corpo e o formato da resposta abaixo são SUPOSIÇÃO (formato da API de
 * áudio da OpenAI), sem confirmação na documentação da DeepInfra nem numa chamada real. DEVE ser confirmado
 * (docs ou uma chamada barata, Task 11) antes de confiar neste adaptador.
 */
const URL_DEEPINFRA = 'https://api.deepinfra.com/v1/openai/audio/speech'

/**
 * Monta o corpo do pedido à DeepInfra — o ÚNICO lugar a corrigir na Task 11.
 * NÃO VERIFICADO: (1) `extra_body` é construção do SDK Python da OpenAI; na rede provavelmente NÃO é uma
 * chave JSON honrada, então o idioma pode ser ignorado em silêncio; (2) `response_format: 'wav'` pode não
 * ser aceito por todo modelo; (3) supõe-se que a resposta seja o WAV cru (não JSON com base64).
 * @param {{ modelo: string, voz: string }} cfg
 * @param {string} texto
 * @param {OpcoesDeSintese} o
 */
function corpoDaDeepInfra(cfg, texto, o) {
  return {
    model: cfg.modelo,
    input: texto,
    voice: o.voz || cfg.voz,
    response_format: 'wav',
    ...(o.velocidade ? { speed: o.velocidade } : {}),
    extra_body: { language: o.idioma },
  }
}

/**
 * Adaptador da DeepInfra (endpoint compatível com a OpenAI). A chave vem SÓ de `DEEPINFRA_API_KEY`; nunca
 * é lida de arquivo, impressa nem registrada. Pedido com campo de clonagem lança antes de qualquer rede.
 * @param {{ modelo: string, voz: string, idiomas?: string[], limiteDeCaracteres?: number }} cfg
 * @param {{ fetch?: typeof fetch, camposDeClonagem?: readonly string[] }} [deps]
 * @returns {Sintetizador}
 */
export function criarSintetizadorDeepInfra(cfg, deps = {}) {
  let campos = deps.camposDeClonagem
  const conferir = async (objeto) => {
    campos ??= await carregarCamposDeClonagem()
    for (const chave of Object.keys(objeto)) {
      if (campos.includes(chave) || chave === 'reference_audio') {
        throw new Error(`campo de clonagem de voz no pedido: ${chave}`)
      }
    }
  }
  return {
    id: `deepinfra:${cfg.modelo}`,
    versao: cfg.modelo,
    idiomas: cfg.idiomas ?? [],
    limiteDeCaracteres: cfg.limiteDeCaracteres ?? 1000,
    async vozes() {
      return [{ id: cfg.voz, idioma: '*' }]
    },
    async sintetizar(texto, o) {
      await conferir(cfg)
      await conferir(o)
      const chave = process.env.DEEPINFRA_API_KEY
      if (!chave)
        throw new Error('DEEPINFRA_API_KEY ausente: defina a variável de ambiente (nunca em arquivo versionado)')
      const corpo = corpoDaDeepInfra(cfg, texto, o)
      await conferir(corpo)
      const inicio = performance.now()
      const r = await (deps.fetch ?? fetch)(URL_DEEPINFRA, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}` },
        body: JSON.stringify(corpo),
      })
      const wav = await wavDaResposta(r, 'deepinfra')
      return clipeDe(wav, (performance.now() - inicio) / 1000)
    },
  }
}

/**
 * Sintetizador de mentira para testes e para o ensaio da bancada: silêncio de duração determinística
 * (`duracaoPorCaractereS` × caracteres, a 16 kHz).
 * @param {{ duracaoPorCaractereS?: number, limiteDeCaracteres?: number }} [cfg]
 * @returns {Sintetizador}
 */
export function criarSintetizadorFalso(cfg = {}) {
  const porCaractere = cfg.duracaoPorCaractereS ?? 0.06
  return {
    id: 'falso',
    versao: '0',
    idiomas: ['pt', 'en', 'es'],
    limiteDeCaracteres: cfg.limiteDeCaracteres ?? LIMITE_PADRAO,
    async vozes() {
      return [{ id: 'falsa', idioma: '*' }]
    },
    async sintetizar(texto) {
      return clipeDe(wavDeSilencio(texto.length * porCaractere, 16000), 0)
    },
  }
}

/**
 * Corta `texto` em pedaços de no máximo `limite` caracteres: prefere o fim de frase (`. ! ? …`), depois o
 * espaço; só parte uma palavra que sozinha passa do limite.
 * @param {string} texto
 * @param {number} limite
 * @returns {string[]}
 */
function cortar(texto, limite) {
  // A pontuação solta do começo ("...oi") vira o início da primeira frase, não se perde.
  const frases = texto.match(/[.!?…]*[^.!?…]+[.!?…]+["'”’)»]*\s*|[.!?…]+\s*$|[^.!?…]+$/g) ?? [texto]
  const pedacos = []
  let atual = ''
  const fechar = () => {
    if (atual.trim()) pedacos.push(atual.trim())
    atual = ''
  }
  for (const frase of frases) {
    if (frase.trim().length > limite) {
      fechar()
      for (const parte of cortarPorEspaco(frase.trim(), limite)) pedacos.push(parte)
    } else if ((atual + frase).trim().length > limite) {
      fechar()
      atual = frase
    } else {
      atual += frase
    }
  }
  fechar()
  return pedacos
}

/** @param {string} frase @param {number} limite @returns {string[]} */
function cortarPorEspaco(frase, limite) {
  const saida = []
  let atual = ''
  for (const palavra of frase.split(/\s+/)) {
    if (palavra.length > limite) {
      if (atual) saida.push(atual)
      atual = ''
      for (let i = 0; i < palavra.length; i += limite) saida.push(palavra.slice(i, i + limite))
    } else if (atual && atual.length + 1 + palavra.length > limite) {
      saida.push(atual)
      atual = palavra
    } else {
      atual = atual ? `${atual} ${palavra}` : palavra
    }
  }
  if (atual) saida.push(atual)
  return saida
}

/**
 * Sintetiza texto de qualquer tamanho respeitando `limiteDeCaracteres`: corta, sintetiza em ordem e emenda
 * os clipes com `pausaS` (padrão 0,3 s) de silêncio.
 * @param {Sintetizador} s
 * @param {string} texto
 * @param {OpcoesDeSintese & { pausaS?: number }} o
 * @returns {Promise<ClipeDeAudio>}
 */
export async function sintetizarComLimite(s, texto, o) {
  const { pausaS = PAUSA_PADRAO_S, ...opcoes } = o
  if (!Number.isFinite(pausaS) || pausaS < 0) throw new RangeError(`sintetizarComLimite: pausaS inválida (${pausaS})`)
  const pedacos = cortar(texto, s.limiteDeCaracteres)
  if (pedacos.length === 0) throw new Error('sintetizarComLimite: texto vazio')
  const clipes = []
  for (const p of pedacos) clipes.push(await s.sintetizar(p, opcoes))
  const wav = emendarWavs(
    clipes.map((c) => c.wav),
    pausaS,
  )
  const memorias = clipes.map((c) => c.memoriaMB).filter((m) => m !== undefined)
  return {
    wav,
    duracaoS: clipes.reduce((t, c) => t + c.duracaoS, 0) + (clipes.length - 1) * pausaS,
    taxaHz: clipes[0].taxaHz,
    tempoDeSinteseS: clipes.reduce((t, c) => t + c.tempoDeSinteseS, 0),
    ...(memorias.length > 0 ? { memoriaMB: Math.max(...memorias) } : {}),
  }
}
