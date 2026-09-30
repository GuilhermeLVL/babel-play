/**
 * O LIVRO-CAIXA DA BANCADA (B5) — o teto de gasto vale ANTES da chamada, não depois.
 *
 * O livro antigo somava o custo depois da resposta e lançava quando o total já tinha passado do
 * teto: a última chamada (e as que estavam em voo com a concorrência 4) iam além. Com a bancada
 * rodando no Actions com as chaves do dono, "passou um pouco" é dinheiro de verdade. Agora cada
 * chamada RESERVA o pior caso antes de sair; a reserva que não cabe é recusada e a chamada não
 * acontece. A resposta ACERTA a reserva pelo custo real.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { armazemEmMemoria, LivroCaixa, TetoDeGasto } from '../../scripts/eval-fala/bancada/livroCaixa.mjs'

const livro = (teto: number, inicial = 0) =>
  new LivroCaixa({ tetoUsd: teto, armazem: armazemEmMemoria({ totalUsd: inicial, porSistema: {} }) })

describe('livro-caixa: reserva antes da chamada', () => {
  it('reserva que cabe passa; a que passaria do teto é recusada ANTES de gastar', () => {
    const l = livro(1)
    const r = l.reservar('a', 0.4)
    expect(l.reservadoUsd).toBeCloseTo(0.4)
    expect(() => l.reservar('a', 0.7)).toThrow(TetoDeGasto)
    // A recusa não gasta nem reserva nada.
    expect(l.totalUsd).toBe(0)
    expect(l.reservadoUsd).toBeCloseTo(0.4)
    r.acertar(0.1)
  })

  it('as reservas EM VOO contam: a concorrência não fura o teto', () => {
    const l = livro(1)
    l.reservar('a', 0.6)
    expect(() => l.reservar('b', 0.6)).toThrow(TetoDeGasto)
  })

  it('acertar troca a reserva pelo custo real e devolve a folga', () => {
    const l = livro(1)
    const r = l.reservar('a', 0.8)
    r.acertar(0.2)
    expect(l.totalUsd).toBeCloseTo(0.2)
    expect(l.reservadoUsd).toBe(0)
    expect(l.porSistema()).toEqual({ a: 0.2 })
    // A folga voltou: 0,2 gasto + 0,7 reservado cabem em 1.
    expect(() => l.reservar('a', 0.7)).not.toThrow()
  })

  it('cancelar solta a reserva sem gastar (o provedor recusou e não cobrou)', () => {
    const l = livro(1)
    const r = l.reservar('a', 0.9)
    r.cancelar()
    expect(l.totalUsd).toBe(0)
    expect(l.reservadoUsd).toBe(0)
  })

  it('acertar duas vezes não cobra duas vezes', () => {
    const l = livro(1)
    const r = l.reservar('a', 0.5)
    r.acertar(0.3)
    r.acertar(0.3)
    r.cancelar()
    expect(l.totalUsd).toBeCloseTo(0.3)
    expect(l.reservadoUsd).toBe(0)
  })

  it('custo real desconhecido cobra o reservado (o lado seguro)', () => {
    const l = livro(1)
    l.reservar('a', 0.25).acertar(Number.NaN)
    expect(l.totalUsd).toBeCloseTo(0.25)
  })

  it('custo real acima do reservado fica registrado e PARA a bancada se passar do teto', () => {
    const l = livro(1, 0.5)
    const r = l.reservar('a', 0.4)
    expect(() => r.acertar(0.6)).toThrow(TetoDeGasto)
    expect(l.totalUsd).toBeCloseTo(1.1)
    // Depois disso nada mais sai.
    expect(() => l.reservar('a', 0.0001)).toThrow(TetoDeGasto)
  })

  it('sem estimativa válida não há garantia: recusa com erro que não é de teto', () => {
    const l = livro(1)
    for (const ruim of [Number.NaN, -1, Infinity]) {
      let erro: unknown
      try {
        l.reservar('a', ruim)
      } catch (e) {
        erro = e
      }
      expect(erro).toBeInstanceOf(Error)
      expect(erro).not.toBeInstanceOf(TetoDeGasto)
    }
  })

  it('o gasto já registrado no armazém (outra etapa do workflow) conta', () => {
    const l = livro(3, 2.9)
    expect(() => l.reservar('a', 0.2)).toThrow(TetoDeGasto)
    expect(() => l.reservar('a', 0.05)).not.toThrow()
    expect(l.disponivelUsd).toBeCloseTo(0.05)
  })

  it('registrar (depois da chamada, o jeito antigo da sonda de latência) soma e para acima do teto', () => {
    const l = livro(1)
    l.registrar('lat', 0.6)
    expect(() => l.registrar('lat', 0.6)).toThrow(TetoDeGasto)
    expect(l.totalUsd).toBeCloseTo(1.2)
    // Zero, negativo e NaN não entram (chamada local, sem custo).
    l.registrar('lat', 0)
    l.registrar('lat', Number.NaN)
    expect(l.totalUsd).toBeCloseTo(1.2)
  })

  it('a mensagem do teto diz o total e o teto', () => {
    const l = livro(3, 2.99)
    expect(() => l.reservar('x', 0.02)).toThrow(/3/)
  })
})

/**
 * A tentativa paga de `comum.mjs`, com o livro em disco (`BANCADA_DIR/gasto.json`) numa pasta
 * temporária — o mesmo arquivo que as etapas do workflow somam.
 */
describe('tentativaPaga: a reserva em volta de cada tentativa HTTP', () => {
  const pasta = mkdtempSync(path.join(os.tmpdir(), 'bancada-caixa-'))
  const envAnterior = { dir: process.env.BANCADA_DIR, teto: process.env.BANCADA_TETO_USD }
  process.env.BANCADA_DIR = pasta
  process.env.BANCADA_TETO_USD = '0.05'
  afterAll(() => {
    if (envAnterior.dir === undefined) delete process.env.BANCADA_DIR
    else process.env.BANCADA_DIR = envAnterior.dir
    if (envAnterior.teto === undefined) delete process.env.BANCADA_TETO_USD
    else process.env.BANCADA_TETO_USD = envAnterior.teto
    rmSync(pasta, { recursive: true, force: true })
  })
  const gasto = () => JSON.parse(readFileSync(path.join(pasta, 'gasto.json'), 'utf8')).totalUsd
  const resposta = (status: number) => new Response('{}', { status })

  it('ok: fica reservado até o acerto, que grava o custo real', async () => {
    const { tentativaPaga } = await import('../../scripts/eval-fala/bancada/comum.mjs')
    const r = await tentativaPaga('p:m', 0.02, async () => resposta(200))()
    r.acertar(0.001)
    expect(gasto()).toBeCloseTo(0.001)
  })

  it('recusa do provedor (5xx) não gasta: a retentativa reserva de novo', async () => {
    const { tentativaPaga } = await import('../../scripts/eval-fala/bancada/comum.mjs')
    const antes = gasto()
    const r = await tentativaPaga('p:m', 0.02, async () => resposta(503))()
    expect(r.status).toBe(503)
    expect(gasto()).toBeCloseTo(antes)
  })

  it('a rede caiu no meio: cobra o reservado (pode ter sido cobrado) e repassa o erro', async () => {
    const { tentativaPaga } = await import('../../scripts/eval-fala/bancada/comum.mjs')
    const antes = gasto()
    await expect(
      tentativaPaga('p:m', 0.01, async () => {
        throw new Error('fetch failed')
      })(),
    ).rejects.toThrow('fetch failed')
    expect(gasto()).toBeCloseTo(antes + 0.01)
  })

  it('sem folga no teto, o fetch NEM É CHAMADO', async () => {
    const { tentativaPaga, TetoDeGasto: Teto } = await import('../../scripts/eval-fala/bancada/comum.mjs')
    let chamou = false
    await expect(
      tentativaPaga('p:m', 0.05, async () => {
        chamou = true
        return resposta(200)
      })(),
    ).rejects.toBeInstanceOf(Teto)
    expect(chamou).toBe(false)
  })
})
