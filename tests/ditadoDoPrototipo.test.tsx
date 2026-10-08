// @vitest-environment jsdom
/**
 * O DITADO DO PROTÓTIPO (`src/components/minigames/DitadoDoPrototipo.tsx`), porte de `jogos2.js:692-763`:
 * a cena (ouvir, devagar, campo, Conferir, correção, pular) e as regras: o limiar por nível (70, 80, 90 %),
 * a segunda chance (Fácil e Médio, uma vez por fala, nunca ao pular; o começo certo fica no campo e o
 * resto sai sozinho) e a dica, que escreve até a próxima palavra certa.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RodadaDitado, RoundReport } from '../src/core'

/* O aparelho do teste é um computador: é onde o desenho novo (e o placar do protótipo) liga. */
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...m, perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), tipo: 'desktop-com-gpu' }) }
})
vi.mock('../src/lib/juice', () => ({
  contarAte: vi.fn(async () => {}),
  comemorar: vi.fn(),
  pontosDoElemento: vi.fn(),
  pontosFlutuantes: vi.fn(),
  tremor: vi.fn(),
  tremorDeTela: vi.fn(),
  pulsoDeZoom: vi.fn(),
  flashDeTela: vi.fn(),
  vibrar: vi.fn(),
  executarEfeito: vi.fn(),
  glitchDeTela: vi.fn(),
  multiplicador: () => 1,
}))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn(), somMudo: () => true }))

const { default: DitadoDoPrototipo } = await import('../src/components/minigames/DitadoDoPrototipo')

/* Dez palavras: cada uma vale 10 %, e os três limiares caem em contas redondas. */
const DEZ = 'one two three four five six seven eight nine ten'
const fala = (id: string, text: string, translation: string) => ({
  id,
  text,
  lang: 'en',
  startMs: 0,
  endMs: 0,
  translation,
})
const rodadas = (texto = 'Where is the train station') =>
  [
    { fala: fala('d1', texto, 'Onde fica'), palavras: 5 },
    { fala: fala('d2', 'We ship the order today', 'Hoje'), palavras: 5 },
  ] as RodadaDitado[]

const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null
const qq = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
const nivel = (n: 'facil' | 'medio' | 'dificil') => localStorage.setItem('babel.nivel.ditado', n)

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho').forEach((x) => x.remove())
  vi.useRealTimers()
  vi.clearAllMocks()
})

const montar = (texto?: string) =>
  render(
    <section className="palco-jogo">
      <DitadoDoPrototipo
        rodadas={rodadas(texto)}
        audioUrl=""
        onFinish={(r) => (relatorio = r)}
        onExit={() => undefined}
      />
    </section>,
  )
const campo = () => q<HTMLInputElement>('.pj-entrada input')!
const escrever = (texto: string) => fireEvent.change(campo(), { target: { value: texto } })
const conferir = () => fireEvent.click(q('[data-pj="conferir"]')!)
const pular = () => fireEvent.click(q('[data-pj="pular"]')!)
const feito = () => relatorio as RoundReport | null
/** As primeiras `n` palavras certas e o resto trocado. */
const comCertas = (n: number) =>
  DEZ.split(' ')
    .map((w, k) => (k < n ? w : 'x'))
    .join(' ')

describe('a cena do Ditado', () => {
  it('tem a instrução e as peças do protótipo, na ordem', () => {
    montar()
    expect(q('.pj-instr')?.textContent).toBe('Escute com atenção e escreva o que ouviu. Acento e pontuação não contam.')
    expect([...q('.pj-miolo')!.children].map((e) => e.className)).toEqual([
      'pj-acoes',
      'pj-entrada',
      'pj-correcao',
      'pj-link',
    ])
    expect(q('.pj-acoes > .btn.btn-solid.pj-grande[data-pj="ouvir"]')?.textContent?.trim()).toBe('Ouvir fala')
    expect(q('.pj-acoes > .btn.btn-outline[data-pj="devagar"]')?.textContent?.trim()).toBe('devagar')
    expect(campo().placeholder).toBe('escreva o que ouviu…')
    expect(campo().getAttribute('aria-label')).toBe('O que você ouviu')
    expect(campo().getAttribute('lang')).toBe('en')
    expect(q('.pj-entrada > .btn.btn-solid[data-pj="conferir"]')?.textContent?.trim()).toBe('Conferir')
    expect(q('.pj-correcao')?.childElementCount).toBe(0)
    expect(q('.pj-link[data-pj="pular"]')?.textContent?.trim()).toBe('não consigo, pular')
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('0 de 2 falas')
  })

  it('as ajudas do placar: Dica (3 no Médio) e Ver resposta', () => {
    montar()
    expect(qq('.hud-ajudas .ajuda-jogo').map((b) => b.dataset.ajuda)).toEqual(['palavra', 'resposta'])
    expect(q('[data-ajuda="palavra"]')?.textContent?.replace(/\s/g, '')).toBe('Dica3')
  })
})

describe('a segunda chance (Fácil e Médio)', () => {
  it('a primeira conferência abaixo do limiar não fecha a fala: o começo certo fica, o resto sai', () => {
    montar()
    escrever('where is a bus stop')
    conferir()
    expect(campo().value).toBe('Where is ')
    expect(campo().disabled).toBe(false)
    expect(q('.pj-correcao > .pj-aviso')?.textContent).toBe(
      'As 2 primeiras palavras ficaram; o resto saiu. Ouça de novo e complete: você tem mais uma tentativa.',
    )
    // A correção palavra a palavra não aparece antes da hora: seria a resposta.
    expect(q('.pj-palavras')).toBeNull()
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('0 de 2 falas')
    esperar(5000)
    expect(feito()).toBeNull()
  })

  it('os três textos do aviso: nenhuma, uma e várias palavras no lugar', () => {
    montar()
    escrever('nothing right here')
    conferir()
    expect(campo().value).toBe('')
    expect(q('.pj-aviso')?.textContent).toBe('Ainda não. Ouça de novo e complete: você tem mais uma tentativa.')
    cleanup()
    montar()
    escrever('where are we now')
    conferir()
    expect(campo().value).toBe('Where ')
    expect(q('.pj-aviso')?.textContent).toBe(
      'A primeira palavra ficou; o resto saiu. Ouça de novo e complete: você tem mais uma tentativa.',
    )
  })

  it('conferir o campo vazio também só gasta a segunda chance', () => {
    montar()
    conferir()
    expect(q('.pj-aviso')?.textContent).toMatch(/^Ainda não\./)
    expect(campo().disabled).toBe(false)
  })

  it('corrigir na segunda tentativa vale como acerto, com duas tentativas na conta', () => {
    montar()
    escrever('where is a bus stop')
    conferir()
    escrever('Where is the train station')
    conferir()
    expect(campo().disabled).toBe(true)
    expect(q('.pj-correcao > p')?.textContent).toBe('5 de 5 palavras, 100%')
    expect(q('.ganho.erro')).toBeNull()
    expect(q<HTMLElement>('[data-pj="pular"]')?.hidden).toBe(true)
    esperar(1699)
    expect(campo().disabled).toBe(true)
    esperar(1)
    expect(campo().disabled).toBe(false)
    expect(q('.pj-correcao')?.childElementCount).toBe(0)
    pular()
    esperar(3400 + 899)
    expect(feito()).toBeNull()
    esperar(1)
    expect(feito()?.gameId).toBe('ditado')
    expect(feito()?.items[0]).toMatchObject({ itemRef: 'd1', correct: true, attempts: 2 })
    expect(feito()?.items[1]).toMatchObject({ itemRef: 'd2', correct: false, revealed: true })
  })

  it('a segunda conferência errada fecha a fala: correção palavra a palavra, o escrito riscado e 3400 ms', () => {
    montar()
    escrever('where is a bus stop')
    conferir()
    escrever('Where is a train')
    conferir()
    expect(q('.pj-correcao > p')?.textContent).toBe('3 de 5 palavras, 60%')
    expect(q('.ganho.erro')?.textContent).toBe('Abaixo de 80%')
    const palavras = qq('.pj-palavras > span')
    expect(palavras.map((s) => s.className)).toEqual(['ok', 'ok', 'no', 'ok', 'no'])
    expect(palavras.map((s) => s.style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3', '4'])
    expect(palavras[2].querySelector('small')?.textContent).toBe('a')
    expect(palavras[4].querySelector('small')?.textContent).toBe('-')
    expect(q('.pj-correcao > p:last-child')?.textContent).toBe('Onde fica')
    esperar(3399)
    expect(campo().disabled).toBe(true)
    esperar(1)
    expect(campo().disabled).toBe(false)
    expect(campo().value).toBe('')
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('1 de 2 falas')
  })

  it('a segunda chance é uma por fala: a fala seguinte tem a sua', () => {
    montar()
    escrever('x')
    conferir()
    escrever('y')
    conferir()
    esperar(3400)
    escrever('z')
    conferir()
    expect(q('.pj-aviso')?.textContent).toMatch(/^Ainda não\./)
    expect(q('.pj-palavras')).toBeNull()
  })

  it('pular não dá segunda chance: fecha a fala na hora, como desistência', () => {
    montar()
    escrever('where')
    pular()
    expect(q('.pj-aviso')).toBeNull()
    expect(q('.pj-palavras')).not.toBeNull()
    expect(campo().disabled).toBe(true)
  })

  it('Enter no campo confere', () => {
    montar()
    escrever('Where is the train station')
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(q('.pj-correcao > p')?.textContent).toBe('5 de 5 palavras, 100%')
  })
})

describe('o limiar por nível', () => {
  /** `true` passou, `false` fechou como erro, `null` caiu na segunda chance. */
  const passa = (certas: number) => {
    escrever(comCertas(certas))
    conferir()
    return q('.pj-palavras') ? !q('.ganho.erro') : null
  }
  const outraVez = () => {
    cleanup()
    document.querySelectorAll('.ganho').forEach((x) => x.remove())
    montar(DEZ)
  }

  it('Médio: vale com 80 %, e 70 % cai na segunda chance', () => {
    montar(DEZ)
    expect(passa(8)).toBe(true)
    expect(q('.pj-correcao > p')?.textContent).toBe('8 de 10 palavras, 80%')
    outraVez()
    expect(passa(7)).toBeNull()
    expect(q('.pj-aviso')?.textContent).toMatch(/^As 7 primeiras palavras ficaram/)
    // Na segunda, 70 % ainda não vale no Médio.
    expect(passa(7)).toBe(false)
    expect(q('.ganho.erro')?.textContent).toBe('Abaixo de 80%')
  })

  it('Fácil: vale com 70 %, e há segunda chance abaixo disso', () => {
    nivel('facil')
    montar(DEZ)
    expect(passa(7)).toBe(true)
    expect(q('[data-ajuda="palavra"]')?.textContent?.replace(/\s/g, '')).toBe('Dica4')
    outraVez()
    expect(passa(6)).toBeNull()
    expect(passa(6)).toBe(false)
    expect(q('.ganho.erro')?.textContent).toBe('Abaixo de 70%')
  })

  it('Difícil: precisa de 90 %, e não há segunda chance', () => {
    nivel('dificil')
    montar(DEZ)
    expect(passa(9)).toBe(true)
    expect(q('[data-ajuda="palavra"]')?.textContent?.replace(/\s/g, '')).toBe('Dica2')
    outraVez()
    expect(passa(8)).toBe(false)
    expect(q('.ganho.erro')?.textContent).toBe('Abaixo de 90%')
    expect(q('.pj-aviso')).toBeNull()
  })
})

describe('a dica do Ditado', () => {
  it('escreve até a próxima palavra certa, gasta uma e marca a fala como com dica', () => {
    montar()
    const dica = q<HTMLButtonElement>('[data-ajuda="palavra"]')!
    fireEvent.click(dica)
    expect(campo().value).toBe('Where ')
    expect(q('.ganho')?.textContent).toBe('palavra 1')
    escrever('where is xx')
    fireEvent.click(dica)
    expect(campo().value).toBe('Where is the ')
    expect(dica.textContent?.replace(/\s/g, '')).toBe('Dica1')
    escrever('Where is the train station')
    conferir()
    esperar(1700)
    pular()
    esperar(3400 + 900)
    expect(feito()?.items[0]).toMatchObject({ correct: true, hinted: true })
  })

  it('com a fala inteira já escrita a dica não gasta', () => {
    montar()
    escrever('where is the train station')
    fireEvent.click(q('[data-ajuda="palavra"]')!)
    expect(q('[data-ajuda="palavra"]')?.textContent?.replace(/\s/g, '')).toBe('Dica3')
  })
})
