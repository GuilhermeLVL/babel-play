// @vitest-environment jsdom
/** util de callback: detecta /auth/callback e limpa a URL para '/'. Fora do callback é no-op. */
import { describe, it, expect, afterEach } from 'vitest'
import { isOnAuthCallback, clearAuthCallbackUrl, AUTH_CALLBACK_PATH } from '../src/lib/authCallback'

afterEach(() => { window.history.replaceState({}, '', '/') })

describe('authCallback', () => {
  it('detecta o path de callback', () => {
    window.history.replaceState({}, '', AUTH_CALLBACK_PATH + '#access_token=x')
    expect(isOnAuthCallback()).toBe(true)
  })
  it('clearAuthCallbackUrl volta para / quando no callback', () => {
    window.history.replaceState({}, '', AUTH_CALLBACK_PATH)
    clearAuthCallbackUrl()
    expect(window.location.pathname).toBe('/')
  })
  it('fora do callback é no-op', () => {
    window.history.replaceState({}, '', '/estudo')
    clearAuthCallbackUrl()
    expect(window.location.pathname).toBe('/estudo')
    expect(isOnAuthCallback()).toBe(false)
  })
})
