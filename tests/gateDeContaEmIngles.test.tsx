// @vitest-environment jsdom
/**
 * O PORTÃO DE CONTA NO IDIOMA DA INTERFACE. O modal (`GateDeConta`), os motivos (`motivoDoGate`) e o
 * cartão de convite no lugar da tela (`CartaoDeConvite`) tinham frases fixas em português: quem usa o
 * app em inglês via o resto em inglês e o convite a criar conta em português. Com o catálogo inglês
 * de verdade carregado, nenhuma frase portuguesa pode sobrar.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import CartaoDeConvite from '../src/components/conta/CartaoDeConvite'
import { CONVITE, motivoDoGate } from '../src/components/conta/exigeConta'
import GateDeConta from '../src/components/conta/GateDeConta'
import { registrarCatalogo, usarIdioma } from '../src/lib/i18n'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

/** Palavras que só aparecem no português destas telas. */
const PORTUGUES = /\b(conta|Entrar|Continuar sem|precisa|Isto|você|sua|seu|navegador)\b/i

beforeAll(async () => {
  const en = JSON.parse(readFileSync(join(__dirname, '..', 'public', 'i18n', 'en.json'), 'utf8'))
  registrarCatalogo('en', en)
  await usarIdioma('en')
})
afterAll(() => usarIdioma('pt'))
afterEach(cleanup)

describe('portão de conta em inglês', () => {
  it('o modal: título, motivo, texto e botões', () => {
    render(<GateDeConta aberto motivo={motivoDoGate('POST /api/import/web')} onFechar={() => {}} onEntrar={() => {}} />)
    const dialogo = screen.getByRole('dialog')
    expect(dialogo.textContent).not.toMatch(PORTUGUES)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('todos os motivos', () => {
    for (const origem of [
      'POST /api/import/youtube',
      'POST /api/import/web',
      'POST /api/ai/mt',
      'GET /api/images/search',
      'PATCH /api/me',
      ...Object.keys(CONVITE),
    ])
      expect(motivoDoGate(origem), origem).not.toMatch(PORTUGUES)
  })

  it('o cartão de convite de cada tela', () => {
    for (const view of [...Object.keys(CONVITE), 'inventada']) {
      render(<CartaoDeConvite view={view} onEntrar={() => {}} onVoltar={() => {}} />)
      expect(screen.getByTestId('cartao-de-convite').textContent, view).not.toMatch(PORTUGUES)
      cleanup()
    }
  })
})
