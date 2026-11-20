/**
 * O WORKER DO KITTEN (OPFS, rede, hash e runtime falsos): baixa só os arquivos do idioma, confere o sha256, carrega
 * (o WebGPU lento cai para o WASM) e sintetiza com o fonetizador do app e o estilo da voz.
 */
import { describe, expect, it } from 'vitest'

import { arquivosDoIdioma, bytesDe } from '../src/core/voz/kitten'
import {
  criarWorkerDoKitten,
  type MensagemDoKitten,
  nomeNoDiscoDoKitten,
} from '../src/gateway/adapters/kittenLocal.worker'
import type { ArquivoDaPasta, PastaDaVoz, SessaoDaVoz } from '../src/gateway/adapters/pesosNoAparelho'

function pastaFalsa() {
  const arquivos = new Map<string, Uint8Array>()
  const marcas = new Map<string, string>()
  const pasta: PastaDaVoz & { marcas: typeof marcas; arquivos: typeof arquivos } = {
    arquivos,
    marcas,
    async abrir(nome): Promise<ArquivoDaPasta> {
      let b = arquivos.get(nome) ?? new Uint8Array(0)
      return {
        tamanho: () => b.length,
        escrever(d, em) {
          const n = new Uint8Array(Math.max(b.length, em + d.length))
          n.set(b)
          n.set(d, em)
          b = n
          arquivos.set(nome, b)
        },
        ler: () => b.slice(),
        truncar(n) {
          b = b.slice(0, n)
          arquivos.set(nome, b)
        },
        fechar() {},
      }
    },
    marca: async (n) => marcas.get(n) ?? null,
    marcar: async (n, s) => void marcas.set(n, s),
    apagarTudo: async () => {
      arquivos.clear()
      marcas.clear()
    },
  }
  return pasta
}

/** O "conteúdo" de cada arquivo é o tamanho certo, cheio de um byte; o hash falso devolve o sha da lista pelo tamanho. */
const lista = arquivosDoIdioma('pico', 'pt')
const hashPorTamanho = async (b: Uint8Array) => lista.find((a) => a.bytes === b.length)?.sha256 ?? 'errado'

describe('criarWorkerDoKitten: download', () => {
  it('baixa só os arquivos do idioma, na URL <raiz>/<variante>/<caminho>, e marca cada um conferido', async () => {
    const pasta = pastaFalsa()
    const urls: string[] = []
    const msgs: MensagemDoKitten[] = []
    const w = criarWorkerDoKitten({
      buscar: async (url) => {
        urls.push(url)
        const a = lista.find((x) => url.endsWith(`/pico/${x.caminho}`))!
        return new Response(new Uint8Array(a.bytes).fill(1))
      },
      abrirPasta: async () => pasta,
      abrirRuntime: async () => {
        throw new Error('sem runtime')
      },
      temWebGpu: async () => false,
      sha256: hashPorTamanho,
      enviar: (m) => msgs.push(m),
    })
    await w.receber({ tipo: 'baixar', id: 1, raiz: 'https://m.x/kitten-tts-2', variante: 'pico', idioma: 'pt' })
    expect(msgs.at(-1)).toEqual({ tipo: 'ok', id: 1 })
    expect(urls).toHaveLength(lista.length)
    expect(urls).toContain('https://m.x/kitten-tts-2/pico/kitten_tts_2_pico_pt.onnx')
    expect(urls.some((u) => u.includes('_es.onnx'))).toBe(false)
    for (const a of lista) expect(pasta.marcas.get(nomeNoDiscoDoKitten('pico', a))).toBe(a.sha256)
    const progresso = msgs.filter((m) => m.tipo === 'progresso').at(-1) as { recebidos: number; total: number }
    expect(progresso.recebidos).toBe(bytesDe(lista))
  })

  it('sha256 errado: erro e nada marcado', async () => {
    const pasta = pastaFalsa()
    const msgs: MensagemDoKitten[] = []
    const w = criarWorkerDoKitten({
      buscar: async (url) => new Response(new Uint8Array(lista.find((x) => url.endsWith(x.caminho))!.bytes)),
      abrirPasta: async () => pasta,
      abrirRuntime: async () => {
        throw new Error('x')
      },
      temWebGpu: async () => false,
      sha256: async () => 'f'.repeat(64),
      enviar: (m) => msgs.push(m),
    })
    await w.receber({ tipo: 'baixar', id: 2, raiz: 'https://m.x', variante: 'pico', idioma: 'pt' })
    expect(msgs.at(-1)).toMatchObject({ tipo: 'erro', id: 2 })
    expect(pasta.marcas.size).toBe(0)
  })
})

/** Um npz mínimo com uma voz "juliana" [4, 256]. */
function npzJuliana(): Uint8Array {
  let cab = "{'descr': '<f4', 'fortran_order': False, 'shape': (4, 256), }"
  while ((10 + cab.length + 1) % 64) cab += ' '
  cab += '\n'
  const n = 4 * 256
  const npy = new Uint8Array(10 + cab.length + n * 4)
  npy.set([0x93, ...new TextEncoder().encode('NUMPY'), 1, 0])
  new DataView(npy.buffer).setUint16(8, cab.length, true)
  npy.set(new TextEncoder().encode(cab), 10)
  const nome = new TextEncoder().encode('juliana.npy')
  const local = new Uint8Array(30 + nome.length)
  const dv = new DataView(local.buffer)
  dv.setUint32(0, 0x04034b50, true)
  dv.setUint32(18, npy.length, true)
  dv.setUint16(26, nome.length, true)
  local.set(nome, 30)
  const out = new Uint8Array(local.length + npy.length)
  out.set(local)
  out.set(npy, local.length)
  return out
}

describe('criarWorkerDoKitten: carregar e sintetizar', () => {
  function montar(o: { rtfWebGpu: number }) {
    const pasta = pastaFalsa()
    const conteudo = new Map<string, Uint8Array>([
      ['vocab.json', new TextEncoder().encode(JSON.stringify({ ' ': 16, '.': 4, a: 43, l: 54, o: 57, ˈ: 156, ɔ: 76 }))],
      ['voices_pt.npz', npzJuliana()],
      ['kitten_tts_2_pico_pt.onnx', new Uint8Array([1, 2, 3])],
    ])
    for (const a of lista) {
      const nome = nomeNoDiscoDoKitten('pico', a)
      pasta.arquivos.set(nome, conteudo.get(a.caminho) ?? new Uint8Array(0))
      pasta.marcas.set(nome, a.sha256)
    }
    let relogio = 0
    const execucoes: Array<{ ep: string; ids: number }> = []
    const msgs: MensagemDoKitten[] = []
    const sessao = (ep: 'webgpu' | 'wasm'): SessaoDaVoz => ({
      outputNames: ['waveform', 'duration'],
      async run(e) {
        const ids = (e.input_ids as { dims: number[] }).dims[1]
        execucoes.push({ ep, ids })
        /* 1 s de áudio por chamada; o relógio anda conforme o RTF do backend */
        relogio += ep === 'webgpu' ? o.rtfWebGpu * 1000 : 100
        return {
          waveform: { data: new Float32Array(24_000).fill(0.5), dims: [24_000] },
          duration: { data: Array.from({ length: ids }, () => 1), dims: [ids] },
        }
      },
      release: async () => undefined,
    })
    const w = criarWorkerDoKitten({
      buscar: async () => new Response(null, { status: 500 }),
      abrirPasta: async () => pasta,
      abrirRuntime: async () => ({
        criarSessao: async (_b, ep) => sessao(ep),
        tensor: (_t, dados, dims) => ({ data: dados, dims }),
      }),
      temWebGpu: async () => true,
      sha256: async () => '',
      enviar: (m) => msgs.push(m),
      agora: () => relogio,
    })
    return { w, msgs, execucoes }
  }

  it('WebGPU em tempo real fica; o lento (por software) cai para o WASM', async () => {
    const rapido = montar({ rtfWebGpu: 0.05 })
    await rapido.w.receber({ tipo: 'carregar', id: 1, variante: 'pico', idioma: 'pt', threads: 4, webgpu: true })
    expect(rapido.msgs.at(-1)).toEqual({ tipo: 'ok', id: 1, backend: 'webgpu' })

    const lento = montar({ rtfWebGpu: 17 })
    await lento.w.receber({ tipo: 'carregar', id: 1, variante: 'pico', idioma: 'pt', threads: 4, webgpu: true })
    expect(lento.msgs.at(-1)).toEqual({ tipo: 'ok', id: 1, backend: 'wasm' })
  })

  it('sintetiza: PCM a 24 kHz, ids do fonetizador do app', async () => {
    const { w, msgs, execucoes } = montar({ rtfWebGpu: 0.05 })
    await w.receber({ tipo: 'carregar', id: 1, variante: 'pico', idioma: 'pt', threads: 1, webgpu: false })
    await w.receber({
      tipo: 'sintetizar',
      id: 2,
      variante: 'pico',
      texto: 'Olá.',
      idioma: 'pt-BR',
      voz: 'Juliana',
      velocidade: 1,
    })
    const ok = msgs.at(-1) as Extract<MensagemDoKitten, { tipo: 'ok' }>
    expect(ok.tipo).toBe('ok')
    expect(ok.taxa).toBe(24_000)
    expect(ok.pcm!.length).toBeGreaterThan(20_000)
    expect(ok.backend).toBe('wasm')
    expect(execucoes.at(-1)!.ids).toBeGreaterThan(3)
  })

  it('sem carregar: erro, não silêncio', async () => {
    const { w, msgs } = montar({ rtfWebGpu: 0.05 })
    await w.receber({ tipo: 'sintetizar', id: 9, variante: 'pico', texto: 'Olá', idioma: 'pt', voz: '', velocidade: 1 })
    expect(msgs.at(-1)).toMatchObject({ tipo: 'erro', id: 9 })
  })
})
