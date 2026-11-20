// @vitest-environment jsdom
/**
 * A EXPLICAÇÃO DA FRASE NA TELA (planos v4, etapa 2, Task 2): a seção "Explicar esta frase" da folha da
 * frase e do diálogo do computador. Cobre os estados: flag desligada, sem consentimento, carregando,
 * resultado (com e sem gíria), contador da amostra, fim da amostra (adulto com link neutro, protegido sem
 * link nem preço), pool global (sem número), cota do mês, 502 e uso justo.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExplicacaoDaFrase from '../src/components/views/captura/estudo/ExplicacaoDaFrase'

const api = vi.hoisted(() => ({ explicarFrase: vi.fn() }))
vi.mock('../src/data/apiDoEstudo', () => api)
const nuvem = vi.hoisted(() => ({ consentiu: true, autorizar: vi.fn() }))
vi.mock('../src/lib/consentimentoDeNuvem', () => ({ useConsentimentoDeNuvem: () => nuvem }))
const flag = vi.hoisted(() => ({ ligada: true }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => flag.ligada }))
const protecao = vi.hoisted(() => ({ protegido: false }))
vi.mock('../src/lib/protecaoDoMenor', () => ({ perfilProtegido: () => protecao.protegido }))

const fala = { texto: 'I would have gone if I had known.', traducao: 'Eu teria ido se soubesse.', lang: 'en-US' }
const EXPLICACAO = {
  porQue: 'Usei "teria ido" para manter o condicional do original.',
  gramatica: 'Terceiro condicional: would have + particípio.',
  registro: 'Neutro, serve na fala e na escrita.',
  girias: [] as { termo: string; sentido: string }[],
}
const ok = (extra: object = {}) => ({
  ok: true,
  valor: { explicacao: EXPLICACAO, origem: 'plano', restanteNaAmostra: null, ...extra },
})
const falha = (motivo: string, extra: object = {}) => ({ ok: false, motivo, status: 402, ...extra })

function montar(aoConhecer?: () => void) {
  return render(
    <ExplicacaoDaFrase fala={fala} destino="pt-BR" contexto={['Ola', 'Tudo bem?']} aoConhecer={aoConhecer} />,
  )
}
const pedir = () => fireEvent.click(screen.getByRole('button', { name: /Explicar esta frase/ }))

afterEach(cleanup)
beforeEach(() => {
  api.explicarFrase.mockReset()
  nuvem.consentiu = true
  nuvem.autorizar.mockReset()
  flag.ligada = true
  protecao.protegido = false
})

describe('ExplicacaoDaFrase', () => {
  it('flag desligada: a seção não aparece e nada é pedido', () => {
    flag.ligada = false
    const { container } = montar()
    expect(container.textContent).toBe('')
    expect(api.explicarFrase).not.toHaveBeenCalled()
  })

  it('sem consentimento de nuvem: só "Autorizar IA de nuvem", e nenhum pedido sai', async () => {
    nuvem.consentiu = false
    montar()
    expect(await screen.findByRole('button', { name: /Autorizar IA de nuvem/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Explicar esta frase/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Autorizar IA de nuvem/ }))
    expect(nuvem.autorizar).toHaveBeenCalled()
    expect(api.explicarFrase).not.toHaveBeenCalled()
  })

  it('carregando e depois os blocos curtos, sem "Gíria" quando não há gíria, com o aviso de IA', async () => {
    let resolver!: (v: unknown) => void
    api.explicarFrase.mockReturnValue(new Promise((r) => (resolver = r)))
    montar()
    pedir()
    expect(await screen.findByText(/Explicando a frase/)).toBeTruthy()
    expect(api.explicarFrase).toHaveBeenCalledWith({
      texto: fala.texto,
      traducao: fala.traducao,
      lang: 'en-US',
      langDaTraducao: 'pt-BR',
      contexto: ['Ola', 'Tudo bem?'],
    })
    resolver(ok())
    expect(await screen.findByText('Por que essa tradução')).toBeTruthy()
    expect(screen.getByText(EXPLICACAO.porQue)).toBeTruthy()
    expect(screen.getByText('Gramática')).toBeTruthy()
    expect(screen.getByText('Registro')).toBeTruthy()
    expect(screen.queryByText('Gíria')).toBeNull()
    expect(screen.getByText(/Isto é uma IA/)).toBeTruthy()
    expect(screen.queryByText(/de 5/)).toBeNull()
  })

  it('mostra a gíria quando houver', async () => {
    api.explicarFrase.mockResolvedValue(
      ok({ explicacao: { ...EXPLICACAO, girias: [{ termo: 'gonna', sentido: 'forma falada de going to' }] } }),
    )
    montar()
    pedir()
    expect(await screen.findByText('Gíria')).toBeTruthy()
    expect(screen.getByText('gonna')).toBeTruthy()
    expect(screen.getByText(/forma falada de going to/)).toBeTruthy()
  })

  it('amostra do Grátis: depois do primeiro uso mostra quantas das 5 de hoje foram usadas', async () => {
    api.explicarFrase.mockResolvedValue(ok({ origem: 'amostra', restanteNaAmostra: 3 }))
    montar()
    pedir()
    expect(await screen.findByText(/2 de 5/)).toBeTruthy()
  })

  it('fim da amostra, adulto: frase neutra, "volta amanhã" e link para os planos', async () => {
    api.explicarFrase.mockResolvedValue(falha('amostra_acabou', { restanteNaAmostra: 2 }))
    const aoConhecer = vi.fn()
    const { container } = montar(aoConhecer)
    pedir()
    expect(await screen.findByText(/A amostra de hoje acabou/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/\d/)
    fireEvent.click(screen.getByRole('button', { name: /Ver os planos/ }))
    expect(aoConhecer).toHaveBeenCalled()
    expect(container.textContent).not.toMatch(/R\$|%|últim|só hoje/i)
  })

  it('fim da amostra, perfil protegido: só "volta amanhã", sem link nem preço, mesmo que receba aoConhecer', async () => {
    protecao.protegido = true
    api.explicarFrase.mockResolvedValue(falha('amostra_acabou'))
    const { container } = montar(vi.fn())
    pedir()
    expect(await screen.findByText(/Volta amanhã/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /planos/i })).toBeNull()
    expect(container.textContent).not.toMatch(/R\$|plano|Premium|Plus/i)
  })

  it('cota do mês esgotada (plano pago): diz quando voltam, sem oferta', async () => {
    api.explicarFrase.mockResolvedValue(falha('cota_do_mes'))
    const { container } = montar(vi.fn())
    pedir()
    expect(await screen.findByText(/explicações deste mês/)).toBeTruthy()
    expect(container.textContent).toMatch(/voltam/)
    expect(screen.queryByRole('button', { name: /planos/i })).toBeNull()
  })

  it('uso justo do dia nunca vira oferta', async () => {
    api.explicarFrase.mockResolvedValue(falha('uso_justo', { status: 429 }))
    const { container } = montar(vi.fn())
    pedir()
    expect(await screen.findByText(/limite de hoje/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /planos/i })).toBeNull()
    expect(container.textContent).not.toMatch(/R\$|Premium|Plus/)
  })

  it('erro 502: "Não deu para explicar agora", a seção continua e dá para tentar de novo', async () => {
    api.explicarFrase.mockResolvedValueOnce(falha('indisponivel', { status: 502 }))
    montar()
    pedir()
    expect(await screen.findByText('Não deu para explicar agora.')).toBeTruthy()
    api.explicarFrase.mockResolvedValueOnce(ok())
    pedir()
    await waitFor(() => expect(screen.getByText(EXPLICACAO.porQue)).toBeTruthy())
  })

  it('convidado ou sem conta: pede para entrar, sem oferta', async () => {
    api.explicarFrase.mockResolvedValue(falha('sem_conta', { status: 401 }))
    montar(vi.fn())
    pedir()
    expect(await screen.findByText(/Entre na sua conta/)).toBeTruthy()
  })

  it('sem_plano (logado, plano sem a cota): frase própria, sem "Entre na sua conta" e sem link', async () => {
    api.explicarFrase.mockResolvedValue(falha('sem_plano'))
    const { container } = montar(vi.fn())
    pedir()
    expect(await screen.findByText(/não está disponível nesta conta/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/Entre na sua conta/)
    expect(screen.queryByRole('button', { name: /planos/i })).toBeNull()
  })

  it('o aviso (role="status") já está montado antes do pedido; só o texto troca', async () => {
    api.explicarFrase.mockResolvedValue(falha('indisponivel', { status: 502 }))
    montar()
    const aviso = screen.getByRole('status')
    expect(aviso.textContent).toBe('')
    pedir()
    await waitFor(() => expect(aviso.textContent).toBe('Não deu para explicar agora.'))
    expect(screen.getByRole('status')).toBe(aviso)
  })

  it('trocar o idioma de destino da mesma frase descarta a explicação anterior', async () => {
    api.explicarFrase.mockResolvedValue(ok())
    const { rerender } = montar()
    pedir()
    expect(await screen.findByText(EXPLICACAO.porQue)).toBeTruthy()
    rerender(<ExplicacaoDaFrase fala={fala} destino="es" contexto={['Ola', 'Tudo bem?']} />)
    await waitFor(() => expect(screen.queryByText(EXPLICACAO.porQue)).toBeNull())
  })

  it('flag velha no cache (404 recurso_indisponivel): a seção some em vez de mostrar erro', async () => {
    api.explicarFrase.mockResolvedValue(falha('fora', { status: 404 }))
    const { container } = montar()
    pedir()
    await waitFor(() => expect(container.textContent).toBe(''))
  })
})
