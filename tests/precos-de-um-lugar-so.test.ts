/**
 * PREÇO VEM DE UM LUGAR SÓ (mudança vender-onde-se-ve).
 *
 * `PLAN_MATRIX` e `CATALOGO_DE_CREDITOS` sempre foram a fonte, e mesmo assim quatro telas
 * escreviam o número à mão: a tabela comparativa de Planos (duas vezes), o selo do menu do avatar
 * e o texto de armazenamento. Preço duplicado diverge — quem muda a matriz não vai lembrar de
 * caçar os literais.
 *
 * Este teste varre as telas de venda por preço em real escrito no meio do JSX. Ele reprova o
 * padrão, não o número: se alguém escrever "R$ 29,90" numa tela nova, quebra aqui.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { precoDoPlano, menorPrecoDeAssinatura, armazenamentoEmTexto } from '../src/core/planos'

const TELAS = [
  'src/components/views/Planos.tsx',
  'src/components/shell/MenuDaConta.tsx',
  'src/components/CardDePlanos.tsx',
  'src/components/views/loja/ComprarCreditos.tsx',
  'src/components/views/planos/Assinar.tsx',
  'src/components/views/Sobre.tsx',
]

describe('nenhum preço literal nas telas de venda', () => {
  for (const arquivo of TELAS) {
    it(arquivo.split('/').pop()!, () => {
      /* Comentários fora: a regra é sobre o que o USUÁRIO vê. Um comentário que explica por que
         o Essencial custa o que custa é documentação, e documentação com número é útil — o que
         não pode é a TELA ter o número, porque a tela é que fica errada quando o preço muda. */
      const texto = readFileSync(arquivo, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      // "R$ 9,90" / "R$ 19,90" — o que interessa é o NÚMERO colado no símbolo.
      const literais = texto.match(/R\$\s*\d+[,.]\d{2}/g) ?? []
      expect(literais, `preço escrito à mão: ${literais.join(', ')}`).toEqual([])
    })
  }
})

describe('os formatadores derivam da matriz', () => {
  it('preço de plano sai da matriz e vem em vírgula', () => {
    expect(precoDoPlano('essencial')).toMatch(/^\d+,\d{2}$/)
    expect(precoDoPlano('free'), 'plano sem preço não inventa número').toBeNull()
  })

  it('o menor preço é o menor dos vendáveis', () => {
    const menor = menorPrecoDeAssinatura()!
    expect(Number(menor.replace(',', '.'))).toBeLessThanOrEqual(Number(precoDoPlano('pro')!.replace(',', '.')))
  })

  it('armazenamento vira texto a partir da quota, não de um literal', () => {
    expect(armazenamentoEmTexto('free')).toMatch(/MB|GB/)
    expect(armazenamentoEmTexto('selfhost')).toBe('sem teto')
  })
})
