// @vitest-environment jsdom
/**
 * A BARRA E O PAINEL DO NARRADOR (v2): os botões de transporte com os atalhos anunciados, o passo fino da
 * velocidade, o temporizador de sono, os estilos de leitura, os ajustes (tom, volume, pausas, repetições), o
 * "Meu estilo" e as teclas (Espaço, vírgula, ponto, J, colchetes). O narrador é de mentira: o que importa aqui é
 * o que a tela pede a ele.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BarraDoNarrador, {
  aoTeclarNoNarrador,
  ATALHOS_DO_NARRADOR,
  PainelDaNarracao,
} from '../src/components/views/leitor/BarraDoNarrador'
import { ESTILOS_DE_LEITURA, OPCOES_PADRAO_DA_NARRACAO } from '../src/core/leitura/estilosDeLeitura'
import type { Narrador, VistaDoNarrador } from '../src/lib/leitor/narrador'
import { CHAVE_DO_MEU_ESTILO } from '../src/lib/leitor/preferenciasDaNarracao'

vi.mock('../src/components/voz/SeletorDeVoz', () => ({
  default: ({ idioma }: { idioma: string }) => <div data-testid="seletor-de-voz" data-idioma={idioma} />,
}))

function falso(opcoes = OPCOES_PADRAO_DA_NARRACAO) {
  const n = {
    opcoes,
    alternar: vi.fn(),
    anterior: vi.fn(),
    proxima: vi.fn(),
    voltar: vi.fn(),
    irParaCapitulo: vi.fn(),
    definirVelocidade: vi.fn(),
    definirOpcoes: vi.fn(),
    definirSono: vi.fn(),
  }
  return n as typeof n & Narrador
}

const vista = (o: Partial<VistaDoNarrador> = {}): VistaDoNarrador => ({
  fase: 'tocando',
  indice: 1,
  total: 10,
  frase: 'x',
  opcoes: OPCOES_PADRAO_DA_NARRACAO,
  sono: null,
  ...o,
})

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('a barra do narrador', () => {
  const montar = (n = falso(), v = vista()) =>
    render(
      <BarraDoNarrador
        vista={v}
        narrador={n}
        ajustesAbertos={false}
        aoAlternar={vi.fn()}
        aoAjustes={vi.fn()}
        aoParar={vi.fn()}
      />,
    )

  it('tem play/pausa, frases, voltar 10 s e capítulos, cada um chamando o narrador', () => {
    const n = falso()
    montar(n)
    fireEvent.click(screen.getByRole('button', { name: 'Capítulo anterior' }))
    expect(n.irParaCapitulo).toHaveBeenCalledWith(-1)
    fireEvent.click(screen.getByRole('button', { name: 'Próximo capítulo' }))
    expect(n.irParaCapitulo).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Voltar 10 segundos' }))
    expect(n.voltar).toHaveBeenCalledWith(10)
    fireEvent.click(screen.getByRole('button', { name: 'Frase anterior' }))
    expect(n.anterior).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Próxima frase' }))
    expect(n.proxima).toHaveBeenCalled()
  })

  it('o botão de tocar diz o que faz em cada fase e anuncia o atalho', () => {
    montar()
    const tocar = screen.getByRole('button', { name: 'Pausar a narração' })
    expect(tocar.getAttribute('aria-keyshortcuts')).toBe(ATALHOS_DO_NARRADOR.tocar)
    cleanup()
    montar(falso(), vista({ fase: 'pausada' }))
    expect(screen.getByRole('button', { name: 'Ouvir a narração' })).toBeTruthy()
    cleanup()
    montar(falso(), vista({ fase: 'parada' }))
    expect(screen.getByRole('button', { name: 'Frase anterior' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Voltar 10 segundos' }).hasAttribute('disabled')).toBe(true)
  })

  it('anuncia os atalhos de cada controle (aria-keyshortcuts)', () => {
    montar()
    const atalho = (nome: string) => screen.getByRole('button', { name: nome }).getAttribute('aria-keyshortcuts')
    expect(atalho('Frase anterior')).toBe(',')
    expect(atalho('Próxima frase')).toBe('.')
    expect(atalho('Voltar 10 segundos')).toBe('J')
    expect(atalho('Mais devagar')).toBe('[')
    expect(atalho('Mais rápido')).toBe(']')
  })

  it('velocidade: 0,5 a 2,5 em passos de 0,1, com − e +', () => {
    const n = falso({ ...OPCOES_PADRAO_DA_NARRACAO, velocidade: 1.3 })
    montar(n, vista({ opcoes: n.opcoes }))
    const seletor = screen.getByTestId('narrador-velocidade') as HTMLSelectElement
    const valores = [...seletor.options].map((o) => o.textContent)
    expect(valores).toHaveLength(21)
    expect(valores[0]).toBe('0,5×')
    expect(valores.at(-1)).toBe('2,5×')
    expect(seletor.value).toBe('1.3')
    fireEvent.click(screen.getByRole('button', { name: 'Mais rápido' }))
    expect(n.definirVelocidade).toHaveBeenLastCalledWith(1.4)
    fireEvent.click(screen.getByRole('button', { name: 'Mais devagar' }))
    expect(n.definirVelocidade).toHaveBeenLastCalledWith(1.2)
    fireEvent.change(seletor, { target: { value: '2.5' } })
    expect(n.definirVelocidade).toHaveBeenLastCalledWith(2.5)
  })

  it('as pontas da velocidade travam os botões', () => {
    montar(falso(), vista({ opcoes: { ...OPCOES_PADRAO_DA_NARRACAO, velocidade: 2.5 } }))
    expect(screen.getByRole('button', { name: 'Mais rápido' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Mais devagar' }).hasAttribute('disabled')).toBe(false)
  })

  it('temporizador de sono: 15, 30, 60 min, fim do capítulo e desligar', () => {
    const n = falso()
    montar(n)
    const sono = screen.getByTestId('narrador-sono') as HTMLSelectElement
    expect([...sono.options].map((o) => o.value)).toEqual(['', '15', '30', '60', 'capitulo'])
    fireEvent.change(sono, { target: { value: '30' } })
    expect(n.definirSono).toHaveBeenLastCalledWith(30)
    fireEvent.change(sono, { target: { value: 'capitulo' } })
    expect(n.definirSono).toHaveBeenLastCalledWith('capitulo')
    fireEvent.change(sono, { target: { value: '' } })
    expect(n.definirSono).toHaveBeenLastCalledWith(null)
  })

  it('com o sono armado, a tela mostra quanto falta', () => {
    montar(falso(), vista({ sono: { tipo: 'minutos', ate: Date.now() + 12 * 60_000 } }))
    const sono = screen.getByTestId('narrador-sono') as HTMLSelectElement
    expect(sono.value).toBe('ativo')
    expect(sono.selectedOptions[0].textContent).toBe('Para em 12 min')
  })
})

describe('os atalhos de teclado', () => {
  const tecla = (key: string, alvo: Element | Document = document.body, extra: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
    Object.defineProperty(e, 'target', { value: alvo })
    return e
  }

  it('Espaço toca/pausa; vírgula e ponto mudam a frase; J volta 10 s; colchetes mudam a velocidade', () => {
    const n = falso({ ...OPCOES_PADRAO_DA_NARRACAO, velocidade: 1 })
    expect(aoTeclarNoNarrador(tecla(' '), n)).toBe(true)
    expect(n.alternar).toHaveBeenCalled()
    expect(aoTeclarNoNarrador(tecla(','), n)).toBe(true)
    expect(n.anterior).toHaveBeenCalled()
    expect(aoTeclarNoNarrador(tecla('.'), n)).toBe(true)
    expect(n.proxima).toHaveBeenCalled()
    expect(aoTeclarNoNarrador(tecla('J'), n)).toBe(true)
    expect(n.voltar).toHaveBeenCalledWith(10)
    expect(aoTeclarNoNarrador(tecla(']'), n)).toBe(true)
    expect(n.definirVelocidade).toHaveBeenLastCalledWith(1.1)
    expect(aoTeclarNoNarrador(tecla('['), n)).toBe(true)
    expect(n.definirVelocidade).toHaveBeenLastCalledWith(0.9)
  })

  it('Espaço num botão é do botão, e em campo de texto ou seletor ninguém toma a tecla', () => {
    const n = falso()
    const botao = document.createElement('button')
    const campo = document.createElement('select')
    expect(aoTeclarNoNarrador(tecla(' ', botao), n)).toBe(false)
    expect(aoTeclarNoNarrador(tecla(' ', campo), n)).toBe(false)
    expect(aoTeclarNoNarrador(tecla('.', campo), n)).toBe(false)
    expect(n.alternar).not.toHaveBeenCalled()
  })

  it('as setas só mudam a frase com o foco dentro da barra (no texto elas viram a página)', () => {
    const n = falso()
    const barra = document.createElement('section')
    barra.className = 'leitor-narrador'
    const dentro = document.createElement('button')
    barra.append(dentro)
    document.body.append(barra)
    expect(aoTeclarNoNarrador(tecla('ArrowRight'), n)).toBe(false)
    expect(aoTeclarNoNarrador(tecla('ArrowRight', dentro), n)).toBe(true)
    expect(n.proxima).toHaveBeenCalledTimes(1)
    expect(aoTeclarNoNarrador(tecla('ArrowLeft', dentro), n)).toBe(true)
    expect(n.anterior).toHaveBeenCalledTimes(1)
    barra.remove()
  })

  it('com Ctrl/Cmd/Alt a tecla é do navegador; sem narrador, nada', () => {
    const n = falso()
    expect(aoTeclarNoNarrador(tecla(' ', document.body, { ctrlKey: true }), n)).toBe(false)
    expect(aoTeclarNoNarrador(tecla(' '), null)).toBe(false)
  })
})

describe('o painel da narração', () => {
  const montar = (n = falso(), o = OPCOES_PADRAO_DA_NARRACAO) =>
    render(
      <PainelDaNarracao
        modo="original"
        seguir
        opcoes={o}
        narrador={n}
        idiomaDoLivro="en"
        idiomaDaPessoa="pt"
        nuvem={false}
        convite={false}
        aoModo={vi.fn()}
        aoSeguir={vi.fn()}
        aoEscolherVoz={vi.fn()}
      />,
    )

  it('mostra os cinco estilos, com o atual marcado, e aplica o escolhido na hora', () => {
    const n = falso()
    montar(n)
    const grupo = screen.getByRole('radiogroup', { name: 'Estilo de leitura' })
    const nomes = within(grupo)
      .getAllByRole('radio')
      .map((r) => r.getAttribute('data-estilo'))
    expect(nomes).toEqual(['natural', 'audiolivro', 'dinamico', 'estudo', 'foco'])
    expect((within(grupo).getByRole('radio', { name: /Natural/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(within(grupo).getByRole('radio', { name: /Audiolivro/ }))
    expect(n.definirOpcoes).toHaveBeenLastCalledWith(ESTILOS_DE_LEITURA.audiolivro.ajustes, { adiar: false })
    fireEvent.click(within(grupo).getByRole('radio', { name: /Estudo/ }))
    expect(n.definirOpcoes).toHaveBeenLastCalledWith(ESTILOS_DE_LEITURA.estudo.ajustes, { adiar: false })
  })

  it('tom, volume, velocidade e pausas: cada controle manda só o seu valor', () => {
    const n = falso()
    montar(n)
    fireEvent.change(screen.getByTestId('narr-tom'), { target: { value: '0.8' } })
    expect(n.definirOpcoes).toHaveBeenLastCalledWith({ tom: 0.8 })
    fireEvent.change(screen.getByTestId('narr-volume'), { target: { value: '0.5' } })
    expect(n.definirOpcoes).toHaveBeenLastCalledWith({ volume: 0.5 })
    fireEvent.change(screen.getByTestId('narr-velocidade'), { target: { value: '1.8' } })
    expect(n.definirOpcoes).toHaveBeenLastCalledWith({ velocidade: 1.8 })
    fireEvent.change(screen.getByTestId('narr-pausa-frase'), { target: { value: '0.6' } })
    expect(n.definirOpcoes).toHaveBeenLastCalledWith({ pausaFrase: 0.6 })
    fireEvent.change(screen.getByTestId('narr-pausa-paragrafo'), { target: { value: '1.2' } })
    expect(n.definirOpcoes).toHaveBeenLastCalledWith({ pausaParagrafo: 1.2 })
    fireEvent.change(screen.getByTestId('narr-repeticoes'), { target: { value: '3' } })
    expect(n.definirOpcoes).toHaveBeenLastCalledWith({ repeticoes: 3 })
  })

  it('os controles dizem o valor em palavras (tom) e em unidade (pausa, velocidade)', () => {
    montar(falso(), { ...OPCOES_PADRAO_DA_NARRACAO, tom: 0.8, pausaFrase: 0.5, velocidade: 1.5, volume: 0.25 })
    expect(screen.getByTestId('narr-tom').getAttribute('aria-valuetext')).toBe('Mais grave')
    expect(screen.getByTestId('narr-pausa-frase').getAttribute('aria-valuetext')).toBe('0,5 s')
    expect(screen.getByTestId('narr-velocidade').getAttribute('aria-valuetext')).toBe('1,5×')
    expect(screen.getByTestId('narr-volume').getAttribute('aria-valuetext')).toBe('25%')
  })

  it('"Meu estilo": salva os ajustes atuais e passa a aparecer como opção', () => {
    const personalizado = { ...OPCOES_PADRAO_DA_NARRACAO, velocidade: 1.2, tom: 1.1 }
    const n = falso(personalizado)
    montar(n, personalizado)
    expect(document.querySelector('[data-estilo="meu"]')).toBeNull()
    fireEvent.click(screen.getByTestId('salvar-meu-estilo'))
    expect(JSON.parse(localStorage.getItem(CHAVE_DO_MEU_ESTILO)!)).toMatchObject({ velocidade: 1.2, tom: 1.1 })
    const meu = document.querySelector('[data-estilo="meu"]') as HTMLInputElement
    expect(meu).toBeTruthy()
    expect(meu.checked).toBe(true)
    expect((screen.getByTestId('salvar-meu-estilo') as HTMLButtonElement).disabled).toBe(true)
  })

  it('diz em UMA frase que pausar volta ao início da frase', () => {
    montar()
    expect(screen.getByTestId('nota-pausar').textContent).toBe(
      'Ao pausar, a leitura volta ao início da frase quando você continua.',
    )
  })

  it('o modo bilíngue pede também a voz do idioma da pessoa', () => {
    render(
      <PainelDaNarracao
        modo="bilingue"
        seguir
        opcoes={OPCOES_PADRAO_DA_NARRACAO}
        narrador={falso()}
        idiomaDoLivro="en"
        idiomaDaPessoa="pt"
        nuvem={false}
        convite={false}
        aoModo={vi.fn()}
        aoSeguir={vi.fn()}
        aoEscolherVoz={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId('seletor-de-voz').map((e) => e.getAttribute('data-idioma'))).toEqual(['en', 'pt'])
  })
})
