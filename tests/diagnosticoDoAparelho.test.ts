/**
 * DIAGNÓSTICO DO APARELHO (`/diagnostico`) — as partes puras.
 *
 * A página existe para medir NO APARELHO o que a emulação não mede (o Quest, 01/10/2026): o que o
 * navegador entrega, o nível do microfone, se o compartilhamento traz áudio e a velocidade real de
 * cada modelo. Aqui: a leitura dos sinais com APIs ausentes, o nível em dB, a conta dos quadros
 * travados, o fator de tempo real e o resumo que vai para a tela.
 */
import { describe, expect, it } from 'vitest'

import {
  coletarSinaisDoDiagnostico,
  estatisticaDeQuadros,
  fatorDeTempoReal,
  medirModelo,
  MODELOS_DA_CPU,
  nivelDoAudio,
  resumirModelo,
  veredictoDoModelo,
  type WorkerDeTranscricao,
} from '../src/lib/dispositivo/diagnostico'

const UA_QUEST =
  'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/41.0.0.0 Chrome/150.0.0.0 VR Safari/537.36'

describe('coletarSinaisDoDiagnostico', () => {
  it('Quest: lê núcleos, isolamento, compartilhamento de tela, Web Speech, tradutor e a GPU', async () => {
    const s = await coletarSinaisDoDiagnostico({
      escopo: {
        navigator: {
          userAgent: UA_QUEST,
          hardwareConcurrency: 6,
          deviceMemory: 8,
          maxTouchPoints: 0,
          xr: {},
          mediaDevices: { getDisplayMedia: () => undefined, getUserMedia: () => undefined },
          storage: { estimate: async () => ({ quota: 2048 * 1048576, usage: 100 * 1048576 }) },
        },
        crossOriginIsolated: true,
        SharedArrayBuffer: function () {},
        performance: { memory: { jsHeapSizeLimit: 2048 * 1048576, usedJSHeapSize: 50 * 1048576 } },
        speechSynthesis: { getVoices: () => [{ lang: 'en-US' }, { lang: 'pt-BR' }] },
      },
      infoDoAdaptador: async () => ({
        shaderF16: true,
        limites: { maxStorageBufferBindingSize: 268435456, maxBufferSize: 268435456 },
        fornecedor: 'qualcomm',
        arquitetura: 'adreno-700',
      }),
      perfilDoApp: { tipo: 'quest', modoLeve: 'true' },
    })
    expect(s).toMatchObject({
      userAgent: UA_QUEST,
      navegador: { oculus: '41.0.0.0', chrome: '150.0.0.0', modelo: 'Quest 3' },
      nucleos: 6,
      memoriaGb: 8,
      isolado: true,
      sharedArrayBuffer: true,
      compartilharTela: true,
      microfone: true,
      webSpeech: false,
      tradutorNativo: false,
      detectorDeIdioma: false,
      webxr: true,
      heapLimiteMb: 2048,
      cotaMb: 2048,
      vozesDeLeitura: 2,
      webGpu: { fornecedor: 'qualcomm', arquitetura: 'adreno-700', shaderF16: true, maxBufferMb: 256 },
      perfilDoApp: { tipo: 'quest', modoLeve: 'true' },
    })
  })

  it('navegador sem nada (APIs ausentes ou que lançam): não lança, e tudo vira falso ou nulo', async () => {
    const s = await coletarSinaisDoDiagnostico({
      escopo: {
        navigator: {
          userAgent: '',
          storage: {
            estimate: async () => {
              throw new Error('SecurityError')
            },
          },
        },
      },
      infoDoAdaptador: async () => null,
    })
    expect(s).toMatchObject({
      nucleos: null,
      memoriaGb: null,
      isolado: false,
      sharedArrayBuffer: false,
      compartilharTela: false,
      microfone: false,
      webSpeech: false,
      webGpu: null,
      heapLimiteMb: null,
      cotaMb: null,
      vozesDeLeitura: null,
      navegador: { oculus: null, chrome: null, modelo: null },
    })
  })

  it('Web Speech com prefixo e a Translator API contam como presentes', async () => {
    const s = await coletarSinaisDoDiagnostico({
      escopo: {
        navigator: { userAgent: 'x' },
        webkitSpeechRecognition: function () {},
        Translator: {},
        LanguageDetector: {},
      },
      infoDoAdaptador: async () => null,
    })
    expect(s).toMatchObject({ webSpeech: true, tradutorNativo: true, detectorDeIdioma: true })
  })
})

describe('nivelDoAudio', () => {
  it('silêncio digital: -100 dB (piso), sem -Infinity na tela', () => {
    expect(nivelDoAudio(new Float32Array(1600))).toEqual({ rmsDb: -100, picoDb: -100 })
  })

  it('senoide em meia escala: pico −6 dB, RMS −9 dB', () => {
    const x = new Float32Array(16000)
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / 16000)
    const n = nivelDoAudio(x)
    expect(n.picoDb).toBeCloseTo(-6, 0)
    expect(n.rmsDb).toBeCloseTo(-9, 0)
  })

  it('vazio: piso', () => {
    expect(nivelDoAudio(new Float32Array(0))).toEqual({ rmsDb: -100, picoDb: -100 })
  })
})

describe('estatisticaDeQuadros', () => {
  it('conta os quadros, o pior intervalo e os que passaram de 50 ms', () => {
    expect(estatisticaDeQuadros([11, 12, 11, 180, 60, 11])).toEqual({ quadros: 6, piorMs: 180, longos: 2, mediaMs: 48 })
  })

  it('sem quadros (aba escondida): zeros', () => {
    expect(estatisticaDeQuadros([])).toEqual({ quadros: 0, piorMs: 0, longos: 0, mediaMs: 0 })
  })
})

describe('fatorDeTempoReal e veredicto', () => {
  it('11 s de áudio em 2,2 s: 0,2', () => {
    expect(fatorDeTempoReal(2200, 11000)).toBe(0.2)
  })

  it('áudio de duração zero: null (não divide por zero)', () => {
    expect(fatorDeTempoReal(100, 0)).toBeNull()
  })

  it.each([
    [0.2, 'folga'],
    [0.5, 'folga'],
    [0.8, 'justo'],
    [1.0, 'justo'],
    [1.4, 'lento'],
    [null, 'falhou'],
  ] as const)('RTF %s → %s', (rtf, esperado) => {
    expect(veredictoDoModelo(rtf)).toBe(esperado)
  })
})

describe('medirModelo (worker falso)', () => {
  const modelo = MODELOS_DA_CPU[0]
  const pcm = new Float32Array(16000 * 2)
  const semQuadros = () => ({ parar: () => ({ quadros: 0, piorMs: 0, longos: 0, mediaMs: 0 }) })

  /** Um worker que responde `ready` à carga e `result` a cada pedido, e anota o que recebeu. */
  function workerFalso(responder: (m: any, w: WorkerDeTranscricao) => void) {
    const recebidas: any[] = []
    const w: WorkerDeTranscricao & { encerrado: boolean } = {
      onmessage: null,
      onerror: null,
      encerrado: false,
      postMessage(m) {
        recebidas.push(m)
        queueMicrotask(() => responder(m, w))
      },
      terminate() {
        w.encerrado = true
      },
    }
    return { w, recebidas }
  }
  const mensagem = (w: WorkerDeTranscricao, data: unknown) => w.onmessage?.({ data } as MessageEvent)

  it('carrega com as threads pedidas, decodifica duas vezes, fica com a mais rápida e encerra o worker', async () => {
    let relogio = 0
    const tempos = [1000, 400] // 1º decode e 2º decode
    const { w, recebidas } = workerFalso((m, worker) => {
      if (m.type === 'load') {
        relogio += 3000
        mensagem(worker, { type: 'ready' })
      } else if (m.type === 'transcribe') {
        relogio += tempos.shift() ?? 0
        mensagem(worker, { type: 'result', id: m.id, text: 'ask not' })
      }
    })
    const r = await medirModelo(modelo, pcm, { criarWorker: () => w, agora: () => relogio, vigiar: semQuadros })
    expect(recebidas[0]).toMatchObject({ type: 'load', model: modelo.modelo, dtype: 'q8', device: 'wasm', threads: 1 })
    expect(recebidas.filter((m) => m.type === 'transcribe')).toHaveLength(2)
    expect(r).toMatchObject({ cargaMs: 3000, decodeMs: 400, audioMs: 2000, rtf: 0.2, texto: 'ask not', erro: null })
    expect(w.encerrado).toBe(true)
  })

  it('o worker responde erro na carga: a medida falha com a mensagem, sem lançar, e o worker é encerrado', async () => {
    const { w } = workerFalso((m, worker) => {
      if (m.type === 'load') mensagem(worker, { type: 'error', id: null, message: 'device lost' })
    })
    const r = await medirModelo(modelo, pcm, { criarWorker: () => w, vigiar: semQuadros })
    expect(r).toMatchObject({ erro: 'device lost', rtf: null, decodeMs: null })
    expect(w.encerrado).toBe(true)
  })

  it('o worker nunca responde: falha pelo prazo', async () => {
    const { w } = workerFalso(() => {})
    const r = await medirModelo(modelo, pcm, { criarWorker: () => w, prazoMs: 20, vigiar: semQuadros })
    expect(r.erro).toBe('demorou demais')
    expect(w.encerrado).toBe(true)
  })

  it('o worker nem sobe: falha com o motivo', async () => {
    const r = await medirModelo(modelo, pcm, {
      criarWorker: () => {
        throw new Error('CSP')
      },
    })
    expect(r.erro).toBe('CSP')
  })
})

describe('resumirModelo', () => {
  it('uma linha legível: modelo, onde rodou, o tempo, o fator e os quadros travados', () => {
    expect(
      resumirModelo({
        id: 'moonshine-tiny-wasm-1',
        rotulo: 'Moonshine tiny',
        backend: 'wasm',
        threads: 1,
        cargaMs: 3210,
        decodeMs: 1840,
        audioMs: 11000,
        rtf: 0.17,
        quadros: { quadros: 500, piorMs: 80, longos: 3, mediaMs: 12 },
        texto: 'and so my fellow americans',
        erro: null,
      }),
    ).toBe('Moonshine tiny · CPU, 1 thread · 11 s de fala em 1,8 s (fator 0,17) · carga 3,2 s · 3 travadas, pior 80 ms')
  })

  it('falha: diz o erro, sem números inventados', () => {
    expect(
      resumirModelo({
        id: 'whisper-base-webgpu',
        rotulo: 'Whisper base',
        backend: 'webgpu',
        threads: 1,
        cargaMs: null,
        decodeMs: null,
        audioMs: 11000,
        rtf: null,
        quadros: null,
        texto: '',
        erro: 'device lost',
      }),
    ).toBe('Whisper base · placa de vídeo · falhou: device lost')
  })
})
