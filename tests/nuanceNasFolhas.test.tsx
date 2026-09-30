// @vitest-environment jsdom
/**
 * A TRADUÇÃO NUANCE NAS FOLHAS DA CAPTURA (Fase D, 30/09/2026).
 *
 *   · D3 — "Sempre traduzir assim" na folha da palavra: com a Nuance, confirma (ou corrige) a glosa e
 *     grava no glossário; sem ela, o MESMO botão, com cadeado, abre o texto positivo e o convite;
 *   · o perfil protegido (menor) nunca recebe o convite promocional — vê o cadeado e o texto;
 *   · o texto do Grátis é positivo ("Tradução rápida ao vivo") e não vende "% de qualidade";
 *   · D4 — a folha da frase: ao abrir, a Tradução Nuance da frase; "Outras formas" e Formal/Informal;
 *     escolher troca a fala e oferece o glossário; nada troca a fala sem a pessoa escolher; sem a
 *     IA de nuvem autorizada, nenhum pedido sai;
 *   · o menu do balão no computador (ChatTranscript) só nas falas finais, e só sem o toque do celular.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ChatTranscript from '../src/components/ChatTranscript'
import NuanceDaFrase from '../src/components/views/captura/nuance/NuanceDaFrase'
import NuanceDaPalavra from '../src/components/views/captura/nuance/NuanceDaPalavra'
import { DEFAULT_TRANSCRIPT_SETTINGS } from '../src/lib/transcriptUtils'

const api = vi.hoisted(() => ({
  fixarNoGlossario: vi.fn(),
  traduzirComNuance: vi.fn(),
  pedirAlternativas: vi.fn(),
  listarGlossario: vi.fn(),
  apagarDoGlossario: vi.fn(),
}))
vi.mock('../src/data/apiDaNuance', () => api)
const nuvem = vi.hoisted(() => ({ consentiu: true, autorizar: vi.fn() }))
vi.mock('../src/lib/consentimentoDeNuvem', () => ({ useConsentimentoDeNuvem: () => nuvem }))

afterEach(cleanup)
beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset()
  nuvem.consentiu = true
  nuvem.autorizar.mockReset()
})

/** O que o Grátis lê não pode vender "qualidade" nem porcentagem (decisão do dono, C7). */
function semVendaDeQualidade(el: HTMLElement) {
  expect(el.textContent ?? '').not.toMatch(/%|qualidade/i)
}

describe('D3 — "Sempre traduzir assim" na folha da palavra', () => {
  it('com a Nuance: o campo vem com a glosa, e fixar grava no glossário com os idiomas', async () => {
    api.fixarNoGlossario.mockResolvedValue({
      ok: true,
      valor: { id: 'g1', termo: 'deadline', traducao: 'data-limite', origem: 'en', destino: 'pt', atualizadoEm: 1 },
    })
    render(<NuanceDaPalavra palavra="deadline" lang="en-US" glosa="prazo" destino="pt-BR" disponivel />)
    fireEvent.click(screen.getByRole('button', { name: /Sempre traduzir assim/ }))
    const campo = screen.getByLabelText('Traduzir sempre como') as HTMLInputElement
    expect(campo.value).toBe('prazo')
    fireEvent.change(campo, { target: { value: 'data-limite' } })
    fireEvent.click(screen.getByRole('button', { name: /Fixar no glossário/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/data-limite/))
    expect(api.fixarNoGlossario).toHaveBeenCalledWith({
      termo: 'deadline',
      traducao: 'data-limite',
      origem: 'en-US',
      destino: 'pt-BR',
    })
  })

  it('o glossário cheio diz o que fazer', async () => {
    api.fixarNoGlossario.mockResolvedValue({ ok: false, motivo: 'glossario_cheio', status: 409 })
    render(<NuanceDaPalavra palavra="deadline" lang="en" glosa="prazo" destino="pt" disponivel />)
    fireEvent.click(screen.getByRole('button', { name: /Sempre traduzir assim/ }))
    fireEvent.click(screen.getByRole('button', { name: /Fixar no glossário/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/500 entradas/))
  })

  it('sem a Nuance: o botão com cadeado abre o texto positivo e o convite, sem gravar nada', () => {
    const aoConhecer = vi.fn()
    render(
      <NuanceDaPalavra
        palavra="deadline"
        lang="en"
        glosa="prazo"
        destino="pt"
        disponivel={false}
        aoConhecer={aoConhecer}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Sempre traduzir assim/ }))
    const convite = screen.getByTestId('convite-da-nuance')
    expect(convite.textContent).toMatch(/Tradução rápida ao vivo/)
    semVendaDeQualidade(convite)
    fireEvent.click(screen.getByRole('button', { name: /Conhecer o Premium/ }))
    expect(aoConhecer).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Traduzir sempre como')).toBeNull()
    expect(api.fixarNoGlossario).not.toHaveBeenCalled()
  })

  it('perfil protegido (sem `aoConhecer`): o cadeado e o texto, nunca o convite promocional', () => {
    render(<NuanceDaPalavra palavra="deadline" lang="en" glosa="prazo" destino="pt" disponivel={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Sempre traduzir assim/ }))
    expect(screen.getByTestId('convite-da-nuance')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Premium/ })).toBeNull()
  })

  it('termo que não cabe no glossário (mais de 80 caracteres): sem o botão', () => {
    render(<NuanceDaPalavra palavra={'a'.repeat(81)} lang="en" glosa="x" destino="pt" disponivel />)
    expect(screen.queryByRole('button', { name: /Sempre traduzir assim/ })).toBeNull()
  })
})

describe('D4 — a Tradução Nuance da frase', () => {
  const fala = { texto: 'see you later', traducao: 'até mais', lang: 'en' }
  const props = { fala, destino: 'pt-BR', contexto: ['hi'], falada: true, aoEscolher: vi.fn() }

  it('ao abrir, pede a Nuance da frase; a forma só troca a fala quando a pessoa a escolhe', async () => {
    api.traduzirComNuance.mockResolvedValue({ ok: true, valor: { texto: 'até logo' } })
    const aoEscolher = vi.fn()
    render(<NuanceDaFrase {...props} aoEscolher={aoEscolher} disponivel />)
    const opcao = await screen.findByRole('button', { name: /até logo/ })
    expect(api.traduzirComNuance).toHaveBeenCalledWith({
      texto: 'see you later',
      src: 'en',
      tgt: 'pt-BR',
      contexto: ['hi'],
      falada: true,
    })
    expect(aoEscolher).not.toHaveBeenCalled()
    fireEvent.click(opcao)
    expect(aoEscolher).toHaveBeenCalledWith('até logo')
    // Escolheu: o glossário aparece, já com a forma escolhida.
    expect((screen.getByLabelText('Traduzir sempre como') as HTMLInputElement).value).toBe('até logo')
  })

  it('"Outras formas": as opções e a nota, pedidas com a tradução atual', async () => {
    api.traduzirComNuance.mockResolvedValue({ ok: true, valor: { texto: 'até mais' } })
    api.pedirAlternativas.mockResolvedValue({
      ok: true,
      valor: { opcoes: ['Até logo', 'A gente se vê'], nota: 'A segunda é mais informal.' },
    })
    const aoEscolher = vi.fn()
    render(<NuanceDaFrase {...props} aoEscolher={aoEscolher} disponivel />)
    await screen.findByText(/concorda com a legenda/)
    fireEvent.click(screen.getByRole('button', { name: /Outras formas/ }))
    const formas = await screen.findByTestId('outras-formas')
    expect(formas.textContent).toMatch(/A segunda é mais informal/)
    expect(api.pedirAlternativas).toHaveBeenCalledWith(expect.objectContaining({ traducaoAtual: 'até mais' }))
    fireEvent.click(screen.getByRole('button', { name: /A gente se vê/ }))
    expect(aoEscolher).toHaveBeenCalledWith('A gente se vê')
  })

  it('Formal: a mesma frase pedida no registro formal', async () => {
    api.traduzirComNuance.mockResolvedValue({ ok: true, valor: { texto: 'até mais tarde' } })
    render(<NuanceDaFrase {...props} disponivel />)
    await screen.findByRole('button', { name: /até mais tarde/ })
    fireEvent.click(screen.getByRole('button', { name: 'Formal' }))
    await waitFor(() =>
      expect(api.traduzirComNuance).toHaveBeenCalledWith(expect.objectContaining({ registro: 'formal' })),
    )
  })

  it('nuvem ocupada: diz para tentar em instantes', async () => {
    api.traduzirComNuance.mockResolvedValue({ ok: false, motivo: 'nuvem_ocupada', status: 429 })
    render(<NuanceDaFrase {...props} disponivel />)
    expect(await screen.findByText(/nuvem está ocupada/)).toBeTruthy()
  })

  it('sem a IA de nuvem autorizada: nenhum pedido sai, e o botão autoriza ali mesmo', () => {
    nuvem.consentiu = false
    render(<NuanceDaFrase {...props} disponivel />)
    expect(api.traduzirComNuance).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Autorizar IA de nuvem/ }))
    expect(nuvem.autorizar).toHaveBeenCalledTimes(1)
  })

  it('sem a Nuance: os botões com cadeado, o texto positivo e o convite — sem pedido nenhum', () => {
    const aoConhecer = vi.fn()
    render(<NuanceDaFrase {...props} disponivel={false} aoConhecer={aoConhecer} />)
    fireEvent.click(screen.getByRole('button', { name: /Outras formas/ }))
    const convite = screen.getByTestId('convite-da-nuance')
    expect(convite.textContent).toMatch(/Tradução rápida ao vivo/)
    semVendaDeQualidade(convite)
    fireEvent.click(screen.getByRole('button', { name: /Conhecer o Premium/ }))
    expect(aoConhecer).toHaveBeenCalled()
    expect(api.traduzirComNuance).not.toHaveBeenCalled()
    expect(api.pedirAlternativas).not.toHaveBeenCalled()
  })

  it('perfil protegido: o cadeado e o texto, sem o convite promocional', () => {
    render(<NuanceDaFrase {...props} disponivel={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Formal ou informal/ }))
    expect(screen.getByTestId('convite-da-nuance')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Premium/ })).toBeNull()
  })
})

describe('D4 — o menu do balão no computador', () => {
  const base = {
    speakers: [{ id: 's1', name: 'Pessoa 1', color: '#888' }],
    scenario: 'conversation' as const,
    tsSettings: DEFAULT_TRANSCRIPT_SETTINGS,
    ageProfile: 'pro' as const,
    sourceLang: 'pt-BR',
    targetLang: 'en-US',
    isRecording: false,
    addedWords: [],
    onExamineWord: vi.fn(),
    onSpeakWord: vi.fn(),
  }
  const fala = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    speakerId: 's1',
    source: 'system' as const,
    timestamp: '00:01',
    originalText: `hello ${id}`,
    translatedText: `olá ${id}`,
    words: [],
    lang: 'en',
    ...extra,
  })

  it('um botão por fala FINAL; o clique entrega a fala e o idioma', () => {
    const aoAbrir = vi.fn()
    render(
      <ChatTranscript {...base} segments={[fala('a'), fala('b', { isPartial: true })]} aoAbrirMenuDaFala={aoAbrir} />,
    )
    const botoes = screen.getAllByRole('button', { name: 'Tradução Nuance da fala' })
    expect(botoes).toHaveLength(1)
    fireEvent.click(botoes[0])
    expect(aoAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'en-US')
  })

  it('no celular (com o toque na fala) não há o botão: a folha da frase já tem a Nuance', () => {
    render(<ChatTranscript {...base} segments={[fala('a')]} aoAbrirMenuDaFala={vi.fn()} aoTocarFala={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Tradução Nuance da fala' })).toBeNull()
  })

  it('sem o callback, a conversa de sempre', () => {
    render(<ChatTranscript {...base} segments={[fala('a')]} />)
    expect(screen.queryByRole('button', { name: 'Tradução Nuance da fala' })).toBeNull()
  })
})
