// @vitest-environment jsdom
/**
 * O APP SOB `/app` (`src/lib/baseDoApp.ts`): as rotas são internas e a base só existe na barra. Sob `/app`
 * a navegação publica `/app/…`; na raiz (dev, testes, self-host) nada muda; e o callback do login volta a
 * `/app` no build de produção.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearAuthCallbackUrl } from '../src/lib/authCallback'
import { comBaseDoApp, semBaseDoApp } from '../src/lib/baseDoApp'
import { estadoDaIntencao, navegarPara, publicarUrl, urlParaEstado } from '../src/lib/rotas'

afterEach(() => {
  vi.unstubAllEnvs()
  window.history.replaceState({}, '', '/')
})

describe('base do app', () => {
  it('semBaseDoApp tira só o segmento /app', () => {
    expect(semBaseDoApp('/app')).toBe('/')
    expect(semBaseDoApp('/app/')).toBe('/')
    expect(semBaseDoApp('/app/jogar')).toBe('/jogar')
    expect(semBaseDoApp('/jogar')).toBe('/jogar')
    expect(semBaseDoApp('/apple')).toBe('/apple')
  })

  it('urlParaEstado lê com ou sem a base', () => {
    expect(urlParaEstado('/app/plano/assinado')).toEqual(urlParaEstado('/plano/assinado'))
    expect(urlParaEstado('/app')).toEqual({ view: 'hub' })
    expect(estadoDaIntencao('/app/plano/assinar')).toEqual({ view: 'planos', planosTela: 'assinar' })
  })

  it('sob /app, a navegação publica /app/…', () => {
    window.history.replaceState({}, '', '/app')
    publicarUrl({ view: 'play' })
    expect(window.location.pathname).toBe('/app/jogar')
    navegarPara({ view: 'cartoes' })
    expect(window.location.pathname).toBe('/app/cartoes')
    publicarUrl({ view: 'hub' })
    expect(window.location.pathname).toBe('/app')
  })

  it('na raiz, nada muda', () => {
    publicarUrl({ view: 'play' })
    expect(window.location.pathname).toBe('/jogar')
    expect(comBaseDoApp('/x')).toBe('/x')
  })

  it('callback do login: /app no build de produção, a raiz fora dele', () => {
    window.history.replaceState({}, '', '/auth/callback')
    clearAuthCallbackUrl()
    expect(window.location.pathname).toBe('/')
    vi.stubEnv('PROD', true)
    window.history.replaceState({}, '', '/auth/callback')
    clearAuthCallbackUrl()
    expect(window.location.pathname).toBe('/app')
  })
})
