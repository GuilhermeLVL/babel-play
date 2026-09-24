// @vitest-environment jsdom
/**
 * O iCHAT DO PROTÓTIPO NO APP — comportamento, com o tutor e o caderno simulados na borda.
 *
 * Trava o que o dono validou no protótipo (`docs/prototipos/consistencia-telas.html`, iChat
 * contextual): abrir pelo botão, as sugestões do vazio, a ficha `@palavra` que vai junto como
 * material, a etapa "consultando…", a origem e a proposta que só roda com confirmação, a lacuna
 * que nem chega ao modelo e as conversas salvas (nova, renomear, apagar).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React, { useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('../src/data/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('../src/data/rotas/vocabulario', () => ({
  fetchDeck: async () => [
    {
      id: '1',
      word: 'leverage',
      translation: 'alavancar',
      cefrLevel: 'B2',
      sentence: 'We can leverage it.',
      inDeck: true,
    },
    { id: '2', word: 'deadline', translation: 'prazo', inDeck: true },
  ],
  exportarApkg: vi.fn(),
}))
/* O tutor é nuvem e exige o consentimento de Ajustes → Privacidade (Fase 2 do lançamento). Os casos
   daqui supõem o "sim"; o caso sem consentimento liga a chave abaixo. */
let consentiu = true
vi.mock('../src/lib/consentimentoDeNuvem', () => ({
  consentiuNuvem: () => consentiu,
  useConsentimentoDeNuvem: () => ({ consentiu, autorizar: async () => true }),
}))
vi.mock('../src/lib/ichatContext', async (orig) => ({
  ...(await orig<typeof import('../src/lib/ichatContext')>()),
  construirContextoDaTela: async () => 'Tela: Vocabulário (conteúdo real).',
}))

import IChat from '../src/components/IChat'
import type { AppMetrics } from '../src/core/learning/contract'

const metrics = { deckSize: 2, dueToday: 2, streakDays: 1, reviews: 0 } as unknown as AppMetrics

function Casca({ onChangeView = vi.fn() }: { onChangeView?: (v: string, d?: unknown) => void }) {
  const [aberto, setAberto] = useState(false)
  const [fixo, setFixo] = useState(false)
  return (
    <main>
      <IChat
        activeView="metrics"
        selectedRecording={null}
        liveTranscription=""
        onChangeView={onChangeView}
        isOpen={aberto}
        setIsOpen={setAberto}
        isDocked={fixo}
        setIsDocked={setFixo}
        recordings={[]}
        metrics={metrics}
      />
    </main>
  )
}

const responder = (text: string) =>
  apiFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ text }) } as unknown as Response)

async function abrir(extra?: Parameters<typeof Casca>[0]) {
  render(<Casca {...extra} />)
  fireEvent.click(screen.getByRole('button', { name: 'Abrir o iChat' }))
  await screen.findByText(/Sou o iChat do seu estudo/)
  return screen.getByLabelText('Pergunte ao iChat') as HTMLInputElement
}

describe('iChat', () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver
  })
  beforeEach(() => {
    localStorage.clear()
    apiFetch.mockReset()
  })
  afterEach(cleanup)

  it('abre no vazio do protótipo: saudação, 4 sugestões e o contexto da tela', async () => {
    await abrir()
    for (const s of [
      'O que revisar hoje?',
      'Resumir esta sessão',
      'Qual jogo começo?',
      'Crie uma frase com as minhas palavras',
    ])
      expect(screen.getByRole('button', { name: s })).toBeTruthy()
    expect(screen.getByText(/Contexto: tela Vocabulário \+ 2 palavras no caderno/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir o iChat' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('@palavra vira ficha, vai como material, e a proposta só roda ao confirmar', async () => {
    const irPara = vi.fn()
    const campo = await abrir({ onChangeView: irPara })
    fireEvent.change(campo, { target: { value: '@lev' } })
    expect(await screen.findByRole('option', { name: /leverage/ })).toBeTruthy()
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Tirar leverage' })).toBeTruthy()

    let soltar: (r: Response) => void = () => {}
    apiFetch.mockReturnValueOnce(new Promise<Response>((ok) => (soltar = ok)))
    fireEvent.change(campo, { target: { value: 'o que significa?' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(await screen.findByText(/consultando seu caderno/)).toBeTruthy()
    expect(campo.disabled).toBe(true)

    const corpo = JSON.parse(apiFetch.mock.calls[0][1].body as string)
    expect(apiFetch.mock.calls[0][0]).toBe('/api/tutor/chat')
    expect(corpo.funcao).toBe('tutor')
    expect(corpo.material).toContain('[PALAVRA DO CADERNO] leverage = alavancar; nível B2')
    expect(corpo.messages.at(-1)).toEqual({ role: 'user', content: 'o que significa?' })
    /* O prompt é do servidor (Fase 2 do lançamento): a tela não manda mais `system`. */
    expect(corpo.systemInstruction).toBeUndefined()

    await act(async () =>
      soltar({
        ok: true,
        status: 200,
        json: async () => ({ text: '“leverage” é **alavancar**.' }),
      } as unknown as Response),
    )
    expect(await screen.findByText(/Origem: seu caderno · “leverage”/, {}, { timeout: 3000 })).toBeTruthy()
    expect(irPara).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Revisar esta palavra agora/ }))
    expect(irPara).toHaveBeenCalledWith(
      'study',
      expect.objectContaining({ seed: expect.objectContaining({ word: 'leverage' }) }),
    )
    expect(screen.getByText('Feito')).toBeTruthy()
  })

  it('P3: pergunta de senha nem chega ao modelo', async () => {
    const campo = await abrir()
    fireEvent.change(campo, { target: { value: 'qual a minha senha?' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(await screen.findByText(/Origem: lacuna conhecida/, {}, { timeout: 3000 })).toBeTruthy()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('falha do tutor aparece como aviso, sem origem nem avaliação', async () => {
    const campo = await abrir()
    apiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ unavailable: true }),
    } as unknown as Response)
    fireEvent.change(campo, { target: { value: 'oi' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(await screen.findByText(/IA local indisponível/, {}, { timeout: 3000 })).toBeTruthy()
    await waitFor(() => expect(campo.disabled).toBe(false), { timeout: 3000 })
    expect(screen.queryByText(/Origem:/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Não faz sentido aqui/ })).toBeNull()
  })

  it('sem consentimento de nuvem, a pergunta não sai do aparelho e a resposta diz onde autorizar', async () => {
    consentiu = false
    try {
      const campo = await abrir()
      apiFetch.mockClear()
      fireEvent.change(campo, { target: { value: 'o que é leverage?' } })
      fireEvent.keyDown(campo, { key: 'Enter' })
      expect(await screen.findByText(/ainda não autorizou/, {}, { timeout: 3000 })).toBeTruthy()
      expect(apiFetch.mock.calls.some((c) => String(c[0]).includes('/api/tutor'))).toBe(false)
    } finally {
      consentiu = true
    }
  })

  it('conversas: a pergunta dá o título, e nova/renomear/apagar ficam salvos', async () => {
    const campo = await abrir()
    responder('Roteiro.')
    fireEvent.click(screen.getByRole('button', { name: 'Qual jogo começo?' }))
    expect(await screen.findByText(/Origem: seu caderno · 2 palavras/, {}, { timeout: 3000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Abrir o Memória/ })).toBeTruthy()
    await waitFor(() => expect(campo.disabled).toBe(false), { timeout: 3000 })

    fireEvent.click(screen.getByRole('button', { name: 'Conversas' }))
    expect(screen.getByText('Qual jogo começo?', { selector: 'b' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Renomear' }))
    const nome = screen.getByLabelText('Novo nome')
    fireEvent.change(nome, { target: { value: 'Jogos' } })
    fireEvent.keyDown(nome, { key: 'Enter' })
    expect(screen.getByText('Jogos', { selector: 'b' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Nova$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Conversas' }))
    expect(screen.getAllByRole('button', { name: 'Apagar conversa' })).toHaveLength(2)
    const salvas = JSON.parse(localStorage.getItem('ichat_conversas') ?? '[]') as { titulo: string }[]
    expect(salvas.map((c) => c.titulo)).toEqual(['Nova conversa', 'Jogos'])

    fireEvent.click(screen.getAllByRole('button', { name: 'Apagar conversa' })[1])
    expect(screen.getAllByRole('button', { name: 'Apagar conversa' })).toHaveLength(1)
    expect(await screen.findByText('Conversa apagada')).toBeTruthy()
  })
})
