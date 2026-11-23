import { describe, expect, it } from 'vitest'

import { avancar, novoLocalAgreement, visualizar } from '../src/core/legendas/localAgreement'

const rodar = (hipoteses: string[]) => {
  let e = novoLocalAgreement()
  return hipoteses.map((h) => {
    const r = avancar(e, h)
    e = r.estado
    return r
  })
}

describe('LocalAgreement-2', () => {
  it('a primeira hipótese não confirma nada: tudo é provisório', () => {
    const [r] = rodar(['the cat sat'])
    expect(r.confirmado).toBe('')
    expect(r.provisorio).toBe('the cat sat')
    expect(r.texto).toBe('the cat sat')
  })

  it('duas hipóteses que concordam confirmam o prefixo comum; o resto é a cauda', () => {
    const [, r] = rodar(['the cat sat on', 'the cat sat on the mat'])
    expect(r.confirmado).toBe('the cat sat on')
    expect(r.provisorio).toBe('the mat')
    expect(r.texto).toBe('the cat sat on the mat')
  })

  it('o confirmado nunca regride, mesmo quando a hipótese seguinte discorda ou encolhe', () => {
    const rs = rodar(['one two three', 'one two three four', 'one zwei', 'one', 'zzz'])
    expect(rs[1].confirmado).toBe('one two three')
    for (const r of rs.slice(1)) expect(r.confirmado).toBe('one two three')
    // a hipótese encolheu: a cauda some, o confirmado fica
    expect(rs[3].texto).toBe('one two three')
    expect(rs[3].provisorio).toBe('')
  })

  it('o confirmado só cresce, nunca troca de palavra', () => {
    const rs = rodar(['a b c', 'a b c d', 'x y c d e', 'x y c d e f'])
    const conf = rs.map((r) => r.confirmado)
    for (let i = 1; i < conf.length; i++) expect(conf[i].startsWith(conf[i - 1])).toBe(true)
  })

  it('empate de tamanho: hipóteses iguais confirmam tudo e a cauda fica vazia', () => {
    const [, r] = rodar(['good morning everyone', 'good morning everyone'])
    expect(r.confirmado).toBe('good morning everyone')
    expect(r.provisorio).toBe('')
  })

  it('pontuação e caixa não impedem a concordância; o texto confirmado fica como estava', () => {
    const [, r] = rodar(['Hello world', 'hello, World! How'])
    expect(r.confirmado).toBe('hello, World!')
    expect(r.provisorio).toBe('How')
    const [, r2] = rodar(['Olá, tudo bem', 'ola tudo bem hoje'])
    expect(r2.confirmado).toBe('ola tudo bem')
  })

  it('pontuação solta cola na palavra anterior e não vira palavra', () => {
    const [, r] = rodar(['wait — what', 'wait — what now'])
    expect(r.confirmado).toBe('wait — what')
    expect(r.provisorio).toBe('now')
  })

  it('idioma sem espaço: um caractere por palavra', () => {
    const [, r] = rodar(['今日は天気', '今日は天気がいい'])
    expect(r.confirmado).toBe('今日は天気')
    expect(r.provisorio).toBe('がいい')
    expect(r.texto).toBe('今日は天気がいい')
    const [, r2] = rodar(['你好吗', '你好呢'])
    expect(r2.confirmado).toBe('你好')
    expect(r2.provisorio).toBe('呢')
  })

  it('texto vazio é seguro', () => {
    const rs = rodar(['', '', 'a', 'a b'])
    expect(rs[0].texto).toBe('')
    expect(rs[3].confirmado).toBe('a')
    expect(rs[3].provisorio).toBe('b')
  })

  it('visualizar pinta o decode em curso sem avançar a concordância', () => {
    let e = novoLocalAgreement()
    e = avancar(e, 'the cat').estado
    e = avancar(e, 'the cat sat').estado // confirma "the cat"
    const v = visualizar(e, 'the cat sat on the')
    expect(v.confirmado).toBe('the cat')
    expect(v.provisorio).toBe('sat on the')
    // o estado não mudou: a próxima hipótese completa ainda compara com a anterior real
    const r = avancar(e, 'the cat sat down')
    expect(r.confirmado).toBe('the cat sat')
  })
})
