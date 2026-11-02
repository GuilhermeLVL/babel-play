// @vitest-environment jsdom
/**
 * O CARTÃO LEVE DA PALAVRA do leitor (`views/leitor/CartaoDaPalavra.tsx`): não modal, não toca na narração,
 * traduz a frase com carregando/erro, salva, expande "Mais" e fica perto da palavra sem cobri-la.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/dictionary', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dictionary')>()),
  lookup: vi.fn(async (word: string) => ({
    status: 'found',
    entry: {
      word,
      lang: 'en',
      ipa: '/kɔːl/',
      senses: [
        { partOfSpeech: 'Proper noun', definition: 'A surname.', examples: [] },
        { partOfSpeech: 'Verb', definition: 'To name or refer to.', examples: [] },
      ],
      glossLang: 'en',
      source: {
        name: 'Wiktionary',
        wiki: 'en.wiktionary.org',
        url: 'https://en.wiktionary.org/wiki/call',
        license: 'CC BY-SA 4.0',
      },
    },
  })),
}))
vi.mock('../src/lib/flags', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flags')>()),
  useFlag: () => false,
}))

import CartaoDaPalavra, { type CartaoDaPalavraProps } from '../src/components/views/leitor/CartaoDaPalavra'

const fala = { cancel: vi.fn(), pause: vi.fn(), resume: vi.fn(), speak: vi.fn() }

function montar(extra: Partial<CartaoDaPalavraProps> = {}) {
  const props: CartaoDaPalavraProps = {
    vocab: { word: 'call', translation: 'chamar', lang: 'en', mtEngine: 'dicionario-local' },
    mtNote: null,
    contexto: { palavra: 'Call', frase: 'Call me Ishmael.', idioma: 'en' },
    formaDeConsulta: 'call',
    destino: 'pt-BR',
    ancora: { top: 200, left: 300, bottom: 220, right: 340 },
    porTeclado: false,
    podeOuvir: true,
    aoOuvir: vi.fn(),
    velocidade: 1,
    aoMudarVelocidade: vi.fn(),
    salva: false,
    aoSalvar: vi.fn(),
    traduzirFrase: vi.fn(async () => 'Me chame de Ismael.'),
    aoFechar: vi.fn(),
    ...extra,
  }
  const r = render(
    <div>
      <button type="button">fora</button>
      <CartaoDaPalavra {...props} />
    </div>,
  )
  return { props, ...r, cartao: screen.getByTestId('folha-da-palavra') }
}

const janela = (largura: number, altura: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: largura })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: altura })
}

beforeEach(() => {
  janela(1280, 800)
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: fala })
  for (const f of Object.values(fala)) f.mockClear()
})
afterEach(cleanup)

describe('CartaoDaPalavra — não bloqueia', () => {
  it('abre como diálogo NÃO modal, sem <dialog> nem fundo, e sem tomar o foco quando aberto pelo toque', () => {
    const { cartao } = montar()
    expect(cartao.getAttribute('role')).toBe('dialog')
    expect(cartao.getAttribute('aria-modal')).toBe('false')
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.querySelector('[class*="backdrop"], [class*="fundo-"]')).toBeNull()
    expect(cartao.contains(document.activeElement)).toBe(false)
    // O resto da página continua alcançável: nada ficou inerte.
    expect(document.querySelector('[inert]')).toBeNull()
  })

  it('aberto pelo teclado, o foco vai ao cartão; Esc fecha', () => {
    const { cartao, props } = montar({ porTeclado: true })
    expect(document.activeElement).toBe(cartao)
    fireEvent.keyDown(cartao, { key: 'Escape' })
    expect(props.aoFechar).toHaveBeenCalledTimes(1)
  })

  it('toque fora fecha; toque dentro não', () => {
    const { props, cartao } = montar()
    fireEvent.pointerDown(cartao.querySelector('button')!)
    expect(props.aoFechar).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'fora' }))
    expect(props.aoFechar).toHaveBeenCalledTimes(1)
  })

  it('abrir e fechar não pausa nem cancela a narração (nenhuma chamada à fala)', () => {
    const { unmount, cartao } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Mais/ }))
    fireEvent.keyDown(cartao, { key: 'Escape' })
    unmount()
    expect(fala.cancel).not.toHaveBeenCalled()
    expect(fala.pause).not.toHaveBeenCalled()
  })
})

describe('CartaoDaPalavra — o essencial e as ações', () => {
  it('mostra a palavra, a fonética do verbete e a tradução, sem a frase "não traz transcrição"', async () => {
    const { cartao } = montar()
    await act(async () => {})
    expect(cartao.textContent).toContain('call')
    expect(cartao.textContent).toContain('/kɔːl/')
    expect(cartao.textContent).toContain('chamar')
    expect(cartao.textContent).not.toMatch(/não traz transcrição|o que isso significa|verificar/)
  })

  it('"Sentido" escolhe o verbo para "Call me Ishmael", não o sobrenome', async () => {
    montar()
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /Sentido/ }))
    const bloco = screen.getByTestId('cartao-sentido')
    expect(bloco.textContent).toContain('verbo')
    expect(bloco.textContent).toContain('To name or refer to.')
    expect(bloco.textContent).not.toContain('A surname.')
  })

  it('"Traduzir a frase": anuncia o carregando, mostra o resultado e usa o cache na segunda vez', async () => {
    let soltar: (v: string) => void = () => {}
    const traduzirFrase = vi.fn(() => new Promise<string>((ok) => (soltar = ok)))
    montar({ traduzirFrase })
    fireEvent.click(screen.getByRole('button', { name: /Traduzir a frase/ }))
    const bloco = screen.getByTestId('cartao-frase')
    expect(bloco.querySelector('[aria-live="polite"]')!.textContent).toContain('Traduzindo a frase…')
    await act(async () => soltar('Me chame de Ismael.'))
    expect(bloco.textContent).toContain('Me chame de Ismael.')
    fireEvent.click(screen.getByRole('button', { name: /Traduzir a frase/ }))
    fireEvent.click(screen.getByRole('button', { name: /Traduzir a frase/ }))
    expect(screen.getByTestId('cartao-frase').textContent).toContain('Me chame de Ismael.')
    expect(traduzirFrase).toHaveBeenCalledTimes(1)
  })

  it('"Traduzir a frase" com erro: diz o fato e oferece tentar de novo', async () => {
    const traduzirFrase = vi
      .fn<(f: string) => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('Me chame de Ismael.')
    montar({ traduzirFrase })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Traduzir a frase/ })))
    expect(screen.getByTestId('cartao-frase').textContent).toContain('Não deu para traduzir a frase agora.')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' })))
    expect(screen.getByTestId('cartao-frase').textContent).toContain('Me chame de Ismael.')
    expect(traduzirFrase).toHaveBeenCalledTimes(2)
  })

  it('"Salvar" chama o deck; já salva, o chip diz "Salva"', () => {
    const { props } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    expect(props.aoSalvar).toHaveBeenCalledTimes(1)
    cleanup()
    montar({ salva: true })
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull()
    expect(screen.getByTestId('folha-da-palavra').textContent).toContain('Salva')
  })

  it('"Mais" expande no próprio cartão o dicionário, os links e as fontes recolhidas', async () => {
    montar()
    await act(async () => {})
    expect(screen.queryByTestId('cartao-detalhes')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Mais/ }))
    const mais = screen.getByTestId('cartao-detalhes')
    expect(mais.textContent).toContain('To name or refer to.')
    expect(screen.getByRole('link', { name: /Wiktionary/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Forvo/ })).toBeTruthy()
    const fontes = mais.querySelector('details')!
    expect(fontes.open).toBe(false)
    expect(fontes.textContent).toContain('en.wiktionary.org')
  })

  it('imagem: nenhuma sem a prop (perfil protegido); uma miniatura com licença quando há', () => {
    montar()
    expect(screen.queryByRole('img')).toBeNull()
    cleanup()
    montar({
      imagens: {
        carregando: false,
        lista: [
          {
            id: '1',
            url: 'https://upload.wikimedia.org/a.jpg',
            titulo: 'telefone',
            licenca: 'CC BY-SA 4.0',
            acervo: 'Wikimedia Commons',
            fonte: 'verbete',
            pagina: 'https://commons.wikimedia.org/a',
          },
          {
            id: '2',
            url: 'https://upload.wikimedia.org/b.jpg',
            titulo: 'outra',
            acervo: 'Wikimedia Commons',
            fonte: 'verbete',
          },
        ],
      },
    })
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toBeTruthy()
  })
})

describe('CartaoDaPalavra — posição', () => {
  it('computador: abaixo da palavra quando cabe', () => {
    const { cartao } = montar()
    expect(cartao.dataset.modo).toBe('ancorado')
    expect(cartao.dataset.lado).toBe('abaixo')
    expect(parseInt(cartao.style.top)).toBeGreaterThanOrEqual(220)
  })

  it('computador: acima quando a palavra está no pé da janela', () => {
    const { cartao } = montar({ ancora: { top: 760, left: 300, bottom: 780, right: 340 } })
    expect(cartao.dataset.lado).toBe('acima')
    expect(parseInt(cartao.style.top) + parseInt(cartao.style.maxHeight)).toBeLessThanOrEqual(760)
  })

  it('celular (390 px): mini-folha embaixo, até 40% da altura; no topo se embaixo cobriria a palavra', () => {
    janela(390, 844)
    const { cartao } = montar({ ancora: { top: 150, left: 20, bottom: 170, right: 60 } })
    expect(cartao.dataset.modo).toBe('folha')
    expect(cartao.dataset.lado).toBe('baixo')
    expect(parseInt(cartao.style.maxHeight)).toBeLessThanOrEqual(Math.floor(844 * 0.4))
    cleanup()
    const outro = montar({ ancora: { top: 700, left: 20, bottom: 720, right: 60 } }).cartao
    expect(outro.dataset.lado).toBe('topo')
  })
})
