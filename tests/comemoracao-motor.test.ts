// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import {
  EFEITOS_PADRAO,
  type EventoDeComemoracao,
  FINALIZACOES,
  intensidadeDe,
  planoDeComemoracao,
} from '../src/lib/comemoracao'

/**
 * O MOTOR ÚNICO DE COMEMORAÇÃO (recompensas v2, onda 1).
 *
 * O plano é PURO: dado o evento e o contexto (modo leve, som desligado, efeitos equipados), diz o
 * que vai tocar, o que vai explodir, quanto vibra e que número sobe. `celebrar` só executa. É por
 * isso que dá para travar aqui as regras que separam retorno de caça-níquel: intensidade
 * proporcional ao feito, e modo leve sem partícula nem tremor.
 */

const CTX = { leve: false, semSom: false, efeitos: EFEITOS_PADRAO }

describe('intensidade proporcional', () => {
  it('uma estrela é discreta e não solta rajada nenhuma', () => {
    const ev: EventoDeComemoracao = { tipo: 'rodada', estrelas: 1, jogo: 'memory' }
    expect(intensidadeDe(ev)).toBe('discreta')
    expect(planoDeComemoracao(ev, CTX).rajadas).toEqual([])
  })

  it('zero estrela também não festeja', () => {
    const ev: EventoDeComemoracao = { tipo: 'rodada', estrelas: 0, jogo: 'memory' }
    expect(intensidadeDe(ev)).toBe('discreta')
    expect(planoDeComemoracao(ev, CTX).rajadas).toEqual([])
  })

  it('três estrelas é máxima e solta a finalização equipada, na forma dela', () => {
    const ev: EventoDeComemoracao = { tipo: 'rodada', estrelas: 3, jogo: 'termo' }
    expect(intensidadeDe(ev)).toBe('maxima')
    const plano = planoDeComemoracao(ev, CTX)
    const fin = FINALIZACOES[EFEITOS_PADRAO.finalizacao]
    expect(plano.rajadas).toContainEqual(expect.objectContaining({ kind: fin.kind, forma: fin.forma }))
    expect(plano.tremor).toBeGreaterThan(0)
  })

  it('duas estrelas ficam no meio: confete no ponto, sem a chuva da finalização', () => {
    const ev: EventoDeComemoracao = { tipo: 'rodada', estrelas: 2, jogo: 'karuta' }
    expect(intensidadeDe(ev)).toBe('media')
    const plano = planoDeComemoracao(ev, CTX)
    expect(plano.rajadas.length).toBeGreaterThan(0)
    expect(plano.rajadas.map((r) => r.kind)).not.toContain(FINALIZACOES[EFEITOS_PADRAO.finalizacao].kind)
  })

  it('o acerto é o mais contido de todos', () => {
    expect(intensidadeDe({ tipo: 'acerto', combo: 0 })).toBe('discreta')
    expect(intensidadeDe({ tipo: 'nivel' })).not.toBe('discreta')
  })
})

describe('acerto', () => {
  it('o tom sobe um semitom por acerto seguido', () => {
    for (let combo = 0; combo <= 6; combo++) {
      const plano = planoDeComemoracao({ tipo: 'acerto', combo }, CTX)
      expect(plano.sons[0]).toEqual({ evento: 'success', transpose: Math.min(combo, 12) })
    }
  })

  it('o tom para de subir no teto de uma oitava', () => {
    expect(planoDeComemoracao({ tipo: 'acerto', combo: 40 }, CTX).sons[0].transpose).toBe(12)
  })

  it('com pontos, o número que sobe é "+N"; sem pontos, nenhum', () => {
    expect(planoDeComemoracao({ tipo: 'acerto', combo: 1, pontos: 15 }, CTX).flutuante).toBe('+15')
    expect(planoDeComemoracao({ tipo: 'acerto', combo: 1 }, CTX).flutuante).toBeNull()
    // Acerto que não mudou o placar (peça do meio da palavra) não inventa "+0".
    expect(planoDeComemoracao({ tipo: 'acerto', combo: 1, pontos: 0 }, CTX).flutuante).toBeNull()
  })

  it('uma rajada só, e uma vibração só', () => {
    const plano = planoDeComemoracao({ tipo: 'acerto', combo: 2 }, CTX)
    expect(plano.rajadas).toHaveLength(1)
    expect(plano.vibracao).not.toBeNull()
  })
})

describe('erro', () => {
  it('vibra no padrão de aviso e não mostra número', () => {
    const plano = planoDeComemoracao({ tipo: 'erro' }, CTX)
    expect(plano.vibracao).toEqual([40, 30, 40])
    expect(plano.flutuante).toBeNull()
    expect(plano.sons[0].evento).toBe('error')
  })
})

describe('combo', () => {
  it('mostra o multiplicador e toca o som de combo', () => {
    const plano = planoDeComemoracao({ tipo: 'combo', multiplicador: 3 }, CTX)
    expect(plano.flutuante).toBe('×3')
    expect(plano.sons[0].evento).toBe('combo')
  })
})

describe('modo leve e som desligado', () => {
  const eventos: EventoDeComemoracao[] = [
    { tipo: 'acerto', combo: 5, pontos: 20 },
    { tipo: 'erro' },
    { tipo: 'combo', multiplicador: 4 },
    { tipo: 'recorde' },
    { tipo: 'rodada', estrelas: 3, jogo: 'blitz' },
    { tipo: 'maestria', jogo: 'taboo', nivel: 5 },
    { tipo: 'conquista' },
    { tipo: 'bau', raridade: 'raro' },
    { tipo: 'nivel' },
  ]

  it('leve: sem rajada, sem tremor, sem vibração — o som continua', () => {
    for (const ev of eventos) {
      const normal = planoDeComemoracao(ev, CTX)
      const leve = planoDeComemoracao(ev, { ...CTX, leve: true })
      expect(leve.rajadas, ev.tipo).toEqual([])
      expect(leve.tremor, ev.tipo).toBe(0)
      expect(leve.vibracao, ev.tipo).toBeNull()
      expect(leve.sons, ev.tipo).toEqual(normal.sons)
    }
  })

  it('som desligado: nenhum som', () => {
    for (const ev of eventos) expect(planoDeComemoracao(ev, { ...CTX, semSom: true }).sons, ev.tipo).toEqual([])
  })
})

describe('celebrar lê o aparelho', () => {
  it('com reduzirEfeitos ligado, não pede rajada nenhuma; o som toca', async () => {
    const efeitos = await import('../src/lib/effects')
    const som = await import('../src/lib/soundFx')
    const perfil = await import('../src/lib/dispositivo/perfil')
    const { celebrar } = await import('../src/lib/comemoracao')
    const rajadas = vi.spyOn(efeitos, 'emitBurst')
    const toque = vi.spyOn(som, 'play').mockImplementation(() => {})
    vi.spyOn(perfil, 'reduzirEfeitos').mockReturnValue(true)
    celebrar({ tipo: 'rodada', estrelas: 3, jogo: 'memory' })
    celebrar({ tipo: 'acerto', combo: 4, pontos: 12 })
    expect(rajadas).not.toHaveBeenCalled()
    expect(toque).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('sem modo leve, a rodada perfeita pede a finalização', async () => {
    const efeitos = await import('../src/lib/effects')
    const som = await import('../src/lib/soundFx')
    const perfil = await import('../src/lib/dispositivo/perfil')
    const { celebrar } = await import('../src/lib/comemoracao')
    const rajadas = vi.spyOn(efeitos, 'emitBurst')
    vi.spyOn(som, 'play').mockImplementation(() => {})
    vi.spyOn(perfil, 'reduzirEfeitos').mockReturnValue(false)
    celebrar({ tipo: 'rodada', estrelas: 3, jogo: 'memory' })
    expect(rajadas.mock.calls.map((c) => c[2])).toContain(FINALIZACOES[EFEITOS_PADRAO.finalizacao].kind)
    vi.restoreAllMocks()
  })
})
