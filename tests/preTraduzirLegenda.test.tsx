// @vitest-environment jsdom
/**
 * A TELA DA PRÉ-TRADUÇÃO DA LEGENDA (openspec `pre-traducao-de-legendas`, 5.1): o botão só com a flag, o aviso do download
 * antes do primeiro byte, o progresso com cancelar, a coluna bilíngue e a falha por fala sem quebrar a lista.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PreTraduzirLegenda from '../src/components/views/biblioteca/PreTraduzirLegenda'
import type { TradutorDaPreTraducao } from '../src/gateway/preTraducaoLocal'

const flag = vi.hoisted(() => ({ ligada: true }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => flag.ligada }))

const SRT = (falas: string[]) =>
  falas.map((f, i) => `${i + 1}\n00:00:0${i},000 --> 00:00:0${i + 1},000\n${f}\n`).join('\n')
const arquivo = (falas: string[], nome = 'ep1.srt') => new File([SRT(falas)], nome, { type: 'text/plain' })
const IDIOMAS = { de: 'en', para: 'pt' }
const BOTAO = /Traduzir tudo no aparelho/

function tradutor(over: Partial<TradutorDaPreTraducao> = {}): TradutorDaPreTraducao {
  return {
    pronto: () => true,
    aquecer: vi.fn(),
    traduzir: vi.fn(async (t: string) => `PT:${t}`),
    ...over,
  }
}

beforeEach(() => {
  flag.ligada = true
})
afterEach(cleanup)

describe('PreTraduzirLegenda', () => {
  it('não aparece com a flag desligada nem para arquivo que não é legenda', () => {
    flag.ligada = false
    const { container, rerender } = render(<PreTraduzirLegenda arquivo={arquivo(['Hi.'])} idiomas={IDIOMAS} />)
    expect(container.innerHTML).toBe('')
    flag.ligada = true
    rerender(<PreTraduzirLegenda arquivo={new File(['x'], 'livro.pdf')} idiomas={IDIOMAS} />)
    expect(container.innerHTML).toBe('')
    rerender(<PreTraduzirLegenda arquivo={arquivo(['Hi.'])} idiomas={IDIOMAS} />)
    expect(screen.getByRole('button', { name: BOTAO })).toBeTruthy()
  })

  it('avisa o tamanho do download antes de baixar e só baixa depois do sim', async () => {
    let pronto = false
    const t = tradutor({
      pronto: () => pronto,
      aquecer: vi.fn(() => {
        pronto = true
      }),
    })
    render(
      <PreTraduzirLegenda
        arquivo={arquivo(['Hi.'])}
        idiomas={IDIOMAS}
        criarTradutor={() => t}
        mbDoDownload={113}
        esperaDoModeloMs={5}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: BOTAO }))
    const aviso = await screen.findByRole('group', { name: /Aviso de download/ })
    expect(aviso.textContent).toMatch(/113 MB/)
    expect(t.aquecer).not.toHaveBeenCalled()

    fireEvent.click(within(aviso).getByRole('button', { name: /Agora não/ }))
    expect(t.aquecer).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: BOTAO }))
    fireEvent.click(await screen.findByRole('button', { name: /Baixar e traduzir/ }))
    await screen.findByText('PT:Hi.')
    expect(t.aquecer).toHaveBeenCalledTimes(1)
  })

  it('mostra o progresso, a estimativa só depois de 5 e deixa cancelar pelo teclado', async () => {
    let n = 0
    let solta!: () => void
    const trava = new Promise<void>((r) => (solta = r))
    const t = tradutor({
      traduzir: vi.fn(async (x: string) => {
        n++
        if (n > 6) await trava // a 7ª fala fica pendurada
        return `PT:${x}`
      }),
    })
    const falas = Array.from({ length: 10 }, (_, i) => `Fala ${i}`)
    render(<PreTraduzirLegenda arquivo={arquivo(falas)} idiomas={IDIOMAS} criarTradutor={() => t} />)
    fireEvent.click(screen.getByRole('button', { name: BOTAO }))

    const barra = await screen.findByRole('progressbar', { name: /Progresso da tradução/ })
    await waitFor(() => expect(barra.getAttribute('value')).toBe('6'))
    expect(screen.getByText(/6 de 10 falas/).textContent).toMatch(/estimativa/)
    expect(document.querySelector('[aria-live="polite"]')).toBeTruthy()

    const cancelar = screen.getByRole('button', { name: /Cancelar/ })
    cancelar.focus()
    expect(document.activeElement).toBe(cancelar)
    fireEvent.click(cancelar)
    solta()
    await screen.findByText(/Você cancelou/)
    expect(screen.queryByText('PT:Fala 9')).toBeNull()
    expect(screen.getByText('PT:Fala 0')).toBeTruthy()
  })

  it('não mostra estimativa antes de 5 traduções', async () => {
    let n = 0
    const trava = new Promise<void>(() => {})
    const t = tradutor({
      traduzir: vi.fn(async (x: string) => {
        if (++n > 2) await trava
        return `PT:${x}`
      }),
    })
    render(<PreTraduzirLegenda arquivo={arquivo(['A', 'B', 'C', 'D'])} idiomas={IDIOMAS} criarTradutor={() => t} />)
    fireEvent.click(screen.getByRole('button', { name: BOTAO }))
    await waitFor(() => expect(screen.getByText(/2 de 4 falas/)).toBeTruthy())
    expect(screen.getByText(/2 de 4 falas/).textContent).not.toMatch(/estimativa/)
  })

  it('mostra original e tradução lado a lado e marca a fala que falhou como não traduzida', async () => {
    const t = tradutor({
      traduzir: vi.fn(async (x: string) => {
        if (x === 'Broken.') throw new Error('falhou')
        return `PT:${x}`
      }),
    })
    render(
      <PreTraduzirLegenda arquivo={arquivo(['Hello.', 'Broken.', 'Bye.'])} idiomas={IDIOMAS} criarTradutor={() => t} />,
    )
    fireEvent.click(screen.getByRole('button', { name: BOTAO }))
    const tabela = await screen.findByRole('table')
    expect(within(tabela).getByRole('columnheader', { name: 'Original' })).toBeTruthy()
    expect(within(tabela).getByRole('columnheader', { name: 'Tradução' })).toBeTruthy()
    const linhas = within(tabela).getAllByRole('row').slice(1)
    expect(linhas.map((l) => Array.from(l.querySelectorAll('td')).map((c) => c.textContent))).toEqual([
      ['Hello.', 'PT:Hello.'],
      ['Broken.', 'não traduzida'],
      ['Bye.', 'PT:Bye.'],
    ])
    expect(screen.getByText(/1 fala não foi traduzida/)).toBeTruthy()
  })
})
