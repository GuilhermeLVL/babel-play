// @vitest-environment jsdom
/**
 * A TELA /admin: sem papel admin mostra "Página não encontrada"; com papel, mostra as abas e carrega
 * a aba Resumo; o pedido do segundo fator vira a mensagem com o caminho, não um erro genérico.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const perfil = vi.hoisted(() => ({ atual: { carregando: false, perfil: { id: 'eu', role: 'admin' } as unknown } }))
vi.mock('../src/lib/usePerfil', () => ({ usePerfil: () => perfil.atual }))

const rotas = vi.hoisted(() => ({ resposta: {} as Record<string, unknown> }))
const COMUM = {
  '/api/admin/resumo': {
    usuarios: 3,
    usuariosNovos7d: 1,
    sessoes: 2,
    sessoes7d: 1,
    falas: 9,
    cartoesDeVocabulario: 4,
    geradoEm: 1,
  },
  '/api/admin/ia': {
    mes: '2026-10',
    ligada: true,
    gastoUsd: 1,
    tetoUsd: 10,
    percentual: 10,
    chamadas: 5,
    alerta80Em: null,
    esgotadoEm: null,
    dia: {
      dia: '2026-10-03',
      gastoUsd: 0,
      tetoUsd: null,
      percentual: null,
      chamadas: 0,
      alerta80Em: null,
      esgotadoEm: null,
    },
    portao: { ok: true },
  },
} as Record<string, unknown>
vi.mock('../src/data/funil', () => ({
  apiFetch: async (url: string) =>
    rotas.resposta.status
      ? new Response(JSON.stringify(rotas.resposta.dados), { status: Number(rotas.resposta.status) })
      : new Response(JSON.stringify(COMUM[url] ?? []), { status: 200 }),
  lerErro: async (r: Response) => {
    const c = (await r.json().catch(() => ({}))) as { error?: string; code?: string }
    return { status: r.status, error: c.error ?? 'erro', code: c.code }
  },
}))

import Admin from '../src/components/views/Admin'

beforeEach(() => {
  perfil.atual = { carregando: false, perfil: { id: 'eu', role: 'admin' } }
  rotas.resposta = {}
})

describe('Admin', () => {
  it('quem não é admin cai no 404', async () => {
    perfil.atual = { carregando: false, perfil: { id: 'eu', role: 'user' } }
    render(<Admin onChangeView={() => {}} onBuscar={() => {}} />)
    expect(await screen.findByRole('button', { name: /início|inicio/i })).toBeTruthy()
    expect(screen.queryByRole('tab', { name: /contas/i })).toBeNull()
  })

  it('o admin vê as cinco abas', async () => {
    render(<Admin onChangeView={() => {}} onBuscar={() => {}} />)
    for (const nome of ['Resumo', 'Contas', 'Cobrança', 'Erros', 'Flags'])
      expect(await screen.findByRole('tab', { name: new RegExp(nome) })).toBeTruthy()
  })

  it('o 403 do segundo fator pede o código', async () => {
    rotas.resposta = { status: 403, dados: { error: 'confirme', code: 'aal2_requerido' } }
    render(<Admin onChangeView={() => {}} onBuscar={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Confirme o código da verificação em duas etapas/)).toBeTruthy())
    expect(screen.getByRole('button', { name: /Digitar o código/ })).toBeTruthy()
  })
})
