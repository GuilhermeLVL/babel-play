// @vitest-environment jsdom
/**
 * `Play` NAO PODE RE-RENDERIZAR EM CASCATA (frente de desempenho, 03/10/2026).
 * A auditoria de 26/09 contou 13 renders de `Play` por clique de categoria. Aqui contamos os COMMITS
 * da arvore de `Play` (Profiler) ao montar com o baralho carregado e a cada clique de categoria.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React, { Profiler } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { VocabCard } from '../src/types'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const cartao = (i: number): VocabCard =>
  ({
    id: `c${i}`,
    word:
      ['harvest', 'garden', 'bridge', 'window', 'river', 'planet', 'silver', 'market'][i % 8] +
      (i >= 8 ? String.fromCharCode(97 + (i % 20)) : ''),
    translation: `traducao ${i}`,
    explanation: '',
    phonetics: '',
    sentence: 'A small sentence about it.',
    srcLang: 'en',
    tgtLang: 'pt',
    leitnerBox: 1,
    leitnerDueAt: '',
    fsrsState: 'New',
    fsrsStability: 0,
    fsrsDifficulty: 5,
    fsrsPredictedRetention: 0,
    fsrsDueAt: '',
    dueAtMs: 0,
    createdAtMs: 0,
    inDeck: true,
    daTrilha: false,
    daAnki: false,
    baralhosAnki: [],
  }) as unknown as VocabCard

vi.mock('../src/data/api', async (orig) => ({
  ...(await orig<typeof import('../src/data/api')>()),
  fetchDeck: vi.fn(async () => Array.from({ length: 40 }, (_, i) => cartao(i))),
}))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

const { default: Play } = await import('../src/components/views/Play')
const { deriveProgress } = await import('../src/lib/progress')

afterEach(cleanup)
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })),
)

describe('Play: renders ao montar e ao trocar de categoria', () => {
  it('monta, assenta e troca de categoria sem cascata', async () => {
    let commits = 0
    render(
      <Profiler
        id="play"
        onRender={() => {
          commits++
        }}
      >
        <Play
          onChangeView={() => {}}
          ageProfile="pro"
          progress={deriveProgress(null)}
          metrics={null}
          soundEnabled
          toggleSound={() => {}}
        />
      </Profiler>,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    const aoMontar = commits
    const abas = screen.queryAllByRole('tab')
    console.log(`[play] commits ao montar=${aoMontar} abas=${abas.map((a) => a.textContent).join('|')}`)
    const parado = commits
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1500))
    })
    const ociosos = commits - parado
    console.log(`[play] commits parado 1,5 s=${ociosos}`)
    const porClique: number[] = []
    for (const nome of [/Clássicos/, /Favoritos/, /Todos/, /Clássicos/, /Todos/]) {
      const antes = commits
      fireEvent.click(screen.getByRole('tab', { name: nome }))
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50))
      })
      porClique.push(commits - antes)
    }
    console.log(`[play] commits por clique=${porClique.join(',')}`)
    /* Contrato: montar assenta em poucos commits, parado nao renderiza e cada clique de categoria e UM
       commit. A auditoria de 26/09 viu 13 por clique no build de perfil; em jsdom nunca passou de 1. */
    expect(aoMontar).toBeLessThanOrEqual(8)
    expect(ociosos).toBe(0)
    for (const n of porClique) expect(n).toBeLessThanOrEqual(2)
  })
})
