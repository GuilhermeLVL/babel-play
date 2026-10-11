// @vitest-environment jsdom
/**
 * A TELA CARTÕES, VERSÃO ENXUTA (10/10/2026) — porte de `docs/prototipos/cartoes-enxuto.html` com o dado real:
 *   · o cabeçalho numa linha: título, a ficha de conteúdo, as abas Hoje e Palavras e o "…";
 *   · os cinco estados de Hoje, no modo faixa, saem de `GET /api/vocab/resumo` e RESPEITAM a fonte da ficha;
 *   · "Estudar agora", os atalhos e "Continuar por baralho" abrem a rodada com o conteúdo que a recorta;
 *   · abrir a tela NÃO pede o baralho inteiro (`GET /api/vocab`): só o resumo e as contagens do catálogo;
 *   · a aba Baralhos saiu: as ações dela estão no painel da fonte, no catálogo, e no "…" da fonte;
 *   · a Memória é tela de dentro, com voltar; Ajustes, Trazer e levar e Exportar são folhas do "…";
 *   · sem conta, o estado vazio, sem leitura do resumo.
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
  doAnki: [] as unknown[],
  ativar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  contagens: null as unknown,
}))

vi.mock('../src/data/api', async (orig) => {
  api.lerResumo = vi.fn(async () => api.resumo)
  api.baralho = vi.fn(async () => [])
  return {
    ...(await orig<typeof import('../src/data/api')>()),
    lerResumoDosCartoes: api.lerResumo,
    fetchDeck: api.baralho,
  }
})
vi.mock('../src/data/apiAnki', async (orig) => {
  api.ativar = vi.fn(async () => ({ ativadas: 20, restantes: 100 }))
  return {
    ...(await orig<typeof import('../src/data/apiAnki')>()),
    listarBaralhosAnki: vi.fn(async () => api.doAnki),
    ativarNotasDoBaralho: api.ativar,
  }
})
vi.mock('../src/data/rotas/settings', () => ({
  fetchSettings: async () => null,
  patchUiSettings: vi.fn(async () => null),
  saveSettings: async () => null,
}))
vi.mock('../src/data/rotas/conteudo', () => ({
  lerContagensDeConteudo: async () => api.contagens,
}))
vi.mock('../src/lib/langConfig', async (orig) => {
  const real = await orig<typeof import('../src/lib/langConfig')>()
  return { ...real, useLangConfig: () => real.DEFAULT_LANG_CONFIG, fetchLangConfig: async () => real.DEFAULT_LANG_CONFIG }
})
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true }))

import Cartoes from '../src/components/views/Cartoes'
import type { ContagensDeConteudo } from '../src/core/learning/contagensDeConteudo'
import { conteudoAtual, escolherConteudo, zerarConteudoParaTeste } from '../src/lib/conteudo/loja'
import type { Recording } from '../src/types'

const HOJE = new Date(2026, 9, 10).getTime() // sábado

const resumoBase = (mudou: Partial<ResumoDosCartoes> = {}): ResumoDosCartoes => ({
  agora: HOJE + 12 * 3_600_000,
  inicioDoDia: HOJE,
  total: 422,
  suspensas: 9,
  idiomas: 2,
  dificeis: 6,
  revisoesDeSempre: 612,
  revisadasHoje: 0,
  hoje: { novas: 5, aprendendo: 3, revisar: 18 },
  guardadas: 0,
  fases: { novas: 96, aprendendo: 41, jovens: 148, maduras: 128 },
  previsao: [26, 8, 14, 21, 9, 17, 12, 26, ...Array.from({ length: 23 }, () => 10)],
  calendario: Array.from({ length: 84 }, (_, i) => (i % 3 === 0 ? 0 : 5)),
  retencao: {
    d7: { total: 100, lembradas: 91 },
    d30: { total: 612, lembradas: 539 },
    semanas: Array.from({ length: 8 }, () => ({ total: 50, lembradas: 44 })),
  },
  botoes: [73, 55, 416, 68],
  baralhos: {
    idiomas: [
      { id: 'en', total: 318, novas: 4, aprendendo: 3, revisar: 15 },
      { id: 'es', total: 104, novas: 1, aprendendo: 0, revisar: 3 },
    ],
    sessoes: [
      { id: 's-reuniao', total: 37, novas: 3, aprendendo: 2, revisar: 4 },
      { id: 's-apagada', total: 5, novas: 0, aprendendo: 0, revisar: 1 },
    ],
    anki: [{ id: 'a-pv', total: 120, novas: 0, aprendendo: 0, revisar: 2 }],
    trilha: { total: 60, novas: 1, aprendendo: 0, revisar: 1 },
  },
  ...mudou,
})

const sessao: Recording = {
  id: 's-reuniao',
  title: 'Reunião de produto: roadmap do trimestre',
  date: 'hoje',
  durationStr: '38 min',
  wordCount: 400,
  type: 'audio',
  tags: [],
  status: 'Processado',
  idioma: 'en',
}

const SESSAO = { tipo: 'sessao', id: 's-reuniao', nome: 'Reunião de produto: roadmap do trimestre' } as const
const ANKI = { tipo: 'anki', id: 'a-pv', nome: 'English Phrasal Verbs (B1–B2)' } as const

/** O catálogo de conteúdo da conta de exemplo: dois idiomas, lido em inglês. */
const contagensBase = (mudou: Partial<ContagensDeConteudo> = {}): ContagensDeConteudo => ({
  agora: HOJE + 12 * 3_600_000,
  idioma: 'en',
  idiomas: [
    { id: 'en', palavras: 318 },
    { id: 'es', palavras: 104 },
  ],
  tudo: { palavras: 318, frases: 236, paraHoje: 22 },
  dificeis: { palavras: 5, frases: 5, paraHoje: 2 },
  sessoes: [
    { id: 's-reuniao', nome: SESSAO.nome, tipo: 'audio', quando: HOJE, duracaoMs: 38 * 60_000, palavras: 37, frases: 31, paraHoje: 9 },
    { id: 's-podcast', nome: 'Podcast: The science of sleep', tipo: 'audio', quando: HOJE - 86_400_000, duracaoMs: null, palavras: 52, frases: 40, paraHoje: 0 },
  ],
  anki: [{ id: 'a-pv', nome: ANKI.nome, tipo: null, quando: HOJE - 28 * 86_400_000, duracaoMs: null, palavras: 120, frases: 96, paraHoje: 2 }],
  trilha: { palavras: 60, frases: 0, paraHoje: 2 },
  ...mudou,
})

const EM_INGLES = { idioma: 'en', fonte: { tipo: 'tudo' } }

const montar = (extra: Partial<React.ComponentProps<typeof Cartoes>> = {}) => {
  const ir = vi.fn()
  const trocar = vi.fn()
  const r = render(
    <Cartoes
      aba="hoje"
      aoTrocarAba={trocar}
      estudo={null}
      recordings={[sessao]}
      metrics={{ streakDays: 4, maiorSequenciaPresenca: 11 } as never}
      onChangeView={ir}
      {...extra}
    />,
  )
  return { ir, trocar, ...r }
}
const painel = () => screen.getByRole('tabpanel')
/** A tela leu o resumo E as contagens do catálogo (o número de Palavras na aba é o da fonte). */
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
  api.doAnki = []
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
})

describe('a tela', () => {
  it('o cabeçalho numa linha: título, a ficha de conteúdo, as abas Hoje e Palavras e o "…"', async () => {
    montar()
    await pronta()
    const cab = screen.getByTestId('cartoes').querySelector('header.q-cab.ct-cab.fs-cab')!
    expect(cab.querySelector('h1')?.textContent).toBe('Cartões')
    /* A ordem é a do protótipo (`ctCab`): título, ficha, abas, espaço, "…". */
    expect([...cab.children].map((x) => x.className.split(' ').find((c) => /^(fs-ficha|ct-abas|q-espaco|q-ctl)$/.test(c)) ?? x.tagName)).toEqual([
      'H1',
      'fs-ficha',
      'ct-abas',
      'q-espaco',
      'q-ctl',
    ])
    expect(cab.querySelector('.fs-ficha .fs-nome')?.textContent).toBe('TudoInglês')
    const abas = within(screen.getByRole('tablist', { name: 'Seções de Cartões' })).getAllByRole('tab')
    /* O número de Palavras é o do conteúdo escolhido (tudo em inglês), não o da conta inteira. */
    expect(abas.map((a) => a.textContent)).toEqual(['Hoje', 'Palavras318'])
    expect(abas[0].getAttribute('aria-selected')).toBe('true')
    expect(within(cab as HTMLElement).getByRole('button', { name: /^Mais opções/ })).toBeTruthy()
    /* Saíram a linha de totais e os botões soltos. */
    expect(cab.querySelector('.q-sobre')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Palavra' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajustes' })).toBeNull()
    expect(screen.queryByRole('tab', { name: /Baralhos|Trazer e levar|Memória/ })).toBeNull()
  })

  it('abrir a tela pede só o resumo e as contagens: o baralho inteiro não é baixado', async () => {
    montar()
    await pronta()
    expect(api.lerResumo).toHaveBeenCalledTimes(1)
    expect(api.baralho).not.toHaveBeenCalled()
  })

  it('tocar numa aba avisa quem guarda a aba (o endereço acompanha)', async () => {
    const { trocar } = montar()
    await pronta()
    fireEvent.click(screen.getByRole('tab', { name: /Palavras/ }))
    expect(trocar).toHaveBeenCalledWith('palavras')
  })

  it('a leitura falhou: a tela diz, não mostra "nenhum cartão", e tenta de novo', async () => {
    api.resumo = null
    montar()
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('vazio')
    expect(screen.queryByText('Seus cartões aparecem aqui')).toBeNull()
    api.resumo = resumoBase()
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }))
    await waitFor(() => expect(screen.getByText('Para estudar agora')).toBeTruthy())
  })
})

describe('a aba Hoje, no modo faixa, pelo dado real e pela fonte da ficha', () => {
  it('normal: o número do dia é o do conteúdo, com as três contagens; "Estudar agora" abre a rodada dele', async () => {
    const { ir } = montar()
    await pronta()
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('normal')
    const convite = screen.getByTestId('convite-de-hoje')
    /* Tudo em inglês: 22 (4 + 3 + 15), e não os 26 da conta inteira. */
    await waitFor(() => expect(convite.querySelector('.qv-contagem')?.textContent).toBe('22'))
    expect([...convite.querySelectorAll('.ct-tags-do-dia .q-tag')].map((x) => x.textContent)).toEqual([
      '15 a rever',
      '3 aprendendo',
      '4 novas',
    ])
    fireEvent.click(within(convite).getByRole('button', { name: /Estudar agora/ }))
    expect(ir).toHaveBeenLastCalledWith('study', { conteudo: EM_INGLES })
  })

  it('os três atalhos: "Só 10", "Difíceis · N" e "Praticar de outro jeito"', async () => {
    const { ir } = montar()
    await pronta()
    const atalhos = await waitFor(() => {
      const l = [...painel().querySelectorAll('.ct-atalhos .ct-atalho')]
      expect(l.map((x) => x.textContent)).toEqual(['Só 10', 'Difíceis · 2', 'Praticar de outro jeito'])
      return l as HTMLElement[]
    })
    fireEvent.click(atalhos[0])
    expect(ir).toHaveBeenLastCalledWith('study', { limite: 10, conteudo: EM_INGLES })
    fireEvent.click(atalhos[1])
    expect(ir).toHaveBeenLastCalledWith('study', { conteudo: { idioma: 'en', fonte: { tipo: 'dificeis' } } })
    fireEvent.click(atalhos[2])
    expect(ir).toHaveBeenLastCalledWith('study', {
      praticar: { origem: 'hoje', rotulo: 'As palavras de hoje' },
      conteudo: EM_INGLES,
    })
  })

  it('a faixa de estado numa linha: sequência, anel de retenção e a barra de novas; cada lado é uma porta', async () => {
    localStorage.setItem('revisao.novasPorDia', '10')
    const { trocar } = montar()
    await pronta()
    const faixa = screen.getByTestId('faixa-de-estado')
    expect(faixa.querySelector('.ct-chama b')?.textContent).toBe('4 dias')
    expect(faixa.querySelector('[data-ct-ret]')?.textContent).toBe('91%')
    await waitFor(() => expect(faixa.querySelector('.ct-estado-teto b')?.textContent).toBe('4 de 10'))
    expect(faixa.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('4')
    /* Os três cartões de antes não existem no modo faixa. */
    expect(painel().querySelector('.ct-tres-cartoes')).toBeNull()
    fireEvent.click(within(faixa).getByRole('button', { name: /Abrir a Memória/ }))
    expect(trocar).toHaveBeenLastCalledWith('memoria')
    fireEvent.click(within(faixa).getByRole('button', { name: /Mudar o limite do dia/ }))
    const ajustes = await folha('Ajustes da memória')
    /* Os três principais à vista; o resto atrás de "Mais ajustes". */
    expect([...ajustes.querySelectorAll('.dlg-corpo > .q-ajuste b')].map((b) => b.textContent)).toEqual([
      'Meta de retenção · 90%',
      'Novas por dia',
      'Revisões por dia',
    ])
    expect(within(ajustes).queryByText('Botões de resposta')).toBeNull()
    fireEvent.click(within(ajustes).getByRole('button', { name: /Mais ajustes/ }))
    const botoes = within(ajustes).getByRole('group', { name: 'Botões de resposta' })
    expect([...botoes.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Quatro', 'Dois'])
    fireEvent.click(within(botoes).getByRole('button', { name: 'Dois' }))
    expect(localStorage.getItem('revisao.botoesDeNota')).toBe('2')
  })

  it('quem estuda dois idiomas vê um por vez: o outro fica a um toque, com a contagem dele', async () => {
    montar()
    await pronta()
    fireEvent.click(await screen.findByRole('button', { name: 'Espanhol tem 4 para hoje' }))
    expect(conteudoAtual()).toEqual({ idioma: 'es', fonte: { tipo: 'tudo' } })
  })

  it('"Continuar por baralho": as fontes com o que estudar, e a linha abre a rodada dela direto', async () => {
    const { ir } = montar()
    await pronta()
    const linhas = await waitFor(() => {
      const l = within(screen.getByTestId('continuar-por-baralho')).getAllByRole('button')
      /* A sessão com fila e o baralho do Anki; o podcast, sem nada para hoje, não entra. */
      expect(l.map((x) => x.querySelector('b')?.textContent)).toEqual([SESSAO.nome, ANKI.nome])
      return l
    })
    expect(linhas[0].querySelector('.ct-tres')?.getAttribute('aria-label')).toBe('3 novas, 2 aprendendo, 4 a revisar')
    expect(linhas[0].querySelector('.ct-pilula')?.textContent).toBe('Estudar')
    fireEvent.click(linhas[0])
    expect(ir).toHaveBeenLastCalledWith('study', { conteudo: { idioma: 'en', fonte: SESSAO }, id: 's-reuniao' })
    fireEvent.click(linhas[1])
    expect(ir).toHaveBeenLastCalledWith('study', { conteudo: { idioma: 'en', fonte: ANKI } })
    /* A linha estuda sem trocar a escolha do app. */
    expect(conteudoAtual().fonte).toEqual({ tipo: 'tudo' })
  })

  it('com uma sessão na ficha, tudo é dela: o número, a rodada, a aba Palavras; e não há "Continuar por baralho"', async () => {
    const { ir } = montar()
    await pronta()
    act(() => escolherConteudo(SESSAO, 'en'))
    const convite = screen.getByTestId('convite-de-hoje')
    await waitFor(() => expect(convite.querySelector('.qv-contagem')?.textContent).toBe('9'))
    expect([...convite.querySelectorAll('.ct-tags-do-dia .q-tag')].map((x) => x.textContent)).toEqual([
      '4 a rever',
      '2 aprendendo',
      '3 novas',
    ])
    expect(screen.getByRole('tab', { name: /Palavras/ }).textContent).toBe('Palavras37')
    expect(screen.queryByTestId('continuar-por-baralho')).toBeNull()
    fireEvent.click(within(convite).getByRole('button', { name: /Estudar agora/ }))
    expect(ir).toHaveBeenLastCalledWith('study', { conteudo: { idioma: 'en', fonte: SESSAO }, id: 's-reuniao' })
  })

  it('nada vence na fonte escolhida, mas vence em outro lugar: "Nada vence aqui hoje", sem comemorar', async () => {
    montar()
    await pronta()
    act(() => escolherConteudo({ tipo: 'sessao', id: 's-podcast', nome: 'Podcast: The science of sleep' }, 'en'))
    await waitFor(() =>
      expect(within(screen.getByTestId('convite-de-hoje')).getByRole('button', { name: 'Nada vence aqui hoje' })).toHaveProperty(
        'disabled',
        true,
      ),
    )
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('normal')
    expect(screen.queryByText('Tudo em dia')).toBeNull()
  })

  it('pilha: vence mais do que cabe na rodada; a folha "E o resto?" guarda as saídas que o app cumpre', async () => {
    localStorage.setItem('revisao.novasPorDia', '5')
    localStorage.setItem('revisao.revisoesPorDia', '10')
    const { ir } = montar()
    await pronta()
    await waitFor(() => expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('pilha'))
    const convite = screen.getByTestId('convite-de-hoje')
    expect(convite.querySelector('h2')?.textContent).toBe('Você tem 22 esperando. Vamos de 14 hoje?')
    fireEvent.click(within(convite).getByRole('button', { name: 'Estudar 14 agora' }))
    expect(ir).toHaveBeenLastCalledWith('study', { conteudo: EM_INGLES })
    fireEvent.click(within(convite).getByRole('button', { name: /E o resto\?/ }))
    const resto = await folha('E o resto?')
    const saidas = within(resto).getAllByRole('radio')
    /* Espalhar e adiar pedem reagendamento no servidor, que não existe: não viram botão. */
    expect(saidas.map((x) => x.querySelector('b')?.textContent)).toEqual(['Só 10 por dia', 'Sem palavras novas'])
    expect(saidas[0].getAttribute('aria-checked')).toBe('true')
    fireEvent.click(saidas[1])
    expect(localStorage.getItem('revisao.novasPorDia')).toBe('0')
    expect(within(resto).getAllByRole('radio')[1].getAttribute('aria-checked')).toBe('true')
    /* A previsão do resumo é a da conta inteira: com dois idiomas ela não é "a semana" deste conteúdo. */
    expect(resto.querySelector('.ct-mini7')).toBeNull()
  })

  it('dia cumprido: o que foi estudado, a semana, praticar de outro jeito e mais novas só se houver guardadas', async () => {
    const semFila = { novas: 0, aprendendo: 0, revisar: 0 }
    api.resumo = resumoBase({
      hoje: semFila,
      revisadasHoje: 26,
      guardadas: 3,
      baralhos: { ...resumoBase().baralhos, idiomas: [{ id: 'en', total: 318, ...semFila }, { id: 'es', total: 104, ...semFila }] },
    })
    const { ir } = montar()
    await pronta()
    await waitFor(() => expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('feito'))
    const fecho = screen.getByTestId('convite-de-hoje')
    expect(fecho.classList.contains('ct-feito')).toBe(true)
    expect(fecho.querySelector('h2')?.textContent).toBe('Tudo em dia')
    expect(fecho.querySelector('p')?.textContent).toBe('Você estudou 26 cartões hoje. A próxima abre amanhã com 8.')
    expect(fecho.querySelectorAll('.ct-semana li')).toHaveLength(7)
    fireEvent.click(within(fecho).getByRole('button', { name: /Praticar de outro jeito/ }))
    expect(ir).toHaveBeenLastCalledWith('study', {
      praticar: { origem: 'hoje', rotulo: 'Todas as suas palavras' },
      conteudo: EM_INGLES,
    })
    fireEvent.click(screen.getByRole('button', { name: /Mais 3 novas/ }))
    expect(ir).toHaveBeenLastCalledWith('study', { soNovas: true, limite: 3, conteudo: EM_INGLES })
    fireEvent.click(screen.getByRole('button', { name: 'Jogar com as mesmas' }))
    expect(ir).toHaveBeenLastCalledWith('play')
    /* O "Estudo livre" do protótipo (fora da agenda) não existe no app: não vira botão. */
    expect(screen.queryByRole('button', { name: /Estudo livre/ })).toBeNull()
    expect(screen.getByTestId('faixa-de-estado')).toBeTruthy()
  })

  it('primeiras palavras: nunca houve revisão; começa por 10 e explica em três passos', async () => {
    api.resumo = resumoBase({
      total: 34,
      idiomas: 1,
      revisoesDeSempre: 0,
      hoje: { novas: 34, aprendendo: 0, revisar: 0 },
      baralhos: { idiomas: [], sessoes: [], anki: [], trilha: null },
    })
    api.contagens = contagensBase({
      idioma: '',
      idiomas: [{ id: 'en', palavras: 34 }],
      tudo: { palavras: 34, frases: 30, paraHoje: 34 },
      dificeis: { palavras: 0, frases: 0, paraHoje: 0 },
      sessoes: [],
      anki: [],
      trilha: null,
    })
    const { ir } = montar()
    await waitFor(() => expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('primeiro'))
    expect(screen.getByTestId('convite-de-hoje').querySelector('h2')?.textContent).toBe(
      'Suas 34 palavras das sessões já são cartões',
    )
    expect(painel().querySelectorAll('.ct-como .q-passos li')).toHaveLength(3)
    expect([...painel().querySelectorAll('.ct-atalhos.ct-quebra .ct-atalho')].map((x) => x.textContent)).toEqual([
      'Capturar outra sessão',
      'Trazer do Anki',
      'Jogar com a Trilha',
    ])
    fireEvent.click(screen.getByRole('button', { name: /Começar por 10/ }))
    expect(ir).toHaveBeenLastCalledWith('study', { limite: 10, conteudo: EM_INGLES })
  })

  it('nenhum cartão: os três caminhos de quem começa', async () => {
    api.resumo = resumoBase({ total: 0, revisoesDeSempre: 0, hoje: { novas: 0, aprendendo: 0, revisar: 0 } })
    const { ir } = montar()
    await waitFor(() => expect(screen.getByText('Seus cartões aparecem aqui')).toBeTruthy())
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('vazio')
    const caminhos = [...painel().querySelectorAll('.ct-tres-caminhos .q-tile b')].map((b) => b.textContent)
    expect(caminhos).toEqual(['Capturar uma sessão', 'Trazer um baralho do Anki', 'Começar pela Trilha'])
    fireEvent.click(screen.getByRole('button', { name: /Capturar uma sessão/ }))
    expect(ir).toHaveBeenLastCalledWith('capture')
    /* "Trazer um baralho do Anki" abre o seletor de arquivos da tela (o mesmo da folha "Trazer e levar"). */
    const arquivo = screen.getByTestId('anki-arquivo') as HTMLInputElement
    const abriu = vi.spyOn(arquivo, 'click')
    fireEvent.click(screen.getByRole('button', { name: /Trazer um baralho do Anki/ }))
    expect(abriu).toHaveBeenCalledTimes(1)
  })

  it('sem conta: o estado vazio, sem leitura do resumo, e o "…" só com o que não pede conta', async () => {
    montar({ semConta: true })
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('vazio')
    expect(screen.getByText('Seus cartões aparecem aqui')).toBeTruthy()
    expect(api.lerResumo).not.toHaveBeenCalled()
    expect(api.baralho).not.toHaveBeenCalled()
    expect(screen.queryByTestId('anki-arquivo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Mais opções/ }))
    const menu = await folha('Mais opções')
    expect([...menu.querySelectorAll('.q-linha b')].map((b) => b.textContent)).toEqual(['Ajustes da memória', 'Memória'])
  })

  /* O que o protótipo mostra e o app não mede ou não faz não aparece com número inventado. */
  it('fora: o tempo estimado, o congelamento da sequência e o teto contado por dia', async () => {
    montar()
    await pronta()
    const tela = screen.getByTestId('cartoes')
    expect(tela.textContent).not.toMatch(/uns \d+ min/)
    expect(tela.textContent).not.toMatch(/congelamento/)
    expect(tela.querySelector('.ct-teto')).toBeNull()
    expect(tela.querySelector('.ct-cobertura')).toBeNull()
  })
})

describe('o "…" do cabeçalho e as folhas', () => {
  const abrirMenu = async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Mais opções/ }))
    return folha('Mais opções')
  }

  it('Palavra nova, Trazer e levar, Ajustes da memória, Memória e Exportar', async () => {
    const { trocar } = montar()
    await pronta()
    const menu = await abrirMenu()
    expect([...menu.querySelectorAll('.q-linha b')].map((b) => b.textContent)).toEqual([
      'Palavra nova',
      'Trazer e levar',
      'Ajustes da memória',
      'Memória',
      'Exportar',
    ])
    expect(within(menu).getByRole('button', { name: /Ajustes da memória/ }).textContent).toContain(
      'Meta de 90%, 20 novas e 200 revisões por dia',
    )
    fireEvent.click(within(menu).getByRole('button', { name: /^Memória/ }))
    await waitFor(() => expect(trocar).toHaveBeenLastCalledWith('memoria'))

    fireEvent.click(within(await abrirMenu()).getByRole('button', { name: /Palavra nova/ }))
    await waitFor(() => expect(trocar).toHaveBeenLastCalledWith('palavras'))
  })

  it('"Trazer e levar" é uma folha: palavra nova, arquivo do Anki e exportar (que pede o baralho na hora)', async () => {
    montar()
    await pronta()
    fireEvent.click(within(await abrirMenu()).getByRole('button', { name: /Trazer e levar/ }))
    const trazer = await folha('Trazer e levar')
    expect([...trazer.querySelectorAll('.q-linha b')].map((b) => b.textContent)).toEqual([
      'Palavra nova',
      'Arquivo do Anki',
      'Exportar',
    ])
    /* Colar uma lista não existe no app: não vira linha. */
    expect(within(trazer).queryByText(/Colar uma lista/)).toBeNull()
    const arquivo = screen.getByTestId('anki-arquivo') as HTMLInputElement
    const abriu = vi.spyOn(arquivo, 'click')
    fireEvent.click(within(trazer).getByRole('button', { name: /Arquivo do Anki/ }))
    expect(abriu).toHaveBeenCalledTimes(1)
    expect(api.baralho).not.toHaveBeenCalled()
    fireEvent.click(within(trazer).getByRole('button', { name: /Exportar/ }))
    await waitFor(() => expect(api.baralho).toHaveBeenCalledTimes(1))
  })

  it('com um baralho do Anki na ficha, "Opções de …" guarda o que só existia na aba Baralhos', async () => {
    api.doAnki = [
      {
        id: 'a-pv',
        nome: ANKI.nome,
        arquivoOrigem: 'pv.apkg',
        estado: 'ativo',
        idiomaOrigem: 'en',
        idiomaAlvo: 'pt',
        createdAt: new Date(2026, 8, 12).getTime(),
        total: 480,
        ativas: 120,
        descartadas: 10,
        ausentes: 0,
      },
    ]
    montar()
    await pronta()
    act(() => escolherConteudo(ANKI, 'en'))
    const menu = await abrirMenu()
    fireEvent.click(within(menu).getByRole('button', { name: new RegExp(`Opções de ${ANKI.nome.slice(0, 12)}`) }))
    const daFonte = await folha(ANKI.nome)
    await waitFor(() =>
      expect([...daFonte.querySelectorAll('.q-linha b')].map((b) => b.textContent)).toEqual([
        'Ativar mais 20',
        'Gerenciar',
        'Exportar',
      ]),
    )
    expect(within(daFonte).getByRole('button', { name: /Ativar mais 20/ }).textContent).toContain('120 de 480 já ativadas')
    /* O que o app não cumpre não vira botão. */
    expect(within(daFonte).queryByText(/Compartilhar por link/)).toBeNull()
    fireEvent.click(within(daFonte).getByRole('button', { name: /Ativar mais 20/ }))
    await waitFor(() => expect(api.ativar).toHaveBeenCalledWith('a-pv', 20))
    await waitFor(() => expect(api.lerResumo).toHaveBeenCalledTimes(2))
  })
})

describe('as ações que eram da aba Baralhos, no painel da fonte do catálogo', () => {
  const abrirCatalogo = async () => {
    fireEvent.click(document.querySelector('[data-fs="abrir"]')!)
    return folha('Escolher o conteúdo')
  }
  const naLista = (d: HTMLElement, chave: string) => d.querySelector<HTMLElement>(`.fx-linha[data-fx-fonte="${chave}"]`)!

  it('Revisar, Praticar, Jogar e Ver palavras: a fonte vira a escolha e a ação leva', async () => {
    const { ir, trocar } = montar()
    await pronta()
    let d = await abrirCatalogo()
    fireEvent.click(naLista(d, 'sessao:s-reuniao'))
    const acoes = () => within(d.querySelector('.fx-cat-det') as HTMLElement)
    expect(acoes().getByText(SESSAO.nome)).toBeTruthy()
    fireEvent.click(acoes().getByRole('button', { name: 'Revisar · 9' }))
    expect(conteudoAtual().fonte).toEqual(SESSAO)
    expect(ir).toHaveBeenLastCalledWith('study', { conteudo: { idioma: 'en', fonte: SESSAO }, id: 's-reuniao' })

    d = await abrirCatalogo()
    fireEvent.click(naLista(d, 'anki:a-pv'))
    fireEvent.click(acoes().getByRole('button', { name: 'Praticar' }))
    expect(ir).toHaveBeenLastCalledWith('study', {
      praticar: { origem: 'baralho', rotulo: ANKI.nome },
      conteudo: { idioma: 'en', fonte: ANKI },
    })

    d = await abrirCatalogo()
    fireEvent.click(naLista(d, 'sessao:s-reuniao'))
    fireEvent.click(acoes().getByRole('button', { name: 'Jogar' }))
    expect(ir).toHaveBeenLastCalledWith('play', { id: 's-reuniao' })

    d = await abrirCatalogo()
    fireEvent.click(naLista(d, 'trilha'))
    fireEvent.click(acoes().getByRole('button', { name: 'Ver palavras' }))
    expect(conteudoAtual().fonte).toEqual({ tipo: 'trilha' })
    expect(trocar).toHaveBeenLastCalledWith('palavras')
  })

  it('o "…" do painel: abrir a sessão e exportar só aquele conteúdo', async () => {
    const { ir } = montar()
    await pronta()
    const d = await abrirCatalogo()
    fireEvent.click(naLista(d, 'sessao:s-reuniao'))
    fireEvent.click(within(d.querySelector('.fx-cat-det') as HTMLElement).getByRole('button', { name: 'Mais ações deste conteúdo' }))
    const daFonte = await folha(SESSAO.nome)
    expect([...daFonte.querySelectorAll('.q-linha b')].map((b) => b.textContent)).toEqual(['Abrir a sessão', 'Exportar'])
    fireEvent.click(within(daFonte).getByRole('button', { name: /Abrir a sessão/ }))
    await waitFor(() => expect(ir).toHaveBeenLastCalledWith('analysis', { id: 's-reuniao' }))
  })
})

describe('a Memória, tela de dentro', () => {
  it('abre com voltar e Ajustes no cabeçalho, sem as abas; o voltar devolve a "Hoje"', async () => {
    const { trocar } = montar({ aba: 'memoria' })
    await pronta()
    const tela = screen.getByTestId('cartoes')
    expect(tela.classList.contains('ct-dentro')).toBe(true)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Memória')
    expect(screen.queryByRole('tablist', { name: 'Seções de Cartões' })).toBeNull()
    expect(tela.querySelector('.fs-ficha')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ajustes da memória' }))
    fireEvent.click(within(await folha('Ajustes da memória')).getByRole('button', { name: /Pronto/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Cartões' }))
    expect(trocar).toHaveBeenLastCalledWith('hoje')
  })

  it('a semana da sequência e a previsão de 7 dias, que começa amanhã (domingo)', async () => {
    montar({ aba: 'memoria' })
    await pronta()
    const seq = screen.getByTestId('sequencia-da-semana')
    expect(seq.querySelector('h2')?.textContent).toBe('4 dias seguidos')
    expect(seq.textContent).toContain('Recorde: 11 dias.')
    /* O calendário da fixture: um dia sem revisão a cada três; hoje (índice 83) teve. */
    expect([...seq.querySelectorAll('.ct-semana li')].map((li) => `${li.querySelector('small')?.textContent}:${li.className}`)).toEqual([
      'dom:feito',
      'seg:fora',
      'ter:feito',
      'qua:feito',
      'qui:fora',
      'sex:feito',
      'sáb:feito',
    ])
    const colunas = [...screen.getByTestId('previsao-dos-proximos-dias').querySelectorAll('.qv-col')]
    expect(colunas.map((c) => `${c.querySelector('small')?.textContent} ${c.querySelector('b')?.textContent}`)).toEqual(
      ['dom 8', 'seg 14', 'ter 21', 'qua 9', 'qui 17', 'sex 12', 'sáb 26'],
    )
    expect(colunas[0].querySelector('.qv-barra')?.classList.contains('hoje')).toBe(true)
  })

  it('os números são os medidos: retenção de 30 dias, revisões, botões e fases', async () => {
    const { trocar } = montar({ aba: 'memoria' })
    await pronta()
    const kpis = [...painel().querySelectorAll('.ct-kpis .q-num')].map(
      (k) => `${k.querySelector('.q-rotulo')?.textContent?.trim()}=${k.querySelector('b')?.textContent}`,
    )
    expect(kpis).toEqual(['Retenção real=88%', 'Revisões=612', 'Sequência=4 dias', 'Difíceis=6'])
    const botoes = [...screen.getByTestId('botoes-usados').querySelectorAll('.ct-bh')].map(
      (b) =>
        `${b.querySelector('span')?.textContent} ${b.querySelector('b')?.textContent} ${b.querySelector('small')?.textContent}`,
    )
    expect(botoes).toEqual(['Errei 12% 73', 'Difícil 9% 55', 'Bom 68% 416', 'Fácil 11% 68'])
    const fases = [...screen.getByTestId('cartoes-por-estado').querySelectorAll('.ct-leg-fases li')].map(
      (li) => `${li.querySelector('span')?.textContent} ${li.querySelector('b')?.textContent}`,
    )
    expect(fases).toEqual([
      'Novas 96 · 23%',
      'Aprendendo 41 · 10%',
      'Jovens 148 · 35%',
      'Maduras 128 · 30%',
      'Suspensas 9 · 2%',
    ])
    expect(screen.getByTestId('previsao-de-carga').querySelectorAll('.ct-prev30 i')).toHaveLength(30)
    expect(screen.getByTestId('previsao-de-carga').querySelectorAll('.ct-prev30 i.pico')).toHaveLength(1)
    expect(screen.getByTestId('dias-estudados').textContent).toContain('56 dias com revisão')
    /* O tempo por cartão não é medido: o número do protótipo não aparece. */
    expect(painel().textContent).not.toMatch(/por cartão|congelamento/)
    /* "Ver as difíceis": "Difíceis" vira o conteúdo e a lista de Palavras abre. */
    fireEvent.click(screen.getByRole('button', { name: 'Ver as 6 difíceis' }))
    expect(conteudoAtual().fonte).toEqual({ tipo: 'dificeis' })
    expect(trocar).toHaveBeenLastCalledWith('palavras')
  })

  it('sem revisão nenhuma: os números aparecem depois das primeiras', async () => {
    api.resumo = resumoBase({ revisoesDeSempre: 0 })
    const { trocar } = montar({ aba: 'memoria' })
    await waitFor(() => expect(screen.getByText('Os números aparecem depois das primeiras revisões')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Ver como começar/ }))
    expect(trocar).toHaveBeenLastCalledWith('hoje')
  })
})
