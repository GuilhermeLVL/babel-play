// @vitest-environment jsdom
/**
 * AS TELAS DA FLAG `estudo_palavras_v2` (frente `palavras`): com a flag ligada, a aba Palavras ganha Suspensas à vista, filtro por
 * etiqueta e ações em massa pelo servidor; a Memória ganha a definição de cada número, nada de percentual sem base mínima e a
 * seção "Por fonte"; a cobertura diz "você conhece X% das palavras" (nunca "entende"). Desligada, nada disso aparece.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContagensDeConteudo } from '../src/core/learning/contagensDeConteudo'
import type { ResumoDosCartoes } from '../src/core/learning/resumoDosCartoes'
import type { MemoriaPorBaralho } from '../src/core/palavras/memoriaDoBaralho'
import type { VocabCard } from '../src/types'

const mundo = vi.hoisted(() => ({ flag: true }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => mundo.flag }))

const rede = vi.hoisted(() => ({
  lote: vi.fn(),
  memoria: vi.fn(),
}))
vi.mock('../src/data/api', () => ({ updateCard: vi.fn() }))
vi.mock('../src/data/rotas/palavrasEmLote', () => ({ aplicarEmLote: rede.lote }))
vi.mock('../src/data/rotas/memoriaPorBaralho', () => ({ lerMemoriaPorBaralho: rede.memoria }))

import Memoria from '../src/components/views/cartoes/Memoria'
import Palavras from '../src/components/views/cartoes/Palavras'
import type { Conteudo } from '../src/lib/conteudo/estado'

const AGORA = Date.now()
const DIA = 86_400_000
const c = (id: string, o: Partial<VocabCard> = {}): VocabCard =>
  ({
    id,
    word: id,
    translation: `tradução de ${id}`,
    srcLang: 'en',
    inDeck: true,
    fsrsState: 'Review',
    dueAtMs: AGORA + 3 * DIA,
    createdAtMs: AGORA - 10 * DIA,
    ...o,
  }) as VocabCard

const BARALHO: VocabCard[] = [
  c('ship', { etiquetas: ['filme'] }),
  c('nap', { etiquetas: ['filme', 'viagem'] }),
  c('roadmap', { fsrsState: 'New', dueAtMs: null }),
  c('loading', { inDeck: false, etiquetas: ['viagem'] }),
]
const TUDO: Conteudo = { idioma: 'en', fonte: { tipo: 'tudo' } }

beforeEach(() => {
  mundo.flag = true
  localStorage.clear()
  rede.lote.mockReset()
  rede.memoria.mockReset()
})
afterEach(cleanup)

const montarPalavras = () => {
  const p = { aoAbrir: vi.fn(), aoPraticar: vi.fn(), aoExportar: vi.fn(), aoMudar: vi.fn() }
  render(<Palavras cartoes={BARALHO} carregando={false} conteudo={TUDO} rotuloDoConteudo="" sessoes={[]} {...p} />)
  return p
}
const palavras = () => [...document.querySelectorAll('tbody tr')].map((tr) => tr.getAttribute('data-palavra'))

describe('Palavras com a flag', () => {
  it('Suspensas à vista na linha dos estados e filtro por etiqueta', () => {
    montarPalavras()
    const estados = screen.getByRole('radiogroup', { name: 'Estado do cartão' })
    expect(within(estados).getByRole('radio', { name: /Suspensas/ })).toBeTruthy()
    const etiquetas = screen.getByTestId('filtro-de-etiquetas')
    fireEvent.click(within(etiquetas).getByRole('button', { name: /filme/ }))
    expect(palavras().sort()).toEqual(['nap', 'ship'])
    fireEvent.click(within(estados).getByRole('radio', { name: /Suspensas/ }))
    expect(palavras()).toEqual([]) // suspensa + filme: nenhuma
    fireEvent.click(within(etiquetas).getByRole('button', { name: /viagem/ }))
    expect(palavras()).toEqual(['loading'])
  })

  it('etiquetar em massa faz UM pedido ao servidor e atualiza a lista', async () => {
    rede.lote.mockResolvedValue({ ok: true, alterados: 2 })
    const p = montarPalavras()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar várias' }))
    fireEvent.click(document.querySelector('tr[data-palavra="roadmap"]')!)
    fireEvent.click(document.querySelector('tr[data-palavra="ship"]')!)
    fireEvent.click(screen.getByRole('button', { name: /Etiquetar/ }))
    fireEvent.change(screen.getByLabelText('Etiqueta para as selecionadas'), { target: { value: 'trabalho' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(p.aoMudar).toHaveBeenCalled())
    expect(rede.lote).toHaveBeenCalledTimes(1)
    expect(rede.lote.mock.calls[0][0].sort()).toEqual(['roadmap', 'ship'])
    expect(rede.lote.mock.calls[0][1]).toEqual({ acao: 'etiquetar', adicionar: ['trabalho'], remover: [] })
    const novos = p.aoMudar.mock.calls[0][0] as VocabCard[]
    expect(novos.find((x) => x.id === 'ship')?.etiquetas).toEqual(['filme', 'trabalho'])
    expect(novos.find((x) => x.id === 'roadmap')?.etiquetas).toEqual(['trabalho'])
  })

  it('suspender em massa vai em um pedido só', async () => {
    rede.lote.mockResolvedValue({ ok: true, alterados: 2 })
    const p = montarPalavras()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar várias' }))
    fireEvent.click(document.querySelector('tr[data-palavra="nap"]')!)
    fireEvent.click(document.querySelector('tr[data-palavra="ship"]')!)
    fireEvent.click(document.querySelector('[data-ct-massa="suspender"]')!)
    await waitFor(() => expect(p.aoMudar).toHaveBeenCalled())
    expect(rede.lote).toHaveBeenCalledTimes(1)
    expect(rede.lote.mock.calls[0][1]).toEqual({ acao: 'suspender' })
    expect((p.aoMudar.mock.calls[0][0] as VocabCard[]).every((x) => x.inDeck === false)).toBe(true)
  })

  it('desligada: sem Suspensas na linha, sem etiquetas e sem Etiquetar', () => {
    mundo.flag = false
    montarPalavras()
    const estados = screen.getByRole('radiogroup', { name: 'Estado do cartão' })
    expect(within(estados).queryByRole('radio', { name: /Suspensas/ })).toBeNull()
    expect(screen.queryByTestId('filtro-de-etiquetas')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar várias' }))
    expect(screen.queryByRole('button', { name: /Etiquetar/ })).toBeNull()
  })
})

const resumo = (d30: { total: number; lembradas: number }): ResumoDosCartoes => ({
  agora: AGORA,
  inicioDoDia: AGORA - 5 * 3_600_000,
  total: 40,
  suspensas: 1,
  idiomas: 1,
  dificeis: 2,
  revisoesDeSempre: 50,
  revisadasHoje: 3,
  hoje: { novas: 1, aprendendo: 1, revisar: 3 },
  guardadas: 0,
  fases: { novas: 5, aprendendo: 5, jovens: 20, maduras: 9 },
  previsao: new Array<number>(31).fill(1),
  calendario: new Array<number>(84).fill(0).map((_, i) => (i > 70 ? 2 : 0)),
  retencao: { d7: d30, d30, semanas: Array.from({ length: 8 }, () => ({ total: 0, lembradas: 0 })) },
  botoes: [1, 2, 3, 4],
  baralhos: { idiomas: [], sessoes: [], anki: [], trilha: null },
})
const catalogo: ContagensDeConteudo = {
  agora: AGORA,
  idioma: '',
  idiomas: [{ id: 'en', palavras: 40 }],
  tudo: { palavras: 40, frases: 10, paraHoje: 5 },
  dificeis: { palavras: 2, frases: 0, paraHoje: 2 },
  sessoes: [
    { id: 's1', nome: 'Reunião', tipo: 'live', quando: 1, duracaoMs: null, palavras: 12, frases: 4, paraHoje: 2 },
  ],
  anki: [{ id: 'dA', nome: 'Verbos', tipo: null, quando: 1, duracaoMs: null, palavras: 20, frases: 6, paraHoje: 3 }],
  trilha: null,
}
const montarMemoria = (d30: { total: number; lembradas: number }) =>
  render(
    <Memoria
      resumo={resumo(d30)}
      metaDeRetencao={90}
      sequencia={4}
      maiorSequencia={9}
      aoHoje={() => undefined}
      aoVerDificeis={() => undefined}
      contagens={catalogo}
    />,
  )

describe('Memória com a flag', () => {
  it('cada número tem definição acessível', () => {
    rede.memoria.mockResolvedValue(null)
    montarMemoria({ total: 40, lembradas: 36 })
    for (const id of ['retencaoReal', 'revisoes', 'sequencia', 'dificeis', 'botoes', 'fases', 'previsao']) {
      const botao = screen.getByTestId(`definicao-${id}`)
      expect(botao.getAttribute('aria-label')!.length).toBeGreaterThan(40)
      expect(botao.getAttribute('title')).toBeTruthy()
    }
    expect(screen.getByTestId('definicao-retencaoReal').getAttribute('aria-label')).toContain('Retenção real')
  })

  it('sem base mínima, sem percentual: "—" e "poucas revisões ainda"', () => {
    rede.memoria.mockResolvedValue(null)
    montarMemoria({ total: 12, lembradas: 12 })
    const kpi = screen.getByText('Retenção real').closest('.qe-kpi')!
    expect(kpi.querySelector('b')!.textContent).toBe('—')
    expect(kpi.textContent).toContain('poucas revisões ainda')
    expect(screen.getByTestId('botoes-usados').textContent).not.toMatch(/\d+%/)
  })

  it('com a base, a porcentagem aparece', () => {
    rede.memoria.mockResolvedValue(null)
    montarMemoria({ total: 40, lembradas: 36 })
    expect(screen.getByText('Retenção real').closest('.qe-kpi')!.querySelector('b')!.textContent).toBe('90%')
  })

  it('"Por fonte": as palavras são as do catálogo e a retenção só com 20 revisões', async () => {
    const memoria: MemoriaPorBaralho = {
      agora: AGORA,
      janelaDias: 90,
      baralhos: [
        { tipo: 'anki', id: 'dA', revisoes: 30, lembradas: 24, proximaRevisao: AGORA + 2 * DIA },
        { tipo: 'sessao', id: 's1', revisoes: 6, lembradas: 6, proximaRevisao: null },
      ],
    }
    rede.memoria.mockResolvedValue(memoria)
    montarMemoria({ total: 40, lembradas: 36 })
    const secao = await screen.findByTestId('memoria-por-fonte')
    await waitFor(() => expect(secao.querySelector('[data-fonte="anki:dA"]')!.textContent).toContain('80%'))
    const anki = secao.querySelector('[data-fonte="anki:dA"]')!
    expect(anki.textContent).toContain('Verbos')
    expect(anki.textContent).toContain('20')
    const sessao = secao.querySelector('[data-fonte="sessao:s1"]')!
    expect(sessao.textContent).toContain('12')
    expect(sessao.textContent).toContain('poucas revisões ainda')
    expect(sessao.textContent).not.toContain('100%')
  })

  it('desligada: sem definições e sem "Por fonte"', () => {
    mundo.flag = false
    montarMemoria({ total: 40, lembradas: 36 })
    expect(screen.queryByTestId('definicao-retencaoReal')).toBeNull()
    expect(screen.queryByTestId('memoria-por-fonte')).toBeNull()
    expect(rede.memoria).not.toHaveBeenCalled()
  })
})
