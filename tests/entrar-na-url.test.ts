// @vitest-environment jsdom
/**
 * O ATALHO DO SITE PARA O LOGIN (acesso sem conta v2, etapa 5): `/app?entrar=login|signup`.
 *
 * O `App` lê o parâmetro uma vez, tira-o da barra sem mexer no resto da URL e só pede a porta a quem está
 * sem conta num app que tem conta. No self-host, na edição estática e com sessão, o parâmetro é inofensivo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ambiente = vi.hoisted(() => ({ authRequired: true }))
vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  supabaseConfigurado: false,
  get authRequired() {
    return ambiente.authRequired
  },
  carregarSupabase: async () => null,
  getAccessToken: async () => null,
}))

import { aplicarEntrarDaUrl, lerEntrarDaUrl, tirarEntrarDaUrl } from '../src/lib/entrarNaUrl'
import { _reiniciarIdentidade, definirIdentidade, estadoDeIdentidade } from '../src/lib/identidade'

const irPara = (caminho: string) => window.history.replaceState({}, '', caminho)
const barra = () => window.location.pathname + window.location.search + window.location.hash

beforeEach(() => {
  ambiente.authRequired = true
  localStorage.clear()
  sessionStorage.clear()
  _reiniciarIdentidade()
  irPara('/')
})
afterEach(() => vi.unstubAllEnvs())

describe('lerEntrarDaUrl', () => {
  it('só `login` e `signup` valem', () => {
    expect(lerEntrarDaUrl('?entrar=login')).toBe('login')
    expect(lerEntrarDaUrl('?entrar=signup')).toBe('signup')
    expect(lerEntrarDaUrl('?entrar=admin')).toBeNull()
    expect(lerEntrarDaUrl('?entrar=')).toBeNull()
    expect(lerEntrarDaUrl('')).toBeNull()
  })
})

describe('tirarEntrarDaUrl', () => {
  it('devolve o modo e tira só o parâmetro, mantendo caminho, outros parâmetros e o #', () => {
    irPara('/app?x=1&entrar=signup&y=2#topo')
    const antes = window.history.length
    expect(tirarEntrarDaUrl()).toBe('signup')
    expect(barra()).toBe('/app?x=1&y=2#topo')
    expect(window.history.length).toBe(antes)
    /* Uma vez só: a segunda leitura já não acha nada. */
    expect(tirarEntrarDaUrl()).toBeNull()
  })

  it('valor desconhecido também sai da barra, sem pedir nada', () => {
    irPara('/app?entrar=%3Cscript%3E')
    expect(tirarEntrarDaUrl()).toBeNull()
    expect(barra()).toBe('/app')
  })

  it('sem o parâmetro, não mexe na URL', () => {
    irPara('/app/jogar?filtro=a')
    expect(tirarEntrarDaUrl()).toBeNull()
    expect(barra()).toBe('/app/jogar?filtro=a')
  })
})

describe('aplicarEntrarDaUrl', () => {
  it('sem conta no modo público: pede a porta no modo da URL e limpa a barra', () => {
    definirIdentidade('anonimo')
    irPara('/app?entrar=signup')
    const pedir = vi.fn()
    expect(aplicarEntrarDaUrl(pedir)).toBe('signup')
    expect(pedir).toHaveBeenCalledWith('signup')
    expect(barra()).toBe('/app')
    /* O efeito roda de novo (sessão, StrictMode): nada mais acontece. */
    expect(aplicarEntrarDaUrl(pedir)).toBeNull()
    expect(pedir).toHaveBeenCalledTimes(1)
  })

  it('com a sessão ainda carregando, espera (o parâmetro fica na barra para a próxima rodada)', () => {
    /* Sessão guardada no aparelho: o boot começa em `carregando`. */
    localStorage.setItem('sb-x-auth-token', '{}')
    _reiniciarIdentidade()
    expect(estadoDeIdentidade()).toBe('carregando')
    irPara('/app?entrar=login')
    const pedir = vi.fn()
    expect(aplicarEntrarDaUrl(pedir)).toBeNull()
    expect(pedir).not.toHaveBeenCalled()
    expect(barra()).toBe('/app?entrar=login')
    /* A sessão guardada estava vencida: sem conta, o atalho vale. */
    definirIdentidade('anonimo')
    expect(aplicarEntrarDaUrl(pedir)).toBe('login')
    expect(pedir).toHaveBeenCalledWith('login')
    expect(barra()).toBe('/app')
  })

  it('com conta: só limpa a URL, sem pedir a porta', () => {
    definirIdentidade('conta')
    irPara('/app?entrar=login')
    const pedir = vi.fn()
    expect(aplicarEntrarDaUrl(pedir)).toBeNull()
    expect(pedir).not.toHaveBeenCalled()
    expect(barra()).toBe('/app')
  })

  it('edição estática: só limpa a URL (lá não há porta)', () => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
    _reiniciarIdentidade()
    irPara('/?entrar=signup')
    const pedir = vi.fn()
    expect(aplicarEntrarDaUrl(pedir)).toBeNull()
    expect(pedir).not.toHaveBeenCalled()
    expect(barra()).toBe('/')
  })

  it('self-host: só limpa a URL', () => {
    ambiente.authRequired = false
    _reiniciarIdentidade()
    irPara('/?entrar=login')
    const pedir = vi.fn()
    expect(aplicarEntrarDaUrl(pedir)).toBeNull()
    expect(pedir).not.toHaveBeenCalled()
    expect(barra()).toBe('/')
  })
})
