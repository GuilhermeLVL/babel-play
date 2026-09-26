// @vitest-environment jsdom
/**
 * MODO CONVIDADO NO CLIENTE (Fase 7).
 *
 *  - `signInAnonymously` só é chamado com as flags `modo_convidado` + `nuvem_convidado` ligadas E numa
 *    rota de IA de nuvem — nunca no primeiro acesso, nunca numa rota de dados;
 *  - duas chamadas simultâneas criam UM anônimo;
 *  - o token anônimo só sai nas rotas de nuvem; o resto continua no servidor em memória;
 *  - os tetos (local e de nuvem) disparam `babel:oferta` com o momento certo — e nada com o modo
 *    convidado desligado;
 *  - criar conta a partir da sessão anônima CONVERTE (updateUser/linkIdentity), não cria outro usuário.
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const supa = vi.hoisted(() => {
  const estado: { sessao: null | { access_token: string; user: { is_anonymous?: boolean } } } = { sessao: null }
  return {
    estado,
    auth: {
      getSession: vi.fn(async () => ({ data: { session: estado.sessao } })),
      signInAnonymously: vi.fn(async () => {
        estado.sessao = { access_token: 'tok-anonimo', user: { is_anonymous: true } }
        return { data: { session: estado.sessao }, error: null }
      }),
      updateUser: vi.fn(async () => ({ data: {}, error: null })),
      linkIdentity: vi.fn(async () => ({ data: {}, error: null })),
      signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
      signInWithOAuth: vi.fn(async () => ({ error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: null } })),
      signOut: vi.fn(async () => {}),
    },
  }
})
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: supa.auth },
  authRequired: true,
  carregarSupabase: async () => ({ auth: supa.auth }),
  getAccessToken: async () => supa.estado.sessao?.access_token ?? null,
}))

import { apiFetch } from '../src/data/funil'
import * as auth from '../src/lib/auth'
import { _esquecerCriacaoDeConvidado } from '../src/lib/convidado'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'
import { definirIdentidade } from '../src/lib/identidade'
import { EVENTO_OFERTA as EVENTO_DE_OFERTA } from '../src/lib/ofertas/eventos'

const rede = vi.fn()
const ofertas: Array<{ momento: string; contexto: Record<string, unknown> }> = []
const ouvir = (e: Event) => ofertas.push((e as CustomEvent).detail)

function flags(modo: boolean, nuvem: boolean): void {
  definirEstadoDasFlags({ modo_convidado: { ligada: modo }, nuvem_convidado: { ligada: nuvem } })
}
const resposta = (status: number, corpo: unknown = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
const aguardar = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  supa.estado.sessao = null
  for (const f of Object.values(supa.auth)) f.mockClear()
  rede.mockReset()
  rede.mockResolvedValue(resposta(200, { text: 'olá' }))
  vi.stubGlobal('fetch', rede)
  definirIdentidade('anonimo')
  _esquecerCriacaoDeConvidado()
  ofertas.length = 0
  window.addEventListener(EVENTO_DE_OFERTA, ouvir)
})
afterEach(() => {
  window.removeEventListener(EVENTO_DE_OFERTA, ouvir)
  vi.unstubAllGlobals()
  definirEstadoDasFlags(null)
})

describe('criação do convidado anônimo', () => {
  it('flags desligadas: nuvem responde pelo servidor em memória e nenhum anônimo é criado', async () => {
    flags(false, false)
    const r = await apiFetch('/api/ai/mt', { method: 'POST', body: '{}' })
    expect(r.status).toBe(501)
    expect(supa.auth.signInAnonymously).not.toHaveBeenCalled()
    expect(rede).not.toHaveBeenCalled()
  })

  it('só `modo_convidado` ligado (sem `nuvem_convidado`): continua local', async () => {
    flags(true, false)
    await apiFetch('/api/ai/mt', { method: 'POST', body: '{}' })
    expect(supa.auth.signInAnonymously).not.toHaveBeenCalled()
    expect(rede).not.toHaveBeenCalled()
  })

  it('flags ligadas + rota de DADOS: nenhum anônimo, nada sai para a rede', async () => {
    flags(true, true)
    await apiFetch('/api/sessions')
    await apiFetch('/api/settings')
    expect(supa.auth.signInAnonymously).not.toHaveBeenCalled()
    expect(rede).not.toHaveBeenCalled()
  })

  it('flags ligadas + primeiro uso de nuvem: cria o anônimo UMA vez e manda o token só nessa rota', async () => {
    flags(true, true)
    const [a, b] = await Promise.all([
      apiFetch('/api/ai/mt', { method: 'POST', body: '{}' }),
      apiFetch('/api/tutor/chat', { method: 'POST', body: '{}' }),
    ])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(supa.auth.signInAnonymously).toHaveBeenCalledTimes(1)
    expect(rede).toHaveBeenCalledTimes(2)
    const cabecalhos = rede.mock.calls[0][1].headers as Record<string, string>
    expect(cabecalhos.Authorization).toBe('Bearer tok-anonimo')

    // Depois de criado, dados continuam locais.
    await apiFetch('/api/sessions')
    expect(rede).toHaveBeenCalledTimes(2)
    // E a sessão existente é reaproveitada: nenhum anônimo novo.
    await apiFetch('/api/ai/mt', { method: 'POST', body: '{}' })
    expect(supa.auth.signInAnonymously).toHaveBeenCalledTimes(1)
  })

  it('sem VITE_TURNSTILE_SITE_KEY o captcha fica de fora (signInAnonymously sem captchaToken)', async () => {
    flags(true, true)
    await apiFetch('/api/ai/stt/available')
    expect(supa.auth.signInAnonymously).toHaveBeenCalledWith(undefined)
  })
})

describe('evento babel:oferta nos tetos', () => {
  it('402 quota_exceeded: o funil NÃO duplica (quem dispara fim_de_cota é o adaptador de nuvem)', async () => {
    flags(true, true)
    rede.mockResolvedValue(resposta(402, { code: 'quota_exceeded' }))
    await apiFetch('/api/ai/mt', { method: 'POST', body: '{}' })
    await aguardar()
    expect(ofertas).toEqual([])
  })

  it('429 limite_de_convidados e 403 exige_conta → convidado_para_conta', async () => {
    flags(true, true)
    rede.mockResolvedValueOnce(resposta(429, { code: 'limite_de_convidados' }))
    rede.mockResolvedValueOnce(resposta(403, { code: 'exige_conta' }))
    await apiFetch('/api/ai/mt', { method: 'POST', body: '{}' })
    await apiFetch('/api/tutor/chat', { method: 'POST', body: '{}' })
    await aguardar()
    expect(ofertas.map((o) => o.momento)).toEqual(['convidado_para_conta', 'convidado_para_conta'])
  })

  it('teto LOCAL (507 TETO_ANONIMO do servidor em memória) → convidado_para_conta', async () => {
    flags(true, false)
    const { limparTudo } = await import('../src/data/efemero/store')
    await limparTudo()
    for (let i = 0; i < 6; i++) {
      await apiFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: `s${i}`, kind: 'live', sourceLang: 'en', targetLang: 'pt', utterances: [] }),
      })
    }
    await aguardar()
    expect(ofertas.some((o) => o.momento === 'convidado_para_conta' && o.contexto.motivo === 'teto_local')).toBe(true)
  })

  it('modo convidado DESLIGADO: nenhum evento (o comportamento de antes não muda)', async () => {
    flags(false, false)
    const { limparTudo } = await import('../src/data/efemero/store')
    await limparTudo()
    for (let i = 0; i < 6; i++) {
      await apiFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: `s${i}`, kind: 'live', sourceLang: 'en', targetLang: 'pt', utterances: [] }),
      })
    }
    await aguardar()
    expect(ofertas).toEqual([])
  })
})

describe('conversão mantém o id', () => {
  it('criar conta com sessão anônima usa updateUser({ email }), não signUp', async () => {
    supa.estado.sessao = { access_token: 't', user: { is_anonymous: true } }
    const r = await auth.signUpEmail('pessoa@exemplo.com', 'senha-forte-123')
    expect(r).toMatchObject({ ok: true, needsEmailConfirm: true })
    expect(supa.auth.updateUser).toHaveBeenCalledWith({ email: 'pessoa@exemplo.com' })
    expect(supa.auth.signUp).not.toHaveBeenCalled()
  })

  it('login social com sessão anônima usa linkIdentity', async () => {
    supa.estado.sessao = { access_token: 't', user: { is_anonymous: true } }
    await auth.signInWithProvider('google', 'https://app.exemplo/auth/callback')
    expect(supa.auth.linkIdentity).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://app.exemplo/auth/callback' },
    })
    expect(supa.auth.signInWithOAuth).not.toHaveBeenCalled()
  })

  it('sem sessão anônima, o cadastro é o de sempre', async () => {
    await auth.signUpEmail('pessoa@exemplo.com', 'senha-forte-123')
    expect(supa.auth.signUp).toHaveBeenCalled()
    expect(supa.auth.updateUser).not.toHaveBeenCalled()
  })
})
