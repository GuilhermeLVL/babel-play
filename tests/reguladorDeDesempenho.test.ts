/**
 * REGULADOR DE DESEMPENHO — a máquina de estados que faz o harness REAGIR durante o uso.
 *
 * Hoje o RTF e a fila só vão à telemetria: no Pixel 7 e no iPhone 14 o RTF medido foi 1,04–1,53, a
 * fila cresce e a legenda chega com p95 > 8 s, e nada muda (relatório §5). Estes testes prendem as
 * regras do `harness-adaptativo.md` §4: os gatilhos de descida, a ORDEM dos passos, a histerese de
 * 60 s para subir, a pausa com a aba escondida e o veto de modelo em OOM/`device.lost`.
 */
import { describe, expect, it } from 'vitest'

import {
  CONFIG_PADRAO_DO_REGULADOR,
  type ConfigDoRegulador,
  type EntradaDoRegulador,
  escadaDeDescida,
  type EstadoDoRegulador,
  estadoInicialDoRegulador,
  regular,
} from '../src/core/harness/reguladorDeDesempenho'

const ok = (agoraMs: number, extra: Partial<EntradaDoRegulador> = {}): EntradaDoRegulador => ({
  rtf: 0.3,
  filaPendente: 0,
  latenciaMs: 800,
  visivel: true,
  modoSoOuvir: false,
  agoraMs,
  ...extra,
})

/** Passa uma sequência de entradas e devolve o estado final e as ações de cada passo. */
function rodar(entradas: EntradaDoRegulador[], config?: Partial<ConfigDoRegulador>, estado?: EstadoDoRegulador) {
  let e = estado ?? estadoInicialDoRegulador()
  const acoes: string[][] = []
  for (const x of entradas) {
    const r = regular(e, x, config)
    e = r.estado
    acoes.push(r.acoes)
  }
  return { estado: e, acoes }
}

describe('escada de descida — a ordem do §4', () => {
  it('padrão: cortar parciais → modelo menor (×2) → oferecer nativo/nuvem; sem troca de backend', () => {
    expect(escadaDeDescida(CONFIG_PADRAO_DO_REGULADOR)).toEqual([
      'cortar-parciais',
      'modelo-menor',
      'modelo-menor',
      'oferecer-nativo-ou-nuvem',
    ])
  })

  it('troca de backend entra em 2º SÓ quando o microbenchmark diz que o outro é mais rápido', () => {
    const escada = escadaDeDescida({ ...CONFIG_PADRAO_DO_REGULADOR, outroBackendMaisRapido: true, modelosMenores: 1 })
    expect(escada).toEqual(['cortar-parciais', 'trocar-backend', 'modelo-menor', 'oferecer-nativo-ou-nuvem'])
  })

  it('sem modelo menor disponível, pula direto para oferecer nativo/nuvem', () => {
    expect(escadaDeDescida({ ...CONFIG_PADRAO_DO_REGULADOR, modelosMenores: 0 })).toEqual([
      'cortar-parciais',
      'oferecer-nativo-ou-nuvem',
    ])
  })
})

describe('gatilhos de descida', () => {
  it('RTF médio > 0,8 por 3 trechos SEGUIDOS desce um degrau — 2 trechos não bastam', () => {
    const lento = (t: number) => ok(t, { rtf: 1.2 })
    const { acoes, estado } = rodar([lento(0), lento(1000), lento(2000)])
    expect(acoes[0]).toEqual([])
    expect(acoes[1]).toEqual([])
    expect(acoes[2]).toEqual(['cortar-parciais'])
    expect(estado.nivel).toBe(1)
  })

  it('um trecho rápido no meio zera a contagem (a média móvel cai abaixo do limiar)', () => {
    const { acoes } = rodar([
      ok(0, { rtf: 0.9 }),
      ok(1000, { rtf: 0.9 }),
      ok(2000, { rtf: 0.1 }),
      ok(3000, { rtf: 0.9 }),
    ])
    expect(acoes.flat()).toEqual([])
  })

  it('fila > 2 desce na hora', () => {
    const { acoes } = rodar([ok(0, { filaPendente: 3 })])
    expect(acoes[0]).toEqual(['cortar-parciais'])
  })

  it('fila = 2 não desce (o limiar é estrito)', () => {
    expect(rodar([ok(0, { filaPendente: 2 })]).acoes[0]).toEqual([])
  })

  it('latência p90 > 3 s desce — mas só com amostras suficientes', () => {
    const lentas = Array.from({ length: 10 }, (_, i) => ok(i * 1000, { latenciaMs: 4000 }))
    const { acoes } = rodar(lentas)
    expect(acoes.slice(0, 9).flat()).toEqual([])
    expect(acoes[9]).toEqual(['cortar-parciais'])
  })

  it('uma latência alta isolada não puxa o p90 acima de 3 s', () => {
    const entradas = Array.from({ length: 10 }, (_, i) => ok(i * 1000, { latenciaMs: i === 5 ? 9000 : 700 }))
    expect(rodar(entradas).acoes.flat()).toEqual([])
  })

  it.each(['serious', 'critical'] as const)('pressão "%s" desce', (pressao) => {
    expect(rodar([ok(0, { pressao })]).acoes[0]).toEqual(['cortar-parciais'])
  })

  it.each(['nominal', 'fair'] as const)('pressão "%s" não desce', (pressao) => {
    expect(rodar([ok(0, { pressao })]).acoes[0]).toEqual([])
  })

  it('bateria < 20% sem carregador desce; carregando, não', () => {
    expect(rodar([ok(0, { bateria: { nivel: 0.15, carregando: false } })]).acoes[0]).toEqual(['cortar-parciais'])
    expect(rodar([ok(0, { bateria: { nivel: 0.15, carregando: true } })]).acoes[0]).toEqual([])
    expect(rodar([ok(0, { bateria: { nivel: 0.5, carregando: false } })]).acoes[0]).toEqual([])
  })

  it('devolve os motivos para a telemetria', () => {
    const r = regular(estadoInicialDoRegulador(), ok(0, { filaPendente: 5, pressao: 'critical' }))
    expect(r.motivos).toEqual(expect.arrayContaining(['fila', 'pressao']))
  })
})

describe('ordem e ritmo da descida', () => {
  it('percorre a escada na ordem, um degrau por intervalo mínimo, e para no chão', () => {
    const passo = CONFIG_PADRAO_DO_REGULADOR.intervaloEntreDescidasMs
    const entradas = Array.from({ length: 8 }, (_, i) => ok(i * passo, { filaPendente: 5 }))
    const { acoes, estado } = rodar(entradas, { outroBackendMaisRapido: true })
    expect(acoes.flat()).toEqual([
      'cortar-parciais',
      'trocar-backend',
      'modelo-menor',
      'modelo-menor',
      'oferecer-nativo-ou-nuvem',
    ])
    expect(estado.nivel).toBe(5)
  })

  it('não desce dois degraus seguidos dentro do intervalo mínimo', () => {
    const { acoes } = rodar([ok(0, { filaPendente: 5 }), ok(500, { filaPendente: 5 }), ok(1000, { filaPendente: 5 })])
    expect(acoes.flat()).toEqual(['cortar-parciais'])
  })
})

describe('histerese de subida', () => {
  /** Estado já descido 2 degraus em t = 0. */
  function descido(): EstadoDoRegulador {
    const passo = CONFIG_PADRAO_DO_REGULADOR.intervaloEntreDescidasMs
    return rodar([ok(0, { filaPendente: 5 }), ok(passo, { filaPendente: 5 })]).estado
  }

  it('sobe UM degrau só depois de 60 s de folga (RTF < 0,5, sem erro)', () => {
    const e0 = descido()
    const inicio = 100_000
    const { acoes, estado } = rodar(
      [ok(inicio), ok(inicio + 30_000), ok(inicio + 59_999), ok(inicio + 60_000)],
      undefined,
      e0,
    )
    expect(acoes.slice(0, 3).flat()).toEqual([])
    expect(acoes[3]).toEqual(['subir'])
    expect(estado.nivel).toBe(e0.nivel - 1)
  })

  it('o degrau seguinte exige OUTROS 60 s', () => {
    const e0 = descido()
    const t = 100_000
    const { acoes } = rodar([ok(t), ok(t + 60_000), ok(t + 90_000), ok(t + 120_000)], undefined, e0)
    expect(acoes.map((a) => a.join())).toEqual(['', 'subir', '', 'subir'])
  })

  it('um trecho sem folga (RTF ≥ 0,5) reinicia o relógio', () => {
    const e0 = descido()
    const t = 100_000
    const { acoes } = rodar([ok(t), ok(t + 40_000, { rtf: 0.6 }), ok(t + 70_000), ok(t + 100_000)], undefined, e0)
    expect(acoes.flat()).toEqual([])
  })

  it('um erro reinicia o relógio', () => {
    const e0 = descido()
    const t = 100_000
    const { acoes } = rodar([ok(t), ok(t + 30_000, { erro: 'outro' }), ok(t + 61_000)], undefined, e0)
    expect(acoes.flat()).toEqual([])
  })

  it('no nível 0 não há para onde subir', () => {
    const { acoes } = rodar([ok(0), ok(60_000), ok(120_000)])
    expect(acoes.flat()).toEqual([])
  })

  it('a zona entre 0,5 e 0,8 não desce nem sobe (é a histerese)', () => {
    const e0 = descido()
    const entradas = Array.from({ length: 20 }, (_, i) => ok(100_000 + i * 10_000, { rtf: 0.65 }))
    const { acoes, estado } = rodar(entradas, undefined, e0)
    expect(acoes.flat()).toEqual([])
    expect(estado.nivel).toBe(e0.nivel)
  })
})

describe('OOM, device.lost e aba escondida', () => {
  it.each(['oom', 'device-lost'] as const)('%s proíbe o modelo atual', (erro) => {
    const r = regular(estadoInicialDoRegulador(), ok(0, { erro }))
    expect(r.acoes[0]).toBe('proibir-modelo')
    expect(r.motivos).toContain(erro)
  })

  it('erro "outro" não proíbe o modelo', () => {
    expect(regular(estadoInicialDoRegulador(), ok(0, { erro: 'outro' })).acoes).not.toContain('proibir-modelo')
  })

  it('aba escondida sem "só ouvir" pausa — uma vez — e retoma ao voltar', () => {
    const { acoes } = rodar([ok(0, { visivel: false }), ok(1000, { visivel: false }), ok(2000)])
    expect(acoes).toEqual([['pausar'], [], ['retomar']])
  })

  it('escondida, a pausa ignora os gatilhos de descida (não há o que medir)', () => {
    const { acoes, estado } = rodar([ok(0, { visivel: false, filaPendente: 9 })])
    expect(acoes[0]).toEqual(['pausar'])
    expect(estado.nivel).toBe(0)
  })

  it('em modo "só ouvir" a aba escondida NÃO pausa', () => {
    expect(rodar([ok(0, { visivel: false, modoSoOuvir: true })]).acoes[0]).toEqual([])
  })
})

describe('estado', () => {
  it('a média móvel do RTF segue a fórmula EWMA com o alfa da config', () => {
    const { estado } = rodar([ok(0, { rtf: 1 }), ok(1000, { rtf: 0 })], { alfaEwma: 0.25 })
    expect(estado.rtfEwma).toBeCloseTo(0.75)
  })

  it('regular é puro: não muta o estado recebido', () => {
    const e = estadoInicialDoRegulador()
    const copia = structuredClone(e)
    regular(e, ok(0, { filaPendente: 5 }))
    expect(e).toEqual(copia)
  })

  it('a janela de latência não cresce sem limite', () => {
    const entradas = Array.from({ length: 100 }, (_, i) => ok(i * 1000))
    expect(rodar(entradas).estado.latencias.length).toBe(CONFIG_PADRAO_DO_REGULADOR.janelaDeLatencia)
  })
})
