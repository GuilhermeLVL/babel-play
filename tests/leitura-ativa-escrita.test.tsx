// @vitest-environment jsdom
/**
 * A ESCRITA DA LEITURA ATIVA NA TELA (spec `leitura-ativa-escrita`, ux T5/T5b). A API da IA é SIMULADA
 * (`pedirRetornoDaEscrita` trocado): nenhuma chamada sai.
 *
 * O que se prova: 12 palavras desativa o pedido; e-mail bloqueia sem requisição e sublinha o trecho; rascunho fica no
 * aparelho; Grátis confere sozinho (contagem e palavras-alvo usadas) com a linha neutra e "Ver planos"; perfil
 * protegido sem plano; o retorno marca 3 frases, mostra elogio, dicas, "Ver um exemplo" e o selo; erro com "Tentar de
 * novo"; cota esgotada com a data e "Conferir sozinho"; o reenvio mostra "✓ Resolvido" e some.
 */
import { readFileSync } from 'node:fs'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FichaDeTexto } from '../src/core/leitura/fichaDeTexto'
import textos from '../src/data/leitura/textos.json'

const api = vi.hoisted(() => ({ pedidos: [] as unknown[], respostas: [] as unknown[] }))
vi.mock('../src/data/apiDoEstudo', async (orig) => ({
  ...(await orig<typeof import('../src/data/apiDoEstudo')>()),
  pedirRetornoDaEscrita: async (p: unknown) => {
    api.pedidos.push(p)
    return api.respostas.shift() ?? { ok: false, motivo: 'indisponivel' }
  },
}))

const conta = vi.hoisted(() => ({ plan: 'plus' as string, teste: null as { terminaEm: number } | null }))
vi.mock('../src/lib/entitlements', async (orig) => {
  const real = await orig<typeof import('../src/lib/entitlements')>()
  return { ...real, getEntitlements: () => ({ ...real.getEntitlements(), plan: conta.plan, teste: conta.teste }) }
})
vi.mock('../src/lib/identidade', async (orig) => ({
  ...(await orig<typeof import('../src/lib/identidade')>()),
  estadoDeIdentidade: () => 'conta',
}))

const { default: EscritaDoTexto, acessoDaEscrita } = await import('../src/components/views/leituraAtiva/EscritaDoTexto')

const MERCADO = textos.find((t) => t.id === 'a1-no-mercado') as FichaDeTexto
const VINTE_E_DUAS =
  'In the morning I go to the market with my dad. I buy six green apples. I see my friend Ben and his happy dog.'

function abrir(acesso: 'retorno' | 'conferir' | 'restrito', aoTerminar = () => {}, protegido = false) {
  return render(<EscritaDoTexto ficha={MERCADO} acesso={acesso} protegido={protegido} aoTerminar={aoTerminar} />)
}
const escrever = (texto: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value: texto } })
const ok = (retorno: unknown) => ({ ok: true, valor: retorno })

beforeEach(() => {
  api.pedidos.length = 0
  api.respostas.length = 0
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('escrever', () => {
  it('com 12 palavras o pedido fica desativado e diz o mínimo', () => {
    abrir('retorno')
    escrever('Lia goes to the market with her dad and buys six apples.')
    expect(screen.getByText('12 palavras')).toBeTruthy()
    expect((screen.getByTestId('pedir-retorno') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('limite-da-escrita').textContent).toBe('20 palavras ou mais para pedir retorno')
  })

  it('e-mail no texto: nada é enviado e o trecho fica sublinhado com o aviso', async () => {
    abrir('retorno')
    escrever(`${VINTE_E_DUAS} My email is lia@exemplo.com`)
    await act(async () => fireEvent.click(screen.getByTestId('pedir-retorno')))
    expect(api.pedidos).toHaveLength(0)
    const aviso = screen.getByTestId('dado-pessoal')
    expect(aviso.textContent).toContain('Tire esta parte antes de enviar: o Frasy não precisa de dados pessoais.')
    expect(aviso.querySelector('mark')?.textContent).toBe('lia@exemplo.com')
  })

  it('o rascunho fica no aparelho e volta ao reabrir, sem requisição', () => {
    vi.useFakeTimers()
    abrir('retorno')
    escrever(VINTE_E_DUAS)
    act(() => vi.advanceTimersByTime(1200))
    cleanup()
    abrir('retorno')
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(VINTE_E_DUAS)
    expect(api.pedidos).toHaveLength(0)
  })

  it('o chip insere a palavra do texto e ganha ✓ quando usada', () => {
    abrir('conferir')
    escrever('I like the')
    fireEvent.click(screen.getByRole('button', { name: 'morning' }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('morning')
    expect(screen.getByRole('button', { name: 'morning ✓' })).toBeTruthy()
  })
})

describe('Grátis e conta restrita', () => {
  it('confere sozinho: contagem, "morning" e "friend" usadas, nenhuma requisição; linha neutra com "Ver planos"', () => {
    abrir('conferir')
    expect(screen.getByTestId('linha-dos-planos').textContent).toContain('O retorno com IA faz parte dos planos pagos.')
    expect(screen.getByRole('button', { name: 'Ver planos' })).toBeTruthy()
    expect(screen.queryByTestId('pedir-retorno')).toBeNull()
    escrever('Good morning, my friend. I like apples')
    fireEvent.click(screen.getByTestId('conferir-sozinho'))
    const r = screen.getByTestId('leitura-ativa-conferido')
    expect(r.textContent).toContain('7 palavras')
    expect([...r.querySelectorAll('[data-usada]')].map((e) => e.textContent)).toEqual(['morning ✓', 'friend ✓'])
    expect(r.textContent).toContain('I like apples')
    expect(api.pedidos).toHaveLength(0)
  })

  it('perfil protegido ou conta restrita: só "Conferir sozinho", sem falar de plano', () => {
    const { container } = abrir('restrito')
    expect(screen.getByTestId('conferir-sozinho')).toBeTruthy()
    expect(container.textContent).not.toMatch(/plano/i)
  })
})

describe('o retorno da IA (simulada)', () => {
  const RETORNO = {
    elogio: 'Você contou na ordem certa e usou “morning”.',
    pontos: [
      { trecho: 'I go', tipo: 'tempoVerbal', dica: 'A história está no passado.', exemplo: 'I went' },
      { trecho: 'I buy', tipo: 'tempoVerbal', dica: 'De novo o passado.', exemplo: 'I bought' },
      { trecho: 'I see', tipo: 'tempoVerbal', dica: 'Qual é o passado de see?', exemplo: 'I saw' },
    ],
    resolvidos: [],
  }

  it('marca 3 trechos com 1, 2 e 3, mostra o elogio, as dicas, "Ver um exemplo" e o selo', async () => {
    api.respostas.push(ok(RETORNO))
    abrir('retorno')
    escrever(VINTE_E_DUAS)
    await act(async () => fireEvent.click(screen.getByTestId('pedir-retorno')))
    expect(api.pedidos).toEqual([{ textoId: 'a1-no-mercado', tarefa: 'reescrever', escrita: VINTE_E_DUAS }])
    const r = screen.getByTestId('leitura-ativa-retorno')
    expect([...r.querySelectorAll('mark[data-ponto]')].map((m) => m.getAttribute('data-ponto'))).toEqual([
      '1',
      '2',
      '3',
    ])
    expect(r.textContent).toContain('Você contou na ordem certa')
    expect(r.textContent).toContain('Qual é o passado de see?')
    expect(r.textContent).not.toContain('I saw')
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver um exemplo' })[2])
    expect(r.textContent).toContain('I saw')
    expect(r.textContent).toContain('Retorno feito por IA. Ela pode errar.')
  })

  it('erro da IA: "Não deu para ler seu texto agora." com "Tentar de novo"', async () => {
    api.respostas.push({ ok: false, motivo: 'indisponivel' })
    abrir('retorno')
    escrever(VINTE_E_DUAS)
    await act(async () => fireEvent.click(screen.getByTestId('pedir-retorno')))
    expect(screen.getByTestId('erro-da-escrita').textContent).toBe('Não deu para ler seu texto agora.')
    api.respostas.push(ok(RETORNO))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' })))
    expect(screen.getByTestId('leitura-ativa-retorno')).toBeTruthy()
  })

  it('cota esgotada: a data em que volta e "Conferir sozinho", sem oferta de plano', async () => {
    api.respostas.push({ ok: false, motivo: 'cota_esgotada', limite: 30, voltam: 'em 1 de dezembro' })
    const { container } = abrir('retorno')
    escrever(VINTE_E_DUAS)
    await act(async () => fireEvent.click(screen.getByTestId('pedir-retorno')))
    expect(screen.getByTestId('cota-da-escrita').textContent).toBe(
      'Você usou os 30 retornos deste mês. Eles voltam em 1 de dezembro.',
    )
    expect(screen.getByTestId('conferir-sozinho')).toBeTruthy()
    expect(container.textContent).not.toMatch(/Ver planos/)
  })

  it('o reenvio manda os trechos, marca "✓ Resolvido" e o botão some', async () => {
    api.respostas.push(ok(RETORNO))
    abrir('retorno')
    escrever(VINTE_E_DUAS)
    await act(async () => fireEvent.click(screen.getByTestId('pedir-retorno')))
    fireEvent.click(screen.getByTestId('corrigir-e-mandar'))
    const corrigido = VINTE_E_DUAS.replace('I go', 'I went').replace('I buy', 'I bought')
    escrever(corrigido)
    api.respostas.push(ok({ elogio: 'Bem melhor.', pontos: [RETORNO.pontos[2]], resolvidos: ['I go', 'I buy'] }))
    await act(async () => fireEvent.click(screen.getByTestId('pedir-retorno')))
    expect((api.pedidos[1] as { anteriores: string[] }).anteriores).toEqual(['I go', 'I buy', 'I see'])
    const r = screen.getByTestId('leitura-ativa-retorno')
    expect(r.querySelectorAll('[data-resolvido]')).toHaveLength(2)
    expect(r.textContent).toContain('✓ Resolvido')
    expect(r.textContent).toContain('Você resolveu 2 de 3. Ótimo trabalho.')
    expect(screen.queryByTestId('corrigir-e-mandar')).toBeNull()
  })

  it('o 403 do servidor (teste de 3 dias) vira a conferência no aparelho', async () => {
    api.respostas.push({ ok: false, motivo: 'sem_plano' })
    abrir('retorno')
    escrever(VINTE_E_DUAS)
    await act(async () => fireEvent.click(screen.getByTestId('pedir-retorno')))
    expect(screen.getByTestId('conferir-sozinho')).toBeTruthy()
  })

  it('o 403 com perfil protegido (plano vencido no cache) vira só a conferência, sem falar de plano', async () => {
    api.respostas.push({ ok: false, motivo: 'sem_plano' })
    const { container } = abrir('retorno', () => {}, true)
    escrever(VINTE_E_DUAS)
    await act(async () => fireEvent.click(screen.getByTestId('pedir-retorno')))
    expect(screen.getByTestId('conferir-sozinho')).toBeTruthy()
    expect(screen.queryByTestId('linha-dos-planos')).toBeNull()
    expect(container.textContent).not.toMatch(/plano/i)
  })
})

describe('acessoDaEscrita', () => {
  afterEach(() => {
    conta.plan = 'plus'
    conta.teste = null
  })
  it('plano pago com conta: retorno', () => {
    expect(acessoDaEscrita(false)).toBe('retorno')
  })
  it('no teste de 3 dias o servidor recusa: conferência (adulto) ou restrito (protegido), nunca o pedido', () => {
    conta.teste = { terminaEm: Date.now() + 86_400_000 }
    expect(acessoDaEscrita(false)).toBe('conferir')
    expect(acessoDaEscrita(true)).toBe('restrito')
  })
  it('Grátis: conferência para adulto e restrito para protegido', () => {
    conta.plan = 'free'
    expect(acessoDaEscrita(false)).toBe('conferir')
    expect(acessoDaEscrita(true)).toBe('restrito')
  })
})

describe('o texto da etapa de escrita', () => {
  it('não usa urgência, escassez, culpa nem contagem regressiva', () => {
    const fonte = readFileSync('src/components/views/leituraAtiva/EscritaDoTexto.tsx', 'utf8')
    const textosDeUi = [...fonte.matchAll(/t\(\s*'([^']+)'/g)].map((m) => m[1])
    expect(textosDeUi.length).toBeGreaterThan(20)
    for (const s of textosDeUi)
      expect(s, s).not.toMatch(
        /últim[oa]s?|só hoje|corra|não perca|perder|acaba em|restam|urgente|agora mesmo|apenas \d|oferta|desconto|culpa|vergonha/i,
      )
  })
})

void React
