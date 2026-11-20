// @vitest-environment jsdom
/**
 * O RESUMO DA SESSÃO NA REVISÃO (planos v4, etapa 2, Task 3): "Resumir a sessão" mostra 3 pontos e os cartões
 * propostos, todos marcados; "Adicionar N cartões" manda ao bulk-add SÓ os marcados e diz quantos entraram e quais
 * ficaram de fora (com o motivo legível). Os estados de consentimento, amostra (Grátis: 1 por semana) e perfil
 * protegido são os da explicação da frase.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ResumoDaSessao from '../src/components/views/analise/ResumoDaSessao'

const api = vi.hoisted(() => ({ resumirSessao: vi.fn() }))
vi.mock('../src/data/apiDoEstudo', () => api)
const deck = vi.hoisted(() => ({ bulkAddCards: vi.fn() }))
vi.mock('../src/data/api', () => deck)
const nuvem = vi.hoisted(() => ({ consentiu: true, autorizar: vi.fn() }))
vi.mock('../src/lib/consentimentoDeNuvem', () => ({ useConsentimentoDeNuvem: () => nuvem }))
const flag = vi.hoisted(() => ({ ligada: true }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => flag.ligada }))
const protecao = vi.hoisted(() => ({ protegido: false }))
vi.mock('../src/lib/protecaoDoMenor', () => ({ perfilProtegido: () => protecao.protegido }))

const PONTOS = ['Combinaram um café.', 'Alguém estava atrasado.', 'A tarefa foi fácil.']
const CARTOES = [
  {
    word: 'grab a coffee',
    back: 'tomar um café',
    sentence: 'We should grab a coffee sometime.',
    srcLang: 'en',
    tgtLang: 'pt-BR',
  },
  { word: 'running late', back: 'atrasado', sentence: 'I am running late.', srcLang: 'en', tgtLang: 'pt-BR' },
  { word: 'piece of cake', back: 'moleza', sentence: 'It was a piece of cake.', srcLang: 'en', tgtLang: 'pt-BR' },
]
const ok = (extra: object = {}) => ({
  ok: true,
  valor: { pontos: PONTOS, cartoes: CARTOES, origem: 'plano', restanteNaAmostra: null, ...extra },
})
const falha = (motivo: string, extra: object = {}) => ({ ok: false, motivo, status: 402, ...extra })

function montar(props: { aoConhecer?: () => void; aoAdicionar?: (n: unknown[]) => void } = {}) {
  return render(<ResumoDaSessao sessionId="s-1" lang="pt-BR" {...props} />)
}
const resumir = () => fireEvent.click(screen.getByRole('button', { name: /Resumir a sessão/ }))

afterEach(cleanup)
beforeEach(() => {
  api.resumirSessao.mockReset()
  deck.bulkAddCards.mockReset()
  nuvem.consentiu = true
  nuvem.autorizar.mockReset()
  flag.ligada = true
  protecao.protegido = false
})

describe('ResumoDaSessao', () => {
  it('flag desligada: nada aparece e nada é pedido', () => {
    flag.ligada = false
    const { container } = montar()
    expect(container.textContent).toBe('')
    expect(api.resumirSessao).not.toHaveBeenCalled()
  })

  it('sem consentimento de nuvem: só "Autorizar IA de nuvem", e nenhum pedido sai', async () => {
    nuvem.consentiu = false
    montar()
    expect(await screen.findByText(/ainda não autorizou/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Resumir a sessão/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Autorizar IA de nuvem/ }))
    expect(nuvem.autorizar).toHaveBeenCalled()
    expect(api.resumirSessao).not.toHaveBeenCalled()
  })

  it('mostra os 3 pontos e os cartões, todos marcados; pede com a sessão e o idioma', async () => {
    api.resumirSessao.mockResolvedValue(ok())
    montar()
    resumir()
    for (const p of PONTOS) expect(await screen.findByText(p)).toBeTruthy()
    expect(api.resumirSessao).toHaveBeenCalledWith({ sessionId: 's-1', lang: 'pt-BR' })
    const caixas = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(caixas).toHaveLength(3)
    expect(caixas.every((c) => c.checked)).toBe(true)
    expect(screen.getByRole('button', { name: 'Adicionar 3 cartões' })).toBeTruthy()
    expect(screen.getByText(/Isto é uma IA e pode errar/)).toBeTruthy()
  })

  it('adiciona SÓ os marcados e diz quantos entraram e quais ficaram de fora, com o motivo', async () => {
    api.resumirSessao.mockResolvedValue(ok())
    deck.bulkAddCards.mockResolvedValue({
      cards: [{ id: 'c1', word: 'grab a coffee' }],
      skipped: [{ word: 'piece of cake', motivo: 'duplicada' }],
    })
    const aoAdicionar = vi.fn()
    montar({ aoAdicionar })
    resumir()
    await screen.findByText(PONTOS[0])
    fireEvent.click(screen.getByRole('checkbox', { name: /running late/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar 2 cartões' }))
    await waitFor(() => expect(deck.bulkAddCards).toHaveBeenCalledTimes(1))
    const enviados = deck.bulkAddCards.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(enviados.map((c) => c.word)).toEqual(['grab a coffee', 'piece of cake'])
    expect(enviados[0]).toMatchObject({
      word: 'grab a coffee',
      back: 'tomar um café',
      sentence: 'We should grab a coffee sometime.',
      srcLang: 'en',
      tgtLang: 'pt-BR',
      sessionId: 's-1',
    })
    expect(await screen.findByText('1 cartão entrou no seu baralho.')).toBeTruthy()
    const fora = screen.getAllByRole('listitem').find((li) => li.textContent?.startsWith('piece of cake'))
    expect(fora?.textContent).toBe('piece of cake: Já está no seu baralho')
    expect(aoAdicionar).toHaveBeenCalledWith([{ id: 'c1', word: 'grab a coffee' }])
    /* O que já foi tratado não volta a ser oferecido: só o desmarcado continua escolhível. */
    expect((screen.getByRole('checkbox', { name: /grab a coffee/ }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: /piece of cake/ }) as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /running late/ }))
    expect(screen.getByRole('button', { name: 'Adicionar 1 cartão' })).toBeTruthy()
  })

  it('nenhum marcado: o botão de adicionar fica desabilitado', async () => {
    api.resumirSessao.mockResolvedValue(ok({ cartoes: [CARTOES[0]] }))
    montar()
    resumir()
    await screen.findByText(PONTOS[0])
    fireEvent.click(screen.getByRole('checkbox'))
    expect((screen.getByRole('button', { name: /Adicionar 0 cartões/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('sem cartões propostos: os pontos e uma frase, sem botão de adicionar', async () => {
    api.resumirSessao.mockResolvedValue(ok({ cartoes: [] }))
    montar()
    resumir()
    expect(await screen.findByText(/Nenhuma frase desta sessão virou cartão/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Adicionar/ })).toBeNull()
  })

  it('o bulk-add falhou: diz que não deu, e os cartões continuam para tentar de novo', async () => {
    api.resumirSessao.mockResolvedValue(ok())
    deck.bulkAddCards.mockRejectedValue(new Error('500'))
    montar()
    resumir()
    await screen.findByText(PONTOS[0])
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar 3 cartões' }))
    expect(await screen.findByText('Não deu para adicionar os cartões agora.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Adicionar 3 cartões' })).toBeTruthy()
  })

  it('amostra do Grátis: diz quantos resumos da semana foram usados', async () => {
    api.resumirSessao.mockResolvedValue(ok({ origem: 'amostra', restanteNaAmostra: 0 }))
    montar()
    resumir()
    expect(await screen.findByText(/Você usou 1 de 1 resumo nesta semana/)).toBeTruthy()
  })

  it('fim da amostra, adulto: frase neutra e o link para os planos, sem número nem preço', async () => {
    api.resumirSessao.mockResolvedValue(falha('amostra_acabou'))
    const aoConhecer = vi.fn()
    montar({ aoConhecer })
    resumir()
    const aviso = await screen.findByText(/O resumo desta semana já foi usado/)
    expect(aviso.textContent).not.toMatch(/\d|R\$|%/)
    fireEvent.click(screen.getByRole('button', { name: 'Ver os planos' }))
    expect(aoConhecer).toHaveBeenCalled()
  })

  it('fim da amostra, perfil protegido: só o que continua funcionando, sem link nem preço', async () => {
    protecao.protegido = true
    api.resumirSessao.mockResolvedValue(falha('amostra_acabou'))
    const { container } = montar({ aoConhecer: vi.fn() })
    resumir()
    expect(await screen.findByText(/O resumo desta semana já foi usado/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /planos/i })).toBeNull()
    expect(container.textContent).not.toMatch(/R\$|Premium|Plus/)
  })

  it('sem_plano: frase própria, sem "Entre na sua conta" e sem link', async () => {
    api.resumirSessao.mockResolvedValue(falha('sem_plano'))
    const { container } = montar({ aoConhecer: vi.fn() })
    resumir()
    expect(await screen.findByText(/não está disponível nesta conta/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/Entre na sua conta/)
    expect(screen.queryByRole('button', { name: /planos/i })).toBeNull()
  })

  it('cota do mês, uso justo e sessão curta: sem oferta', async () => {
    for (const [motivo, frase] of [
      ['cota_do_mes', /resumos deste mês/],
      ['uso_justo', /limite de hoje/],
      ['sessao_curta', /pelo menos 4 falas/],
    ] as const) {
      api.resumirSessao.mockResolvedValue(falha(motivo))
      const { container, unmount } = montar({ aoConhecer: vi.fn() })
      resumir()
      expect(await screen.findByText(frase)).toBeTruthy()
      expect(screen.queryByRole('button', { name: /planos/i })).toBeNull()
      expect(container.textContent).not.toMatch(/R\$|Premium|Plus/)
      unmount()
    }
  })

  it('erro 502: "Não deu para resumir agora" e dá para tentar de novo; o aviso (role="status") é sempre o mesmo', async () => {
    api.resumirSessao.mockResolvedValueOnce(falha('indisponivel', { status: 502 }))
    montar()
    const aviso = screen.getByRole('status')
    expect(aviso.textContent).toBe('')
    resumir()
    await waitFor(() => expect(aviso.textContent).toBe('Não deu para resumir agora.'))
    api.resumirSessao.mockResolvedValueOnce(ok())
    resumir()
    expect(await screen.findByText(PONTOS[1])).toBeTruthy()
    expect(screen.getByRole('status')).toBe(aviso)
  })

  it('flag velha no cache (404 recurso_indisponivel): a seção some', async () => {
    api.resumirSessao.mockResolvedValue(falha('fora', { status: 404 }))
    const { container } = montar()
    resumir()
    await waitFor(() => expect(container.textContent).toBe(''))
  })
})
