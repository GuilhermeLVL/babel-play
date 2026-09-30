/**
 * Regressão de A-P0-1 e A-P0-2 (docs/discovery/A-model-download.md).
 *
 * Os dois workers construíam agregadores próprios de progresso. Medido em produção: a barra do
 * Whisper cravava 100% aos 8,75 s e ficava lá por 4 minutos, com 8,48 MB de ~146 MB baixados; a
 * do tradutor oscilava para trás o tempo todo e batia 100% no primeiro arquivo concluído.
 *
 * A causa é que a biblioteca JÁ entrega o agregado correto por bytes (`progress_total`,
 * pré-semeado com o total de TODOS os arquivos antes do primeiro byte — validado na Fase 0 contra
 * `dist/transformers.web.js`), e o código caseiro o descartava (`whisperWorker.ts:89` exigia
 * `info.file`, campo que `progress_total` não tem) ou o confundia com o progresso por-arquivo
 * (`mtWorker.ts:17`).
 *
 * Estes testes fixam o contrato do tradutor de eventos: SÓ `progress_total` e `ready` movem a barra.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  criarRastreadorDeProgresso,
  criarWatchdogDeEstagnacao,
  lerProgresso,
  limitarProgresso,
} from '../src/gateway/adapters/modelProgress'

/** Eventos fiéis ao que @huggingface/transformers 4.2 emite (utils/core.js, utils/hub.js). */
const ev = {
  initiate: (file: string) => ({ status: 'initiate' as const, name: 'repo', file }),
  download: (file: string) => ({ status: 'download' as const, name: 'repo', file }),
  /** `progress` é o percentual DO ARQUIVO — nunca do conjunto. */
  progress: (file: string, loaded: number, total: number) =>
    ({ status: 'progress' as const, name: 'repo', file, loaded, total, progress: (loaded / total) * 100 }),
  /** `progress_total` é o agregado. NÃO tem campo `file` — era isso que o filtro antigo barrava. */
  progressTotal: (loaded: number, total: number) =>
    ({ status: 'progress_total' as const, name: 'repo', loaded, total, progress: (loaded / total) * 100, files: {} }),
  /** `done` é POR ARQUIVO e não carrega `total` (core.js:59-63). */
  done: (file: string) => ({ status: 'done' as const, name: 'repo', file }),
  ready: () => ({ status: 'ready' as const, task: 'asr', model: 'repo' }),
}

describe('lerProgresso — tradutor de eventos da lib', () => {
  it('usa progress_total como fonte única do percentual, por bytes reais', () => {
    const r = lerProgresso(ev.progressTotal(12_000_000, 85_000_000))
    expect(r).not.toBeNull()
    expect(r!.progress).toBeCloseTo(12 / 85, 5)
    expect(r!.loaded).toBe(12_000_000)
    expect(r!.total).toBe(85_000_000)
  })

  it('IGNORA `progress` por-arquivo — era a metade da causa da barra oscilante do tradutor', () => {
    // A lib emite progress(arquivo) e progress_total(conjunto) em sequência. Tratar os dois como
    // a mesma grandeza fazia a barra pular entre duas séries e andar para trás.
    expect(lerProgresso(ev.progress('decoder.onnx', 90, 100))).toBeNull()
  })

  it('IGNORA `done` — é por arquivo e cravava a barra em 100% no primeiro arquivo concluído', () => {
    expect(lerProgresso(ev.done('config.json'))).toBeNull()
  })

  it('IGNORA initiate e download', () => {
    expect(lerProgresso(ev.initiate('x.onnx'))).toBeNull()
    expect(lerProgresso(ev.download('x.onnx'))).toBeNull()
  })

  it('`ready` é o único outro evento que move a barra, e vai a 1', () => {
    const r = lerProgresso(ev.ready())
    expect(r!.progress).toBe(1)
  })

  it('não divide por zero quando o total ainda é 0', () => {
    const r = lerProgresso(ev.progressTotal(0, 0))
    expect(r!.progress).toBe(0)
    expect(Number.isFinite(r!.progress)).toBe(true)
  })

  it('satura em 1 se a lib reportar loaded > total', () => {
    expect(lerProgresso(ev.progressTotal(120, 100))!.progress).toBe(1)
  })
})

describe('criarRastreadorDeProgresso — estado POR CARGA, não global de módulo', () => {
  it('REGRESSÃO A-P0-1: arquivos pequenos terminando primeiro NÃO levam a barra a 100%', () => {
    // Esta é exatamente a sequência que quebrava: config/tokenizer completam enquanto os .onnx
    // (a esmagadora maioria dos bytes) mal começaram. O agregado da lib sabe o total desde o
    // início, então o percentual reflete a realidade.
    const vistos: number[] = []
    const rastrear = criarRastreadorDeProgresso((p) => vistos.push(p.progress))
    const TOTAL = 85_000_000

    rastrear(ev.progress('config.json', 1_508, 1_508))
    rastrear(ev.progressTotal(1_508, TOTAL))
    rastrear(ev.done('config.json'))
    rastrear(ev.progress('tokenizer.json', 2_480_466, 2_480_466))
    rastrear(ev.progressTotal(2_481_974, TOTAL))
    rastrear(ev.done('tokenizer.json'))

    expect(Math.max(...vistos)).toBeLessThan(0.05)
    expect(vistos).not.toContain(1)
  })

  it('REGRESSÃO A-P0-2: a barra nunca anda para trás quando a lib intercala per-arquivo e agregado', () => {
    const vistos: number[] = []
    const rastrear = criarRastreadorDeProgresso((p) => vistos.push(p.progress))
    const TOTAL = 100

    // Sequência real medida: per-arquivo em 46, agregado em 52, per-arquivo em 47, agregado em 53…
    rastrear(ev.progress('decoder.onnx', 46, 100))
    rastrear(ev.progressTotal(52, TOTAL))
    rastrear(ev.progress('decoder.onnx', 47, 100))
    rastrear(ev.progressTotal(53, TOTAL))
    rastrear(ev.progress('decoder.onnx', 48, 100))
    rastrear(ev.progressTotal(54, TOTAL))

    expect(vistos).toEqual([0.52, 0.53, 0.54])
    for (let i = 1; i < vistos.length; i++) expect(vistos[i]).toBeGreaterThanOrEqual(vistos[i - 1])
  })

  it('cada rastreador tem estado próprio — dois modelos não contaminam a barra um do outro', () => {
    // O estado antigo (`fileBytes`/`lastEmitted`) era global de módulo e nunca era resetado, então
    // a segunda carga herdava o 100% da primeira e a barra nascia travada.
    const a: number[] = []
    const b: number[] = []
    const rA = criarRastreadorDeProgresso((p) => a.push(p.progress))
    rA(ev.progressTotal(100, 100))
    rA(ev.ready())

    const rB = criarRastreadorDeProgresso((p) => b.push(p.progress))
    rB(ev.progressTotal(5, 100))

    expect(a[a.length - 1]).toBe(1)
    expect(b).toEqual([0.05]) // nasce em 5%, não herda o 100% de A
  })

  it('expõe bytes para a UI poder dizer "12 MB de 85 MB" em vez de só um percentual', () => {
    let ultimo: { loaded: number; total: number } | null = null
    const rastrear = criarRastreadorDeProgresso((p) => { ultimo = { loaded: p.loaded, total: p.total } })
    rastrear(ev.progressTotal(12_000_000, 85_000_000))
    expect(ultimo).toEqual({ loaded: 12_000_000, total: 85_000_000 })
  })
})

describe('criarWatchdogDeEstagnacao — regressão A-P1-6', () => {
  it('NÃO derruba um download lento porém vivo, por mais que ele demore', async () => {
    // O defeito: prazo ABSOLUTO de 45 s desde o início do load. Medido em produção, disparou 2×
    // (t=52,18 s e t=91,11 s) no meio de um download legítimo de 85 MB, descartando o progresso.
    vi.useFakeTimers()
    let travou = false
    const w = criarWatchdogDeEstagnacao({
      semProgressoMs: 45_000, tickMs: 5_000, aoTravar: () => { travou = true },
    })
    // 5 minutos de download, com bytes chegando a cada 10 s — bem além do antigo prazo absoluto.
    for (let i = 0; i < 30; i++) {
      await vi.advanceTimersByTimeAsync(10_000)
      w.sinalDeVida()
    }
    expect(travou).toBe(false)
    w.cancelar()
    vi.useRealTimers()
  })

  it('derruba quando o progresso REALMENTE para', async () => {
    vi.useFakeTimers()
    let paradoHa = 0
    const w = criarWatchdogDeEstagnacao({
      semProgressoMs: 45_000, tickMs: 5_000, aoTravar: (ms) => { paradoHa = ms },
    })
    await vi.advanceTimersByTimeAsync(20_000)
    w.sinalDeVida()             // último sinal de vida
    await vi.advanceTimersByTimeAsync(44_000)
    expect(paradoHa).toBe(0)    // ainda dentro da janela
    await vi.advanceTimersByTimeAsync(6_000)
    expect(paradoHa).toBeGreaterThanOrEqual(45_000)
    vi.useRealTimers()
  })

  it('cancelar impede disparo posterior', async () => {
    vi.useFakeTimers()
    let travou = false
    const w = criarWatchdogDeEstagnacao({ semProgressoMs: 1_000, tickMs: 100, aoTravar: () => { travou = true } })
    w.cancelar()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(travou).toBe(false)
    vi.useRealTimers()
  })
})

/**
 * A TEMPESTADE DE PROGRESSO ("Grátis sem travar", A1). A lib chama o `progress_callback` a CADA chunk
 * do stream — inclusive quando o arquivo vem do cache (`transformers.web.js`, `readResponse`) —, e cada
 * chamada virava um `postMessage` e um `setModelPrep` na thread principal: milhares de renders para
 * abrir um modelo que já estava no aparelho. O limitador deixa passar só o que muda a barra de forma
 * visível, SEM calar o sinal de vida de que o watchdog de estagnação depende.
 */
describe('limitarProgresso — a barra não afoga a thread principal', () => {
  const p = (progress: number, loaded = progress * 1000, total = 1000) => ({ progress, loaded, total })

  it('5000 eventos de cache (todos no mesmo instante) viram no máximo ~100 emissões, e o 100% sai', () => {
    vi.useFakeTimers()
    try {
      const vistos: number[] = []
      const rastrear = criarRastreadorDeProgresso((x) => vistos.push(x.progress))
      const TOTAL = 85_000_000
      for (let i = 1; i <= 5000; i++) rastrear(ev.progressTotal(Math.round((TOTAL * i) / 5000), TOTAL))
      rastrear(ev.ready())
      expect(vistos.length).toBeLessThanOrEqual(110)
      expect(vistos.length).toBeGreaterThan(50) // a barra ANDA: um passo por ~1%
      expect(vistos.at(-1)).toBe(1) // o `ready` nunca é segurado
      for (let i = 1; i < vistos.length; i++) expect(vistos[i]).toBeGreaterThanOrEqual(vistos[i - 1])
    } finally {
      vi.useRealTimers()
    }
  })

  it('avanço de 1% sai na hora; abaixo disso, só depois de 200 ms', () => {
    vi.useFakeTimers()
    try {
      const vistos: number[] = []
      const limitar = limitarProgresso((x) => vistos.push(x.progress), { intervaloMs: 200, passoMinimo: 0.01 })
      limitar(p(0.1)) // a primeira sempre sai: a barra nasce
      limitar(p(0.101))
      limitar(p(0.105))
      expect(vistos).toEqual([0.1])
      limitar(p(0.11)) // +1% desde a última emitida
      expect(vistos).toEqual([0.1, 0.11])
      vi.advanceTimersByTime(199)
      limitar(p(0.111))
      expect(vistos).toHaveLength(2)
      vi.advanceTimersByTime(1)
      limitar(p(0.112)) // 200 ms e houve avanço: sai
      expect(vistos).toEqual([0.1, 0.11, 0.112])
      limitar(p(1)) // 100% sai sempre
      expect(vistos.at(-1)).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('download lento porém vivo: o watchdog segue recebendo sinal de vida e NÃO dispara', async () => {
    vi.useFakeTimers()
    try {
      let travou = false
      let emissoes = 0
      const w = criarWatchdogDeEstagnacao({ semProgressoMs: 1_000, tickMs: 100, aoTravar: () => (travou = true) })
      const rastrear = criarRastreadorDeProgresso(() => {
        emissoes++
        w.sinalDeVida()
      })
      const TOTAL = 146_000_000
      // 10 s de chunks de 16 KB a cada 50 ms: cada um move a barra ~0,01% (nunca 1% de uma vez).
      for (let i = 1; i <= 200; i++) {
        await vi.advanceTimersByTimeAsync(50)
        rastrear(ev.progressTotal(i * 16_384, TOTAL))
      }
      expect(travou).toBe(false)
      expect(emissoes).toBeLessThanOrEqual(10 * 5 + 1) // no máximo 5/s
      expect(emissoes).toBeGreaterThanOrEqual(10 * 4) // e não cala: ~1 a cada 200 ms
      w.cancelar()
    } finally {
      vi.useRealTimers()
    }
  })

  it('download PARADO não emite nada (nem repetindo o mesmo número) — e o watchdog dispara', async () => {
    vi.useFakeTimers()
    try {
      let travou = false
      let emissoes = 0
      const w = criarWatchdogDeEstagnacao({ semProgressoMs: 1_000, tickMs: 100, aoTravar: () => (travou = true) })
      const rastrear = criarRastreadorDeProgresso(() => {
        emissoes++
        w.sinalDeVida()
      })
      rastrear(ev.progressTotal(1_000, 100_000))
      expect(emissoes).toBe(1)
      // Nenhum byte novo por 2 s, mesmo com eventos repetidos chegando: não é sinal de vida.
      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(100)
        rastrear(ev.progressTotal(1_000, 100_000))
      }
      expect(emissoes).toBe(1)
      expect(travou).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
