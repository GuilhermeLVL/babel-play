// @vitest-environment jsdom
/**
 * O PiP DE VÍDEO (o caminho do Safari): canvas → `captureStream` → `<video>.requestPictureInPicture()`.
 * jsdom não tem canvas nem PiP: os dois são simulados, e o que se prova é o contrato:
 *  - o vídeo fica pronto ANTES do clique (no Safari, esperar depois perde o gesto);
 *  - só redesenha quando o quadro muda (nada de laço);
 *  - play/pausa da Media Session (Chrome) e o `pause`/`play` do próprio vídeo (Safari) pausam a legenda;
 *  - "próxima" salva a frase; sair do PiP solta os tratadores e avisa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { criarLegendaEmVideo, desenharQuadro, type QuadroDaLegenda } from '../src/lib/legendas/legendaEmVideo'

const textos: string[] = []
let pinturas = 0
const ctxFalso = {
  fillRect: () => void pinturas++,
  fillText: (s: string) => void textos.push(s),
  measureText: (s: string) => ({ width: s.length * 20 }),
  set fillStyle(_v: string) {},
  set font(_v: string) {},
  set textAlign(_v: string) {},
  set textBaseline(_v: string) {},
  set globalAlpha(_v: number) {},
}
const trilha = { stop: vi.fn() }
const tratadores = new Map<string, (() => void) | null>()

beforeEach(() => {
  textos.length = 0
  pinturas = 0
  tratadores.clear()
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxFalso) as never
  ;(HTMLCanvasElement.prototype as unknown as { captureStream: () => unknown }).captureStream = vi.fn(() => ({
    getTracks: () => [trilha],
  }))
  HTMLMediaElement.prototype.play = vi.fn(async () => {})
  HTMLMediaElement.prototype.pause = vi.fn()
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 1 })
  ;(
    HTMLVideoElement.prototype as unknown as { requestPictureInPicture: () => Promise<unknown> }
  ).requestPictureInPicture = vi.fn(async function (this: HTMLVideoElement) {
    Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, value: this })
    return {}
  })
  ;(document as unknown as { exitPictureInPicture: () => Promise<void> }).exitPictureInPicture = vi.fn(async () => {
    const v = (document as unknown as { pictureInPictureElement: HTMLVideoElement }).pictureInPictureElement
    v?.dispatchEvent(new Event('leavepictureinpicture'))
  })
  Object.defineProperty(navigator, 'mediaSession', {
    configurable: true,
    value: { setActionHandler: (a: string, f: (() => void) | null) => tratadores.set(a, f), playbackState: 'none' },
  })
})
afterEach(() => {
  document.querySelectorAll('video').forEach((v) => v.remove())
})

const quadro = (extra: Partial<QuadroDaLegenda> = {}): QuadroDaLegenda => ({
  falas: [{ original: 'Hello there, friend.', traducao: 'Olá, amigo.' }],
  formato: 'legenda',
  fundo: 'escuro',
  mostrar: 'ambos',
  escala: 1,
  pausado: false,
  textos: { vazio: 'Esperando a primeira fala', pausada: 'Pausada' },
  ...extra,
})

describe('o quadro desenhado', () => {
  it('original e tradução; só o original; só a tradução; e o selo "Pausada"', () => {
    desenharQuadro(ctxFalso as never, quadro())
    expect(textos).toEqual(['Hello there, friend.', 'Olá, amigo.'])
    textos.length = 0
    desenharQuadro(ctxFalso as never, quadro({ mostrar: 'original' }))
    expect(textos).toEqual(['Hello there, friend.'])
    textos.length = 0
    desenharQuadro(ctxFalso as never, quadro({ mostrar: 'traducao', pausado: true }))
    expect(textos).toEqual(['Olá, amigo.', '❚❚ Pausada'])
  })
  it('sem fala, o aviso de espera; na conversa, quem falou', () => {
    desenharQuadro(ctxFalso as never, quadro({ falas: [] }))
    expect(textos).toEqual(['Esperando a primeira fala'])
    textos.length = 0
    desenharQuadro(ctxFalso as never, quadro({ formato: 'conversa', falas: [{ original: 'Hi.', quem: 'Você' }] }))
    expect(textos).toEqual(['VOCÊ', 'Hi.'])
  })
})

describe('o controlador', () => {
  it('prepara o vídeo antes do clique; abre no gesto; redesenha só quando muda; pausa e salva', async () => {
    const leg = criarLegendaEmVideo()
    leg.preparar()
    const video = document.querySelector('video[data-legenda-em-video]') as HTMLVideoElement
    expect(video).toBeTruthy()
    expect(video.muted).toBe(true)
    expect(video.srcObject).toBeTruthy()

    const aoPausar = vi.fn()
    const aoSalvar = vi.fn()
    const aoSair = vi.fn()
    await leg.abrir({ aoPausar, aoSalvar, aoSair })
    expect(HTMLVideoElement.prototype.requestPictureInPicture).toHaveBeenCalledTimes(1)
    expect(leg.aberta()).toBe(true)

    pinturas = 0
    leg.desenhar(quadro())
    leg.desenhar(quadro())
    leg.desenhar(quadro())
    expect(pinturas, 'o mesmo quadro não é pintado de novo').toBe(1)
    leg.desenhar(quadro({ falas: [{ original: 'New line.' }] }))
    expect(pinturas).toBe(2)

    /* Chrome: a Media Session. */
    expect([...tratadores.keys()].sort()).toEqual(['nexttrack', 'pause', 'play'])
    tratadores.get('pause')!()
    expect(aoPausar).toHaveBeenLastCalledWith(true)
    tratadores.get('play')!()
    expect(aoPausar).toHaveBeenLastCalledWith(false)
    tratadores.get('nexttrack')!()
    expect(aoSalvar).toHaveBeenCalledTimes(1)

    /* Safari: o botão da janelinha pausa o próprio vídeo. */
    video.dispatchEvent(new Event('pause'))
    expect(aoPausar).toHaveBeenLastCalledWith(true)
    video.dispatchEvent(new Event('play'))
    expect(aoPausar).toHaveBeenLastCalledWith(false)

    /* Sair do PiP: avisa e solta os tratadores. */
    video.dispatchEvent(new Event('leavepictureinpicture'))
    expect(aoSair).toHaveBeenCalledTimes(1)
    expect(leg.aberta()).toBe(false)
    expect(tratadores.get('pause')).toBeNull()
    expect(tratadores.get('nexttrack')).toBeNull()

    /* Destruir para as trilhas e tira o vídeo do documento. */
    leg.destruir()
    expect(trilha.stop).toHaveBeenCalled()
    expect(document.querySelector('video[data-legenda-em-video]')).toBeNull()
  })

  it('o navegador recusou o PiP: o erro sobe (quem chamou cai no painel)', async () => {
    ;(
      HTMLVideoElement.prototype as unknown as { requestPictureInPicture: () => Promise<unknown> }
    ).requestPictureInPicture = vi.fn(async () => {
      throw new DOMException('no', 'NotAllowedError')
    })
    const leg = criarLegendaEmVideo()
    await expect(leg.abrir({ aoPausar: vi.fn(), aoSalvar: vi.fn(), aoSair: vi.fn() })).rejects.toThrow()
    expect(leg.aberta()).toBe(false)
    leg.destruir()
  })
})
