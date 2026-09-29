// @vitest-environment jsdom
/**
 * O PAINEL DE PREPARO COM SÓ O TRADUTOR (o "Rápido", relato do dono no celular, 2026-09-29): a Web
 * Speech não baixa modelo de transcrição, então o painel mostra a barra do tradutor sem uma linha do
 * Whisper parada em "-"; e "Modelo pronto" só quando o tradutor também acabou (o Privado com pouca
 * memória carrega o tradutor DEPOIS do Whisper).
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import ModelPrepPanel from '../src/components/ModelPrepPanel'

afterEach(() => cleanup())

describe('ModelPrepPanel', () => {
  it('só o tradutor baixando: a barra dele, sem a do Whisper', () => {
    render(<ModelPrepPanel state={{ whisper: null, mt: 0.4, fromCache: false, error: null, done: false }} />)
    expect(screen.getByText('Tradutor (opus-mt)')).toBeTruthy()
    expect(screen.queryByText('Transcrição (Whisper)')).toBeNull()
    expect(screen.getByText('40%')).toBeTruthy()
  })

  it('Whisper pronto e o tradutor ainda baixando: não diz "Modelo pronto"', () => {
    render(<ModelPrepPanel state={{ whisper: 1, mt: 0.5, fromCache: false, error: null, done: true }} />)
    expect(screen.queryByText(/Modelo pronto/)).toBeNull()
    expect(screen.getByText('50%')).toBeTruthy()
  })

  it('tudo pronto: "Modelo pronto"', () => {
    render(<ModelPrepPanel state={{ whisper: 1, mt: 1, fromCache: false, error: null, done: true }} />)
    expect(screen.getByText(/Modelo pronto/)).toBeTruthy()
  })
})
