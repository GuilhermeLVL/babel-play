/**
 * TEMPORADA COM DATAS (recompensas v2, onda 5; spec 8.3) — os contratos:
 * 1. A Temporada 1 vai de 01/10/2026 a 25/11/2026 (8 semanas, dia de Brasília); fora das datas não
 *    há temporada atual.
 * 2. XP de temporada = XP da conta ganho DENTRO da janela; 30 níveis de 150 XP.
 * 3. Trilha grátis: recompensa em todo nível par (item, ou Seeds onde não há item). Trilha de
 *    assinante: ITEM em todo nível, nunca Seeds (Seeds pela assinatura seriam Seeds compráveis).
 * 4. O crédito `temporada:<id>:<nível>:<trilha>` tem valor decidido pela regra; nenhum motivo de
 *    gasto compra nível.
 * 5. Item de temporada passada volta à Loja com Seeds 365 dias depois do `fim`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CATALOGO_DA_TEMPORADA } from '../src/core/catalogoTemporada'
import {
  autorizarGasto,
  autorizarGastoDeCredito,
  ehRecusa,
  itensSorteaveisNoDrop,
  valorDoCredito,
} from '../src/core/economiaAutoridade'
import { PESOS_XP } from '../src/core/learning/xp'
import { CATALOGO_DA_LOJA, type ItemDaLoja, temPortaDeNivel } from '../src/core/loja'
import {
  creditoDaTemporada,
  creditosDaTemporadaDevidos,
  DIAS_ATE_VOLTAR_NA_LOJA,
  ehAssinanteDaTemporada,
  lerCreditoDaTemporada,
  limitesDaTemporada,
  nivelDaTemporada,
  precoSeedsDoItem,
  proximaTemporada,
  recompensaDaTrilha,
  temporadaAtual,
  TEMPORADAS,
  totalDeSeedsDaTrilhaGratis,
  XP_POR_NIVEL_DA_TEMPORADA,
  xpDeTemporada,
} from '../src/core/temporada'

const T1 = TEMPORADAS[0]
const brasilia = (iso: string) => new Date(`${iso}-03:00`)
const ehItem = (r: unknown): r is ItemDaLoja => !!r && typeof r === 'object' && 'id' in r

describe('as datas', () => {
  it('a Temporada 1 é 01/10/2026 a 25/11/2026: 8 semanas, 30 níveis', () => {
    expect(T1).toMatchObject({ id: 't1', inicio: '2026-10-01', fim: '2026-11-25', niveis: 30 })
    const { inicio, fim } = limitesDaTemporada(T1)
    expect(Math.round((fim - inicio) / 86_400_000)).toBe(56)
  })

  it('fora das datas não há temporada atual; dentro, é a T1 — as bordas no dia de Brasília', () => {
    expect(temporadaAtual(brasilia('2026-09-30T23:59:59'))).toBeNull()
    expect(temporadaAtual(brasilia('2026-10-01T00:00:00'))?.id).toBe('t1')
    expect(temporadaAtual(brasilia('2026-11-25T23:59:59'))?.id).toBe('t1')
    expect(temporadaAtual(brasilia('2026-11-26T00:00:00'))).toBeNull()
  })

  it('a próxima temporada: antes da T1 é a T1; depois da última, nenhuma', () => {
    expect(proximaTemporada(brasilia('2026-09-27T12:00:00'))?.id).toBe('t1')
    expect(proximaTemporada(brasilia('2026-10-10T12:00:00'))).toBeNull()
    expect(proximaTemporada(brasilia('2026-12-01T12:00:00'))).toBeNull()
  })
})

describe('XP e nível de temporada', () => {
  it('30 níveis de 150 XP, com piso 0 e teto 30', () => {
    expect(XP_POR_NIVEL_DA_TEMPORADA).toBe(150)
    expect(nivelDaTemporada(0)).toBe(0)
    expect(nivelDaTemporada(149)).toBe(0)
    expect(nivelDaTemporada(150)).toBe(1)
    expect(nivelDaTemporada(4500)).toBe(30)
    expect(nivelDaTemporada(1_000_000)).toBe(30)
    expect(nivelDaTemporada(-5)).toBe(0)
  })

  it('só o XP ganho dentro da janela conta, com os pesos da conta', () => {
    const dentro = brasilia('2026-10-15T10:00:00').getTime()
    const antes = brasilia('2026-09-30T23:00:00').getTime()
    const depois = brasilia('2026-11-26T08:00:00').getTime()
    const xp = xpDeTemporada(
      {
        sessoes: [{ em: dentro, palavras: 10 }, { em: antes, palavras: 50 }],
        revisoes: [{ em: dentro, certa: true }, { em: depois, certa: true }],
        itensDeJogo: [{ em: dentro, certo: false }, { em: antes, certo: true }],
      },
      T1,
    )
    expect(xp).toBe(
      PESOS_XP.sessao + 10 * PESOS_XP.palavraCapturada + PESOS_XP.revisao + PESOS_XP.revisaoCerta + PESOS_XP.itemDeJogo,
    )
  })
})

describe('as duas trilhas', () => {
  it('grátis: nada nos ímpares, recompensa em todo par', () => {
    for (let n = 1; n <= 30; n++) {
      const r = recompensaDaTrilha(n, 'gratis')
      if (n % 2) expect(r, `nível ${n}`).toBeNull()
      else expect(r, `nível ${n}`).not.toBeNull()
    }
  })

  it('assinante: item em todo nível, nunca Seeds', () => {
    for (let n = 1; n <= 30; n++) expect(ehItem(recompensaDaTrilha(n, 'assinante')), `nível ${n}`).toBe(true)
  })

  it('fora de 1..30 não há recompensa', () => {
    expect(recompensaDaTrilha(0, 'gratis')).toBeNull()
    expect(recompensaDaTrilha(31, 'assinante')).toBeNull()
  })

  it('os três candidatos da onda 4 estão na trilha grátis; o tema Observatório é o marco', () => {
    const gratis = Array.from({ length: 30 }, (_, i) => recompensaDaTrilha(i + 1, 'gratis')).filter(ehItem)
    const ids = gratis.map((i) => i.id)
    expect(ids).toEqual(expect.arrayContaining(['tema-observatorio', 'leg-letreiro', 'cartao-constelacao']))
    expect((recompensaDaTrilha(30, 'gratis') as ItemDaLoja).id).toBe('tema-observatorio')
  })

  it('todo item de temporada cai em exatamente uma casa, e toda casa aponta para item do catálogo', () => {
    const vistos = new Map<string, number>()
    for (const trilha of ['gratis', 'assinante'] as const) {
      for (let n = 1; n <= 30; n++) {
        const r = recompensaDaTrilha(n, trilha)
        if (ehItem(r)) {
          expect(CATALOGO_DA_LOJA.some((i) => i.id === r.id), r.id).toBe(true)
          vistos.set(r.id, (vistos.get(r.id) ?? 0) + 1)
        }
      }
    }
    const daTemporada = CATALOGO_DA_LOJA.filter((i) => i.origemTemporada)
    expect(daTemporada.length).toBeGreaterThanOrEqual(CATALOGO_DA_TEMPORADA.length + 3)
    for (const i of daTemporada) expect(vistos.get(i.id), i.id).toBe(1)
    expect(vistos.size).toBe(daTemporada.length)
  })

  it('item de temporada não abre por nível, não tem Seeds nem Créditos, e não cai no baú', () => {
    const sorteaveis = new Set(itensSorteaveisNoDrop(new Set()).map((i) => i.id))
    for (const i of CATALOGO_DA_LOJA.filter((x) => x.origemTemporada)) {
      expect(temPortaDeNivel(i), i.id).toBe(false)
      expect(i.precoSeeds, i.id).toBeUndefined()
      expect(i.precoCreditos, i.id).toBeUndefined()
      expect(sorteaveis.has(i.id), i.id).toBe(false)
    }
  })

  it('as Seeds da trilha grátis são poucas diante da renda (≈ 150/dia no perfil típico) e ficam travadas', () => {
    const total = totalDeSeedsDaTrilhaGratis()
    expect(total).toBeGreaterThanOrEqual(900)
    expect(total).toBeLessThanOrEqual(1200)
  })
})

describe('o crédito da temporada', () => {
  it('o id vai e volta', () => {
    const id = creditoDaTemporada('t1', 12, 'assinante')
    expect(id).toBe('temporada:t1:12:assinante')
    expect(lerCreditoDaTemporada(id)).toEqual({ temporada: T1, nivel: 12, trilha: 'assinante' })
    for (const ruim of ['temporada:t9:2:gratis', 'temporada:t1:0:gratis', 'temporada:t1:31:assinante', 'temporada:t1:2:vip', 'temporada:t1:02:gratis']) {
      expect(lerCreditoDaTemporada(ruim), ruim).toBeNull()
    }
  })

  it('o valor é da regra: Seeds na casa de Seeds, zero na casa de item, e o XP exigido', () => {
    const seeds = recompensaDaTrilha(2, 'gratis') as { seeds: number }
    const v = valorDoCredito('temporada:t1:2:gratis')
    if (ehRecusa(v)) throw new Error(v.erro)
    expect(v).toMatchObject({ seeds: seeds.seeds, xp: 0, reason: 'temporada:t1:2:gratis', nivelMinimo: 0 })
    expect(v.temporada).toEqual({ temporada: T1, nivel: 2, trilha: 'gratis', xpExigido: 300 })

    const item = valorDoCredito('temporada:t1:30:assinante')
    if (ehRecusa(item)) throw new Error(item.erro)
    expect(item.seeds).toBe(0)
    expect(item.temporada?.trilha).toBe('assinante')
  })

  it('casa sem recompensa e id malformado são recusados', () => {
    expect(ehRecusa(valorDoCredito('temporada:t1:3:gratis'))).toBe(true)
    expect(ehRecusa(valorDoCredito('temporada:t1:99:gratis'))).toBe(true)
    expect(ehRecusa(valorDoCredito('temporada:x'))).toBe(true)
  })

  it('o Passe antigo saiu: `passe:t1:*` não é mais crédito', () => {
    expect(ehRecusa(valorDoCredito('passe:t1:cofre-d2-1'))).toBe(true)
  })

  it('assinante é quem tem plano pago concedido pelo servidor — nunca free, convidado ou self-host', () => {
    expect(ehAssinanteDaTemporada('pro')).toBe(true)
    expect(ehAssinanteDaTemporada('essencial')).toBe(true)
    expect(ehAssinanteDaTemporada('free')).toBe(false)
    expect(ehAssinanteDaTemporada('convidado')).toBe(false)
    expect(ehAssinanteDaTemporada('selfhost')).toBe(false)
  })

  it('os créditos devidos: a grátis até o nível; a de assinante só para assinante; sem repetir', () => {
    const semAssinatura = creditosDaTemporadaDevidos(T1, 5, false, new Set())
    expect(semAssinatura).toEqual(['temporada:t1:2:gratis', 'temporada:t1:4:gratis'])
    const comAssinatura = creditosDaTemporadaDevidos(T1, 2, true, new Set(['temporada:t1:1:assinante']))
    expect(comAssinatura).toEqual(['temporada:t1:2:gratis', 'temporada:t1:2:assinante'])
  })
})

describe('nenhuma rota compra nível', () => {
  it('nem Seeds nem Créditos têm motivo de gasto de temporada', () => {
    for (const r of ['temporada:t1:5:gratis', 'temporada:t1:5:assinante', 'nivel-da-temporada', 'temporada']) {
      expect(ehRecusa(autorizarGasto(r)), r).toBe(true)
      expect(ehRecusa(autorizarGastoDeCredito(r)), r).toBe(true)
    }
  })

  it('nenhum arquivo de rota fala em comprar nível ou pular casa', () => {
    const arquivos = [
      ...readdirSync('server/routes').map((f) => join('server/routes', f)),
      ...readdirSync('src/data/efemero/rotas').map((f) => join('src/data/efemero/rotas', f)),
    ].filter((f) => f.endsWith('.ts'))
    for (const f of arquivos) {
      const fonte = readFileSync(f, 'utf8')
      expect(/comprar-?n[ií]vel|pular-?casa|nivel-da-temporada/i.test(fonte), f).toBe(false)
    }
  })
})

describe('o item volta à Loja com Seeds um ano depois do fim', () => {
  const observatorio = CATALOGO_DA_LOJA.find((i) => i.id === 'tema-observatorio')!
  const fim = limitesDaTemporada(T1).fim
  const DIA = 86_400_000

  it('durante e logo depois da temporada, sem preço; 365 dias depois do fim, com o preço de volta', () => {
    expect(DIAS_ATE_VOLTAR_NA_LOJA).toBe(365)
    expect(precoSeedsDoItem(observatorio, brasilia('2026-10-10T12:00:00').getTime())).toBeUndefined()
    expect(precoSeedsDoItem(observatorio, fim + 364 * DIA)).toBeUndefined()
    expect(precoSeedsDoItem(observatorio, fim + 365 * DIA + 1)).toBe(3000)
  })

  it('item comum da Loja continua com o próprio preço', () => {
    const radio = CATALOGO_DA_LOJA.find((i) => i.id === 'tema-radio')!
    expect(precoSeedsDoItem(radio, 0)).toBe(radio.precoSeeds)
  })

  it('a autoridade do gasto usa a mesma régua: recusa agora, vende depois do ano', () => {
    expect(ehRecusa(autorizarGasto('loja:tema-observatorio', brasilia('2026-10-10T12:00:00').getTime()))).toBe(true)
    expect(autorizarGasto('loja:tema-observatorio', fim + 366 * DIA)).toEqual({
      tipo: 'loja',
      itemId: 'tema-observatorio',
      preco: 3000,
    })
  })
})
