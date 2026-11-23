import { describe, expect, it } from 'vitest'

import { avancar, novoLocalAgreement } from '../src/core/legendas/localAgreement'
import {
  lerMascaraDeParciais,
  lerModoDeParciais,
  MASCARA_DO_ACRESCENTA,
  MAX_ENCOLHE_DA_CAUDA,
  pintaTokens,
  vistaAcrescenta,
  vistaDoDecode,
  vistaDoToken,
} from '../src/core/legendas/modoDeParciais'

const rodar = (modo: Parameters<typeof vistaDoDecode>[0], hipoteses: string[]) => {
  let e = novoLocalAgreement()
  let exibido = ''
  return hipoteses.map((h) => {
    const r = avancar(e, h)
    e = r.estado
    const v = vistaDoDecode(modo, r, exibido)
    exibido = v.texto
    return v
  })
}

describe('modo de exibição dos parciais vivos', () => {
  it('lê a chave: padrão cauda-token, valores desconhecidos caem no padrão', () => {
    expect(lerModoDeParciais(null)).toBe('cauda-token')
    expect(lerModoDeParciais('')).toBe('cauda-token')
    expect(lerModoDeParciais('xyz')).toBe('cauda-token')
    expect(lerModoDeParciais('sem-cauda')).toBe('sem-cauda')
    expect(lerModoDeParciais(' cauda-decode ')).toBe('cauda-decode')
  })

  it('só o cauda-token pinta tokens do onUpdate', () => {
    expect(pintaTokens('cauda-token')).toBe(true)
    expect(pintaTokens('sem-cauda')).toBe(false)
    expect(pintaTokens('cauda-decode')).toBe(false)
  })

  it('cauda-token devolve a vista da LocalAgreement sem mexer (comportamento de hoje)', () => {
    const e = avancar(avancar(novoLocalAgreement(), 'a b c').estado, 'a b c d')
    expect(vistaDoDecode('cauda-token', e, 'qualquer coisa')).toBe(e)
  })

  it('sem-cauda mostra só o confirmado e nunca regride', () => {
    const rs = rodar('sem-cauda', ['one two three', 'one two three four', 'one zwei', 'one'])
    expect(rs.map((r) => r.texto)).toEqual(['', 'one two three', 'one two three', 'one two three'])
    for (const r of rs) expect(r.provisorio).toBe('')
  })

  it('cauda-decode: sem encolhimento grande, é a vista da LocalAgreement', () => {
    const rs = rodar('cauda-decode', ['the cat sat on', 'the cat sat on the mat'])
    expect(rs[0].texto).toBe('the cat sat on')
    expect(rs[1].texto).toBe('the cat sat on the mat')
    expect(rs[1].confirmado).toBe('the cat sat on')
  })

  it('cauda-decode: a cauda não encolhe mais de 2 palavras de uma vez', () => {
    expect(MAX_ENCOLHE_DA_CAUDA).toBe(2)
    const rs = rodar('cauda-decode', ['a b c d e f g h', 'a b c x'])
    // mostrado antes: 8 palavras; a nova tem 4 -> piso 6: ficam "e f" da cauda antiga depois das 4 novas
    expect(rs[1].texto.split(' ')).toHaveLength(6)
    expect(rs[1].texto).toBe('a b c x e f')
    expect(rs[1].confirmado).toBe('a b c')
  })

  it('cauda-decode: o confirmado nunca regride mesmo com a cauda segurada', () => {
    const rs = rodar('cauda-decode', ['one two three four five', 'one two three four five six', 'one two', 'one'])
    for (const r of rs.slice(1)) expect(r.texto.startsWith('one two three four five')).toBe(true)
    expect(rs[2].texto.split(' ').length).toBeGreaterThanOrEqual(rs[1].texto.split(' ').length - 2)
  })
})

describe('V1c: só acrescenta, com máscara', () => {
  const palavras = (t: string) => t.split(' ').filter(Boolean)
  const ehPrefixo = (a: string, b: string) => b === a || b.startsWith(a + ' ')

  it('lê os modos novos e o onUpdate só é pintado no acrescenta-token', () => {
    expect(lerModoDeParciais('acrescenta-decode')).toBe('acrescenta-decode')
    expect(lerModoDeParciais(' acrescenta-token ')).toBe('acrescenta-token')
    expect(pintaTokens('acrescenta-token')).toBe(true)
    expect(pintaTokens('acrescenta-decode')).toBe(false)
    expect(MASCARA_DO_ACRESCENTA).toBe(2)
  })

  it('máscara: esconde as 2 últimas palavras da hipótese', () => {
    const rs = rodar('acrescenta-decode', ['the cat sat on the', 'the cat sat on the mat today'])
    expect(rs[0].texto).toBe('the cat sat')
    // as 5 primeiras palavras foram confirmadas pelas duas hipóteses (nunca mascaradas); as 2 últimas da nova ficam de fora
    expect(rs[1].texto).toBe('the cat sat on the')
    const r2 = rodar('acrescenta-decode', ['x y', 'x y z w q r s'])[1]
    expect(r2.texto).toBe('x y z w q')
  })

  it('o confirmado da LocalAgreement nunca é mascarado', () => {
    const rs = rodar('acrescenta-decode', ['a b c d', 'a b c d'])
    expect(rs[0].texto).toBe('a b')
    expect(rs[1].texto).toBe('a b c d')
    expect(rs[1].confirmado).toBe('a b c d')
    expect(rs[1].provisorio).toBe('')
  })

  it('nunca apaga nem troca: cada texto mostrado começa pelo anterior', () => {
    const hip = ['one two three four five', 'one two x y z w', 'one', 'one two three four five six seven', 'um']
    const rs = rodar('acrescenta-decode', hip)
    for (let i = 1; i < rs.length; i++) expect(ehPrefixo(rs[i - 1].texto, rs[i].texto)).toBe(true)
    expect(rs[0].texto).toBe('one two three')
  })

  it('diverge e para: não mostra nada novo até voltar a concordar', () => {
    const rs = rodar('acrescenta-decode', [
      'the cat sat on the mat',
      'a dog ran in the park far away',
      'the cat sat on the mat and slept',
    ])
    expect(rs[0].texto).toBe('the cat sat on')
    expect(rs[1].texto).toBe('the cat sat on') // divergiu
    expect(rs[2].texto).toBe('the cat sat on the mat') // voltou a concordar
  })

  it('hipótese mais curta que a tela: a tela fica', () => {
    const rs = rodar('acrescenta-decode', ['a b c d e f', 'a b'])
    expect(rs[1].texto).toBe(rs[0].texto)
  })

  it('compara pela forma normalizada, mas mantém o texto já mostrado literal', () => {
    const v1 = vistaAcrescenta(
      { confirmado: '', provisorio: 'Hello, big world today now', texto: 'Hello, big world today now' },
      '',
    )
    expect(v1.texto).toBe('Hello, big world')
    const v2 = vistaAcrescenta(
      { confirmado: '', provisorio: 'hello big world today now ok', texto: 'hello big world today now ok' },
      v1.texto,
    )
    expect(v2.texto).toBe('Hello, big world today')
  })

  it('idioma sem espaço: um caractere por palavra', () => {
    const v1 = vistaAcrescenta({ confirmado: '', provisorio: '今日は天気です', texto: '今日は天気です' }, '')
    expect(v1.texto).toBe('今日は天気')
    const v2 = vistaAcrescenta({ confirmado: '', provisorio: '今日は天気ですね', texto: '今日は天気ですね' }, v1.texto)
    expect(v2.texto.startsWith('今日は天気')).toBe(true)
    expect(v2.texto).toBe('今日は天気で')
    const v3 = vistaAcrescenta({ confirmado: '', provisorio: '明日は晴れ', texto: '明日は晴れ' }, v2.texto)
    expect(v3.texto).toBe(v2.texto)
  })

  it('k configurável', () => {
    const v = vistaAcrescenta({ confirmado: '', provisorio: 'a b c d e', texto: 'a b c d e' }, '', 0)
    expect(v.texto).toBe('a b c d e')
    expect(
      palavras(vistaAcrescenta({ confirmado: '', provisorio: 'a b c d e', texto: 'a b c d e' }, '', 4).texto),
    ).toEqual(['a'])
  })

  it('acrescenta-token: o token a token segue a mesma regra; o decode e o token compartilham a tela', () => {
    const hip = { confirmado: '', provisorio: 'one two three four', texto: 'one two three four' }
    const t = vistaDoToken('acrescenta-token', hip, '')
    expect(t.texto).toBe('one two')
    const d = vistaDoDecode(
      'acrescenta-token',
      { ...hip, texto: 'one two three four five', provisorio: 'one two three four five' },
      t.texto,
    )
    expect(d.texto).toBe('one two three')
    // um token que diverge não mexe na tela
    expect(
      vistaDoToken(
        'acrescenta-token',
        { confirmado: '', provisorio: 'uno dos tres cuatro', texto: 'uno dos tres cuatro' },
        d.texto,
      ).texto,
    ).toBe(d.texto)
  })

  it('cauda-token segue devolvendo a vista como veio no token (comportamento de hoje)', () => {
    const v = { confirmado: 'a', provisorio: 'b', texto: 'a b' }
    expect(vistaDoToken('cauda-token', v, 'x y z')).toBe(v)
  })

  it('o final substitui tudo: o modo só decide o parcial; confirmado e provisório são coerentes com o texto', () => {
    const r = rodar('acrescenta-decode', ['a b c d e', 'a b c d e f g'])[1]
    expect([r.confirmado, r.provisorio].filter(Boolean).join(' ')).toBe(r.texto)
  })
})

describe('máscara configurável (V4, chave babel.lab.parciaisMascara)', () => {
  it('lê inteiro de 0 a 8; ausente, vazio, fração, negativo ou grande cai no padrão (2)', () => {
    expect(lerMascaraDeParciais(null)).toBe(MASCARA_DO_ACRESCENTA)
    expect(lerMascaraDeParciais('')).toBe(2)
    expect(lerMascaraDeParciais('1')).toBe(1)
    expect(lerMascaraDeParciais(' 0 ')).toBe(0)
    expect(lerMascaraDeParciais('8')).toBe(8)
    expect(lerMascaraDeParciais('9')).toBe(2)
    expect(lerMascaraDeParciais('-1')).toBe(2)
    expect(lerMascaraDeParciais('1.5')).toBe(2)
    expect(lerMascaraDeParciais('x')).toBe(2)
  })

  it('a máscara muda o que o decode mostra: k=1 mostra uma palavra a mais que k=2', () => {
    const r = avancar(novoLocalAgreement(), 'one two three four five')
    expect(vistaDoDecode('acrescenta-decode', r, '').texto).toBe('one two three')
    expect(vistaDoDecode('acrescenta-decode', r, '', 1).texto).toBe('one two three four')
    expect(vistaDoToken('acrescenta-token', r, '', 1).texto).toBe('one two three four')
  })
})
