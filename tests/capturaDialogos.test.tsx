// @vitest-environment jsdom
/**
 * OS DIÁLOGOS DA CAPTURA NO DESENHO DO PROTÓTIPO (C7 idiomas, C8 encerrar), sem perder o que eles
 * decidem: o par de idiomas continua sendo escrito pela Captura (os `Lado`s), inverter só com os
 * dois idiomas escolhidos, "Detectar" só onde o lado aceita; encerrar tem as quatro saídas e o
 * descarte pede confirmação.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import EncerrarSessao from '../src/components/views/captura/EncerrarSessao'
import IdiomasDaSessao, { type Lado } from '../src/components/views/captura/IdiomasDaSessao'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const lado = (extra: Partial<Lado>): Lado => ({
  rotulo: 'Lado',
  codigo: 'en-US',
  auto: false,
  aceitaAuto: false,
  aoEscolher: vi.fn(),
  ...extra,
})

describe('Idiomas da sessão (C7)', () => {
  beforeAll(prepararDialogoNoJsdom)
  afterEach(cleanup)

  function montar(a: Lado, b: Lado) {
    render(<IdiomasDaSessao sub="sub" lados={[a, b]} resumo="resumo" avisos={null} aoFechar={vi.fn()} />)
  }

  it('escolher um campo abre a lista com busca; escolher um idioma avisa o lado e fecha a lista', () => {
    const a = lado({ rotulo: 'Idioma do conteúdo', auto: true, aceitaAuto: true })
    const b = lado({ rotulo: 'Traduzir para', codigo: 'pt-BR' })
    montar(a, b)
    fireEvent.click(screen.getByRole('button', { name: /Idioma do conteúdo/ }))
    expect(screen.getByRole('option', { name: /Detectar automaticamente/ })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Buscar idioma…'), { target: { value: 'franc' } })
    fireEvent.click(screen.getByRole('option', { name: /Français/ }))
    expect(a.aoEscolher).toHaveBeenCalledWith({ auto: false, code: 'fr-FR' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('o lado que não aceita "Detectar" não o oferece', () => {
    montar(lado({ auto: true, aceitaAuto: true }), lado({ rotulo: 'Traduzir para', codigo: 'pt-BR' }))
    fireEvent.click(screen.getByRole('button', { name: /Traduzir para/ }))
    expect(screen.queryByRole('option', { name: /Detectar automaticamente/ })).toBeNull()
  })

  it('inverter troca os dois idiomas — e fica desligado enquanto um lado detecta sozinho', () => {
    const a = lado({ codigo: 'en-US' })
    const b = lado({ codigo: 'pt-BR' })
    montar(a, b)
    fireEvent.click(screen.getByRole('button', { name: 'Inverter os idiomas' }))
    expect(a.aoEscolher).toHaveBeenCalledWith({ auto: false, code: 'pt-BR' })
    expect(b.aoEscolher).toHaveBeenCalledWith({ auto: false, code: 'en-US' })
    cleanup()
    montar(lado({ auto: true, aceitaAuto: true }), lado({ codigo: 'pt-BR' }))
    expect((screen.getByRole('button', { name: 'Inverter os idiomas' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Encerrar a sessão (C8)', () => {
  beforeAll(prepararDialogoNoJsdom)
  afterEach(cleanup)

  function montar() {
    const props = {
      resumo: '3 falas · 01:20',
      retomada: false,
      titulo: 'Reunião',
      aoTrocarTitulo: vi.fn(),
      capa: '',
      aoTrocarCapa: vi.fn(),
      buscaInicial: 'Reunião',
      aoEscolherArquivo: vi.fn(),
      aoContinuar: vi.fn(),
      aoSalvar: vi.fn(),
      aoDescartar: vi.fn(),
    }
    render(<EncerrarSessao {...props} />)
    return props
  }

  it('as quatro saídas: continuar, salvar e ficar, salvar e ir, descartar (com confirmação)', () => {
    const p = montar()
    expect(screen.getByRole('dialog', { name: 'Encerrar a sessão' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar gravando' }))
    expect(p.aoContinuar).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e ficar aqui' }))
    expect(p.aoSalvar).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: /Salvar e ir para a análise/ }))
    expect(p.aoSalvar).toHaveBeenLastCalledWith(true)

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(p.aoDescartar).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Descartar esta captura?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByRole('dialog', { name: 'Encerrar a sessão' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    fireEvent.click(screen.getByRole('button', { name: /Descartar$/ }))
    expect(p.aoDescartar).toHaveBeenCalled()
  })

  it('as capas: as quatro do protótipo, como rádio, e o botão de buscar imagem', () => {
    const p = montar()
    const padrao = screen.getByRole('radio', { name: 'Padrão' })
    expect(padrao.getAttribute('aria-checked')).toBe('true')
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    fireEvent.click(screen.getByRole('radio', { name: 'Capa 3' }))
    expect(p.aoTrocarCapa).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/svg\+xml,/))
    fireEvent.click(screen.getByRole('button', { name: 'Buscar imagem de capa' }))
    expect(screen.getByRole('textbox', { name: 'Buscar imagem de capa' })).toHaveProperty('value', 'Reunião')
  })
})
