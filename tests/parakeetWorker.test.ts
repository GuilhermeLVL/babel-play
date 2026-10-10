/**
 * PROTOCOLO DO WORKER DO PARAKEET — com o runtime SIMULADO (a prova com o onnxruntime-web de verdade
 * é no navegador, pelo caminho do app). O que estes testes prendem:
 *   - a carga busca os quatro arquivos, confere TAMANHO e sha256 de cada um, abre as três sessões e
 *     aquece antes do `ready`; a barra anda por bytes;
 *   - o motivo da falha é o que a janela precisa: rede, integridade, motor;
 *   - só vai ao Cache Storage o que passou no hash, e a cópia corrompida volta da rede;
 *   - trecho sem fala (silêncio digital, crédito de legenda) NÃO vira texto;
 *   - trecho maior que a janela do encoder é dividido, não recusado;
 *   - cancelar para o laço e responde `cancelado`.
 */
import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import type { PlanoDeCargaDoParakeet } from '../src/gateway/adapters/parakeetArquivos'
import {
  type CacheDoParakeet,
  criarWorkerDoParakeet,
  type MensagemDoParakeet,
  type RuntimeDoParakeet,
  type SessaoDoParakeet,
  type TensorDoParakeet,
} from '../src/gateway/adapters/parakeetWorker'
import type { ManifestoDeModelo } from '../src/gateway/modelManifest'

const hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const bytesDe = (n: number, k: number) => new Uint8Array(Array.from({ length: n }, (_, i) => (i * k) % 251))

/* Vocabulário de teste: os ids 1..4 formam "Olá, mundo." e o 5 é um crédito de legenda. */
const VOCAB = ['<unk> 0', '▁Olá 1', ', 2', '▁mundo 3', '. 4', '▁Legendas▁pela▁comunidade▁Amara.org 5', '<blk> 6'].join(
  '\n',
)
const N_VOCAB = 7
const BRANCO = 6

const CONTEUDO = {
  vocab: new TextEncoder().encode(VOCAB),
  pre: bytesDe(700, 7),
  decoder: bytesDe(900, 13),
  encoder: bytesDe(5000, 3),
}
type Papel = keyof typeof CONTEUDO
const BASE = 'https://pesos.exemplo/istupakov/parakeet-tdt-0.6b-v3-onnx/abc/'

function plano(sobre: Partial<Record<Papel, { sha256?: string; bytes?: number }>> = {}): PlanoDeCargaDoParakeet {
  const arquivos = (['vocab', 'pre', 'decoder', 'encoder'] as const).map((papel) => ({
    papel,
    url: `${BASE}${papel}`,
    bytes: sobre[papel]?.bytes ?? CONTEUDO[papel].length,
    sha256: sobre[papel]?.sha256 ?? hex(CONTEUDO[papel]),
  }))
  return {
    modelId: 'parakeet-tdt-0.6b-v3',
    revisao: 'abc+def',
    arquivos,
    bytesTotais: arquivos.reduce((s, a) => s + a.bytes, 0),
  }
}

const papelDaUrl = (url: string) => url.slice(BASE.length) as Papel

/**
 * Runtime simulado. Cada sessão se reconhece pelos bytes que recebeu. O encoder devolve um quadro por
 * segundo de áudio, numerado `100 × execução + quadro` (para o roteiro saber em que pedaço está); o
 * joint emite `roteiro(quadro)` uma vez e depois o branco, que avança.
 */
function runtimeFalso(
  opcoes: { roteiro?: (quadro: number) => number; encoderQuebra?: boolean; preQuebra?: boolean } = {},
) {
  const registro = {
    sessoes: [] as Papel[],
    encoder: [] as number[], // amostras de cada execução do encoder
    joint: 0,
    threads: 0,
  }
  const roteiro = opcoes.roteiro ?? ((q: number) => [1, 2, 3, 4][q % 100] ?? BRANCO)
  const rt: RuntimeDoParakeet = {
    async criarSessao(bytes) {
      const papel = (Object.keys(CONTEUDO) as Papel[]).find((p) => hex(CONTEUDO[p]) === hex(bytes))
      if (!papel) throw new Error('bytes desconhecidos')
      if (papel === 'encoder' && opcoes.encoderQuebra) throw new Error('std::bad_alloc')
      registro.sessoes.push(papel)
      const sessao: SessaoDoParakeet = {
        async run(entradas): Promise<Record<string, TensorDoParakeet>> {
          if (papel === 'pre') {
            if (opcoes.preQuebra) throw new Error('Cast(13) sem implementação')
            const onda = entradas.waveforms as { data: Float32Array }
            return {
              features: { data: onda.data, dims: [1, 128, 1] },
              features_lens: { data: [BigInt(onda.data.length)], dims: [1] },
            }
          }
          if (papel === 'encoder') {
            const sinal = entradas.audio_signal as { data: Float32Array }
            const execucao = registro.encoder.length
            registro.encoder.push(sinal.data.length)
            const quadros = Math.max(1, Math.ceil(sinal.data.length / 16000))
            const dim = 2
            const dados = new Float32Array(dim * quadros)
            for (let t = 0; t < quadros; t++) dados[t] = 100 * execucao + t
            return {
              outputs: { data: dados, dims: [1, dim, quadros] },
              encoded_lengths: { data: [BigInt(quadros)], dims: [1] },
            }
          }
          registro.joint++
          const quadro = (entradas.encoder_outputs as { data: Float32Array }).data[0]
          const anterior = (entradas.targets as { data: Int32Array }).data[0]
          // Um token por quadro: se o quadro já emitiu o dele, agora é branco e avança.
          const token = roteiro(quadro)
          const jaEmitiu = anterior === token && token !== BRANCO
          const saida = new Float32Array(N_VOCAB + 2).fill(-10)
          saida[jaEmitiu ? BRANCO : token] = 5
          saida[N_VOCAB + (jaEmitiu || token === BRANCO ? 1 : 0)] = 5
          return {
            outputs: { data: saida, dims: [1, 1, 1, N_VOCAB + 2] },
            output_states_1: { data: new Float32Array(1), dims: [2, 1, 640] },
            output_states_2: { data: new Float32Array(1), dims: [2, 1, 640] },
          }
        },
      }
      return sessao
    },
    tensor: (_tipo, dados, dims) => ({ data: dados, dims }),
  }
  return { rt, registro }
}

function cacheFalso(inicial: Record<string, Uint8Array> = {}) {
  const guardado = new Map<string, Uint8Array>(Object.entries(inicial))
  const cache: CacheDoParakeet = {
    match: async (url) => (guardado.has(url) ? new Response(guardado.get(url) as BodyInit) : undefined),
    put: async (url, r) => void guardado.set(url, new Uint8Array(await r.arrayBuffer())),
    delete: async (url) => guardado.delete(url),
  }
  return { cache, guardado }
}

function montar(
  opcoes: {
    rede?: (url: string) => Response | Promise<Response>
    cache?: CacheDoParakeet | null
    runtime?: ReturnType<typeof runtimeFalso>
    runtimeNaoAbre?: boolean
  } = {},
) {
  const enviadas: MensagemDoParakeet[] = []
  const manifestos: ManifestoDeModelo[] = []
  const runtime = opcoes.runtime ?? runtimeFalso()
  const buscar = vi.fn(async (url: string) =>
    opcoes.rede ? opcoes.rede(url) : new Response(CONTEUDO[papelDaUrl(url)] as BodyInit),
  )
  const worker = criarWorkerDoParakeet({
    buscar,
    abrirCache: async () => (opcoes.cache === undefined ? cacheFalso().cache : opcoes.cache),
    abrirRuntime: async (threads) => {
      if (opcoes.runtimeNaoAbre) throw new Error('WebAssembly indisponível')
      runtime.registro.threads = threads
      return runtime.rt
    },
    enviar: (m) => enviadas.push(m),
    registrarManifesto: (m) => manifestos.push(m),
    agora: () => 0,
  })
  const tipos = () => enviadas.map((m) => m.type).filter((t) => t !== 'progress')
  const ultima = <T extends MensagemDoParakeet['type']>(tipo: T) =>
    enviadas.filter((m) => m.type === tipo).at(-1) as Extract<MensagemDoParakeet, { type: T }> | undefined
  return { worker, enviadas, manifestos, buscar, registro: runtime.registro, tipos, ultima }
}

const fala = (segundos: number) => new Float32Array(Math.round(segundos * 16000)).fill(0.1)

describe('carga', () => {
  it('busca os quatro arquivos, abre as sessões na ordem do plano, aquece e só então responde `ready`', async () => {
    const m = montar()
    await m.worker.receber({ type: 'carregar', plano: plano(), threads: 4 })
    expect(m.buscar.mock.calls.map((c) => papelDaUrl(c[0] as string))).toEqual(['vocab', 'pre', 'decoder', 'encoder'])
    expect(m.registro.sessoes).toEqual(['pre', 'decoder', 'encoder'])
    expect(m.registro.threads).toBe(4)
    // O aquecimento passou pelo encoder (1 s de silêncio) ANTES do `ready`.
    expect(m.registro.encoder).toEqual([16000])
    expect(m.tipos()).toEqual(['ready'])
    expect(m.ultima('ready')!.model).toBe('parakeet-tdt-0.6b-v3')
  })

  it('a barra anda por BYTES do conjunto e termina em 100%', async () => {
    const m = montar()
    await m.worker.receber({ type: 'carregar', plano: plano() })
    const progresso = m.enviadas.filter((x) => x.type === 'progress') as Extract<
      MensagemDoParakeet,
      { type: 'progress' }
    >[]
    expect(progresso.length).toBeGreaterThan(0)
    expect(progresso.every((p) => p.total === plano().bytesTotais)).toBe(true)
    const valores = progresso.map((p) => p.progress)
    expect([...valores].sort((a, b) => a - b)).toEqual(valores) // nunca anda para trás
    expect(valores.at(-1)).toBe(1)
  })

  it('grava o manifesto com os quatro arquivos, o dtype int8/wasm e a revisão fixada', async () => {
    const { cache, guardado } = cacheFalso()
    const m = montar({ cache })
    await m.worker.receber({ type: 'carregar', plano: plano() })
    expect(m.manifestos).toHaveLength(1)
    expect(m.manifestos[0]).toMatchObject({
      modelId: 'parakeet-tdt-0.6b-v3',
      dtype: 'int8',
      device: 'wasm',
      bytesTotais: plano().bytesTotais,
      bytesEsperados: plano().bytesTotais,
      revisao: 'abc+def',
    })
    expect(m.manifestos[0].arquivos.map((a) => a.url).sort()).toEqual([...guardado.keys()].sort())
    expect(guardado.get(`${BASE}encoder`)).toEqual(CONTEUDO.encoder)
  })

  it('segunda carga: tudo do cache, nada da rede', async () => {
    const { cache } = cacheFalso()
    await montar({ cache }).worker.receber({ type: 'carregar', plano: plano() })
    const m = montar({ cache })
    await m.worker.receber({ type: 'carregar', plano: plano() })
    expect(m.buscar).not.toHaveBeenCalled()
    expect(m.tipos()).toEqual(['ready'])
  })

  it('sha256 que não confere: `integridade`, e o arquivo NÃO vai ao cache', async () => {
    const { cache, guardado } = cacheFalso()
    const m = montar({ cache })
    await m.worker.receber({ type: 'carregar', plano: plano({ encoder: { sha256: 'f'.repeat(64) } }) })
    expect(m.ultima('loadError')).toMatchObject({ motivo: 'integridade' })
    expect(m.ultima('loadError')!.message).toMatch(/encoder: sha256 não confere/)
    expect(guardado.has(`${BASE}encoder`)).toBe(false)
    expect(m.registro.sessoes).not.toContain('encoder')
    expect(m.manifestos).toHaveLength(0)
  })

  it('arquivo de outro tamanho (truncado ou trocado): `integridade`, sem precisar do hash', async () => {
    for (const bytes of [CONTEUDO.decoder.length + 1, CONTEUDO.decoder.length - 1]) {
      const m = montar()
      await m.worker.receber({ type: 'carregar', plano: plano({ decoder: { bytes } }) })
      expect(m.ultima('loadError'), String(bytes)).toMatchObject({ motivo: 'integridade' })
      expect(m.ultima('loadError')!.message).toMatch(/decoder: tamanho diferente/)
    }
  })

  it('cópia corrompida no cache: sai, e o arquivo volta da rede', async () => {
    const { cache, guardado } = cacheFalso({ [`${BASE}pre`]: bytesDe(700, 11) })
    const m = montar({ cache })
    await m.worker.receber({ type: 'carregar', plano: plano() })
    expect(m.tipos()).toEqual(['ready'])
    expect(m.buscar.mock.calls.map((c) => papelDaUrl(c[0] as string))).toContain('pre')
    expect(guardado.get(`${BASE}pre`)).toEqual(CONTEUDO.pre)
  })

  it('rede que cai ou responde erro: `rede`', async () => {
    const semRede = montar({
      rede: () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await semRede.worker.receber({ type: 'carregar', plano: plano() })
    expect(semRede.ultima('loadError')).toMatchObject({ motivo: 'rede' })
    const http404 = montar({ rede: () => new Response('não achei', { status: 404 }) })
    await http404.worker.receber({ type: 'carregar', plano: plano() })
    expect(http404.ultima('loadError')).toMatchObject({ motivo: 'rede' })
    expect(http404.ultima('loadError')!.message).toMatch(/HTTP 404/)
  })

  it('runtime, sessão ou aquecimento que quebra: `motor`', async () => {
    const semRuntime = montar({ runtimeNaoAbre: true })
    await semRuntime.worker.receber({ type: 'carregar', plano: plano() })
    expect(semRuntime.ultima('loadError')).toMatchObject({ motivo: 'motor' })

    const semMemoria = montar({ runtime: runtimeFalso({ encoderQuebra: true }) })
    await semMemoria.worker.receber({ type: 'carregar', plano: plano() })
    expect(semMemoria.ultima('loadError')).toMatchObject({ motivo: 'motor' })
    expect(semMemoria.ultima('loadError')!.message).toMatch(/encoder não abriu: std::bad_alloc/)

    const semOperador = montar({ runtime: runtimeFalso({ preQuebra: true }) })
    await semOperador.worker.receber({ type: 'carregar', plano: plano() })
    expect(semOperador.ultima('loadError')).toMatchObject({ motivo: 'motor' })
    expect(semOperador.ultima('loadError')!.message).toMatch(/aquecimento falhou/)
  })

  it('sem Cache Storage (modo privado): carrega da rede e não grava manifesto', async () => {
    const m = montar({ cache: null })
    await m.worker.receber({ type: 'carregar', plano: plano() })
    expect(m.tipos()).toEqual(['ready'])
    expect(m.manifestos).toHaveLength(0)
  })

  it('depois de uma falha, mandar carregar de novo tenta de novo (retry de verdade)', async () => {
    let falhar = true
    const m = montar({
      rede: (url) => (falhar ? new Response('', { status: 503 }) : new Response(CONTEUDO[papelDaUrl(url)] as BodyInit)),
    })
    await m.worker.receber({ type: 'carregar', plano: plano() })
    expect(m.tipos()).toEqual(['loadError'])
    falhar = false
    await m.worker.receber({ type: 'carregar', plano: plano() })
    expect(m.tipos()).toEqual(['loadError', 'ready'])
  })
})

describe('transcrever', () => {
  async function carregado(opcoes: Parameters<typeof montar>[0] = {}) {
    const m = montar(opcoes)
    await m.worker.receber({ type: 'carregar', plano: plano() })
    m.registro.encoder.length = 0
    m.registro.joint = 0
    return m
  }

  it('um trecho de fala: extrator → encoder → laço TDT → texto', async () => {
    const m = await carregado()
    await m.worker.receber({ type: 'transcrever', id: 'a', pcm: fala(4), idioma: 'pt' })
    expect(m.ultima('result')).toMatchObject({ id: 'a', text: 'Olá, mundo.', descartado: false, audioS: 4 })
    expect(m.registro.encoder).toEqual([4 * 16000])
  })

  it('sem modelo carregado: erro, não texto', async () => {
    const m = montar()
    await m.worker.receber({ type: 'transcrever', id: 'a', pcm: fala(2), idioma: 'pt' })
    expect(m.ultima('error')).toMatchObject({ id: 'a', message: 'Parakeet não carregado' })
  })

  it('silêncio digital não roda o modelo e devolve texto vazio', async () => {
    const m = await carregado()
    await m.worker.receber({ type: 'transcrever', id: 's', pcm: new Float32Array(3 * 16000), idioma: 'pt' })
    expect(m.ultima('result')).toMatchObject({ id: 's', text: '', descartado: false })
    expect(m.registro.encoder).toEqual([])
    expect(m.registro.joint).toBe(0)
  })

  it('trecho curto demais para ter palavra (< 100 ms) também não roda', async () => {
    const m = await carregado()
    await m.worker.receber({ type: 'transcrever', id: 'c', pcm: fala(0.05), idioma: 'pt' })
    expect(m.ultima('result')).toMatchObject({ text: '' })
    expect(m.registro.encoder).toEqual([])
  })

  it('o que o modelo inventa sobre ruído passa pelo filtro de alucinação de produção', async () => {
    const m = await carregado({ runtime: runtimeFalso({ roteiro: (q) => (q % 100 === 0 ? 5 : BRANCO) }) })
    await m.worker.receber({ type: 'transcrever', id: 'r', pcm: fala(5), idioma: 'pt' })
    // "Legendas pela comunidade Amara.org": o texto existe, o filtro o esvazia, e a telemetria conta.
    expect(m.ultima('result')).toMatchObject({ id: 'r', text: '', descartado: true })
  })

  it('trecho de 70 s: dividido em janelas de até 30 s e os textos juntados, nada recusado', async () => {
    // Um token por pedaço, na ordem: "Olá" no 1º, "mundo" no 2º, "." no 3º.
    const umPorPedaco = (q: number) => (q % 100 === 0 ? ([1, 3, 4][Math.floor(q / 100)] ?? BRANCO) : BRANCO)
    const m = await carregado({ runtime: runtimeFalso({ roteiro: umPorPedaco }) })
    await m.worker.receber({ type: 'transcrever', id: 'l', pcm: fala(70), idioma: 'pt' })
    expect(m.registro.encoder).toHaveLength(3)
    for (const amostras of m.registro.encoder) expect(amostras).toBeLessThanOrEqual(30 * 16000)
    expect(m.registro.encoder.reduce((a, b) => a + b, 0)).toBe(70 * 16000)
    expect(m.ultima('result')!.text).toBe('Olá mundo .')
    expect(m.ultima('result')!.audioS).toBe(70)
  })

  it('erro no meio do decode vira `error` com o id, e o worker segue vivo', async () => {
    const rt = runtimeFalso()
    const m = await carregado({ runtime: rt })
    const original = rt.rt.tensor
    rt.rt.tensor = () => {
      throw new Error('falta de memória')
    }
    await m.worker.receber({ type: 'transcrever', id: 'x', pcm: fala(2), idioma: 'pt' })
    expect(m.ultima('error')).toMatchObject({ id: 'x', message: 'falta de memória' })
    rt.rt.tensor = original
    await m.worker.receber({ type: 'transcrever', id: 'y', pcm: fala(4), idioma: 'pt' })
    expect(m.ultima('result')).toMatchObject({ id: 'y', text: 'Olá, mundo.' })
  })

  it('cancelar um pedido que espera na fila: sai sem rodar e responde `cancelado`', async () => {
    const m = await carregado()
    const primeiro = m.worker.receber({ type: 'transcrever', id: 'p1', pcm: fala(4), idioma: 'pt' })
    const segundo = m.worker.receber({ type: 'transcrever', id: 'p2', pcm: fala(4), idioma: 'pt' })
    await m.worker.receber({ type: 'cancelar', id: 'p2' })
    await Promise.all([primeiro, segundo])
    expect(m.ultima('cancelado')).toMatchObject({ id: 'p2' })
    expect(m.enviadas.filter((x) => x.type === 'result').map((x) => (x as { id: string }).id)).toEqual(['p1'])
    expect(m.registro.encoder).toEqual([4 * 16000])
  })

  it('cancelar o pedido em voo: o laço para e a resposta é `cancelado`, não um texto pela metade', async () => {
    const m = await carregado()
    const emVoo = m.worker.receber({ type: 'transcrever', id: 'v', pcm: fala(20), idioma: 'pt' })
    await m.worker.receber({ type: 'cancelar', id: 'v' })
    await emVoo
    expect(m.ultima('cancelado')).toMatchObject({ id: 'v' })
    expect(m.ultima('result')).toBeUndefined()
  })

  it('finais em rajada saem na ordem em que chegaram (fila serial)', async () => {
    const m = await carregado()
    await Promise.all(
      ['a', 'b', 'c'].map((id) => m.worker.receber({ type: 'transcrever', id, pcm: fala(2), idioma: 'es' })),
    )
    expect(m.enviadas.filter((x) => x.type === 'result').map((x) => (x as { id: string }).id)).toEqual(['a', 'b', 'c'])
  })
})
