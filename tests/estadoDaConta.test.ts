/**
 * O ESTADO DA CONTA NAS TELAS DE PAGAMENTO — derivado só do que o servidor disse.
 *
 * O protótipo simula sete estados; o app desenha os cinco que existem de verdade. O que importa
 * aqui é o lado do dinheiro: `trialing` (checkout iniciado, pagamento não confirmado) NÃO aparece
 * como assinatura ativa, e cancelada só aparece enquanto o período pago ainda vale.
 */
import { describe, expect, it } from 'vitest'

import { brl, dataCurta, estadoDaConta, faturaEmAberto, temAssinatura } from '../src/lib/assinatura'

const AGORA = 1_790_000_000_000
const sub = (status: string, valeAte: number | null = AGORA + 86_400_000, plano = 'premium') => ({
  configurado: true,
  assinatura: { plano, status, valeAte, provedor: 'asaas' },
})

describe('estadoDaConta', () => {
  it('self-host é self-host, com ou sem assinatura', () => {
    expect(estadoDaConta('selfhost', sub('active'), AGORA).estado).toBe('selfhost')
  })

  it('ativa, pagamento pendente e cancelada vêm do status do servidor', () => {
    expect(estadoDaConta('premium', sub('active'), AGORA)).toEqual({
      estado: 'ativa',
      plano: 'premium',
      valeAte: AGORA + 86_400_000,
    })
    expect(estadoDaConta('premium', sub('past_due'), AGORA).estado).toBe('falhou')
    expect(estadoDaConta('premium', sub('canceled'), AGORA).estado).toBe('cancelada')
  })

  it('cancelada com o período vencido volta ao Grátis', () => {
    expect(estadoDaConta('free', sub('canceled', AGORA - 1), AGORA).estado).toBe('gratis')
  })

  it('checkout iniciado (trialing) NÃO é assinatura: o pagamento não confirmou', () => {
    const c = estadoDaConta('free', sub('trialing'), AGORA)
    expect(c.estado).toBe('gratis')
    expect(temAssinatura(c.estado)).toBe(false)
  })

  it('plano pago sem cobrança no provedor fica ativo, sem data', () => {
    expect(estadoDaConta('premium', { configurado: true, assinatura: null }, AGORA)).toEqual({
      estado: 'ativa',
      plano: 'premium',
      valeAte: null,
    })
  })

  it('anônimo e grátis sem assinatura são Grátis', () => {
    expect(estadoDaConta('anonimo', null, AGORA).estado).toBe('gratis')
    expect(estadoDaConta('free', null, AGORA).estado).toBe('gratis')
  })

  it('o servidor anterior manda o nome antigo (`pro`), e a conta é do Premium', () => {
    expect(estadoDaConta('free', sub('active', AGORA + 1000, 'pro'), AGORA)).toMatchObject({
      estado: 'ativa',
      plano: 'premium',
    })
  })

  /* Matriz v3: `essencial` deixou de ser apelido do Premium e `aovivo` é plano novo. A conta mostra o
     plano que o servidor disse, da assinatura ou concedido pelo admin (sem cobrança). */
  it('matriz v3: a conta do Essencial é do Essencial, e a do Ao Vivo é do Ao Vivo', () => {
    expect(estadoDaConta('essencial', { configurado: true, assinatura: null }, AGORA)).toMatchObject({
      estado: 'ativa',
      plano: 'essencial',
    })
    expect(estadoDaConta('aovivo', sub('active', AGORA + 1000, 'aovivo'), AGORA)).toMatchObject({
      estado: 'ativa',
      plano: 'aovivo',
    })
  })

  it('o ciclo da assinatura chega à conta quando o servidor o diz (o anual do C5)', () => {
    const anual = { configurado: true, assinatura: { ...sub('active').assinatura, ciclo: 'anual' as const } }
    expect(estadoDaConta('premium', anual, AGORA)).toMatchObject({ estado: 'ativa', ciclo: 'anual' })
  })
})

describe('formatação', () => {
  it('brl e data no formato do protótipo', () => {
    expect(brl(19.9)).toBe('R$ 19,90')
    expect(dataCurta('2026-10-22')).toBe('22/10/2026')
    expect(dataCurta(null)).toBe('—')
  })

  it('a fatura em aberto é a atrasada/pendente que tem página para pagar', () => {
    const base = { descricao: 'Premium · mensal', valor: 1, metodo: null, recibo: null, data: null }
    expect(
      faturaEmAberto([
        { ...base, id: 'a', status: 'paga', link: 'https://www.asaas.com/i/a' },
        { ...base, id: 'b', status: 'falhou', link: null },
        { ...base, id: 'c', status: 'falhou', link: 'https://www.asaas.com/i/c' },
      ])?.id,
    ).toBe('c')
    expect(faturaEmAberto(null)).toBeNull()
  })
})
