/**
 * PCM e VAD da prática no aparelho (openspec `sombra-sem-web-speech` 2.2): reamostragem, silêncio sem decodificar,
 * buffers soltos, nenhuma requisição.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { analisarFala, juntarBlocos, reamostrarPara16k, TAXA_DO_MODELO } from '../src/core/fala/pcm'
import { type Captura, ouvirUmaFrase } from '../src/lib/fala/ouvirFraseNoAparelho'

/** Seno de 220 Hz com amplitude `a`, `seg` segundos, na taxa `taxa`. */
function tom(seg: number, taxa: number, a = 0.3): Float32Array {
  const out = new Float32Array(Math.round(seg * taxa))
  for (let i = 0; i < out.length; i++) out[i] = a * Math.sin((2 * Math.PI * 220 * i) / taxa)
  return out
}
const ruido = (seg: number, taxa: number, a = 0.0005) => {
  const out = new Float32Array(Math.round(seg * taxa))
  let x = 12345
  for (let i = 0; i < out.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    out[i] = a * (x / 0x7fffffff - 0.5) * 2
  }
  return out
}

describe('pcm', () => {
  it('reamostra 48 kHz e 44,1 kHz para 16 kHz mantendo a duração', () => {
    expect(reamostrarPara16k(tom(1, 48000), 48000).length).toBe(16000)
    expect(reamostrarPara16k(tom(1, 44100), 44100).length).toBe(16000)
    const mesmo = tom(1, 16000)
    expect(reamostrarPara16k(mesmo, 16000)).toBe(mesmo)
  })

  it('o VAD acha fala no meio do silêncio e apara as bordas com folga', () => {
    const pcm = juntarBlocos([ruido(2, TAXA_DO_MODELO), tom(1.5, TAXA_DO_MODELO), ruido(2, TAXA_DO_MODELO)])
    const a = analisarFala(pcm)
    expect(a.semFala).toBe(false)
    expect(a.duracaoMs).toBeGreaterThan(1500)
    expect(a.duracaoMs).toBeLessThan(2100)
  })

  it('silêncio, ruído de sala e estalo curto são semFala', () => {
    expect(analisarFala(new Float32Array(TAXA_DO_MODELO * 2)).semFala).toBe(true)
    expect(analisarFala(ruido(3, TAXA_DO_MODELO)).semFala).toBe(true)
    expect(
      analisarFala(juntarBlocos([ruido(1, TAXA_DO_MODELO), tom(0.05, TAXA_DO_MODELO), ruido(1, TAXA_DO_MODELO)]))
        .semFala,
    ).toBe(true)
    expect(analisarFala(new Float32Array(10)).semFala).toBe(true)
  })
})

function capturaFalsa(blocos: Float32Array[], taxa = 48000) {
  const encerrar = vi.fn(async () => undefined)
  const capturar = vi.fn(async (aoBloco: (b: Float32Array) => void): Promise<Captura> => {
    blocos.forEach((b) => aoBloco(b))
    return { taxa, encerrar }
  })
  return { capturar, encerrar }
}

afterEach(() => vi.unstubAllGlobals())

describe('ouvirUmaFrase', () => {
  it('com fala: reamostra, apara, decodifica e devolve o texto; solta o microfone', async () => {
    const f = capturaFalsa([ruido(1, 48000), tom(1.2, 48000), ruido(1, 48000)])
    const transcrever = vi.fn(async (_pcm: Float32Array, _lang: string) => 'hello there my friend')
    const fetchEspiao = vi.fn()
    vi.stubGlobal('fetch', fetchEspiao)
    const s = await ouvirUmaFrase({ lang: 'en-US', deps: { capturar: f.capturar, transcrever } })
    const r = await s.parar()
    expect(r.semFala).toBe(false)
    expect(r.texto).toBe('hello there my friend')
    expect(transcrever).toHaveBeenCalledTimes(1)
    const pcm = transcrever.mock.calls[0]![0] as Float32Array
    expect(pcm.length).toBeLessThan(16000 * 2.1) // aparado, em 16 kHz
    expect(f.encerrar).toHaveBeenCalledTimes(1)
    expect(fetchEspiao).not.toHaveBeenCalled()
  })

  it('sem fala: NÃO decodifica', async () => {
    const f = capturaFalsa([ruido(2, 48000)])
    const transcrever = vi.fn(async () => 'Thank you.')
    const s = await ouvirUmaFrase({ lang: 'en', deps: { capturar: f.capturar, transcrever } })
    expect(await s.parar()).toEqual({ texto: '', duracaoMs: 0, semFala: true })
    expect(transcrever).not.toHaveBeenCalled()
  })

  it('cancelar solta o microfone e os buffers: parar depois não decodifica nada', async () => {
    const f = capturaFalsa([tom(2, 48000)])
    const transcrever = vi.fn(async () => 'x')
    const s = await ouvirUmaFrase({ lang: 'en', deps: { capturar: f.capturar, transcrever } })
    s.cancelar()
    s.cancelar()
    expect(f.encerrar).toHaveBeenCalledTimes(1)
    expect((await s.parar()).semFala).toBe(true)
    expect(transcrever).not.toHaveBeenCalled()
  })

  it('a guarda de alucinação derruba a saída inventada', async () => {
    const f = capturaFalsa([tom(1.5, 48000)])
    const s = await ouvirUmaFrase({
      lang: 'en',
      deps: { capturar: f.capturar, transcrever: async () => 'no no no no no' },
    })
    expect((await s.parar()).texto).toBe('')
  })

  it('aoNivel recebe o nível de cada bloco', async () => {
    const f = capturaFalsa([tom(0.1, 48000, 0.1)])
    const niveis: number[] = []
    await ouvirUmaFrase({ lang: 'en', aoNivel: (n) => niveis.push(n), deps: { capturar: f.capturar } })
    expect(niveis).toHaveLength(1)
    expect(niveis[0]).toBeGreaterThan(0)
  })
})
