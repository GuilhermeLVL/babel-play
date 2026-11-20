// @vitest-environment jsdom
/**
 * O REPRODUTOR DE CAPÍTULO (F2): um `<audio>` por capítulo, o destaque seguindo `currentTime` (consulta por quadro,
 * não só `timeupdate`), seek dentro de `canplaythrough` (o WebKit ignora seek antes), velocidade com tom preservado,
 * fim e erro de mídia, capítulo vazio pulado sem `<audio>`, e UM "Ouvir" por aparelho (`BroadcastChannel`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type FraseComTempo, temposDasFrases } from '../src/core/leitura/audiolivro'
import { criarReprodutor } from '../src/lib/leitor/audiolivro/reprodutor'

/** O `<audio>` falso: tempo andado à mão, eventos disparados pelo teste. */
class AudioFalso extends EventTarget {
  src = ''
  preload = ''
  currentTime = 0
  paused = true
  readyState = 0
  playbackRate = 1
  preservesPitch = false
  error: { code: number } | null = null
  tocadas = 0
  buscas: number[] = []
  play = vi.fn(async () => {
    this.paused = false
    this.tocadas++
  })
  pause = vi.fn(() => {
    this.paused = true
  })
  load = vi.fn()
  removeAttribute(nome: string) {
    if (nome === 'src') this.src = ''
  }
  disparar(tipo: string) {
    this.dispatchEvent(new Event(tipo))
  }
}

/** Canal falso entre "abas": cada um entrega aos OUTROS. */
function rede() {
  const canais: CanalFalso[] = []
  class CanalFalso {
    onmessage: ((e: MessageEvent) => void) | null = null
    constructor() {
      canais.push(this)
    }
    postMessage(dados: unknown) {
      for (const c of canais) if (c !== this) c.onmessage?.({ data: dados } as MessageEvent)
    }
    close() {}
  }
  return () => new CanalFalso() as unknown as BroadcastChannel
}

/* clipes [2, 3, 1] s, pausas {frase 0,2; parágrafo 0,4}: {0,2.0} {2.2,5.2} {5.6,6.6} (Task 15). */
const TEMPOS: FraseComTempo[] = temposDasFrases(
  [
    { duracaoS: 2, fimDeParagrafo: false },
    { duracaoS: 3, fimDeParagrafo: true },
    { duracaoS: 1, fimDeParagrafo: false },
  ],
  { frase: 0.2, paragrafo: 0.4 },
)
const MUITOS = Array.from({ length: 8 }, (_, i) => ({ i, t0: i * 2, t1: i * 2 + 1.5 }))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function montar(o: { canal?: () => BroadcastChannel } = {}) {
  const audios: AudioFalso[] = []
  const r = criarReprodutor({
    criarAudio: () => {
      const a = new AudioFalso()
      audios.push(a)
      return a as unknown as HTMLAudioElement
    },
    /* um "quadro" a cada 16 ms no relógio falso */
    agendar: (cb) => {
      const id = setTimeout(cb, 16)
      return () => clearTimeout(id)
    },
    canal: o.canal ? o.canal() : null,
  })
  const frases: number[] = []
  r.aoMudarFrase = (i) => frases.push(i)
  return { r, audios, frases }
}

describe('criarReprodutor', () => {
  it('aoMudarFrase segue frasePorTempo e chega ≤ 300 ms depois de o currentTime cruzar o t0', async () => {
    const { r, audios, frases } = montar()
    await r.carregar('https://cdn/1/01.opus', TEMPOS)
    const tocar = r.tocarDe(0)
    audios[0].readyState = 4
    audios[0].disparar('canplaythrough')
    await tocar
    await vi.advanceTimersByTimeAsync(20)
    expect(frases).toEqual([0])
    /* anda o áudio até logo depois do t0 da frase 1 (2,2 s): sem `timeupdate`, só os quadros */
    audios[0].currentTime = 2.2
    const cruzou = Date.now()
    while (frases.length < 2 && Date.now() - cruzou < 1000) await vi.advanceTimersByTimeAsync(16)
    expect(frases).toEqual([0, 1])
    expect(Date.now() - cruzou).toBeLessThanOrEqual(300)
    /* na pausa entre as frases ainda é a anterior */
    audios[0].currentTime = 5.4
    await vi.advanceTimersByTimeAsync(50)
    expect(frases).toEqual([0, 1])
    audios[0].currentTime = 5.6
    await vi.advanceTimersByTimeAsync(50)
    expect(frases).toEqual([0, 1, 2])
  })

  it('tocarDe(5) busca tempos[5].t0 só depois de canplaythrough', async () => {
    const { r, audios } = montar()
    await r.carregar('https://cdn/1/01.opus', MUITOS)
    const tocar = r.tocarDe(5)
    expect(audios[0].currentTime).toBe(0)
    expect(audios[0].play).not.toHaveBeenCalled()
    audios[0].readyState = 4
    audios[0].disparar('canplaythrough')
    await tocar
    expect(audios[0].currentTime).toBe(10)
    expect(audios[0].play).toHaveBeenCalledTimes(1)
    /* já pronto: o seek é imediato */
    await r.tocarDe(2)
    expect(audios[0].currentTime).toBe(4)
  })

  it('definirVelocidade fica entre 0,5 e 2,5, com preservesPitch', async () => {
    const { r, audios } = montar()
    await r.carregar('u', MUITOS)
    r.definirVelocidade(2.6)
    expect(audios[0].playbackRate).toBe(2.5)
    expect(audios[0].preservesPitch).toBe(true)
    r.definirVelocidade(0.1)
    expect(audios[0].playbackRate).toBe(0.5)
    r.definirVelocidade(1.25)
    expect(audios[0].playbackRate).toBe(1.25)
  })

  it('ended → aoFimDoCapitulo; erro de mídia → aoErro(rede | decodificacao)', async () => {
    const { r, audios } = montar()
    const fim = vi.fn()
    const erro = vi.fn()
    r.aoFimDoCapitulo = fim
    r.aoErro = erro
    await r.carregar('u', MUITOS)
    audios[0].disparar('ended')
    expect(fim).toHaveBeenCalledTimes(1)
    audios[0].error = { code: 2 }
    audios[0].disparar('error')
    audios[0].error = { code: 3 }
    audios[0].disparar('error')
    expect(erro.mock.calls).toEqual([['rede'], ['decodificacao']])
  })

  it('play recusado (autoplay, rede) → aoErro("rede") e tocarDe não lança', async () => {
    const { r, audios } = montar()
    const erro = vi.fn()
    r.aoErro = erro
    await r.carregar('u', MUITOS)
    audios[0].readyState = 4
    audios[0].play.mockRejectedValueOnce(new DOMException('não', 'NotAllowedError'))
    await r.tocarDe(0)
    expect(erro).toHaveBeenCalledWith('rede')
  })

  it('capítulo com tempos [] (0 frases): aoFimDoCapitulo imediato, sem criar <audio>', async () => {
    const { r, audios } = montar()
    const fim = vi.fn()
    r.aoFimDoCapitulo = fim
    await r.carregar('u', [])
    await r.tocarDe(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(fim).toHaveBeenCalledTimes(1)
    expect(audios).toHaveLength(0)
  })

  it('pausar, retomar e parar; destruir solta o arquivo e para os quadros', async () => {
    const { r, audios, frases } = montar()
    await r.carregar('u', MUITOS)
    audios[0].readyState = 4
    await r.tocarDe(0)
    r.pausar()
    expect(audios[0].paused).toBe(true)
    await r.retomar()
    expect(audios[0].paused).toBe(false)
    r.parar()
    expect(audios[0].paused).toBe(true)
    r.destruir()
    expect(audios[0].src).toBe('')
    const antes = frases.length
    audios[0].currentTime = 9
    await vi.advanceTimersByTimeAsync(100)
    expect(frases.length).toBe(antes)
  })

  it('precarregar prepara o próximo capítulo noutro <audio>, sem tocar', async () => {
    const { r, audios } = montar()
    r.precarregar('https://cdn/1/02.opus')
    expect(audios).toHaveLength(1)
    expect(audios[0].src).toBe('https://cdn/1/02.opus')
    expect(audios[0].preload).toBe('auto')
    expect(audios[0].play).not.toHaveBeenCalled()
  })

  it('duas abas: tocar numa anuncia {tocando: true} e a outra pausa', async () => {
    const canal = rede()
    const a = montar({ canal })
    const b = montar({ canal })
    const pausouDeFora = vi.fn()
    a.r.aoPausarDeFora = pausouDeFora
    await a.r.carregar('u', MUITOS)
    await b.r.carregar('u', MUITOS)
    a.audios[0].readyState = 4
    b.audios[0].readyState = 4
    await a.r.tocarDe(0)
    expect(a.audios[0].paused).toBe(false)
    await b.r.tocarDe(0)
    expect(a.audios[0].paused).toBe(true)
    expect(pausouDeFora).toHaveBeenCalledTimes(1)
    expect(b.audios[0].paused).toBe(false)
  })
})
