// @vitest-environment jsdom
/**
 * A REVISÃO V2 NA TELA CARTÕES (flag `estudo_revisao_v2`; openspec `cartoes` 2.6, 3.7, 5.1 a 5.3, 8.1 e 9.1):
 * com a flag DESLIGADA a tela é a de sempre (cartoesTela.test.tsx cobre); aqui se prova o que ela liga:
 *   · o resumo é pedido com `v2` e a flag desligada não pede;
 *   · "Estudo livre" e "Só as difíceis" no dia cumprido, abrindo a rodada livre (fora da agenda);
 *   · a sequência com os dias congelados, na semana e na Memória, e o tempo por cartão só com 10 respostas;
 *   · "E o resto?" ganha espalhar e adiar as que aguentam esperar, que só mexem em `adiarAte`;
 *   · menu com Importar e Exportar únicos e a tecla "?" com a lista de atalhos.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResumoDosCartoes } from '../src/core/learning/resumoDosCartoes'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const api = vi.hoisted(() => ({
  resumo: null as unknown,
  lerResumo: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  baralho: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  atualizar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  contagens: null as unknown,
  flagLigada: false,
  protegido: false,
}))

vi.mock('../src/lib/protecaoDoMenor', async (orig) => ({
  ...(await orig<typeof import('../src/lib/protecaoDoMenor')>()),
  perfilProtegido: () => api.protegido,
}))
vi.mock('../src/lib/flags', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flags')>()),
  useFlag: (chave: string) => chave === 'estudo_revisao_v2' && api.flagLigada,
}))
vi.mock('../src/data/api', async (orig) => {
  api.lerResumo = vi.fn(async () => api.resumo)
  api.baralho = vi.fn(async () => [])
  api.atualizar = vi.fn(async (id: string) => ({ id }))
  return {
    ...(await orig<typeof import('../src/data/api')>()),
    lerResumoDosCartoes: api.lerResumo,
    fetchDeck: api.baralho,
    updateCard: api.atualizar,
  }
})
vi.mock('../src/data/apiAnki', async (orig) => ({
  ...(await orig<typeof import('../src/data/apiAnki')>()),
  listarBaralhosAnki: vi.fn(async () => []),
}))
vi.mock('../src/data/rotas/settings', () => ({
  fetchSettings: async () => null,
  patchUiSettings: vi.fn(async () => null),
  saveSettings: async () => null,
}))
vi.mock('../src/data/rotas/opcoesDaRevisao', () => ({
  fetchOpcoesDaRevisao: async () => null,
  gravarOpcoesDaRevisaoNaConta: async () => null,
}))
vi.mock('../src/data/rotas/conteudo', () => ({
  lerContagensDeConteudo: async () => api.contagens,
}))
vi.mock('../src/lib/langConfig', async (orig) => {
  const real = await orig<typeof import('../src/lib/langConfig')>()
  return {
    ...real,
    useLangConfig: () => real.DEFAULT_LANG_CONFIG,
    fetchLangConfig: async () => real.DEFAULT_LANG_CONFIG,
  }
})
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true }))

import Cartoes from '../src/components/views/Cartoes'
import type { ContagensDeConteudo } from '../src/core/learning/contagensDeConteudo'
import { conteudoAtual, zerarConteudoParaTeste } from '../src/lib/conteudo/loja'
import { _reiniciarIdentidade } from '../src/lib/identidade'

const HOJE = new Date(2026, 9, 10).getTime() // sábado
const DIA = 86_400_000
const SEM_FILA = { novas: 0, aprendendo: 0, revisar: 0 }

const resumoBase = (mudou: Partial<ResumoDosCartoes> = {}): ResumoDosCartoes => ({
  agora: HOJE + 12 * 3_600_000,
  inicioDoDia: HOJE,
  total: 422,
  suspensas: 9,
  idiomas: 1,
  dificeis: 6,
  revisoesDeSempre: 612,
  revisadasHoje: 26,
  hoje: SEM_FILA,
  guardadas: 0,
  fases: { novas: 96, aprendendo: 41, jovens: 148, maduras: 128 },
  previsao: [0, 8, 14, 21, 9, 17, 12, 26, ...Array.from({ length: 23 }, () => 10)],
  calendario: Array.from({ length: 84 }, () => 5),
  retencao: {
    d7: { total: 100, lembradas: 91 },
    d30: { total: 612, lembradas: 539 },
    semanas: Array.from({ length: 8 }, () => ({ total: 50, lembradas: 44 })),
  },
  botoes: [73, 55, 416, 68],
  baralhos: {
    idiomas: [{ id: 'en', total: 318, ...SEM_FILA }],
    sessoes: [],
    anki: [],
    trilha: null,
  },
  ...mudou,
})

const contagensBase = (): ContagensDeConteudo => ({
  agora: HOJE + 12 * 3_600_000,
  idioma: 'en',
  idiomas: [{ id: 'en', palavras: 318 }],
  tudo: { palavras: 318, frases: 236, paraHoje: 0 },
  dificeis: { palavras: 5, frases: 5, paraHoje: 0 },
  sessoes: [],
  anki: [],
  trilha: null,
})

const montar = (extra: Partial<React.ComponentProps<typeof Cartoes>> = {}) => {
  const ir = vi.fn()
  const trocar = vi.fn()
  const r = render(
    <Cartoes
      aba="hoje"
      aoTrocarAba={trocar}
      estudo={null}
      recordings={[]}
      metrics={{ streakDays: 4, maiorSequenciaPresenca: 11 } as never}
      onChangeView={ir}
      {...extra}
    />,
  )
  return { ir, trocar, ...r }
}
const pronta = () =>
  waitFor(() => {
    expect(screen.getByTestId('cartoes').querySelector('.q-esqueleto')).toBeNull()
    expect(conteudoAtual().idioma).toBe('en')
  })
const folha = (nome: string | RegExp) => waitFor(() => screen.getByRole('dialog', { name: nome }))

beforeEach(() => {
  localStorage.clear()
  zerarConteudoParaTeste()
  api.resumo = resumoBase()
  api.contagens = contagensBase()
  api.flagLigada = true
  api.protegido = false
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as never
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  _reiniciarIdentidade()
})

describe('o pedido do resumo', () => {
  it('com a flag ligada pede o resumo v2; desligada, o de sempre', async () => {
    montar()
    await pronta()
    expect(api.lerResumo).toHaveBeenCalledWith(undefined, true)
    cleanup()
    api.lerResumo.mockClear()
    api.flagLigada = false
    montar()
    await pronta()
    expect(api.lerResumo).toHaveBeenCalledWith(undefined, false)
  })
})

describe('dia cumprido: estudo livre e só as difíceis (cartões 2.6 e 5.3)', () => {
  it('com a flag: os dois atalhos abrem a rodada livre, fora da agenda', async () => {
    const { ir } = montar()
    await pronta()
    await waitFor(() => expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('feito'))
    fireEvent.click(screen.getByRole('button', { name: 'Estudo livre' }))
    expect(ir).toHaveBeenLastCalledWith('study', { livre: true, conteudo: { idioma: 'en', fonte: { tipo: 'tudo' } } })
    fireEvent.click(screen.getByRole('button', { name: 'Só as difíceis' }))
    expect(ir).toHaveBeenLastCalledWith('study', {
      livre: true,
      soDificeis: true,
      conteudo: { idioma: 'en', fonte: { tipo: 'tudo' } },
    })
  })

  it('sem difíceis no conteúdo, "Só as difíceis" não aparece; o estudo livre continua', async () => {
    api.contagens = { ...contagensBase(), dificeis: { palavras: 0, frases: 0, paraHoje: 0 } }
    montar()
    await pronta()
    await waitFor(() => expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('feito'))
    expect(screen.queryByRole('button', { name: 'Só as difíceis' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Estudo livre' })).toBeTruthy()
  })

  it('com a flag desligada nada disso existe', async () => {
    api.flagLigada = false
    montar()
    await pronta()
    await waitFor(() => expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('feito'))
    expect(screen.queryByRole('button', { name: 'Estudo livre' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Só as difíceis' })).toBeNull()
  })

  it('com 0 difíceis e N difíceis na fila de hoje, o atalho se chama "Só as difíceis · N"', async () => {
    api.resumo = resumoBase({ hoje: { novas: 0, aprendendo: 0, revisar: 4 }, revisadasHoje: 0 })
    api.contagens = {
      ...contagensBase(),
      tudo: { palavras: 318, frases: 236, paraHoje: 4 },
      dificeis: { palavras: 5, frases: 5, paraHoje: 2 },
    }
    montar()
    await pronta()
    await waitFor(() => expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('normal'))
    expect(screen.getByRole('button', { name: /Só as difíceis · 2/ })).toBeTruthy()
  })
})

describe('sequência com congelamento (cartões 8.1)', () => {
  const comGelo = () =>
    resumoBase({
      hoje: { novas: 0, aprendendo: 0, revisar: 4 },
      revisadasHoje: 0,
      calendario: Array.from({ length: 84 }, (_, i) => (i === 82 ? 0 : 5)),
      sequencia: { atual: 12, congelamentos: 1, praticados: [], congelados: [1] },
    })

  it('o dia congelado aparece na semana de Hoje e a frase diz o que sobrou', async () => {
    api.resumo = comGelo()
    api.contagens = { ...contagensBase(), tudo: { palavras: 318, frases: 236, paraHoje: 4 } }
    montar()
    await pronta()
    const semana = await screen.findByTestId('semana-com-gelo')
    expect(semana.querySelectorAll('.ct-semana li.gelo')).toHaveLength(1)
    expect(semana.textContent).toContain('1 congelamento guardado')
  })

  it('o calendário da Memória marca o dia congelado', async () => {
    api.resumo = comGelo()
    montar({ aba: 'memoria' })
    await pronta()
    expect(screen.getByTestId('memoria-dos-cartoes').querySelectorAll('.ct-cal i.gelo')).toHaveLength(1)
    expect(screen.getByTestId('sequencia-da-semana').querySelectorAll('.ct-semana li.gelo')).toHaveLength(1)
  })

  it('sem o campo no resumo (flag desligada) não há gelo nenhum', async () => {
    api.flagLigada = false
    api.resumo = resumoBase({ calendario: Array.from({ length: 84 }, (_, i) => (i === 82 ? 0 : 5)) })
    montar({ aba: 'memoria' })
    await pronta()
    expect(document.querySelector('.gelo')).toBeNull()
  })
})

describe('tempo por cartão na Memória (cartões 3.7)', () => {
  it('mostra a média só com 10 respostas ou mais', async () => {
    api.resumo = resumoBase({ tempo: { n: 12, mediaMs: 7400 } })
    montar({ aba: 'memoria' })
    await pronta()
    expect(screen.getByTestId('memoria-dos-cartoes').textContent).toContain('Tempo por cartão')
    expect(screen.getByTestId('memoria-dos-cartoes').textContent).toContain('7 s em média (12 respostas)')
  })

  it('perfil protegido (menor): nem o tempo nem o dia congelado aparecem', async () => {
    api.protegido = true
    api.resumo = resumoBase({
      tempo: { n: 40, mediaMs: 7400 },
      calendario: Array.from({ length: 84 }, (_, i) => (i === 82 ? 0 : 5)),
      sequencia: { atual: 12, congelamentos: 1, praticados: [], congelados: [1] },
    })
    montar({ aba: 'memoria' })
    await pronta()
    expect(screen.getByTestId('memoria-dos-cartoes').textContent).not.toContain('Tempo por cartão')
    expect(document.querySelector('.gelo')).toBeNull()
  })

  it('com 9 respostas, não mostra número nenhum', async () => {
    api.resumo = resumoBase({ tempo: { n: 9, mediaMs: 7400 } })
    montar({ aba: 'memoria' })
    await pronta()
    expect(screen.getByTestId('memoria-dos-cartoes').textContent).not.toContain('Tempo por cartão')
  })
})

describe('saídas da pilha (cartões 5.2)', () => {
  const pilha = () => {
    localStorage.setItem('revisao.novasPorDia', '5')
    localStorage.setItem('revisao.revisoesPorDia', '10')
    const fila = { novas: 5, aprendendo: 3, revisar: 18 }
    api.resumo = resumoBase({
      hoje: fila,
      revisadasHoje: 0,
      baralhos: { idiomas: [{ id: 'en', total: 318, ...fila }], sessoes: [], anki: [], trilha: null },
    })
    api.contagens = { ...contagensBase(), tudo: { palavras: 318, frases: 236, paraHoje: 26 } }
    const vencidos = Array.from({ length: 25 }, (_, i) => ({
      id: `c${i}`,
      word: `w${i}`,
      inDeck: true,
      srcLang: 'en',
      fsrsState: 'Review',
      fsrsDueAt: new Date(HOJE - DIA).toISOString(),
      leitnerDueAt: '',
      dueAtMs: HOJE - DIA,
      stability: i % 2 ? 40 : undefined,
      lastReview: HOJE - 2 * DIA,
    }))
    api.baralho.mockImplementation(async () => vencidos)
  }

  it('espalhar mexe só em adiarAte: 25 vencidas, 10 por dia, ficam 10 para hoje e 15 vão para frente', async () => {
    pilha()
    montar()
    await pronta()
    await waitFor(() => expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('pilha'))
    fireEvent.click(within(screen.getByTestId('convite-de-hoje')).getByRole('button', { name: /E o resto\?/ }))
    const resto = await folha('E o resto?')
    expect(within(resto).getAllByRole('radio')).toHaveLength(2)
    const saidas = within(resto).getByTestId('saidas-da-pilha')
    fireEvent.click(within(saidas).getByRole('button', { name: /Espalhar pelos próximos dias/ }))
    await waitFor(() => expect(api.atualizar).toHaveBeenCalledTimes(15))
    for (const [, patch] of api.atualizar.mock.calls) {
      expect(Object.keys(patch as object)).toEqual(['adiarAte'])
      expect((patch as { adiarAte: number }).adiarAte).toBeGreaterThan(HOJE)
    }
    const dias = new Set(api.atualizar.mock.calls.map(([, p]) => (p as { adiarAte: number }).adiarAte))
    expect(dias.size).toBe(2) // 10 amanhã e 5 depois de amanhã
  })

  it('adiar as que aguentam esperar: só as de lembrança alta vão para frente', async () => {
    pilha()
    montar()
    await pronta()
    await waitFor(() => expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('pilha'))
    fireEvent.click(within(screen.getByTestId('convite-de-hoje')).getByRole('button', { name: /E o resto\?/ }))
    const saidas = within(await folha('E o resto?')).getByTestId('saidas-da-pilha')
    fireEvent.click(within(saidas).getByRole('button', { name: /Adiar as que aguentam esperar/ }))
    await waitFor(() => expect(api.atualizar).toHaveBeenCalled())
    const ids = api.atualizar.mock.calls.map(([id]) => Number(String(id).slice(1)))
    /* As de índice par não têm estabilidade (lembrança 0): nenhuma delas é adiada. */
    expect(ids.every((i) => i % 2 === 1)).toBe(true)
  })

  it('sem a flag a folha só tem as duas saídas de antes', async () => {
    api.flagLigada = false
    pilha()
    montar()
    await pronta()
    await waitFor(() => expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('pilha'))
    fireEvent.click(within(screen.getByTestId('convite-de-hoje')).getByRole('button', { name: /E o resto\?/ }))
    const resto = await folha('E o resto?')
    expect(within(resto).queryByTestId('saidas-da-pilha')).toBeNull()
  })
})

describe('importar e exportar únicos e a tecla "?" (cartões 9.1)', () => {
  const abrirMenu = async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Mais opções/ }))
    return folha('Mais opções')
  }

  it('o menu tem Importar, Exportar e Atalhos (com aria-keyshortcuts), sem "Trazer e levar"', async () => {
    montar()
    await pronta()
    const menu = await abrirMenu()
    const titulos = [...menu.querySelectorAll('.q-linha b')].map((b) => b.textContent)
    expect(titulos).toContain('Importar')
    expect(titulos).toContain('Atalhos')
    expect(titulos).not.toContain('Trazer e levar')
    expect(titulos.filter((x) => x === 'Exportar')).toHaveLength(1)
    expect(
      within(menu)
        .getByRole('button', { name: /^Atalhos/ })
        .getAttribute('aria-keyshortcuts'),
    ).toBe('?')
  })

  it('a tecla "?" abre a lista de atalhos; dentro de um campo de texto, não', async () => {
    montar()
    await pronta()
    const campo = document.createElement('input')
    document.body.appendChild(campo)
    fireEvent.keyDown(campo, { key: '?' })
    expect(screen.queryByRole('dialog', { name: 'Atalhos e gestos' })).toBeNull()
    campo.remove()
    act(() => {
      fireEvent.keyDown(document.body, { key: '?' })
    })
    const dlg = await folha('Atalhos e gestos')
    expect(within(dlg).getByTestId('atalhos-da-tela')).toBeTruthy()
  })

  it('sem a flag a tecla "?" não faz nada e o menu é o de sempre', async () => {
    api.flagLigada = false
    montar()
    await pronta()
    fireEvent.keyDown(document.body, { key: '?' })
    expect(screen.queryByRole('dialog', { name: 'Atalhos e gestos' })).toBeNull()
    const menu = await abrirMenu()
    expect([...menu.querySelectorAll('.q-linha b')].map((b) => b.textContent)).toContain('Trazer e levar')
  })
})
