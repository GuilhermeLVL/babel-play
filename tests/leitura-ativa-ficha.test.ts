/**
 * A FICHA DE UM TEXTO DA LEITURA ATIVA (spec `leitura-ativa-acervo`): campos, 3 perguntas × 3 opções, `correta`
 * válido e palavras-alvo presentes no texto (também na forma flexionada). Uma ficha inválida quebra o teste do
 * acervo, nunca a tela: o validador devolve a lista de problemas apontando o texto, a pergunta e a palavra.
 */
import { describe, expect, it } from 'vitest'

import { type FichaDeTexto, nivelNumerico, validarFicha } from '../src/core/leitura/fichaDeTexto'

const BOA: FichaDeTexto = {
  id: 'a1-teste',
  titulo: 'At the Market',
  nivel: 'A1',
  categoria: 'Dia a dia',
  texto: 'Lia likes apples. She picks six red apples. Her friend has a small dog.',
  palavrasAlvo: ['apple', 'friend', 'small'],
  perguntas: [
    {
      pergunta: 'What does Lia like?',
      traducao: 'Do que a Lia gosta?',
      opcoes: ['Apples', 'Milk', 'Dogs'],
      correta: 0,
      explicacao: 'Ela gosta de maçãs.',
    },
    {
      pergunta: 'How many apples?',
      traducao: 'Quantas maçãs?',
      opcoes: ['Two', 'Six', 'Ten'],
      correta: 1,
      explicacao: 'Seis maçãs.',
    },
    {
      pergunta: 'Who has a dog?',
      traducao: 'Quem tem um cachorro?',
      opcoes: ['Lia', 'Her dad', 'Her friend'],
      correta: 2,
      explicacao: 'A amiga.',
    },
  ],
  tarefaDeEscrita: { reescrever: 'Reescreva.', opinar: 'Do you like apples?' },
  licenca: 'original Frasy (CC BY 4.0)',
  autoria: 'Equipe Frasy, com apoio de IA',
}

const copia = (): FichaDeTexto => JSON.parse(JSON.stringify(BOA))

describe('validarFicha', () => {
  it('uma ficha completa não tem problema', () => {
    expect(validarFicha(BOA)).toEqual([])
  })

  it('pergunta com índice fora das opções aponta o id e o número da pergunta', () => {
    const f = copia()
    f.perguntas[1].correta = 3
    const p = validarFicha(f)
    expect(p).toHaveLength(1)
    expect(p[0].mensagem).toContain('a1-teste')
    expect(p[0].mensagem).toContain('pergunta 2')
  })

  it('palavra-alvo que não está no texto aponta a palavra', () => {
    const f = copia()
    f.palavrasAlvo.push('umbrella')
    const p = validarFicha(f)
    expect(p.map((x) => x.mensagem).join(' ')).toContain('umbrella')
  })

  it('a palavra-alvo vale na forma flexionada ("apple" ↔ "apples")', () => {
    expect(validarFicha(BOA).some((x) => x.mensagem.includes('apple'))).toBe(false)
  })

  it('cobra 3 perguntas, 3 opções, explicação, 3 a 10 palavras-alvo e as duas tarefas', () => {
    const semPergunta = copia()
    semPergunta.perguntas.pop()
    expect(validarFicha(semPergunta).length).toBeGreaterThan(0)
    const duasOpcoes = copia()
    duasOpcoes.perguntas[0].opcoes.pop()
    expect(validarFicha(duasOpcoes).length).toBeGreaterThan(0)
    const semExplicacao = copia()
    semExplicacao.perguntas[0].explicacao = ' '
    expect(validarFicha(semExplicacao).length).toBeGreaterThan(0)
    const poucasAlvo = copia()
    poucasAlvo.palavrasAlvo = ['apple']
    expect(validarFicha(poucasAlvo).length).toBeGreaterThan(0)
    const semTarefa = copia()
    ;(semTarefa.tarefaDeEscrita as { opinar?: string }).opinar = ''
    expect(validarFicha(semTarefa).length).toBeGreaterThan(0)
    const nivelErrado = copia()
    ;(nivelErrado as { nivel: string }).nivel = 'C2'
    expect(validarFicha(nivelErrado).length).toBeGreaterThan(0)
  })

  it('não lança com lixo: devolve problema', () => {
    expect(validarFicha(null).length).toBeGreaterThan(0)
    expect(validarFicha({ id: 'x' }).length).toBeGreaterThan(0)
  })

  it('o nível vira número (Nível 1 · A1)', () => {
    expect(nivelNumerico('A1')).toBe(1)
    expect(nivelNumerico('A2')).toBe(2)
    expect(nivelNumerico('B1')).toBe(3)
  })
})
