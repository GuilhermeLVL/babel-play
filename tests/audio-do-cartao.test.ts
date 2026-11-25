// @vitest-environment jsdom
/**
 * O ÁUDIO DO CARTÃO (openspec `cartao-com-audio-do-trecho`, tarefas 2.2 a 2.4): armazém local (teto, expulsão, troca de conta),
 * corte do clipe, ligação fala -> cartão e a ordem de queda de `falaOriginal`. Tudo atrás da flag `cartao_com_audio`.
 */
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  guardarAudioDaFala,
  ligarAnelDoCartao,
  limparAudioDasFalas,
  pcmDaFala,
  temAudioDaFala,
} from '../src/lib/captura/audioDasFalas'
import {
  abrirClipeDoCartao,
  audioDoCartaoAtivo,
  gravarDestinoDoAudio,
  guardarClipeDoCartao,
} from '../src/lib/cartoes/audioDoCartao'
import { criarArmazemDeAudioDoCartao } from '../src/lib/cartoes/audioDoCartao/armazem'
import { acharFalaDaFrase, guardarClipeDaFraseSalva } from '../src/lib/cartoes/audioDoCartao/daFala'
import { FOLGA_MS, MAXIMO_MS, recortarClipe } from '../src/lib/cartoes/audioDoCartao/recorte'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'

const blob = (n: number) => new Blob([new Uint8Array(n).fill(7)], { type: 'audio/ogg' })
const fala = (segundos: number, sr = 16000) => new Float32Array(Math.round(segundos * sr)).fill(0.3)

function ligarFlag(ligada: boolean) {
  definirEstadoDasFlags({ cartao_com_audio: { ligada } } as never)
}

describe('armazém local do áudio do cartão', () => {
  it('grava, abre, troca o clipe do mesmo cartão e apaga', async () => {
    const a = criarArmazemDeAudioDoCartao({ fabrica: new IDBFactory() })
    expect(await a.gravar('c1', { audio: blob(100), durMs: 3000 })).toBe(true)
    expect((await a.abrir('c1'))?.durMs).toBe(3000)
    await a.gravar('c1', { audio: blob(50), durMs: 2000 })
    expect((await a.uso()).clipes).toBe(1)
    expect((await a.abrir('c1'))?.audio.size).toBe(50)
    await a.apagar('c1')
    expect(await a.abrir('c1')).toBeNull()
  })

  it('o teto expulsa o mais antigo (e conta o clipe novo)', async () => {
    let t = 1000
    const a = criarArmazemDeAudioDoCartao({ fabrica: new IDBFactory(), teto: 250, agora: () => t++ })
    await a.gravar('velho', { audio: blob(100), durMs: 1000 })
    await a.gravar('meio', { audio: blob(100), durMs: 1000 })
    await a.gravar('novo', { audio: blob(100), durMs: 1000 })
    expect(await a.abrir('velho')).toBeNull()
    expect(await a.abrir('meio')).not.toBeNull()
    expect(await a.abrir('novo')).not.toBeNull()
    expect((await a.uso()).bytes).toBeLessThanOrEqual(250)
  })

  it('apagarTudo limpa (é o que a troca de conta chama) e clipe grande demais é recusado', async () => {
    const a = criarArmazemDeAudioDoCartao({ fabrica: new IDBFactory() })
    await a.gravar('c1', { audio: blob(10), durMs: 500 })
    await a.apagarTudo()
    expect(await a.uso()).toEqual({ clipes: 0, bytes: 0 })
    expect(await a.gravar('c2', { audio: blob(600 * 1024), durMs: 8000 })).toBe(false)
  })

  it('sem IndexedDB, gravar devolve falso e abrir devolve nulo (sem lançar)', async () => {
    const a = criarArmazemDeAudioDoCartao({ fabrica: null })
    expect(await a.gravar('c1', { audio: blob(10), durMs: 500 })).toBe(false)
    expect(await a.abrir('c1')).toBeNull()
    await a.apagarTudo()
  })
})

describe('recorte do clipe', () => {
  it('fala de 3 s vira clipe de 3,3 s (150 ms de folga de cada lado)', () => {
    const c = recortarClipe(fala(3), 16000)!
    expect(Math.abs(c.durMs - (3000 + 2 * FOLGA_MS))).toBeLessThanOrEqual(50)
    expect(c.pcm[0]).toBe(0)
    expect(c.pcm[Math.round(0.2 * 16000)]).toBeCloseTo(0.3)
  })

  it('não passa de 8 s de fala e descarta fala curta demais', () => {
    const longo = recortarClipe(fala(20), 16000)!
    expect(longo.durMs).toBe(MAXIMO_MS + 2 * FOLGA_MS)
    expect(recortarClipe(fala(0.1), 16000)).toBeNull()
    expect(recortarClipe(new Float32Array(0), 16000)).toBeNull()
  })
})

describe('guarda do clipe atrás da flag', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    localStorage.clear()
    limparAudioDasFalas()
  })
  afterEach(() => {
    definirEstadoDasFlags(null)
    ligarAnelDoCartao(false)
  })

  it('flag desligada: nada é guardado e nada é aberto', async () => {
    ligarFlag(false)
    expect(audioDoCartaoAtivo()).toBe(false)
    expect(await guardarClipeDoCartao('c1', fala(2), 16000)).toBe(false)
    expect(await abrirClipeDoCartao('c1')).toBeNull()
  })

  it('"Não guardar" desliga mesmo com a flag ligada', async () => {
    ligarFlag(true)
    gravarDestinoDoAudio('nao')
    expect(audioDoCartaoAtivo()).toBe(false)
    expect(await guardarClipeDoCartao('c1', fala(2), 16000)).toBe(false)
  })

  it('flag ligada: corta, codifica (WAV sem WebCodecs) e abre', async () => {
    ligarFlag(true)
    expect(await guardarClipeDoCartao('c1', fala(2), 16000)).toBe(true)
    const clipe = await abrirClipeDoCartao('c1')
    expect(clipe?.size).toBeGreaterThan(44)
  })

  it('o anel guarda a fala sem mudar o "Ouvir" (só o Quest o usa) e leva o clipe ao cartão pela frase', async () => {
    ligarFlag(true)
    ligarAnelDoCartao(true)
    guardarAudioDaFala('u1', fala(2), 16000)
    guardarAudioDaFala('u2', fala(2), 16000)
    expect(temAudioDaFala('u1')).toBe(false)
    const segmentos = [
      { id: 'u1', originalText: 'I like apples' },
      { id: 'u2', originalText: 'She went to the market.' },
    ]
    expect(acharFalaDaFrase('she went to the market.', segmentos)).toBe('u2')
    expect(acharFalaDaFrase('outra coisa', segmentos)).toBeNull()
    expect(await guardarClipeDaFraseSalva('c9', 'I like apples', segmentos)).toBe(true)
    expect(await abrirClipeDoCartao('c9')).not.toBeNull()
    expect(await guardarClipeDaFraseSalva('c10', 'frase sem fala', segmentos)).toBe(false)
  })

  it('sem o anel ligado, a fala não é guardada', () => {
    ligarFlag(true)
    guardarAudioDaFala('u1', fala(2), 16000)
    expect(pcmDaFala('u1')).toBeNull()
  })
})
