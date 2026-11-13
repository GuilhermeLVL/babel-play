// @vitest-environment jsdom
/**
 * O VISITANTE COM UMA SESSÃO QUE O SERVIDOR RECUSA (fix/cliente-sem-sessao): o Início não pode ficar
 * preso no esqueleto do progresso. Antes, a leitura do perfil saía sem token depois de a sessão cair,
 * levava 401 (`fetchMetrics` → null → `progress.available: false`) e o esqueleto ficava para sempre.
 * Agora ela é respondida como sem conta, pelas mesmas funções que o App usa na abertura.
 */
import 'fake-indexeddb/auto'

import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const supa = vi.hoisted(() => {
  const estado = { token: 'velho' as string | null }
  return {
    estado,
    refreshSession: vi.fn(async () => ({ data: { session: null } })),
    signOut: vi.fn(async () => {
      estado.token = null
      return {}
    }),
  }
})
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: { refreshSession: supa.refreshSession, signOut: supa.signOut } },
  authRequired: true,
  carregarSupabase: async () => null,
  getAccessToken: async () => supa.estado.token,
}))

import InicioDoQuest from '../src/components/views/quest/InicioDoQuest'
import { apiFetch } from '../src/data/funil'
import { fetchMetrics } from '../src/data/rotas/metricas'
import { armarIdentidade, definirIdentidade } from '../src/lib/identidade'
import { deriveProgress } from '../src/lib/progress'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('visitante com sessão recusada', () => {
  it('um 401 só; o perfil vem do modo sem conta e o Início mostra o estado de visitante, sem esqueleto', async () => {
    armarIdentidade()
    definirIdentidade('conta')
    const rede = vi.fn(async () => new Response('{"error":"token inválido"}', { status: 401 }))
    vi.stubGlobal('fetch', rede)

    // A primeira leva do arranque (entitlements) recebe o 401 e encerra a sessão uma vez.
    expect((await apiFetch('/api/me/entitlements')).status).toBe(401)
    expect(supa.signOut).toHaveBeenCalledTimes(1)

    // A leitura do perfil, que vem depois, não vai à rede e chega.
    const metrics = await fetchMetrics()
    expect(metrics).not.toBeNull()
    expect(rede).toHaveBeenCalledTimes(1)

    render(
      <InicioDoQuest
        onChangeView={() => {}}
        recordings={[]}
        progress={deriveProgress(metrics)}
        metrics={metrics}
        semConta
      />,
    )
    expect(screen.getByText('Guarde palavras e o app traz cada uma de volta na hora certa.')).toBeTruthy()
    expect(screen.getByTestId('progresso-no-inicio')).toBeTruthy()
    expect(document.querySelector('.q-esqueleto')).toBeNull()
  })
})
