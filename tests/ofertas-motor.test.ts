/**
 * O MOTOR DE OFERTAS (Fase 8) — cada regra, sozinha. Puro: sem DOM, sem storage, sem relógio.
 */
import { describe, expect, it } from 'vitest'

import type { PlanoDaFlag } from '../src/core/flags'
import { type ConfigDeOfertas, type GatilhoDeOferta, GATILHOS_FUNCIONAIS } from '../src/core/ofertas'
import {
  comDispensa,
  comExibicao,
  comNaoMostrar,
  decidirOferta,
  type EntradaDoMotor,
  HISTORICO_VAZIO,
  INICIO_SEM_OFERTA_MS,
  INTERVALO_GLOBAL_MS,
  normalizarHistorico,
  planoSugerido,
} from '../src/lib/ofertas/motor'

const H = 60 * 60_000
const DIA = 24 * H
const AGORA = 1_800_000_000_000

const gatilho = (p: Partial<GatilhoDeOferta> = {}): GatilhoDeOferta => ({
  id: 'premium',
  momento: 'modelo_premium',
  componente: 'comparacao',
  titulo: 'A nuvem inteira está no Premium',
  texto: 'Compare',
  cta: 'Comparar planos',
  maxPorDia: 2,
  maxPorSemana: 5,
  intervaloMinHoras: 2,
  planos: ['free'],
  ...p,
})

const config = (...gatilhos: GatilhoDeOferta[]): ConfigDeOfertas => ({ gatilhos })

const entrada = (p: Partial<EntradaDoMotor> = {}): EntradaDoMotor => ({
  momento: 'modelo_premium',
  flagLigada: true,
  config: config(gatilho()),
  plano: 'free',
  historico: { ...HISTORICO_VAZIO },
  sessao: { inicio: AGORA - 10 * 60_000, promocionais: 0 },
  tela: { capturaAtiva: false, jogoAtivo: false, dialogoAberto: false },
  agora: AGORA,
  ...p,
})

describe('flag', () => {
  it('ligada: a oferta promocional aparece com o componente do gatilho', () => {
    const d = decidirOferta(entrada())
    expect(d).toMatchObject({ mostrar: true, componente: 'comparacao', planoSugerido: 'premium', variante: 'padrao' })
  })

  it('desligada: promocional NÃO aparece, mesmo com payload em cache', () => {
    expect(decidirOferta(entrada({ flagLigada: false }))).toMatchObject({ mostrar: false, motivo: 'flag_desligada' })
    for (const momento of ['conquista', 'fim_de_sessao', 'convidado_para_conta', 'modelo_premium'] as const) {
      expect(decidirOferta(entrada({ flagLigada: false, momento, plano: 'convidado' })).mostrar).toBe(false)
    }
  })

  it('desligada: os funcionais (fim de cota, cota próxima) aparecem com o texto embutido', () => {
    for (const momento of ['fim_de_cota', 'cota_proxima'] as const) {
      const d = decidirOferta(entrada({ flagLigada: false, momento, config: config() }))
      expect(d.mostrar).toBe(true)
      if (d.mostrar) {
        expect(GATILHOS_FUNCIONAIS).toContain(d.gatilho)
        expect(d.funcional).toBe(true)
        expect(d.variante).toBe('embutida')
      }
    }
  })

  it('ligada com gatilho próprio para o momento funcional: o da flag vence o embutido', () => {
    const g = gatilho({ id: 'cota_acabou', momento: 'fim_de_cota', componente: 'modal', variante: 'b' })
    const d = decidirOferta(entrada({ momento: 'fim_de_cota', config: config(g) }))
    expect(d).toMatchObject({ mostrar: true, componente: 'modal', variante: 'b' })
  })

  it('ligada sem gatilho para o momento promocional: nada', () => {
    expect(decidirOferta(entrada({ momento: 'conquista' }))).toMatchObject({ mostrar: false, motivo: 'sem_gatilho' })
  })
})

describe('frequência por gatilho', () => {
  it('maxPorDia conta as últimas 24 h', () => {
    let h = comExibicao(HISTORICO_VAZIO, 'premium', AGORA - 5 * H)
    h = comExibicao(h, 'premium', AGORA - 3 * H)
    const e = entrada({ historico: { ...h, ultimaExibicao: null } })
    expect(decidirOferta(e)).toMatchObject({ mostrar: false, motivo: 'frequencia_dia' })
    // 25 h depois da primeira, uma sai da janela do dia.
    expect(decidirOferta({ ...e, agora: AGORA + 20 * H }).mostrar).toBe(true)
  })

  it('maxPorSemana conta 7 dias corridos', () => {
    let h = HISTORICO_VAZIO
    for (const d of [6, 5, 4, 3, 2]) h = comExibicao(h, 'premium', AGORA - d * DIA)
    const e = entrada({ historico: { ...h, ultimaExibicao: null } })
    expect(decidirOferta(e)).toMatchObject({ mostrar: false, motivo: 'frequencia_semana' })
    expect(decidirOferta({ ...e, agora: AGORA + 1.1 * DIA }).mostrar).toBe(true)
  })

  it('intervaloMinHoras desde a última exibição do MESMO gatilho', () => {
    const h = { ...comExibicao(HISTORICO_VAZIO, 'premium', AGORA - 1 * H), ultimaExibicao: null }
    expect(decidirOferta(entrada({ historico: h }))).toMatchObject({ mostrar: false, motivo: 'intervalo' })
    expect(decidirOferta(entrada({ historico: h, agora: AGORA + 1.5 * H })).mostrar).toBe(true)
  })

  it('maxPorDia 0 desliga o gatilho', () => {
    expect(decidirOferta(entrada({ config: config(gatilho({ maxPorDia: 0 })) })).mostrar).toBe(false)
  })

  it('bloqueado o primeiro gatilho, o segundo do mesmo momento aparece', () => {
    const h = { ...comExibicao(HISTORICO_VAZIO, 'premium', AGORA - 1 * H), ultimaExibicao: null }
    const d = decidirOferta(entrada({ historico: h, config: config(gatilho(), gatilho({ id: 'premium_b' })) }))
    expect(d).toMatchObject({ mostrar: true, gatilho: { id: 'premium_b' } })
  })

  it('os funcionais também respeitam a própria frequência', () => {
    const id = GATILHOS_FUNCIONAIS[0].id
    const h = comExibicao(HISTORICO_VAZIO, id, AGORA - H)
    expect(decidirOferta(entrada({ momento: 'fim_de_cota', flagLigada: false, historico: h }))).toMatchObject({
      mostrar: false,
    })
  })
})

describe('não mostrar novamente', () => {
  it('é permanente para o gatilho', () => {
    const h = comNaoMostrar(HISTORICO_VAZIO, 'premium')
    expect(decidirOferta(entrada({ historico: h, agora: AGORA + 365 * DIA }))).toMatchObject({
      mostrar: false,
      motivo: 'nao_mostrar',
    })
  })

  it('vale também para o aviso funcional', () => {
    const h = comNaoMostrar(HISTORICO_VAZIO, 'funcional_cota_proxima')
    expect(decidirOferta(entrada({ momento: 'cota_proxima', historico: h, flagLigada: false }))).toMatchObject({
      motivo: 'nao_mostrar',
    })
  })

  it('não afeta outro gatilho', () => {
    const h = comNaoMostrar(HISTORICO_VAZIO, 'outro')
    expect(decidirOferta(entrada({ historico: h })).mostrar).toBe(true)
  })

  it('dispensar ("agora não") não veta para sempre', () => {
    const h = { ...comDispensa(comExibicao(HISTORICO_VAZIO, 'premium', AGORA - 3 * H), 'premium', AGORA - 3 * H) }
    expect(decidirOferta(entrada({ historico: { ...h, ultimaExibicao: null } })).mostrar).toBe(true)
  })
})

describe('tela ocupada', () => {
  for (const [nome, tela] of [
    ['captura ao vivo', { capturaAtiva: true, jogoAtivo: false, dialogoAberto: false }],
    ['rodada de jogo', { capturaAtiva: false, jogoAtivo: true, dialogoAberto: false }],
    ['diálogo aberto (celebração)', { capturaAtiva: false, jogoAtivo: false, dialogoAberto: true }],
  ] as const) {
    it(`${nome}: nada aparece, e o pedido fica para depois`, () => {
      expect(decidirOferta(entrada({ tela }))).toEqual({ mostrar: false, motivo: 'ocupado', adiar: true })
      expect(decidirOferta(entrada({ tela, momento: 'fim_de_cota', flagLigada: false }))).toEqual({
        mostrar: false,
        motivo: 'ocupado',
        adiar: true,
      })
    })
  }
})

describe('teto global (promocionais)', () => {
  it('nenhuma nos primeiros 3 minutos da sessão de uso', () => {
    const e = entrada({ sessao: { inicio: AGORA - INICIO_SEM_OFERTA_MS + 1000, promocionais: 0 } })
    expect(decidirOferta(e)).toMatchObject({ mostrar: false, motivo: 'inicio_da_sessao', adiar: false })
    expect(decidirOferta({ ...e, agora: AGORA + 2000 }).mostrar).toBe(true)
  })

  it('os funcionais não esperam os 3 minutos', () => {
    const e = entrada({ momento: 'fim_de_cota', flagLigada: false, sessao: { inicio: AGORA, promocionais: 0 } })
    expect(decidirOferta(e).mostrar).toBe(true)
  })

  it('no máximo 1 promocional por sessão', () => {
    const e = entrada({ sessao: { inicio: AGORA - DIA, promocionais: 1 } })
    expect(decidirOferta(e)).toMatchObject({ mostrar: false, motivo: 'teto_da_sessao' })
    expect(decidirOferta({ ...e, momento: 'cota_proxima', flagLigada: false }).mostrar).toBe(true)
  })

  it('30 minutos desde a última oferta de qualquer gatilho', () => {
    const h = { ...HISTORICO_VAZIO, ultimaExibicao: AGORA - INTERVALO_GLOBAL_MS + 1000 }
    expect(decidirOferta(entrada({ historico: h }))).toMatchObject({ motivo: 'intervalo_global' })
    expect(decidirOferta(entrada({ historico: h, agora: AGORA + 2000 })).mostrar).toBe(true)
  })
})

describe('planos-alvo', () => {
  const todos: PlanoDaFlag[] = ['convidado', 'free', 'premium', 'selfhost']
  const amplo = gatilho({ planos: todos })

  it('Premium nunca recebe oferta promocional (não se oferece o Premium a quem é Premium)', () => {
    expect(decidirOferta(entrada({ plano: 'premium', config: config(amplo) }))).toMatchObject({ motivo: 'plano_alvo' })
  })

  it('self-host nunca recebe nada, nem aviso de cota', () => {
    expect(decidirOferta(entrada({ plano: 'selfhost', config: config(amplo) })).mostrar).toBe(false)
    expect(decidirOferta(entrada({ plano: 'selfhost', momento: 'fim_de_cota', flagLigada: false })).mostrar).toBe(false)
  })

  it('Premium recebe o aviso funcional de cota, sem plano sugerido', () => {
    const d = decidirOferta(entrada({ plano: 'premium', momento: 'fim_de_cota', flagLigada: false }))
    expect(d).toMatchObject({ mostrar: true, planoSugerido: 'nenhum' })
  })

  it('convidado: conta antes de plano', () => {
    expect(decidirOferta(entrada({ plano: 'convidado', config: config(amplo) }))).toMatchObject({
      motivo: 'convidado_primeiro_conta',
    })
    const conta = gatilho({
      id: 'criar_conta',
      momento: 'convidado_para_conta',
      componente: 'banner',
      planos: ['convidado'],
    })
    const d = decidirOferta(entrada({ plano: 'convidado', momento: 'convidado_para_conta', config: config(conta) }))
    expect(d).toMatchObject({ mostrar: true, planoSugerido: 'conta', componente: 'banner' })
  })

  it('convite de conta não aparece para quem já tem conta', () => {
    const conta = gatilho({ id: 'criar_conta', momento: 'convidado_para_conta', planos: todos })
    expect(
      decidirOferta(entrada({ plano: 'free', momento: 'convidado_para_conta', config: config(conta) })),
    ).toMatchObject({
      motivo: 'plano_alvo',
    })
  })

  it('o gatilho só vale para os planos que lista', () => {
    expect(decidirOferta(entrada({ config: config(gatilho({ planos: ['premium'] })) }))).toMatchObject({
      motivo: 'plano_alvo',
    })
  })

  it('plano sugerido (matriz v2): Grátis → Premium; o Premium não tem para onde subir', () => {
    expect(planoSugerido('free')).toBe('premium')
    expect(planoSugerido('premium')).toBe('nenhum')
    expect(planoSugerido('selfhost')).toBe('nenhum')
    expect(planoSugerido('convidado')).toBe('conta')
  })
})

describe('histórico', () => {
  it('normaliza storage estranho em vez de lançar', () => {
    expect(normalizarHistorico('lixo')).toEqual(HISTORICO_VAZIO)
    expect(normalizarHistorico({ exibicoes: { a: [1, 'x', 2] }, naoMostrar: ['b', 3] })).toEqual({
      exibicoes: { a: [1, 2] },
      dispensas: {},
      naoMostrar: ['b'],
      ultimaExibicao: null,
    })
  })

  it('poda exibições com mais de 8 dias', () => {
    const h = comExibicao(comExibicao(HISTORICO_VAZIO, 'a', AGORA - 9 * DIA), 'a', AGORA)
    expect(h.exibicoes.a).toEqual([AGORA])
    expect(h.ultimaExibicao).toBe(AGORA)
  })
})
