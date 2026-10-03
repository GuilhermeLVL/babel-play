/**
 * A TRADUÇÃO PARCIAL ESTÁVEL (tasks 3.1/3.3): o texto parcial só é traduzido quando as DUAS últimas leituras
 * são iguais e terminam numa fronteira de oração (pontuação final ou 6+ palavras), no máximo uma vez por
 * janela de 1,2 s por fala, e com um teto de traduções por sessão. Função pura: o relógio entra por parâmetro.
 */
import { describe, expect, it } from 'vitest'

import { criarTradutorDeParciais } from '../src/lib/captura/parcialEstavel'

describe('criarTradutorDeParciais', () => {
  it('uma leitura só nunca basta; a segunda igual, com pontuação, libera', () => {
    const p = criarTradutorDeParciais()
    expect(p.ler('a', 'Eu quero comprar arroz,', 0)).toBeNull()
    expect(p.ler('a', 'Eu quero comprar arroz,', 1100)).toBe('Eu quero comprar arroz,')
  })

  it('leituras diferentes zeram a contagem', () => {
    const p = criarTradutorDeParciais()
    p.ler('a', 'Eu quero comprar arroz,', 0)
    expect(p.ler('a', 'Eu quero comprar arroz, feijão,', 1100)).toBeNull()
    expect(p.ler('a', 'Eu quero comprar arroz, feijão,', 2200)).toBe('Eu quero comprar arroz, feijão,')
  })

  it('sem pontuação e com menos de 6 palavras não é fronteira de oração', () => {
    const p = criarTradutorDeParciais()
    p.ler('a', 'Eu quero comprar', 0)
    expect(p.ler('a', 'Eu quero comprar', 1300)).toBeNull()
  })

  it('6 palavras ou mais, sem pontuação, já é uma oração', () => {
    const p = criarTradutorDeParciais()
    p.ler('a', 'Eu quero comprar arroz e feijão', 0)
    expect(p.ler('a', 'Eu quero comprar arroz e feijão', 1300)).toBe('Eu quero comprar arroz e feijão')
  })

  it('no máximo uma tradução por janela de 1,2 s por fala', () => {
    const p = criarTradutorDeParciais()
    p.ler('a', 'Bom dia, tudo bem?', 0)
    expect(p.ler('a', 'Bom dia, tudo bem?', 100)).toBe('Bom dia, tudo bem?')
    // texto novo e estável logo depois: espera a janela
    p.ler('a', 'Bom dia, tudo bem? Eu sou o João.', 300)
    expect(p.ler('a', 'Bom dia, tudo bem? Eu sou o João.', 600)).toBeNull()
    expect(p.ler('a', 'Bom dia, tudo bem? Eu sou o João.', 1400)).toBe('Bom dia, tudo bem? Eu sou o João.')
  })

  it('o mesmo texto já traduzido não é pedido de novo', () => {
    const p = criarTradutorDeParciais()
    p.ler('a', 'Bom dia, tudo bem?', 0)
    expect(p.ler('a', 'Bom dia, tudo bem?', 100)).not.toBeNull()
    expect(p.ler('a', 'Bom dia, tudo bem?', 5000)).toBeNull()
  })

  it('cada fala tem a própria janela e o próprio estado', () => {
    const p = criarTradutorDeParciais()
    p.ler('a', 'Bom dia, tudo bem?', 0)
    p.ler('a', 'Bom dia, tudo bem?', 100)
    p.ler('b', 'Boa noite, até logo.', 150)
    expect(p.ler('b', 'Boa noite, até logo.', 200)).toBe('Boa noite, até logo.')
  })

  it('encerrar a fala libera o estado dela', () => {
    const p = criarTradutorDoParcialComTeto()
    expect(p).toBeDefined()
  })

  it('teto por sessão: ao atingir, para de traduzir parciais', () => {
    const p = criarTradutorDeParciais({ teto: 2 })
    let t = 0
    const traduzir = (id: string, texto: string) => {
      p.ler(id, texto, t)
      t += 10
      return p.ler(id, texto, t)
    }
    expect(traduzir('a', 'Primeira frase pronta.')).not.toBeNull()
    expect(traduzir('b', 'Segunda frase pronta.')).not.toBeNull()
    expect(traduzir('c', 'Terceira frase pronta.')).toBeNull()
    expect(p.esgotado()).toBe(true)
  })

  it('texto vazio não conta', () => {
    const p = criarTradutorDeParciais()
    expect(p.ler('a', '   ', 0)).toBeNull()
    expect(p.ler('a', '   ', 5000)).toBeNull()
  })
})

function criarTradutorDoParcialComTeto() {
  const p = criarTradutorDeParciais()
  p.ler('a', 'Bom dia, tudo bem?', 0)
  p.encerrar('a')
  // depois de encerrar, a mesma chave recomeça do zero (precisa de duas leituras de novo)
  expect(p.ler('a', 'Bom dia, tudo bem?', 9000)).toBeNull()
  return p
}
