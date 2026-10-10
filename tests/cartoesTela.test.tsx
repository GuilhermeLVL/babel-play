// @vitest-environment jsdom
/**
 * A TELA CARTÕES (fatia 1, 10/10/2026) — porte de `docs/prototipos/cartoes.html` com o dado real:
 *   · os cinco estados da aba Hoje saem de `GET /api/vocab/resumo` e dos limites da rodada;
 *   · abrir a tela NÃO pede o baralho inteiro (`GET /api/vocab`): só o resumo;
 *   · estudar abre a rodada que já existia, com o recorte pedido (sessão, "Só 10", "Mais novas");
 *   · a aba Baralhos lista os baralhos automáticos e os do Anki, e só oferece "Revisar este" onde a
 *     revisão aceita o recorte (tudo e sessão);
 *   · sem conta, o estado vazio, sem leitura do servidor.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('../src/lib/langConfig', async (orig) => {
  const real = await orig<typeof import('../src/lib/langConfig')>()
  return { ...real, useLangConfig: () => real.DEFAULT_LANG_CONFIG }
})
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true }))

import Cartoes from '../src/components/views/Cartoes'
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

const montar = (extra: Partial<React.ComponentProps<typeof Cartoes>> = {}) => {
  const ir = vi.fn()
  const trocar = vi.fn()
  const r = render(
    <Cartoes
      aba="hoje"
      aoTrocarAba={trocar}
      estudo={null}
      recordings={[sessao]}
      metrics={null}
      onChangeView={ir}
      {...extra}
    />,
  )
  return { ir, trocar, ...r }
}
const painel = () => screen.getByRole('tabpanel')
const pronta = () => waitFor(() => expect(screen.getByTestId('cartoes').querySelector('.q-esqueleto')).toBeNull())

beforeEach(() => {
  api.resumo = resumoBase()
  api.doAnki = []
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('a tela', () => {
  it('o cabeçalho e as cinco abas do protótipo, na ordem, com "Hoje" escolhida', async () => {
    montar()
    await pronta()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cartões')
    expect(screen.getByTestId('cartoes').querySelector('.q-sobre')?.textContent).toBe(
      '422 cartões · 2 idiomas · meta de retenção 90%',
    )
    const abas = within(screen.getByRole('tablist', { name: 'Seções de Cartões' })).getAllByRole('tab')
    expect(abas.map((a) => a.textContent)).toEqual(['Hoje', 'Baralhos', 'Palavras422', 'Trazer e levar', 'Memória'])
    expect(abas[0].getAttribute('aria-selected')).toBe('true')
  })

  it('abrir a tela pede só o resumo: o baralho inteiro não é baixado', async () => {
    montar()
    await pronta()
    expect(api.lerResumo).toHaveBeenCalledTimes(1)
    expect(api.baralho).not.toHaveBeenCalled()
  })

  it('tocar numa aba avisa quem guarda a aba (o endereço acompanha)', async () => {
    const { trocar } = montar()
    await pronta()
    fireEvent.click(screen.getByRole('tab', { name: /Memória/ }))
    expect(trocar).toHaveBeenCalledWith('memoria')
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

describe('a aba Hoje, pelo dado real', () => {
  it('normal: o total que vence, as três contagens e "Estudar agora" abre a rodada', async () => {
    const { ir } = montar()
    await pronta()
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('normal')
    const convite = screen.getByTestId('convite-de-hoje')
    expect(convite.querySelector('.qv-contagem')?.textContent).toBe('26')
    expect([...convite.querySelectorAll('.ct-tags-do-dia .q-tag')].map((x) => x.textContent)).toEqual([
      '18 a rever',
      '3 aprendendo',
      '5 novas',
    ])
    fireEvent.click(within(convite).getByRole('button', { name: /Estudar agora/ }))
    expect(ir).toHaveBeenLastCalledWith('study', {})
  })

  it('"Só 10 agora" pede a rodada com o limite; "Escolher um baralho" leva à aba', async () => {
    const { ir, trocar } = montar()
    await pronta()
    fireEvent.click(screen.getByRole('button', { name: /Só 10 agora/ }))
    expect(ir).toHaveBeenLastCalledWith('study', { limite: 10 })
    fireEvent.click(screen.getByRole('button', { name: /Escolher um baralho/ }))
    expect(trocar).toHaveBeenLastCalledWith('baralhos')
  })

  it('a retenção da semana é a medida, contra a meta guardada; a previsão começa amanhã (domingo)', async () => {
    localStorage.setItem('revisao.metaDeRetencao', '92')
    montar()
    await pronta()
    const ret = screen.getByTestId('retencao-da-semana')
    expect(ret.querySelector('.px-anel b')?.textContent).toBe('91%')
    expect(ret.querySelector('.px-anel span')?.textContent).toBe('meta 92%')
    expect(ret.querySelector('.qv-nota')?.textContent).toBe('1 ponto abaixo da meta. Nos últimos 30 dias ficou em 88%.')
    const colunas = [...screen.getByTestId('previsao-dos-proximos-dias').querySelectorAll('.qv-col')]
    expect(colunas.map((c) => `${c.querySelector('small')?.textContent} ${c.querySelector('b')?.textContent}`)).toEqual(
      ['dom 8', 'seg 14', 'ter 21', 'qua 9', 'qui 17', 'sex 12', 'sáb 26'],
    )
    expect(colunas[0].querySelector('.qv-barra')?.classList.contains('hoje')).toBe(true)
  })

  it('"Nasceu da legenda" lista as sessões com cartão que ainda existem, e estuda só a sessão', async () => {
    const { ir } = montar()
    await pronta()
    const linhas = within(screen.getByTestId('nasceu-da-legenda')).getAllByRole('button')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].textContent).toContain('Reunião de produto: roadmap do trimestre')
    expect(linhas[0].textContent).toContain('37 palavras viraram cartões')
    fireEvent.click(linhas[0])
    expect(ir).toHaveBeenLastCalledWith('study', { id: 's-reuniao' })
  })

  it('pilha: vence mais do que cabe na rodada; diz quantas esperam e quantas a rodada leva', async () => {
    localStorage.setItem('revisao.novasPorDia', '0')
    localStorage.setItem('revisao.revisoesPorDia', '10')
    const { ir } = montar()
    await pronta()
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('pilha')
    const convite = screen.getByTestId('convite-de-hoje')
    expect(convite.querySelector('h2')?.textContent).toBe('Você tem 26 esperando. Vamos de 10 agora?')
    fireEvent.click(within(convite).getByRole('button', { name: 'Estudar 10 agora' }))
    expect(ir).toHaveBeenLastCalledWith('study', {})
    /* As quatro saídas da pilha do protótipo (espalhar, adiar…) não existem no servidor: não aparecem. */
    expect(painel().querySelector('.ct-pilha')).toBeNull()
  })

  it('dia cumprido: o que foi estudado hoje, quando abre a próxima, e mais novas só se houver guardadas', async () => {
    api.resumo = resumoBase({ hoje: { novas: 0, aprendendo: 0, revisar: 0 }, revisadasHoje: 26, guardadas: 3 })
    const { ir } = montar()
    await pronta()
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('feito')
    const fecho = screen.getByTestId('convite-de-hoje')
    expect(fecho.querySelector('h2')?.textContent).toBe('Tudo em dia')
    expect(fecho.querySelector('p')?.textContent).toBe('Você estudou 26 cartões hoje. A próxima abre amanhã com 8.')
    fireEvent.click(screen.getByRole('button', { name: /Mais 3 novas/ }))
    expect(ir).toHaveBeenLastCalledWith('study', { soNovas: true, limite: 3 })
    fireEvent.click(screen.getByRole('button', { name: 'Jogar' }))
    expect(ir).toHaveBeenLastCalledWith('play')
    cleanup()

    api.resumo = resumoBase({ hoje: { novas: 0, aprendendo: 0, revisar: 0 }, guardadas: 0 })
    montar()
    await pronta()
    expect(screen.queryByRole('button', { name: /Mais \d+ nova/ })).toBeNull()
    expect(screen.getByTestId('convite-de-hoje').querySelector('p')?.textContent).toContain('Nada vence agora.')
  })

  it('primeiras palavras: nunca houve revisão; começa por 10 e explica em três passos', async () => {
    api.resumo = resumoBase({
      total: 34,
      idiomas: 1,
      revisoesDeSempre: 0,
      hoje: { novas: 34, aprendendo: 0, revisar: 0 },
      baralhos: { idiomas: [], sessoes: [], anki: [], trilha: null },
    })
    const { ir } = montar()
    await pronta()
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('primeiro')
    expect(screen.getByTestId('cartoes').querySelector('.q-sobre')?.textContent).toBe(
      'Sua memória · 34 cartões · 1 idioma',
    )
    expect(screen.getByTestId('convite-de-hoje').querySelector('h2')?.textContent).toBe(
      'Suas 34 palavras das sessões já são cartões',
    )
    expect(painel().querySelectorAll('.q-passos li')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /Começar por 10/ }))
    expect(ir).toHaveBeenLastCalledWith('study', { limite: 10 })
  })

  it('nenhum cartão: os três caminhos de quem começa', async () => {
    api.resumo = resumoBase({ total: 0, revisoesDeSempre: 0, hoje: { novas: 0, aprendendo: 0, revisar: 0 } })
    const { ir, trocar } = montar()
    await pronta()
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('vazio')
    expect(screen.getByTestId('cartoes').querySelector('.q-sobre')?.textContent).toBe(
      'Sua memória · nenhum cartão ainda',
    )
    const caminhos = [...painel().querySelectorAll('.ct-tres-caminhos .q-tile b')].map((b) => b.textContent)
    expect(caminhos).toEqual(['Capturar uma sessão', 'Trazer um baralho do Anki', 'Começar pela Trilha'])
    fireEvent.click(screen.getByRole('button', { name: /Capturar uma sessão/ }))
    expect(ir).toHaveBeenLastCalledWith('capture')
    fireEvent.click(screen.getByRole('button', { name: /Trazer um baralho do Anki/ }))
    expect(trocar).toHaveBeenLastCalledWith('trazer')
  })

  it('sem conta: o estado vazio, sem leitura do servidor e sem o "+ Palavra"', () => {
    montar({ semConta: true })
    expect(screen.getByTestId('cartoes').dataset.ctHoje).toBe('vazio')
    expect(screen.getByText('Seus cartões aparecem aqui')).toBeTruthy()
    expect(api.lerResumo).not.toHaveBeenCalled()
    expect(api.baralho).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Palavra' })).toBeNull()
  })

  /* O que o protótipo mostra e o app ainda não faz de verdade não aparece com número inventado. */
  it('fora desta fatia: sequência com congelamento, teto do dia, "Só as difíceis" e o seletor de idioma', async () => {
    montar()
    await pronta()
    const tela = screen.getByTestId('cartoes')
    expect(tela.querySelector('.ct-seq')).toBeNull()
    expect(tela.querySelector('.ct-teto')).toBeNull()
    expect(screen.queryByRole('button', { name: /Só as difíceis/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Todos os idiomas/ })).toBeNull()
    expect(tela.textContent).not.toMatch(/uns \d+ min/)
  })
})

describe('a aba Baralhos', () => {
  const doAnki = {
    id: 'a-pv',
    nome: 'English Phrasal Verbs (B1–B2)',
    arquivoOrigem: 'pv.apkg',
    estado: 'ativo',
    idiomaOrigem: 'en',
    idiomaAlvo: 'pt',
    createdAt: new Date(2026, 8, 12).getTime(),
    total: 480,
    ativas: 120,
    descartadas: 10,
    ausentes: 0,
  }

  it('os baralhos se montam sozinhos: Tudo, por idioma, por sessão (as que existem), Trilha e Anki', async () => {
    api.doAnki = [doAnki]
    montar({ aba: 'baralhos' })
    await pronta()
    await waitFor(() => expect(painel().textContent).toContain('English Phrasal Verbs'))
    const nomes = [...painel().querySelectorAll('.ct-bar-col .ct-linha-b > span:not(.q-ic):not(.ct-tres) > b')].map(
      (b) => b.textContent,
    )
    expect(nomes).toEqual([
      'Tudo',
      'Inglês',
      'Espanhol',
      'Reunião de produto: roadmap do trimestre',
      'Trilha de vocabulário',
      'English Phrasal Verbs (B1–B2)',
    ])
    const tudo = painel().querySelector('.ct-linha-b')!
    expect(tudo.querySelector('.ct-tres')?.getAttribute('aria-label')).toBe('5 novas, 3 aprendendo, 18 a revisar')
    expect(painel().textContent).toContain('120 de 480 notas ativadas')
    expect(painel().querySelector('.ct-grupo .ct-linha-b[data-ct-baralho="cuidar"]')).toBeNull()
  })

  it('"Revisar este" existe onde a revisão aceita o recorte: Tudo e a sessão', async () => {
    const { ir } = montar({ aba: 'baralhos' })
    await pronta()
    const detalhe = () => within(screen.getByTestId('baralho-selecionado'))
    fireEvent.click(detalhe().getByRole('button', { name: 'Revisar este · 26' }))
    expect(ir).toHaveBeenLastCalledWith('study', {})
    fireEvent.click(screen.getByRole('button', { name: /Reunião de produto/ }))
    expect(detalhe().getByText('Sessão de áudio')).toBeTruthy()
    fireEvent.click(detalhe().getByRole('button', { name: 'Revisar este · 9' }))
    expect(ir).toHaveBeenLastCalledWith('study', { id: 's-reuniao' })
    fireEvent.click(detalhe().getByRole('button', { name: /Abrir a sessão/ }))
    expect(ir).toHaveBeenLastCalledWith('analysis', { id: 's-reuniao' })
  })

  it('idioma, Trilha e Anki não oferecem "Revisar este" (fatia seguinte): o principal é jogar', async () => {
    api.doAnki = [doAnki]
    const { ir } = montar({ aba: 'baralhos' })
    await pronta()
    await waitFor(() => expect(painel().textContent).toContain('English Phrasal Verbs'))
    const detalhe = () => screen.getByTestId('baralho-selecionado')
    for (const nome of [/^Inglês/, /Trilha de vocabulário/, /English Phrasal Verbs/]) {
      fireEvent.click(within(painel().querySelector('.ct-bar-col') as HTMLElement).getByRole('button', { name: nome }))
      expect(within(detalhe()).queryByRole('button', { name: /Revisar este/ })).toBeNull()
      expect(detalhe().querySelector('.q-ctl.pri')?.textContent).toContain('Jogar com este')
    }
    fireEvent.click(within(detalhe()).getByRole('button', { name: /Jogar com este/ }))
    expect(ir).toHaveBeenLastCalledWith('play')
    expect(JSON.parse(localStorage.getItem('babel.filtro_da_pratica') ?? '{}').baralhos ?? []).toEqual(['a-pv'])
  })

  it('"Ativar mais 20" ativa notas do baralho do Anki e relê as contagens', async () => {
    api.doAnki = [doAnki]
    montar({ aba: 'baralhos' })
    await pronta()
    await waitFor(() => expect(painel().textContent).toContain('English Phrasal Verbs'))
    fireEvent.click(
      within(painel().querySelector('.ct-bar-col') as HTMLElement).getByRole('button', { name: /English Phrasal/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ativar mais 20' }))
    await waitFor(() => expect(api.ativar).toHaveBeenCalledWith('a-pv', 20))
    await waitFor(() => expect(api.lerResumo).toHaveBeenCalledTimes(2))
  })

  it('sem cartões: os baralhos se montam sozinhos, e o botão leva a "Hoje"', async () => {
    const { trocar } = montar({ aba: 'baralhos', semConta: true })
    expect(screen.getByText('Os baralhos se montam sozinhos')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ver como começar/ }))
    expect(trocar).toHaveBeenLastCalledWith('hoje')
  })
})

describe('a aba Memória', () => {
  it('os números são os medidos: retenção de 30 dias, revisões, botões e fases', async () => {
    montar({
      aba: 'memoria',
      metrics: { streakDays: 4, maiorSequenciaPresenca: 11 } as never,
    })
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
  })

  it('sem revisão nenhuma: os números aparecem depois das primeiras', async () => {
    api.resumo = resumoBase({ revisoesDeSempre: 0 })
    montar({ aba: 'memoria' })
    await pronta()
    expect(screen.getByText('Os números aparecem depois das primeiras revisões')).toBeTruthy()
  })
})

describe('a aba Trazer e levar', () => {
  it('a área de soltar o .apkg e os quatro formatos de levar; levar pede o baralho na hora', async () => {
    montar({ aba: 'trazer' })
    await pronta()
    expect(screen.getByTestId('anki-escolher').querySelector('.ct-soltar b')?.textContent).toBe(
      'Solte o arquivo .apkg aqui',
    )
    const formatos = [...screen.getByTestId('levar').querySelectorAll('.q-tile b')].map((b) => b.textContent)
    expect(formatos).toEqual(['Anki (.apkg)', 'Planilha (CSV)', 'Texto para o Quizlet', 'Relatório'])
    expect(api.baralho).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Planilha \(CSV\)/ }))
    await waitFor(() => expect(api.baralho).toHaveBeenCalledTimes(1))
    /* Colar uma lista e a demonstração da legenda são fatias seguintes. */
    expect(painel().querySelector('.ct-lista')).toBeNull()
    expect(painel().querySelector('.ct-legenda-demo')).toBeNull()
  })
})
