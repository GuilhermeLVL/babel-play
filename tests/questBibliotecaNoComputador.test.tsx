// @vitest-environment jsdom
/**
 * A BIBLIOTECA DO DESENHO NOVO, POR APARELHO (02/10/2026): o mesmo desenho vale no headset e no computador.
 * O que é pequeno e a tela de sempre já tinha (exportar a transcrição, retomar a captura, buscar por título,
 * abrir com duplo clique) vem para dentro do desenho novo NO COMPUTADOR. No headset nada muda: essas funções
 * continuam em "Tela completa". Quem decide é o aparelho (`noHeadset()`), não o desenho.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const aparelho = vi.hoisted(() => ({ quest: true }))

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()),
  useQuestNovo: () => true,
}))
vi.mock('../src/lib/dispositivo/perfil', async (orig) => {
  const m = await orig<typeof import('../src/lib/dispositivo/perfil')>()
  return {
    ...m,
    perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), tipo: aparelho.quest ? 'quest' : 'desktop-com-gpu' }),
  }
})
vi.mock('../src/lib/langConfig', async (orig) => {
  const real = await orig<typeof import('../src/lib/langConfig')>()
  return { ...real, fetchLangConfig: async () => real.DEFAULT_LANG_CONFIG }
})
vi.mock('../src/data/api', async (orig) => ({
  ...(await orig<typeof import('../src/data/api')>()),
  fetchSessions: async () => [],
  fetchSessionTranscript: async () => ({ session: { sourceLang: 'en', targetLang: 'pt' }, utterances: [] }),
  patchSessionMeta: async () => null,
  updateSession: async () => null,
  deleteSession: async () => undefined,
}))

import Library from '../src/components/views/Library'
import type { Recording } from '../src/types'

const gravacao = (id: string, extra: Partial<Recording> = {}): Recording => ({
  id,
  title: `Sessão ${id}`,
  date: 'Ontem',
  durationStr: '38:10',
  wordCount: 120,
  type: 'audio',
  tags: [],
  status: 'Processado',
  idioma: 'en',
  ...extra,
})

const TRES = [gravacao('a'), gravacao('b', { title: 'Podcast de história' }), gravacao('c', { type: 'document' })]

async function montar() {
  const ir = vi.fn()
  const tela = render(<Library onChangeView={ir} recordings={TRES} />)
  await act(async () => {})
  const linhas = () => [...tela.container.querySelectorAll<HTMLButtonElement>('.q-linha[aria-pressed]')]
  const botao = (nome: RegExp) => screen.getByRole('button', { name: nome }) as HTMLButtonElement
  return { ...tela, ir, linhas, botao }
}

beforeEach(() => {
  aparelho.quest = true
})
afterEach(cleanup)

describe('Biblioteca do desenho novo, por aparelho', () => {
  it('no computador: "Exportar transcrição" abre o diálogo de sempre sem sair do desenho novo', async () => {
    aparelho.quest = false
    const { container, botao } = await montar()
    fireEvent.click(botao(/Exportar transcrição/))
    await act(async () => {})
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(container.querySelector('.q-palco.q-bib')).toBeTruthy()
  })
})
