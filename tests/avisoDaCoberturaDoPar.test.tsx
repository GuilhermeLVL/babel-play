// @vitest-environment jsdom
/**
 * O PAR SEM TRADUÇÃO NO APARELHO É ANUNCIADO ANTES DE COMEÇAR (CEL-01): hindi → português sem nuvem diz que não há
 * tradução e qual a saída; espanhol → português passa pelo inglês no aparelho e diz quanto baixa.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import AvisoDaCoberturaDoPar from '../src/components/views/captura/AvisoDaCoberturaDoPar'
import { coberturaNoAparelho } from '../src/core/traducao/coberturaNoAparelho'

const SEM_NADA = { nativo: false, nuvemAutorizada: false, bergamotNoCdn: false }

afterEach(() => cleanup())

describe('AvisoDaCoberturaDoPar', () => {
  it('hindi → português sem nuvem: "Sem tradução neste aparelho para hindi → português", com a saída', () => {
    render(
      <AvisoDaCoberturaDoPar
        de="hi"
        para="pt"
        cobertura={coberturaNoAparelho('hi', 'pt', SEM_NADA)}
        podeAutorizarNuvem
      />,
    )
    const aviso = screen.getByTestId('aviso-sem-rota').textContent ?? ''
    expect(aviso).toContain('Sem tradução neste aparelho para hindi → português')
    expect(aviso).toContain('autorize a tradução pela internet')
  })

  it('perfil protegido (sem a saída da nuvem): o fato, sem oferecer o que a política não permite', () => {
    render(
      <AvisoDaCoberturaDoPar
        de="hi"
        para="pt"
        cobertura={coberturaNoAparelho('hi', 'pt', SEM_NADA)}
        podeAutorizarNuvem={false}
      />,
    )
    expect(screen.getByTestId('aviso-sem-rota').textContent).not.toContain('autorize')
  })

  it('espanhol → português: passa pelo inglês no aparelho e diz o total das duas pernas', () => {
    render(
      <AvisoDaCoberturaDoPar
        de="es"
        para="pt"
        cobertura={coberturaNoAparelho('es', 'pt', { ...SEM_NADA, bergamotNoCdn: true })}
        podeAutorizarNuvem
      />,
    )
    expect(screen.queryByTestId('aviso-sem-rota')).toBeNull()
    expect(screen.getByTestId('aviso-pelo-ingles').textContent).toContain('145 MB')
    expect(screen.getByTestId('aviso-pelo-ingles').textContent).toContain('Tradução aproximada')
  })

  it('nativo pronto: nada a dizer', () => {
    const { container } = render(
      <AvisoDaCoberturaDoPar
        de="es"
        para="pt"
        cobertura={coberturaNoAparelho('es', 'pt', { ...SEM_NADA, nativo: true })}
        podeAutorizarNuvem
      />,
    )
    expect(container.textContent).toBe('')
  })
})
