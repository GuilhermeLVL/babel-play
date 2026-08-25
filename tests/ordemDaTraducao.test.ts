/**
 * O TEXTO PELA METADE NÃO PODE VENCER O TEXTO INTEIRO.
 *
 * Um balão de legenda recebe várias traduções: uma por parcial (o texto refina enquanto a pessoa
 * fala) e uma do decode final, que é o autoritativo. Todas escrevem no MESMO segmento, e cada uma
 * demora o que demora. Nada garantia que a última a CHEGAR fosse a última a ter sido PEDIDA —
 * então a tradução atrasada de "Hola qué" sobrescrevia a de "Hola qué tal, amigos" e ficava assim,
 * porque nada mais escreve naquele balão depois.
 *
 * Quanto mais lento o tradutor, mais provável a inversão. Ou seja: falha exatamente quando o
 * usuário mais depende da legenda.
 */
import { describe, it, expect } from 'vitest'
import { OrdemDasTraducoes } from '../src/lib/ordemDaTraducao'

describe('ordem das traduções', () => {
  it('o resultado mais recente escreve na tela', () => {
    const o = new OrdemDasTraducoes()
    const selo = o.abrir('sys-1')
    expect(o.encerrar('sys-1', selo)).toBe(true)
  })

  it('O CASO DO BUG: a resposta atrasada do parcial NÃO sobrescreve a do final', () => {
    const o = new OrdemDasTraducoes()
    const parcial = o.abrir('sys-1')   // "Hola qué"
    const final = o.abrir('sys-1')     // "Hola qué tal, amigos"

    // O final volta primeiro (o tradutor demorou mais no parcial) — ele escreve.
    expect(o.encerrar('sys-1', final)).toBe(true)
    // E quando o parcial finalmente volta, já perdeu a vez.
    expect(o.encerrar('sys-1', parcial)).toBe(false)
  })

  it('segmentos diferentes não interferem entre si', () => {
    const o = new OrdemDasTraducoes()
    const a = o.abrir('sys-1')
    const b = o.abrir('sys-2')
    expect(o.encerrar('sys-1', a)).toBe(true)
    expect(o.encerrar('sys-2', b)).toBe(true)
  })

  it('vários parciais em sequência: só o último vale', () => {
    const o = new OrdemDasTraducoes()
    const selos = [o.abrir('sys-1'), o.abrir('sys-1'), o.abrir('sys-1')]
    expect(o.encerrar('sys-1', selos[0])).toBe(false)
    expect(o.encerrar('sys-1', selos[1])).toBe(false)
    expect(o.encerrar('sys-1', selos[2])).toBe(true)
  })
})

describe('ocupado — o que corta o retrabalho', () => {
  it('sabe que há tradução em voo', () => {
    const o = new OrdemDasTraducoes()
    expect(o.ocupado('sys-1')).toBe(false)
    const selo = o.abrir('sys-1')
    expect(o.ocupado('sys-1')).toBe(true)
    o.encerrar('sys-1', selo)
    expect(o.ocupado('sys-1')).toBe(false)
  })

  it('conta os pedidos: dois em voo, um encerrado, ainda ocupado', () => {
    const o = new OrdemDasTraducoes()
    const a = o.abrir('sys-1')
    o.abrir('sys-1')
    o.encerrar('sys-1', a)
    expect(o.ocupado('sys-1')).toBe(true)
  })

  it('CAMINHO QUE NÃO PEDE TRADUÇÃO também encerra — senão o balão trava ocupado para sempre', () => {
    // Cache e "não há para onde traduzir" resolvem sem chamar tradutor nenhum. Se esses caminhos
    // esquecerem de encerrar, `ocupado` fica true eternamente e TODO parcial seguinte é descartado.
    const o = new OrdemDasTraducoes()
    const doCache = o.abrir('sys-1')
    o.encerrar('sys-1', doCache)
    expect(o.ocupado('sys-1')).toBe(false)
  })
})

describe('limpeza', () => {
  it('esquecer remove o segmento', () => {
    const o = new OrdemDasTraducoes()
    o.encerrar('sys-1', o.abrir('sys-1'))
    expect(o.tamanho).toBe(1)
    o.esquecer('sys-1')
    expect(o.tamanho).toBe(0)
  })

  it('limpar zera tudo — sessão nova não herda selos da anterior', () => {
    const o = new OrdemDasTraducoes()
    o.abrir('sys-1'); o.abrir('sys-2')
    o.limpar()
    expect(o.tamanho).toBe(0)
    expect(o.ocupado('sys-1')).toBe(false)
    // E o selo recomeça: o pedido de uma sessão antiga não pode "vencer" o da nova.
    expect(o.encerrar('sys-1', 1)).toBe(false)
  })
})
