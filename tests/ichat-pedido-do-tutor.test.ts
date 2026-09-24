/**
 * O PEDIDO DO TUTOR CABE NO TETO DO SERVIDOR (Fase 2 do lançamento).
 *
 * O servidor recusa com 413 acima de `TETO_DE_ENTRADA_DO_TUTOR` caracteres de conteúdo. Quem monta o
 * pedido é a tela, e ela corta ANTES: material de tela longo e histórico antigo não podem fazer a
 * pergunta de agora voltar como "grande demais".
 */
import { describe, expect, it } from 'vitest'

import { TETO_DE_ENTRADA_DO_TUTOR } from '../src/lib/ichat/contencao'
import { pedidoDoTutor } from '../src/lib/ichat/pedido'

const tamanho = (p: ReturnType<typeof pedidoDoTutor>) =>
  p.material.length + p.mensagens.reduce((n, m) => n + m.content.length, 0)

describe('pedidoDoTutor', () => {
  it('pedido pequeno vai inteiro, com a pergunta por último', () => {
    const p = pedidoDoTutor('material curto', [{ role: 'user', content: 'antes' }], 'agora?')
    expect(p.material).toBe('material curto')
    expect(p.mensagens).toEqual([
      { role: 'user', content: 'antes' },
      { role: 'user', content: 'agora?' },
    ])
  })

  it('material enorme é cortado e o total nunca passa do teto do servidor', () => {
    const historico = Array.from({ length: 30 }, (_, i) => ({
      role: 'assistant' as const,
      content: `resposta ${i} `.repeat(80),
    }))
    const p = pedidoDoTutor('m'.repeat(50_000), historico, 'e isso?')
    expect(tamanho(p)).toBeLessThanOrEqual(TETO_DE_ENTRADA_DO_TUTOR)
    expect(p.mensagens.at(-1)).toEqual({ role: 'user', content: 'e isso?' })
  })

  it('o histórico que sobra é o MAIS RECENTE', () => {
    const historico = Array.from({ length: 30 }, (_, i) => ({
      role: 'user' as const,
      content: `${i}`.padEnd(900, '.'),
    }))
    const p = pedidoDoTutor('', historico, 'fim')
    const primeiro = Number(p.mensagens[0].content.replace(/\.+$/, ''))
    expect(primeiro).toBeGreaterThan(15)
    expect(p.mensagens.at(-2)?.content.startsWith('29')).toBe(true)
  })
})
