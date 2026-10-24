// @vitest-environment jsdom
/**
 * O PAINEL DA FRASE (pedido do dono, 24/10/2026): a folha modal da frase virou um painel SEM modal. No
 * computador ele fica à direita da tela e a legenda encolhe para dar lugar; no celular é uma folha baixa
 * (~45%) sem fundo escuro, com a alça que leva a ~85% e, para baixo, fecha. A legenda continua tocável:
 * tocar noutra frase troca o conteúdo do MESMO painel.
 *
 * O Quest, o Intérprete e o foco cheio continuam com a folha modal de antes (`modal`).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/dictionary', () => ({ lookup: async () => ({ status: 'missing' }) }))
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true }))

import FolhasDoPrototipo from '../src/components/views/captura/celular/FolhasDoPrototipo'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

let largura = 1280
let altura = 800
const original = window.matchMedia

beforeEach(() => {
  largura = 1280
  altura = 800
  prepararDialogoNoJsdom()
  window.matchMedia = ((q: string) => {
    const min = /min-width:\s*(\d+)px/.exec(q)
    const maxH = /max-height:\s*(\d+)px/.exec(q)
    const matches = min ? largura >= Number(min[1]) : maxH ? altura <= Number(maxH[1]) : false
    return { matches, media: q, addEventListener() {}, removeEventListener() {} }
  }) as never
})
afterEach(() => {
  cleanup()
  window.matchMedia = original
})

const nada = () => undefined
const frase = (id: string, texto: string) => ({
  id,
  texto,
  traducao: `(${texto})`,
  lang: 'en',
  langDaTraducao: 'pt-BR',
})
const A = frase('a', 'So, are we still shipping the roadmap today?')
const B = frase('b', 'The weather is great.')

function Legenda({ escolhida }: { escolhida: string | null }) {
  return (
    <div>
      {[A, B].map((f) => (
        <button key={f.id} type="button" data-frase-escolhida={escolhida === f.id ? '' : undefined}>
          {f.texto}
        </button>
      ))}
      <input aria-label="Busca" />
    </div>
  )
}

function Tela({
  inicial = A as typeof A | null,
  modal = false,
  aoFechar = nada as () => void,
}: {
  inicial?: typeof A | null
  modal?: boolean
  aoFechar?: () => void
}) {
  const [fala, setFala] = React.useState(inicial)
  return (
    <>
      <Legenda escolhida={fala?.id ?? null} />
      <button type="button" onClick={() => setFala(B)}>
        outra
      </button>
      <button type="button" onClick={() => setFala(A)}>
        abrir A
      </button>
      {fala && (
        <FolhasDoPrototipo
          fala={fala}
          palavra={null}
          modal={modal}
          aoOuvir={nada}
          aoTocarPalavra={nada}
          aoConsultar={async () => ({ traducao: '' })}
          aoSalvar={async () => ''}
          aoFechar={() => {
            aoFechar()
            setFala(null)
          }}
          nuance={{ disponivel: false, destino: 'pt', aoEscolher: nada }}
        />
      )}
    </>
  )
}

const painel = () => screen.getByRole('complementary', { name: 'Frase escolhida' })

describe('PainelDaFrase', () => {
  it('no computador: um painel ao lado, sem diálogo e sem fundo, com o mesmo conteúdo da folha', () => {
    render(<Tela />)
    const p = painel()
    expect(p.tagName).toBe('ASIDE')
    expect(p.getAttribute('data-modo')).toBe('lado')
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.documentElement.dataset.painelDaFrase).toBe('lado')
    expect(p.querySelector('.folha-frase')?.textContent).toBe(A.texto)
    expect(p.querySelector('.folha-frase-trad')?.textContent).toBe(A.traducao)
    expect([...p.querySelectorAll('.folha-grade .folha-acao')].map((b) => b.textContent?.trim())).toEqual([
      'Ouvir',
      'Ouvir devagar',
      'Ouvir tradução',
      'Repetir eu',
      'Copiar',
    ])
    expect(p.querySelector('.px-nuance b')?.textContent?.trim()).toBe('Outras formas de dizer')
    expect(p.querySelector('.folha-rotulo:last-of-type')?.textContent).toBe('Toque numa palavra')
    expect([...p.querySelectorAll('.folha-palavras button')].map((b) => b.textContent)).toContain('roadmap')
    // No computador não há alça: a alça é do celular.
    expect(p.querySelector('.pf-pega')).toBeNull()
  })

  it('a frase escolhida fica marcada na legenda; tocar noutra troca o conteúdo do MESMO painel', () => {
    render(<Tela />)
    const antes = painel()
    fireEvent.click(screen.getByRole('button', { name: 'outra' }))
    expect(painel()).toBe(antes)
    expect(antes.querySelector('.folha-frase')?.textContent).toBe(B.texto)
    expect(document.querySelector('[data-frase-escolhida]')?.textContent).toBe(B.texto)
  })

  it('× fecha, o atributo da casca sai e o foco volta para a frase', () => {
    const aoFechar = vi.fn()
    render(<Tela aoFechar={aoFechar} />)
    const fechar = within(painel()).getByRole('button', { name: 'Fechar' })
    fechar.focus()
    fireEvent.click(fechar)
    expect(aoFechar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('complementary', { name: 'Frase escolhida' })).toBeNull()
    expect(document.documentElement.dataset.painelDaFrase).toBeUndefined()
    expect(document.activeElement?.textContent).toBe(A.texto)
  })

  it('Esc fecha com o foco no painel e com o foco na legenda; não fecha com o foco num campo de texto', () => {
    const aoFechar = vi.fn()
    render(<Tela aoFechar={aoFechar} />)
    const busca = screen.getByRole('textbox', { name: 'Busca' })
    busca.focus()
    fireEvent.keyDown(busca, { key: 'Escape' })
    expect(aoFechar).not.toHaveBeenCalled()

    const ouvir = within(painel()).getByRole('button', { name: 'Ouvir' })
    ouvir.focus()
    fireEvent.keyDown(ouvir, { key: 'Escape' })
    expect(aoFechar).toHaveBeenCalledTimes(1)
    expect(document.activeElement?.textContent).toBe(A.texto)
  })

  it('Esc não fecha o painel enquanto um diálogo modal está aberto por cima', () => {
    const aoFechar = vi.fn()
    render(
      <>
        <Tela aoFechar={aoFechar} />
        <dialog open>
          <button type="button">no diálogo</button>
        </dialog>
      </>,
    )
    const noDialogo = screen.getByRole('button', { name: 'no diálogo' })
    noDialogo.focus()
    fireEvent.keyDown(noDialogo, { key: 'Escape' })
    expect(aoFechar).not.toHaveBeenCalled()
  })

  it('aberto pelo teclado, o foco vai para o painel; pelo toque, fica onde estava', () => {
    const { unmount } = render(<Tela inicial={null} />)
    const abrir = screen.getByRole('button', { name: 'abrir A' })
    abrir.focus()
    fireEvent.keyDown(abrir, { key: 'Enter' })
    fireEvent.click(abrir)
    expect(document.activeElement).toBe(painel())
    unmount()

    render(<Tela inicial={null} />)
    const abrir2 = screen.getByRole('button', { name: 'abrir A' })
    abrir2.focus()
    fireEvent.pointerDown(abrir2)
    fireEvent.click(abrir2)
    expect(document.activeElement).toBe(abrir2)
  })

  it('no celular: folha baixa sem fundo, alça que expande e recolhe, arrastar para baixo fecha', () => {
    largura = 375
    altura = 812
    const aoFechar = vi.fn()
    render(<Tela aoFechar={aoFechar} />)
    const p = painel()
    expect(p.getAttribute('data-modo')).toBe('baixo')
    expect(document.documentElement.dataset.painelDaFrase).toBe('baixo')
    expect(document.querySelector('dialog')).toBeNull()
    const pega = within(p).getByRole('button', { name: 'Expandir' })
    expect(pega.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(pega)
    expect(p.getAttribute('data-altura')).toBe('cheia')
    expect(document.documentElement.dataset.painelCheio).toBe('')
    const recolher = within(p).getByRole('button', { name: 'Recolher' })
    expect(recolher.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(recolher)
    expect(p.getAttribute('data-altura')).toBe('meia')

    // Arrastar a alça para baixo, na meia altura, fecha.
    fireEvent.pointerDown(recolher.ownerDocument.querySelector('.pf-pega')!, { clientY: 400, pointerId: 1 })
    fireEvent.pointerMove(p.querySelector('.pf-pega')!, { clientY: 520, pointerId: 1 })
    fireEvent.pointerUp(p.querySelector('.pf-pega')!, { clientY: 520, pointerId: 1 })
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('arrastar a alça para cima leva à altura cheia', () => {
    largura = 375
    render(<Tela />)
    const pega = painel().querySelector('.pf-pega')!
    fireEvent.pointerDown(pega, { clientY: 500, pointerId: 1 })
    fireEvent.pointerMove(pega, { clientY: 420, pointerId: 1 })
    fireEvent.pointerUp(pega, { clientY: 420, pointerId: 1 })
    expect(painel().getAttribute('data-altura')).toBe('cheia')
  })

  it('tela baixa demais para a folha (celular deitado): a folha modal de antes', () => {
    largura = 812
    altura = 375
    render(<Tela />)
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(document.querySelector('dialog.folha-de-baixo.folha-da-frase')).toBeTruthy()
  })

  it('`modal` (Quest, Intérprete, foco cheio): a folha modal de antes, mesmo no computador', () => {
    render(<Tela modal />)
    expect(screen.queryByRole('complementary')).toBeNull()
    const d = document.querySelector('dialog.folha-de-baixo.folha-da-frase') as HTMLElement
    expect(d.getAttribute('aria-label')).toBe('Ações')
    expect(document.documentElement.dataset.painelDaFrase).toBeUndefined()
  })

  it('a palavra abre no mesmo painel, com o nome dela, e volta à frase', async () => {
    function ComPalavra() {
      const [palavra, setPalavra] = React.useState<string | null>(null)
      return (
        <FolhasDoPrototipo
          fala={A}
          palavra={palavra ? { palavra, frase: A.texto, lang: 'en' } : null}
          aoOuvir={nada}
          aoTocarPalavra={setPalavra}
          aoVoltar={() => setPalavra(null)}
          aoConsultar={async () => ({ traducao: 'roteiro' })}
          aoSalvar={async () => ''}
          aoFechar={nada}
        />
      )
    }
    render(<ComPalavra />)
    const antes = painel()
    fireEvent.click(within(antes).getByRole('button', { name: 'roadmap' }))
    await act(async () => undefined)
    const daPalavra = screen.getByRole('complementary', { name: 'Palavra: roadmap' })
    expect(daPalavra).toBe(antes)
    expect(daPalavra.querySelector('.folha-glosa')?.textContent).toBe('roteiro')
    fireEvent.click(within(daPalavra).getByRole('button', { name: 'Voltar à frase' }))
    expect(painel()).toBe(antes)
  })
})
