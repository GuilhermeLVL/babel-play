// @vitest-environment jsdom
/**
 * "PARA ESTUDAR DESTA SESSÃO" (spec `frases-i-mais-1`): a seção recolhível, as duas abas, "Guardar como cartão" com a
 * frase como contexto, "Já sei" e o portão de honestidade.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const conhecimento = vi.hoisted(() => ({
  atual: { conhecidas: new Set<string>(), sessoes: 5, temConta: true },
}))
vi.mock('../src/lib/etiquetas/conhecimentoDoIdioma', () => ({
  useConhecimentoDoIdioma: () => conhecimento.atual,
}))
const marcar = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../src/lib/etiquetas/teclasDeMarcacao', () => ({ alternarMarcacao: marcar }))
vi.mock('../src/lib/etiquetas/indiceDeEtiquetas', () => ({
  useSnapshotDasEtiquetas: () => ({ caderno: new Map(), marcadas: new Map(), vistas: new Map() }),
}))

import { palavraFicouNoCaderno } from '../src/components/views/analise/guardarDaSessao'
import ParaEstudarDaSessao from '../src/components/views/analise/ParaEstudarDaSessao'

const ENCHIMENTO = 'I like the house and the dog. We go to the park with the dog and the cat every day.'
const FALAS = [
  { texto: 'I cook very delicious food.', lang: 'en' },
  { texto: 'We eat delicious food at the park.', lang: 'en' },
  { texto: ENCHIMENTO, lang: 'en' },
  { texto: ENCHIMENTO, lang: 'en' },
]
const SABIDAS = ['like', 'house', 'dog', 'go', 'park', 'cat', 'day', 'every', 'eat', 'cook', 'very', 'food']

beforeEach(() => {
  conhecimento.atual = { conhecidas: new Set(SABIDAS), sessoes: 5, temConta: true }
  marcar.mockClear()
})
afterEach(cleanup)

const abrir = async () => {
  const cabeca = await screen.findByRole('button', { name: /Para estudar desta sessão/ })
  fireEvent.click(cabeca)
  return cabeca
}

describe('ParaEstudarDaSessao', () => {
  it('recolhida por padrão, abre pelo botão e mostra a frase com a palavra destacada', async () => {
    render(<ParaEstudarDaSessao falas={FALAS} idioma="en" aoGuardar={async () => true} />)
    const cabeca = await screen.findByRole('button', { name: /Para estudar desta sessão/ })
    expect(cabeca.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(cabeca)
    expect(cabeca.getAttribute('aria-expanded')).toBe('true')
    const alvo = document.querySelector('mark.estudar-alvo')
    expect(alvo?.textContent).toBe('delicious')
  })

  it('"Guardar como cartão" guarda a palavra com ESSA frase e passa a dizer "Guardado"', async () => {
    const aoGuardar = vi.fn(async () => true)
    render(<ParaEstudarDaSessao falas={FALAS} idioma="en" aoGuardar={aoGuardar} />)
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /Guardar como cartão: delicious/ }))
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => /Guardado/.test(s.textContent ?? ''))).toBe(true),
    )
    expect(aoGuardar).toHaveBeenCalledOnce()
    const item = (aoGuardar.mock.calls[0] as unknown[])[0] as { palavra: string; frase: string; lang: string }
    expect(item.palavra).toBe('delicious')
    expect(item.frase).toMatch(/delicious/)
    expect(item.lang).toBe('en')
  })

  it('falha ao guardar: avisa e o botão continua', async () => {
    render(<ParaEstudarDaSessao falas={FALAS} idioma="en" aoGuardar={async () => false} />)
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /Guardar como cartão: delicious/ }))
    expect(await screen.findByText('Não deu para salvar agora.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Guardar como cartão: delicious/ })).not.toBeNull()
  })

  it('toque na frase leva o player até a fala', async () => {
    const ir = vi.fn()
    render(<ParaEstudarDaSessao falas={FALAS} idioma="en" aoGuardar={async () => true} aoIrParaFala={ir} />)
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /Ir para esta frase no áudio/ }))
    expect(ir).toHaveBeenCalledWith(1)
  })

  it('aba "Palavras novas": contagem e "Já sei" marca sem criar cartão', async () => {
    render(<ParaEstudarDaSessao falas={FALAS} idioma="en" aoGuardar={async () => true} />)
    await abrir()
    fireEvent.click(screen.getByRole('tab', { name: /Palavras novas/ }))
    expect(screen.getByText('2 vezes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Já sei: delicious/ }))
    await waitFor(() => expect(marcar).toHaveBeenCalledWith('delicious', 'en', 'conhecida'))
  })

  it('portão: sem conta, poucas sessões ou idioma sem espaço, não renderiza nada', async () => {
    conhecimento.atual = { conhecidas: new Set(SABIDAS), sessoes: 5, temConta: false }
    const { container, rerender } = render(
      <ParaEstudarDaSessao falas={FALAS} idioma="en" aoGuardar={async () => true} />,
    )
    await new Promise((r) => setTimeout(r, 120))
    expect(container.innerHTML).toBe('')
    conhecimento.atual = { conhecidas: new Set(SABIDAS), sessoes: 0, temConta: true }
    rerender(<ParaEstudarDaSessao falas={FALAS} idioma="en" aoGuardar={async () => true} />)
    await new Promise((r) => setTimeout(r, 120))
    expect(container.innerHTML).toBe('')
    conhecimento.atual = { conhecidas: new Set(SABIDAS), sessoes: 5, temConta: true }
    rerender(
      <ParaEstudarDaSessao
        falas={[{ texto: '私は毎日学校に行きます。'.repeat(40) }]}
        idioma="ja"
        aoGuardar={async () => true}
      />,
    )
    await new Promise((r) => setTimeout(r, 120))
    expect(container.innerHTML).toBe('')
  })

  it('duplo clique em "Guardar": um pedido só, sem "Guardado" e erro juntos', async () => {
    let resolver: (v: boolean) => void = () => {}
    const aoGuardar = vi.fn(() => new Promise<boolean>((r) => (resolver = r)))
    render(<ParaEstudarDaSessao falas={FALAS} idioma="en" aoGuardar={aoGuardar} />)
    await abrir()
    const botao = screen.getByRole('button', { name: /Guardar como cartão: delicious/ })
    fireEvent.click(botao)
    fireEvent.click(botao)
    expect((botao as HTMLButtonElement).disabled).toBe(true)
    resolver(true)
    await waitFor(() =>
      expect(screen.getAllByRole('status').some((s) => /Guardado/.test(s.textContent ?? ''))).toBe(true),
    )
    expect(aoGuardar).toHaveBeenCalledOnce()
    expect(screen.queryByText('Não deu para salvar agora.')).toBeNull()
  })

  it('duplo clique em "Já sei": uma marcação só', async () => {
    render(<ParaEstudarDaSessao falas={FALAS} idioma="en" aoGuardar={async () => true} />)
    await abrir()
    fireEvent.click(screen.getByRole('tab', { name: /Palavras novas/ }))
    const botao = screen.getByRole('button', { name: /Já sei: delicious/ })
    fireEvent.click(botao)
    fireEvent.click(botao)
    await waitFor(() => expect(marcar).toHaveBeenCalledTimes(1))
  })

  it('"já está no caderno" conta como sucesso; o resto da mensagem não', () => {
    expect(palavraFicouNoCaderno('adicionado ao seu deck')).toBe(true)
    expect(palavraFicouNoCaderno('Esta palavra já está no seu caderno.')).toBe(true)
    expect(palavraFicouNoCaderno('Não deu para salvar agora.')).toBe(false)
  })
})
