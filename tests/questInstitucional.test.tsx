// @vitest-environment jsdom
/**
 * SOBRE, AJUDA, DIAGNÓSTICO E 404 NO META QUEST (segunda rodada do headset, 01/10/2026).
 *
 * A regra do guia (`docs/design/quest-desenho.md`): NENHUMA FUNÇÃO SOME. Cada teste monta a tela no
 * desenho do headset e confere que o que a tela de sempre oferece continua alcançável. O diagnóstico
 * tem um cuidado a mais: é por ele que o dono religa as telas novas, então a tela de sempre (chave
 * desligada) ganha o caminho de volta no topo.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import Ajuda from '../src/components/views/Ajuda'
import Diagnostico from '../src/components/views/Diagnostico'
import NaoEncontrado from '../src/components/views/NaoEncontrado'
import Sobre from '../src/components/views/Sobre'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const quest = vi.hoisted(() => ({ ligado: true, aparelho: 'quest' as string }))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()
  return { ...real, useQuestNovo: () => quest.ligado }
})
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: quest.aparelho }) }
})
const som = vi.hoisted(() => ({ play: vi.fn() }))
vi.mock('../src/lib/soundFx', () => som)

beforeAll(() => {
  prepararDialogoNoJsdom()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ status: 'ok' }))),
  )
})
beforeEach(() => {
  quest.ligado = true
  quest.aparelho = 'quest'
  som.play.mockReset()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

const aba = (nome: string) => screen.getByRole('tab', { name: nome })

describe('Sobre no Quest', () => {
  it('quatro abas; quem faz o app e as redes preenchidas na primeira', () => {
    const { container } = render(<Sobre />)
    expect(container.querySelector('.q-palco.q-inst')).not.toBeNull()
    expect(container.querySelector('.tela')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Sobre o Babel Play' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual([
      'Quem faz',
      'A história',
      'Quer ajudar?',
      'Dados e termos',
    ])
    expect(screen.getByRole('link', { name: 'Portfólio' }).getAttribute('href')).toMatch(/^https:/)
    expect(screen.getByRole('link', { name: 'GitHub' })).toBeTruthy()
    // Rede com placeholder não vira link quebrado.
    expect(screen.queryByRole('link', { name: 'LinkedIn' })).toBeNull()
    // Um único botão principal na tela.
    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    expect(screen.getByText('Grátis para aprender')).toBeTruthy()
  })

  it('a história e a citação', () => {
    render(<Sobre />)
    fireEvent.click(aba('A história'))
    expect(screen.getByText(/aprender aqui vai continuar sendo de graça/)).toBeTruthy()
    expect(screen.getByText(/Você não precisa largar o que gosta de assistir/)).toBeTruthy()
  })

  it('quer ajudar: estrela, comentário e "Assine um plano", que leva aos Planos', () => {
    const aoVerPlanos = vi.fn()
    render(<Sobre onVerPlanos={aoVerPlanos} />)
    fireEvent.click(aba('Quer ajudar?'))
    expect(screen.getByRole('link', { name: /Deixe uma estrela no GitHub/ }).getAttribute('href')).toContain(
      '/babel-play',
    )
    expect(screen.getByRole('link', { name: /Me conte o que faltou/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Assine um plano/ }))
    expect(aoVerPlanos).toHaveBeenCalledWith('planos')
    // O Pix só aparece com a chave preenchida.
    expect(screen.queryByTestId('pix-do-quest')).toBeNull()
  })

  it('política, termos, os dados abertos e a lista completa de fontes', () => {
    render(<Sobre />)
    fireEvent.click(aba('Dados e termos'))
    for (const nome of ['Wikcionário (Wiktionary)', 'Wikidata Lexemes', 'Tatoeba', 'FrequencyWords (OpenSubtitles)'])
      expect(screen.getByRole('link', { name: new RegExp(nome.replace(/[()]/g, '\\$&')) })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Lista completa de fontes e autores/ }).getAttribute('href')).toContain(
      'FONTES.md',
    )
    fireEvent.click(screen.getByRole('button', { name: /Termos de uso/ }))
    expect(screen.getByRole('dialog', { name: 'Termos de uso' })).toBeTruthy()
    cleanup()
    render(<Sobre />)
    fireEvent.click(aba('Dados e termos'))
    fireEvent.click(screen.getByRole('button', { name: /Política de privacidade/ }))
    expect(screen.getByRole('dialog', { name: 'Política de privacidade' })).toBeTruthy()
  })
})

describe('Ajuda no Quest', () => {
  it('busca, os três artigos que abrem o guia, e o estado do servidor', async () => {
    const { container } = render(<Ajuda />)
    expect(container.querySelector('.q-palco.q-inst')).not.toBeNull()
    expect(container.querySelectorAll('.q-tile')).toHaveLength(3)
    await waitFor(() =>
      expect(screen.getByTestId('estado-do-servidor').textContent).toContain('Todos os sistemas funcionando'),
    )

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar na ajuda' }), { target: { value: 'revisão' } })
    expect(container.querySelectorAll('.q-tile')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Como funciona a revisão/ }))
    expect(screen.getByRole('dialog', { name: 'Guia rápido' })).toBeTruthy()
  })

  it('busca sem resultado: diz o que houve e oferece limpar', () => {
    const { container } = render(<Ajuda />)
    const busca = screen.getByRole('searchbox', { name: 'Buscar na ajuda' }) as HTMLInputElement
    fireEvent.change(busca, { target: { value: 'zzzz' } })
    expect(container.querySelectorAll('.q-tile')).toHaveLength(0)
    expect(screen.getByText('Nada encontrado para “zzzz”')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar a busca' }))
    expect(busca.value).toBe('')
    expect(container.querySelectorAll('.q-tile')).toHaveLength(3)
  })

  it('atalhos: a lista não ocupa a tela, mas "Ver todos" abre o mesmo diálogo; o contato continua', () => {
    const { container } = render(<Ajuda />)
    expect(container.querySelector('kbd')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Atalhos de teclado.*Ver todos/ }))
    const dlg = screen.getByRole('dialog', { name: 'Atalhos de teclado' })
    expect(dlg.querySelectorAll('.atalho')).toHaveLength(5)
    expect(within(screen.getByTestId('contato-do-quest')).getByRole('link', { name: 'GitHub' })).toBeTruthy()
    // No headset a linha diz por que a lista não está na tela.
    expect(screen.getByText(/O headset não tem teclado/)).toBeTruthy()
  })

  it('no computador com o desenho novo: os atalhos ficam à vista, como na tela de sempre, e nada fala em headset', () => {
    quest.aparelho = 'desktop-com-gpu'
    const { container } = render(<Ajuda />)
    expect(container.querySelector('.q-palco.q-inst')).not.toBeNull()
    const aVista = screen.getByTestId('atalhos-a-vista')
    expect(aVista.querySelectorAll('.atalho')).toHaveLength(4)
    expect(aVista.textContent).toContain('Buscar gravação, palavra ou tela')
    expect(aVista.querySelectorAll('kbd').length).toBeGreaterThan(3)
    // O trilho não recolhe: o Ctrl+B do menu lateral de sempre não é prometido aqui.
    expect(container.textContent).not.toContain('Recolher ou abrir o menu lateral')
    expect(container.textContent).not.toMatch(/headset/i)

    fireEvent.click(within(aVista).getByRole('button', { name: 'Ver todos' }))
    const dlg = screen.getByRole('dialog', { name: 'Atalhos de teclado' })
    expect(dlg.querySelectorAll('.atalho')).toHaveLength(4)
    expect(dlg.textContent).not.toContain('Recolher ou abrir o menu lateral')
    // O resto da tela é o mesmo: os três artigos e o contato.
    expect(container.querySelectorAll('.q-tile')).toHaveLength(3)
    expect(within(screen.getByTestId('contato-do-quest')).getByRole('link', { name: 'GitHub' })).toBeTruthy()
  })
})

describe('Diagnóstico no Quest', () => {
  it('as seis abas; tudo fica montado: o perfil e o JSON existem em qualquer aba', async () => {
    const { container } = render(<Diagnostico />)
    expect(container.querySelector('.q-palco.q-diag')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Diagnóstico do aparelho' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual([
      'Aparelho',
      'Som',
      'Velocidade',
      'Última captura',
      'Headset',
      'Resultado',
    ])
    await waitFor(() => expect(screen.getByTestId('diagnostico-perfil')).toBeTruthy())
    expect(screen.getByTestId('diagnostico-sinais').textContent).toContain('Núcleos que o navegador vê')
    const json = JSON.parse((screen.getByTestId('diagnostico-json') as HTMLTextAreaElement).value)
    expect(json.microfone).toBeNull()
    expect(json.modelos).toEqual([])
    /* A chave das telas novas saiu com o desenho de antes: o relatório não a traz mais. */
    expect(json).not.toHaveProperty('telaNova')

    // Só um painel à vista por vez.
    const visiveis = () =>
      [...container.querySelectorAll('[role="tabpanel"]')].filter((p) => !(p as HTMLElement).hidden)
    expect(visiveis().map((p) => p.id)).toEqual(['painel-aparelho'])
    fireEvent.click(aba('Som'))
    expect(visiveis().map((p) => p.id)).toEqual(['painel-som'])
  })

  it('cada medida continua com o próprio botão, e copiar é o único principal', async () => {
    const { container } = render(<Diagnostico />)
    for (const nome of [
      'Testar o microfone',
      'Testar o compartilhamento',
      'Medir no processador',
      'Medir na placa de vídeo',
      'Medir na nuvem',
    ])
      expect(screen.getByRole('button', { name: nome, hidden: true })).toBeTruthy()
    expect(screen.getByTestId('diagnostico-ultima-captura').textContent).toContain('Nenhuma captura medida ainda')

    const principais = container.querySelectorAll('.q-ctl.pri')
    expect(principais).toHaveLength(1)
    const escrever = vi.fn(async (_texto: string) => {})
    Object.assign(navigator, { clipboard: { writeText: escrever } })
    fireEvent.click(principais[0])
    await waitFor(() => expect(principais[0].textContent).toContain('Copiado'))
    expect(JSON.parse(escrever.mock.calls[0][0] as string).vibracao).toBeNull()
  })

  it('copiar quando a área de transferência falha: abre o Resultado, seleciona o texto e não diz "Copiado"', async () => {
    const { container } = render(<Diagnostico />)
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error('negado')
        }),
      },
    })
    const copiar = container.querySelector('.q-ctl.pri') as HTMLButtonElement
    fireEvent.click(copiar)
    expect((await screen.findByTestId('copia-a-mao')).textContent).toMatch(/Não deu para copiar sozinho/)
    expect(aba('Resultado').getAttribute('aria-selected')).toBe('true')
    expect((container.querySelector('#painel-resultado') as HTMLElement).hidden).toBe(false)
    const caixa = screen.getByTestId('diagnostico-json') as HTMLTextAreaElement
    await waitFor(() => expect(document.activeElement).toBe(caixa))
    expect(caixa.selectionStart).toBe(0)
    expect(caixa.selectionEnd).toBe(caixa.value.length)
    expect(copiar.textContent).not.toContain('Copiado')
    expect(copiar.textContent).toContain('Copiar o resultado')
  })

  it('headset: a vibração em três botões e a chave de dono; a chave das telas novas não existe mais', async () => {
    render(<Diagnostico />)
    fireEvent.click(aba('Headset'))

    const grupo = within(screen.getByRole('group', { name: 'Testar a vibração do controle' }))
    fireEvent.click(grupo.getByRole('button', { name: 'Forte' }))
    const resultado = await screen.findByTestId('diagnostico-vibracao')
    expect(resultado.textContent).toMatch(/Nenhum controle à vista/)
    // O jsdom não tem `navigator.vibrate` nem Gamepad API: as duas linhas dizem isso.
    expect(resultado.textContent).toMatch(/Vibração pelo navegador.*não existe aqui/)
    expect(resultado.textContent).toContain('nenhum')
    // Nada vibrou: o teste toca o som que o app usa no lugar.
    expect(som.play).toHaveBeenCalledWith('apontar')
    let json = JSON.parse((screen.getByTestId('diagnostico-json') as HTMLTextAreaElement).value)
    expect(json.vibracao).toEqual({ teste: 'forte', vibrate: null, controles: [] })

    fireEvent.click(grupo.getByRole('button', { name: 'Som no lugar' }))
    await waitFor(() => expect(resultado.textContent).toMatch(/Tocou o som que o app usa no lugar/))
    json = JSON.parse((screen.getByTestId('diagnostico-json') as HTMLTextAreaElement).value)
    expect(json.vibracao).toEqual({ teste: 'som', vibrate: null, controles: [] })

    fireEvent.change(screen.getByLabelText('Chave de dono'), { target: { value: ' segredo ' } })
    expect(localStorage.getItem('babel.chaveDoDono')).toBe('segredo')

    expect(screen.queryByRole('button', { name: /Telas novas/ })).toBeNull()
    expect(localStorage.getItem('babel.quest.telaNova')).toBeNull()
  })

  it('vibração: os DOIS caminhos (navigator.vibrate e o motor do controle) e o relato por controle no JSON', async () => {
    const vibrate = vi.fn(() => true)
    const playEffect = vi.fn(async () => 'complete')
    const controles = [
      { id: 'Oculus Touch (Right)', index: 0, buttons: [], vibrationActuator: { playEffect } },
      { id: 'Controle sem motor', index: 1, buttons: [] },
    ]
    Object.assign(navigator, { vibrate, getGamepads: () => controles })
    try {
      render(<Diagnostico />)
      fireEvent.click(aba('Headset'))
      const grupo = within(screen.getByRole('group', { name: 'Testar a vibração do controle' }))
      fireEvent.click(grupo.getByRole('button', { name: 'Suave' }))
      const resultado = await screen.findByTestId('diagnostico-vibracao')
      expect(vibrate).toHaveBeenCalledTimes(1)
      expect(playEffect).toHaveBeenCalledTimes(1)
      expect(resultado.textContent).toMatch(/Vibração pelo navegador.*sim/)
      expect(resultado.textContent).toContain('Oculus Touch (Right): vibrou')
      expect(resultado.textContent).toContain('Controle sem motor: sem motor')
      // Vibrou: o som que entra no lugar não toca.
      expect(som.play).not.toHaveBeenCalled()
      const json = JSON.parse((screen.getByTestId('diagnostico-json') as HTMLTextAreaElement).value)
      expect(json.vibracao).toEqual({
        teste: 'suave',
        vibrate: true,
        controles: [
          { id: 'Oculus Touch (Right)', temMotor: true, vibrou: true },
          { id: 'Controle sem motor', temMotor: false, vibrou: false },
        ],
      })
    } finally {
      Object.assign(navigator, { vibrate: undefined, getGamepads: undefined })
    }
  })

  it('no computador, nada de aviso de religar', () => {
    quest.ligado = false
    quest.aparelho = 'desktop-com-gpu'
    localStorage.setItem('babel.quest.telaNova', 'nao')
    render(<Diagnostico />)
    expect(screen.queryByTestId('religar-telas-novas')).toBeNull()
  })

  it('no computador com o desenho novo: sem a aba Headset; a chave de dono fica junto da medida na nuvem', async () => {
    quest.aparelho = 'desktop-com-gpu'
    const { container } = render(<Diagnostico />)
    expect(container.querySelector('.q-palco.q-diag')).not.toBeNull()
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual([
      'Aparelho',
      'Som',
      'Velocidade',
      'Última captura',
      'Resultado',
    ])
    expect(container.querySelector('#painel-headset')).toBeNull()
    // O que é do headset não existe aqui: a chave das telas novas e a vibração do controle.
    expect(screen.queryByRole('button', { name: /Telas novas/, hidden: true })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Testar a vibração do controle', hidden: true })).toBeNull()

    // As medidas continuam, cada uma com o próprio botão, e copiar é o único principal.
    for (const nome of [
      'Testar o microfone',
      'Testar o compartilhamento',
      'Medir no processador',
      'Medir na placa de vídeo',
      'Medir na nuvem',
    ])
      expect(screen.getByRole('button', { name: nome, hidden: true })).toBeTruthy()
    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)

    fireEvent.click(aba('Velocidade'))
    const painel = container.querySelector('#painel-velocidade') as HTMLElement
    expect(painel.hidden).toBe(false)
    fireEvent.change(within(painel).getByLabelText('Chave de dono'), { target: { value: ' segredo ' } })
    expect(localStorage.getItem('babel.chaveDoDono')).toBe('segredo')
    await waitFor(() => expect(screen.getByTestId('diagnostico-perfil')).toBeTruthy())
  })
})

describe('Página não encontrada no Quest', () => {
  it('o recado e as três saídas, com o Início como principal', () => {
    const ir = vi.fn()
    const buscar = vi.fn()
    const { container } = render(<NaoEncontrado onChangeView={ir} onBuscar={buscar} />)
    expect(container.querySelector('.q-palco .q-vazio')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Esta página não existe' })).toBeTruthy()
    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Ir para o Início' }))
    expect(ir).toHaveBeenLastCalledWith('hub')
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(buscar).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }))
    expect(ir).toHaveBeenLastCalledWith('ajuda')
  })
})
