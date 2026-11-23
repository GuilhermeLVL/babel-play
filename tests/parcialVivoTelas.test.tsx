// @vitest-environment jsdom
/**
 * O TEXTO EM CURSO DO PARCIAL (V6, flag `parciais_vivos`) CHEGA ÀS TELAS QUE LEEM O ESTADO DAS FALAS.
 *
 * Com a flag, o estado guarda só o 1º texto da fala em curso e o resto mora no armazém `parcialVivo`. O Intérprete, a Conversa virtual e o
 * iChat liam o estado (ou o texto que sobe ao App) e deixaram de ver o parcial: aqui cada uma assina o armazém (ou o lê na hora de montar o
 * contexto) e vê o texto de agora, sem a tela que as monta re-renderizar.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React, { useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ text: 'ok' }) })),
}))
vi.mock('../src/data/rotas/vocabulario', () => ({ fetchDeck: async () => [], exportarApkg: vi.fn() }))
vi.mock('../src/lib/consentimentoDeNuvem', () => ({
  consentiuNuvem: () => true,
  useConsentimentoDeNuvem: () => ({ consentiu: true, autorizar: async () => true }),
}))
vi.mock('../src/data/apiDoFeedback', () => ({ enviarFeedback: vi.fn(async () => true) }))
const contexto = vi.hoisted(() => ({ recebido: [] as string[] }))
vi.mock('../src/lib/ichatContext', async (orig) => ({
  ...(await orig<typeof import('../src/lib/ichatContext')>()),
  construirContextoDaTela: async (_v: unknown, _r: unknown, live: string) => {
    contexto.recebido.push(live)
    return 'Tela: Captura.'
  },
}))

import IChat from '../src/components/IChat'
import ConversaVirtual from '../src/components/views/captura/interprete/ConversaVirtual'
import ModoInterprete, { type FalaDoInterprete } from '../src/components/views/captura/interprete/ModoInterprete'
import { escreverParcialVivo, limparParcialVivo } from '../src/lib/captura/parcialVivo'
import { mudarEstadoDaTela } from '../src/lib/polimento/interprete'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
})
beforeEach(() => {
  localStorage.clear()
  contexto.recebido.length = 0
  mudarEstadoDaTela({ emCurso: false, trocados: false, folhaVirtual: false, depois: null })
})
afterEach(() => {
  cleanup()
  limparParcialVivo('sys-2')
  limparParcialVivo('p-1')
})

const escrever = (id: string, originalText: string) => act(() => escreverParcialVivo(id, { originalText }))
const coluna = (lado: 'meu' | 'outro') => screen.getByTestId(`interprete-${lado}`)

/** O estado das falas só tem o 1º texto da fala em curso (é o que a V6 grava nele). */
const parcial: FalaDoInterprete = {
  id: 'sys-2',
  originalText: 'Hello',
  translatedText: '',
  lado: 'outro',
  isPartial: true,
}

/** O pai que monta a tela e conta os seus renders: o texto do parcial não pode re-renderizá-lo. */
function PaiConta({ filho, conta }: { filho: (falas: FalaDoInterprete[]) => React.ReactNode; conta: { n: number } }) {
  conta.n++
  const [falas] = useState([parcial])
  return <>{filho(falas)}</>
}

describe('Conversa virtual vê o texto em curso', () => {
  it('a coluna de quem fala mostra o texto do armazém, e o pai não re-renderiza', () => {
    const conta = { n: 0 }
    render(
      <PaiConta
        conta={conta}
        filho={(falas) => (
          <ConversaVirtual
            idiomas={{ meu: 'pt-BR', outro: 'en-US' }}
            falas={falas}
            registrarPonte={() => {}}
            fontes={{ sistemaAtivo: () => true, microfoneAtivo: () => true }}
            abrirSistema={() => {}}
            alternarMicrofone={() => {}}
            vozNaturalDisponivel={false}
            aoSair={() => {}}
          />
        )}
      />,
    )
    expect(coluna('outro').querySelector('.int-ao-vivo')?.textContent?.trim()).toBe('Hello')
    escrever('sys-2', 'Hello there, how are')
    expect(coluna('outro').querySelector('.int-ao-vivo')?.textContent?.trim()).toBe('Hello there, how are')
    escrever('sys-2', 'Hello there, how are you today')
    expect(coluna('outro').querySelector('.int-ao-vivo')?.textContent?.trim()).toBe('Hello there, how are you today')
    expect(conta.n).toBe(1)
  })
})

/** O Intérprete só mostra o parcial da SUA metade enquanto ouve: o lado `meu` e o botão "Falar" dele apertado. */
const parcialMeu: FalaDoInterprete = { id: 'p-1', originalText: 'Oi', translatedText: '', lado: 'meu', isPartial: true }
const texto = () => (screen.getByTestId('interprete-meu').textContent ?? '').replace(/\s+/g, ' ')

describe('Intérprete vê o texto em curso', () => {
  const tela = (falas: FalaDoInterprete[]) => (
    <ModoInterprete
      idiomas={{ meu: 'pt-BR', outro: 'en-US' }}
      falas={falas}
      microfone={{ abrir: vi.fn(), fechar: vi.fn() }}
      registrarPonte={() => {}}
      vozNaturalDisponivel={false}
      layout="celular"
      aoSair={() => {}}
    />
  )

  it('a sua metade mostra o texto do armazém enquanto ouve, e o pai não re-renderiza', () => {
    const conta = { n: 0 }
    const Pai = () => {
      conta.n++
      const [falas] = useState([parcialMeu])
      return tela(falas)
    }
    render(<Pai />)
    fireEvent.click(screen.getByRole('button', { name: /Falar em Português/i }))
    expect(texto()).toContain('Oi')
    escrever('p-1', 'Oi, tudo bem com você')
    expect(texto()).toContain('Oi, tudo bem com você')
    escrever('p-1', 'Oi, tudo bem com você hoje')
    expect(texto()).toContain('Oi, tudo bem com você hoje')
    expect(conta.n).toBe(1)
  })

  it('sem nada no armazém (flag desligada) mostra o texto do estado, como sempre', () => {
    render(tela([parcialMeu]))
    fireEvent.click(screen.getByRole('button', { name: /Falar em Português/i }))
    expect(texto()).toContain('Oi')
    expect(texto()).not.toContain('tudo bem')
  })
})

describe('iChat vê o texto em curso', () => {
  const Casca = ({ aberto: inicio = true, vivo = 'Fechada.' }: { aberto?: boolean; vivo?: string }) => {
    const [aberto, setAberto] = useState(inicio)
    return (
      <IChat
        activeView="capture"
        selectedRecording={null}
        liveTranscription={vivo}
        onChangeView={vi.fn()}
        isOpen={aberto}
        setIsOpen={setAberto}
        isDocked={false}
        setIsDocked={vi.fn()}
        recordings={[]}
        metrics={null}
      />
    )
  }

  it('o contexto da tela soma o texto em curso ao que o App entrega (e o chip da tela acompanha)', async () => {
    render(<Casca />)
    expect(screen.getByText(/gravando, 1 palavra transcrita até agora/)).toBeTruthy()
    escrever('p-1', 'Hello there how are you')
    expect(screen.getByText(/gravando, 6 palavras transcritas até agora/)).toBeTruthy()
    const campo = screen.getByLabelText('Pergunte ao iChat') as HTMLInputElement
    fireEvent.change(campo, { target: { value: 'o que foi dito?' } })
    await act(async () => {
      fireEvent.keyDown(campo, { key: 'Enter' })
    })
    expect(contexto.recebido.at(-1)).toBe('Fechada. Hello there how are you')
  })

  it('sem parcial em curso (flag desligada), o contexto é o texto do App, como sempre', async () => {
    render(<Casca />)
    const campo = screen.getByLabelText('Pergunte ao iChat') as HTMLInputElement
    fireEvent.change(campo, { target: { value: 'oi' } })
    await act(async () => {
      fireEvent.keyDown(campo, { key: 'Enter' })
    })
    expect(contexto.recebido.at(-1)).toBe('Fechada.')
  })
})
