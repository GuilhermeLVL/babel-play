// @vitest-environment jsdom
/**
 * O DESTAQUE POR VOCABULÁRIO, a parte de tela e de escrita (openspec `leitura-assistida`, Fatia C, C4 a C7): a legenda e o
 * interruptor, o controle de força no cartão da palavra, a escolha de força pelas APIs que já existem e a prática do fim
 * do capítulo. Sem a flag, o cartão é o de sempre.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VocabCard } from '../src/types'

const api = vi.hoisted(() => ({ fetchDeck: vi.fn(), desfazerRevisao: vi.fn() }))
vi.mock('../src/data/api', async (orig) => ({ ...(await orig<typeof import('../src/data/api')>()), ...api }))
vi.mock('../src/lib/dictionary', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dictionary')>()),
  lookup: vi.fn(async () => ({ status: 'not-found', sourceUrl: 'https://example.org' })),
}))
vi.mock('../src/lib/flags', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flags')>()),
  useFlag: () => false,
}))

import CartaoDaPalavra, { type CartaoDaPalavraProps } from '../src/components/views/leitor/CartaoDaPalavra'
import LegendaDoDestaque, { type AjustesDoDestaque } from '../src/components/views/leitor/LegendaDoDestaque'
import PraticaDoCapitulo from '../src/components/views/leitor/PraticaDoCapitulo'
import { esquecerIndiceDeEtiquetas, lerSnapshotDasEtiquetas } from '../src/lib/etiquetas/indiceDeEtiquetas'
import { definirForcaDaPalavra, statusDaPalavra } from '../src/lib/leitor/forcaDaPalavra'

const cartao = (o: Partial<VocabCard> = {}): VocabCard =>
  ({ id: 'c1', word: 'lantern', srcLang: 'en', inDeck: true, reps: 0, ...o }) as VocabCard

beforeEach(() => {
  esquecerIndiceDeEtiquetas()
  api.fetchDeck.mockReset().mockResolvedValue([])
  api.desfazerRevisao.mockReset().mockImplementation(async (id: string) => cartao({ id }))
})
afterEach(cleanup)

describe('C5 definirForcaDaPalavra: pelas APIs de cartão que já existem', () => {
  it('"Não sei" (1): guarda a palavra e não mexe no agendador', async () => {
    const fichar = vi.fn(async () => cartao())
    const r = await definirForcaDaPalavra({ palavra: 'lantern', idioma: 'en', forca: 1, fichar })
    expect(r).toEqual({ ok: true, forca: 1 })
    expect(fichar).toHaveBeenCalledOnce()
    expect(api.desfazerRevisao).not.toHaveBeenCalled()
  })

  it('força 3 numa palavra nova: guarda e grava a estabilidade equivalente; o índice já pinta a força', async () => {
    const fichar = vi.fn(async () => cartao())
    const r = await definirForcaDaPalavra({ palavra: 'lantern', idioma: 'en', forca: 3, fichar, agora: 5_000 })
    expect(r).toEqual({ ok: true, forca: 3 })
    expect(api.desfazerRevisao).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ stability: 8, reps: 1, lapses: 0, lastReview: 5_000 }),
    )
    expect(lerSnapshotDasEtiquetas().forcas?.get('en')?.get('lantern')).toBe(3)
  })

  it('palavra que já tem cartão não guarda de novo (nem duplica)', async () => {
    api.fetchDeck.mockResolvedValue([cartao()])
    const fichar = vi.fn(async () => cartao())
    await definirForcaDaPalavra({ palavra: 'lantern', idioma: 'en', forca: 2, fichar })
    expect(fichar).not.toHaveBeenCalled()
    expect(api.desfazerRevisao).toHaveBeenCalledOnce()
  })

  it('cartão com revisões não é mexido: a força é o histórico dele', async () => {
    api.fetchDeck.mockResolvedValue([cartao({ reps: 4 })])
    const r = await definirForcaDaPalavra({ palavra: 'lantern', idioma: 'en', forca: 4, fichar: vi.fn() })
    expect(r).toEqual({ ok: false, motivo: 'ja-revisada' })
    expect(api.desfazerRevisao).not.toHaveBeenCalled()
  })

  it('a rede falha: devolve o motivo, sem lançar', async () => {
    api.desfazerRevisao.mockRejectedValue(new Error('rede'))
    const r = await definirForcaDaPalavra({ palavra: 'lantern', idioma: 'en', forca: 2, fichar: async () => cartao() })
    expect(r).toEqual({ ok: false, motivo: 'falhou' })
  })
})

describe('statusDaPalavra (o contrato com as outras fatias)', () => {
  it('lê do índice em memória: nova sem cartão, aprendendo depois de escolher a força', async () => {
    expect(statusDaPalavra('lantern', 'en')).toMatchObject({ status: 'nova', forca: 0 })
    await definirForcaDaPalavra({ palavra: 'lantern', idioma: 'en', forca: 2, fichar: async () => cartao() })
    expect(statusDaPalavra('lantern', 'en')).toMatchObject({ status: 'aprendendo', forca: 2 })
  })
})

describe('C5 o cartão da palavra', () => {
  const props = (extra: Partial<CartaoDaPalavraProps> = {}): CartaoDaPalavraProps => ({
    vocab: { word: 'lantern', translation: 'lanterna', lang: 'en', mtEngine: 'dicionario-local' },
    mtNote: null,
    contexto: { palavra: 'lantern', frase: 'The lantern swung.', idioma: 'en' },
    formaDeConsulta: 'lantern',
    destino: 'pt-BR',
    ancora: { top: 200, left: 300, bottom: 220, right: 340 },
    porTeclado: false,
    podeOuvir: false,
    aoOuvir: vi.fn(),
    velocidade: 1,
    aoMudarVelocidade: vi.fn(),
    salva: false,
    aoSalvar: vi.fn(),
    traduzirFrase: vi.fn(async () => null),
    aoFechar: vi.fn(),
    ...extra,
  })

  it('sem a flag (sem `vocabulario`): o "Salvar" de sempre, sem o controle de força', () => {
    render(<CartaoDaPalavra {...props()} />)
    expect(screen.getByRole('button', { name: /Salvar/ })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Quanto você sabe esta palavra' })).toBeNull()
    expect(screen.getByTestId('folha-da-palavra').getAttribute('data-forca')).toBeNull()
  })

  it('com a flag: "Não sei", 2, 3 e 4 em 1 toque; o toque guarda e dá a força; o texto acessível do cartão não muda', async () => {
    const fichar = vi.fn(async () => cartao())
    render(<CartaoDaPalavra {...props({ vocabulario: { fichar } })} />)
    const grupo = screen.getByRole('group', { name: 'Quanto você sabe esta palavra' })
    expect(grupo.querySelectorAll('button')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /Revisar agora/ })).toBeNull() // sem cartão ainda
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '3' }))
    })
    expect(fichar).toHaveBeenCalledOnce()
    expect(api.desfazerRevisao).toHaveBeenCalledOnce()
    expect(screen.getByTestId('folha-da-palavra').getAttribute('data-forca')).toBe('3')
    expect(screen.getByRole('button', { name: '3' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'lantern' })).toBeTruthy() // o nome acessível continua sendo a palavra
  })

  it('"Revisar agora" aparece só com a palavra guardada', async () => {
    const aoRevisar = vi.fn()
    render(<CartaoDaPalavra {...props({ vocabulario: { fichar: async () => cartao(), aoRevisar } })} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Não sei' }))
    })
    fireEvent.click(screen.getByRole('button', { name: /Revisar agora/ }))
    expect(aoRevisar).toHaveBeenCalledOnce()
  })
})

describe('C4 a legenda e as opções do destaque', () => {
  const ajustes = (extra: Partial<AjustesDoDestaque> = {}): AjustesDoDestaque => ({
    ligado: true,
    mudar: vi.fn(),
    marcarAoPaginar: false,
    mudarMarcarAoPaginar: vi.fn(),
    protegido: false,
    estado: {
      resumo: {
        total: 200,
        novas: 14,
        aprendendo: 6,
        conhecidas: 180,
        porcentagemDeNovas: 7,
        porcentagemDeConhecidas: 93,
      },
      candidatas: [],
      grifadas: 20,
      paginadas: 0,
      desfazerPagina: null,
    },
    ...extra,
  })

  it('mostra a legenda de 3 itens e a densidade do capítulo', () => {
    render(<LegendaDoDestaque {...ajustes()} />)
    expect(screen.getByRole('list', { name: 'Legenda do destaque' }).querySelectorAll('li')).toHaveLength(3)
    expect(screen.getByRole('meter', { name: 'Palavras novas neste capítulo' }).getAttribute('aria-valuenow')).toBe('7')
    expect(screen.getByText(/7% de palavras novas.*93%/)).toBeTruthy()
  })

  it('desligado: só o interruptor', () => {
    render(<LegendaDoDestaque {...ajustes({ ligado: false })} />)
    expect(screen.queryByRole('list', { name: 'Legenda do destaque' })).toBeNull()
    expect(screen.queryByRole('meter')).toBeNull()
  })

  it('"paginar marca como conhecida" nasce desligado, com aviso, e muda só quando a pessoa pede', () => {
    const a = ajustes()
    render(<LegendaDoDestaque {...a} />)
    const caixa = screen.getByRole('checkbox', { name: /Virar a página marca como conhecidas/ }) as HTMLInputElement
    expect(caixa.checked).toBe(false)
    expect(screen.getByText(/dá para desfazer a última página/)).toBeTruthy()
    fireEvent.click(caixa)
    expect(a.mudarMarcarAoPaginar).toHaveBeenCalledWith(true)
  })

  it('perfil protegido: a opção não existe', () => {
    render(<LegendaDoDestaque {...ajustes({ protegido: true })} />)
    expect(screen.queryByRole('checkbox', { name: /Virar a página/ })).toBeNull()
  })

  it('"Desfazer última página" só aparece quando há o que desfazer', () => {
    const desfazerPagina = vi.fn()
    const base = ajustes()
    const { rerender } = render(<LegendaDoDestaque {...base} />)
    expect(screen.queryByRole('button', { name: /Desfazer última página/ })).toBeNull()
    rerender(<LegendaDoDestaque {...base} estado={{ ...base.estado!, paginadas: 4, desfazerPagina }} />)
    fireEvent.click(screen.getByRole('button', { name: /Desfazer última página \(4 palavras\)/ }))
    expect(desfazerPagina).toHaveBeenCalledOnce()
  })
})

describe('C7 cinco cartões no fim do capítulo', () => {
  it('oferece até 5 (as tocadas primeiro), nunca começa sozinho, e só guarda as marcadas ao praticar', async () => {
    const guardar = vi.fn(async (_palavra: string) => true)
    const aoPraticar = vi.fn()
    render(
      <PraticaDoCapitulo
        idioma="en"
        tocadas={['Lantern']}
        candidatas={['harbor', 'quill', 'anchor', 'bridge', 'cobweb', 'dagger']}
        guardar={guardar}
        aoPraticar={aoPraticar}
        aoFechar={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('checkbox')).toHaveLength(5)
    expect(screen.getAllByRole('checkbox')[0].parentElement?.textContent).toMatch(/lantern.*você tocou nela/)
    expect(guardar).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('checkbox')[1]) // desmarca "harbor"
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Praticar agora/ }))
    })
    expect(guardar.mock.calls.map((c) => c[0])).toEqual(['lantern', 'quill', 'anchor', 'bridge'])
    expect(aoPraticar).toHaveBeenCalledOnce()
  })

  it('sem palavras, não mostra nada', () => {
    const { container } = render(
      <PraticaDoCapitulo
        idioma="en"
        tocadas={[]}
        candidatas={[]}
        guardar={vi.fn()}
        aoPraticar={vi.fn()}
        aoFechar={vi.fn()}
      />,
    )
    expect(container.textContent).toBe('')
  })
})
