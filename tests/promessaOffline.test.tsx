// @vitest-environment jsdom
/**
 * A PROMESSA OFFLINE CONDICIONADA (DISP-02, change `modelos-confiaveis-e-offline`, 4.3): "A legenda roda no
 * aparelho" só aparece sem rede quando o app está em cache (service worker) E há um modelo de transcrição
 * baixado. Sem isso, a tela diz como chegar lá.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { NotaDoPronto } from '../src/components/views/captura/niveis/pecas'
import { prontoParaLegendarSemRede } from '../src/lib/offline/prontoSemRede'

afterEach(cleanup)

describe('prontoParaLegendarSemRede', () => {
  it('precisa do service worker E de um modelo de transcrição baixado', () => {
    const whisper = (id: string) => id === 'onnx-community/whisper-tiny'
    expect(prontoParaLegendarSemRede({ sw: () => true, temModelo: whisper })).toBe(true)
    expect(prontoParaLegendarSemRede({ sw: () => false, temModelo: whisper })).toBe(false)
    expect(prontoParaLegendarSemRede({ sw: () => true, temModelo: () => false })).toBe(false)
  })
})

describe('NotaDoPronto sem rede', () => {
  it('com o modelo no cache: a promessa', () => {
    render(<NotaDoPronto medidores={[]} semRede prontoOffline />)
    expect(screen.getByTestId('nota-sem-internet').textContent).toMatch(/A legenda roda no aparelho/)
  })

  it('sem o modelo (ou sem o app em cache): o caminho, e nada de promessa', () => {
    render(<NotaDoPronto medidores={[]} semRede prontoOffline={false} />)
    const nota = screen.getByTestId('nota-sem-internet').textContent
    expect(nota).toBe('Sem internet. Para legendar sem rede, abra a legenda uma vez com internet.')
    expect(nota).not.toMatch(/roda no aparelho/)
  })
})
