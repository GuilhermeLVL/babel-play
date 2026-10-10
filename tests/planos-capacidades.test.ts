/**
 * AS CAPACIDADES E AS COTAS POR NÍVEL DE SERVIÇO (change `planos-v3-e-rota-inteligente`, etapas 2 e 7).
 *
 * A matriz passa a dizer, por plano, o que a política de rota, os anúncios e a tela de Planos
 * precisam saber sem olhar o nome: se o plano tira os anúncios (`semAnuncios`), se inclui a nuvem ao
 * vivo (`sttAoVivo`, com a cota `sttAoVivoSegundosMes` ao lado da de trechos) e em que NÍVEL fala
 * (`nivelDeVoz`: a do aparelho, a neural básica ou a neural boa).
 */
import { describe, expect, it } from 'vitest'

import { getEntitlements } from '../server/lib/entitlements'
import {
  ENTITLEMENTS_FECHADOS,
  lerEntitlements,
  NIVEIS_DE_VOZ,
  PLAN_MATRIX,
  PLANO_CONVIDADO,
  type PlanoEfetivo,
  PLANOS_DE_ASSINATURA,
  PLANOS_PAGOS,
} from '../src/core/planos'

const TODOS: Array<[PlanoEfetivo, typeof PLANO_CONVIDADO]> = [
  ...PLANOS_DE_ASSINATURA.map((p) => [p, PLAN_MATRIX[p]] as [PlanoEfetivo, typeof PLANO_CONVIDADO]),
  ['convidado', PLANO_CONVIDADO],
]

describe('toda definição de plano declara as capacidades novas', () => {
  it.each(TODOS)('%s', (_nome, def) => {
    expect(typeof def.entitlements.semAnuncios).toBe('boolean')
    expect(typeof def.entitlements.sttAoVivo).toBe('boolean')
    expect(NIVEIS_DE_VOZ).toContain(def.entitlements.nivelDeVoz)
    const aoVivo = def.quotas.sttAoVivoSegundosMes
    expect(aoVivo === null || (Number.isInteger(aoVivo) && aoVivo >= 0)).toBe(true)
  })

  it('os níveis de voz, do mais simples ao melhor', () => {
    expect([...NIVEIS_DE_VOZ]).toEqual(['aparelho', 'basica', 'boa'])
  })
})

describe('as capacidades não se contradizem', () => {
  /* `vozNatural` é o campo que o servidor já lê (a rota de voz responde 402 sem ele); o nível é o
     mesmo fato com mais um grau. Um plano com voz neural e `vozNatural: false` venderia o que a rota
     recusa. */
  it.each(TODOS)('%s: voz natural é o mesmo que nível de voz acima do aparelho', (_nome, def) => {
    expect(def.entitlements.vozNatural).toBe(def.entitlements.nivelDeVoz !== 'aparelho')
  })

  it.each(TODOS)('%s: só tem horas ao vivo quem tem a nuvem ao vivo', (_nome, def) => {
    if (def.entitlements.sttAoVivo) expect(def.quotas.sttAoVivoSegundosMes).not.toBe(0)
    else expect(def.quotas.sttAoVivoSegundosMes).toBe(0)
  })

  it.each(TODOS)('%s: a nuvem ao vivo é nuvem — pede a nuvem por trechos também', (_nome, def) => {
    if (def.entitlements.sttAoVivo) expect(def.entitlements.managedCloudStt).toBe(true)
  })
})

describe('quem vê anúncio', () => {
  it('o Grátis e o convidado têm anúncios; quem paga e o self-host não', () => {
    expect(PLAN_MATRIX.free.entitlements.semAnuncios).toBe(false)
    expect(PLANO_CONVIDADO.entitlements.semAnuncios).toBe(false)
    expect(PLAN_MATRIX.selfhost.entitlements.semAnuncios).toBe(true)
    for (const p of PLANOS_PAGOS) expect(PLAN_MATRIX[p].entitlements.semAnuncios, p).toBe(true)
  })
})

describe('o Grátis, o convidado e o self-host', () => {
  it('o Grátis e o convidado falam com a voz do aparelho e não têm nuvem ao vivo', () => {
    for (const def of [PLAN_MATRIX.free, PLANO_CONVIDADO]) {
      expect(def.entitlements.nivelDeVoz).toBe('aparelho')
      expect(def.entitlements.sttAoVivo).toBe(false)
    }
  })

  it('o self-host tem tudo, sem teto', () => {
    expect(PLAN_MATRIX.selfhost.entitlements).toMatchObject({ sttAoVivo: true, nivelDeVoz: 'boa' })
    expect(PLAN_MATRIX.selfhost.quotas.sttAoVivoSegundosMes).toBeNull()
  })

  it('o Premium fala com a voz neural básica', () => {
    expect(PLAN_MATRIX.premium.entitlements.nivelDeVoz).toBe('basica')
  })
})

describe('o servidor e o cliente recebem os campos', () => {
  it('os entitlements do servidor trazem as capacidades novas', () => {
    for (const p of PLANOS_DE_ASSINATURA) {
      const e = getEntitlements(p)
      expect(e).toMatchObject({
        semAnuncios: PLAN_MATRIX[p].entitlements.semAnuncios,
        sttAoVivo: PLAN_MATRIX[p].entitlements.sttAoVivo,
        nivelDeVoz: PLAN_MATRIX[p].entitlements.nivelDeVoz,
      })
    }
  })

  it('fechado é com anúncio, sem ao vivo e com a voz do aparelho', () => {
    expect(ENTITLEMENTS_FECHADOS).toMatchObject({ semAnuncios: false, sttAoVivo: false, nivelDeVoz: 'aparelho' })
  })

  it('o nível de voz que veio de fora só vale se for um dos conhecidos', () => {
    expect(lerEntitlements({ nivelDeVoz: 'boa' }).nivelDeVoz).toBe('boa')
    expect(lerEntitlements({ nivelDeVoz: 'basica' }).nivelDeVoz).toBe('basica')
    expect(lerEntitlements({ nivelDeVoz: 'divina' }).nivelDeVoz).toBe('aparelho')
    expect(lerEntitlements({ nivelDeVoz: true }).nivelDeVoz).toBe('aparelho')
    // Servidor anterior: manda `vozNatural` e não o nível. O que não veio fica fechado.
    expect(lerEntitlements({ vozNatural: true })).toMatchObject({ vozNatural: true, nivelDeVoz: 'aparelho' })
  })
})
