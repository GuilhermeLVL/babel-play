// @vitest-environment jsdom
/**
 * PLANOS E A OFERTA NO DESENHO NOVO — a marcação é a do protótipo (`telas2.js:39-117`,
 * `telas.js:495-519`) e os números são os do app (a matriz e o servidor).
 *
 * A igualdade de medidas e de movimento com o protótipo é provada pelo comparador
 * (`scripts/polimento/roteiros/planos*.json` e `oferta*.json`); aqui fica o que o comparador não vê:
 * de onde vêm os números, o que cada botão faz e os estados que o protótipo não tem.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Trophy } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()
  return { ...real, useQuestNovo: () => true }
})

type Resposta = { ok: boolean; status: number; json: () => Promise<unknown> }
const servidor = vi.hoisted(() => ({
  rotas: {} as Record<string, unknown>,
  chamadas: [] as { url: string; init?: RequestInit }[],
}))
vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  apiFetch: async (url: string, init?: RequestInit): Promise<Resposta> => {
    servidor.chamadas.push({ url, init })
    const chave = Object.keys(servidor.rotas).find((k) => url.includes(k))
    return chave
      ? { ok: true, status: 200, json: async () => servidor.rotas[chave] }
      : { ok: false, status: 404, json: async () => ({}) }
  },
}))

const ents = vi.hoisted(() => ({ plan: 'free' as string }))
vi.mock('../src/lib/entitlements', async (original) => {
  const real = await original<typeof import('../src/lib/entitlements')>()
  const ler = () => ({ ...real.getEntitlements(), plan: ents.plan, armazenamento: null, teste: null })
  return { ...real, getEntitlements: ler, carregarEntitlements: async () => ler() }
})

const nav = vi.hoisted(() => ({ navegarPara: vi.fn() }))
vi.mock('../src/lib/rotas', async (original) => ({
  ...(await original<typeof import('../src/lib/rotas')>()),
  navegarPara: nav.navegarPara,
}))
/* O protótipo vende só o mensal: é com o anual fora de venda que a tela é a dele, sem tirar nem pôr. */
const venda = vi.hoisted(() => ({ anual: false }))
vi.mock('../src/data/rotas/idade', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/idade')>()),
  lerAbertura: async () => ({ cadastro: true, checkout: true, anual: venda.anual }),
}))

import CartaoDeOfertaDoQuest from '../src/components/ofertas/quest/CartaoDeOfertaDoQuest'
import Planos from '../src/components/views/Planos'
import { horasDoAlivio } from '../src/components/views/planos/dados'
import { armazenamentoEmTexto, horasDeTranscricao, horasDoUsoJusto, PLAN_MATRIX } from '../src/core/planos'
import { brl } from '../src/lib/assinatura'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'
import { alternarPergunta, planoDeProva } from '../src/lib/polimento/planos'

const aguardar = () => act(async () => {})
const aba = (nome: string) => screen.getByRole('tab', { name: nome })
const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
const texto = (seletor: string) => document.querySelector(seletor)?.textContent?.replace(/\s+/g, ' ').trim()
const abrir = async () => {
  const tela = render(<Planos />)
  await aguardar()
  return tela
}

const FIM_DO_TESTE = Date.now() + 14 * 86_400_000 - 60_000
const podeTestar = { configurado: true, assinatura: null, teste: { estado: 'disponivel', dias: 14 } }
const usoDoGratis = {
  plano: 'free',
  janela: '2026-10',
  chamadas: { usado: 0, teto: 0 },
  segundosDeAudio: { usado: 2520, teto: 10800 },
  tokensDeLlm: { usado: 0, teto: 0 },
}

beforeEach(() => {
  ents.plan = 'free'
  venda.anual = false
  /* "Assinar" leva ao checkout pelo endereço: cada teste começa na tela de Planos. */
  window.history.replaceState({}, '', '/')
  servidor.rotas = { '/api/billing/status': podeTestar, '/api/me/uso': usoDoGratis }
  servidor.chamadas = []
  nav.navegarPara.mockReset()
  localStorage.clear()
  sessionStorage.clear()
  _reiniciarIdentidade()
  definirIdentidade('conta')
})
afterEach(cleanup)

describe('Planos no desenho novo: a aba Planos', () => {
  it('o cabeçalho do protótipo, as três abas e o miolo solto no palco', async () => {
    const { container } = await abrir()
    const palco = container.querySelector('.q-palco.px-planos-tela')!
    expect(palco).not.toBeNull()
    expect(texto('.q-cab .q-sobre')).toBe('Planos')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho',
    )
    expect(texto('.px-meu-plano')).toBe('Seu plano: Grátis')
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual(['Planos', 'Sua assinatura', 'Consumo do mês'])
    expect(aba('Planos').getAttribute('aria-selected')).toBe('true')
    /* Sem painel em volta: a grade, a garantia e as duas seções são filhas do palco, como no protótipo. */
    expect([...palco.children].map((f) => f.className)).toEqual([
      'q-cab',
      'q-abas px-abas-planos',
      'q-grade g2 px-planos-grade',
      'px-garantia',
      'q-secao',
      'q-secao',
    ])
  })

  it('os dois cartões: os textos do protótipo com o preço e as horas da matriz', async () => {
    await abrir()
    const gratis = document.querySelector<HTMLElement>('.px-plano:not(.px-premium)')!
    expect(gratis.querySelector('.q-rotulo')!.textContent).toBe('Seu plano')
    expect(gratis.querySelector('h3')!.textContent).toBe('Grátis')
    expect(gratis.querySelector('.px-preco')!.textContent).toBe('R$ 0para sempre')
    expect([...gratis.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Legenda bilíngue ao vivo, no aparelho, sem limite',
      'Tradução rápida ao vivo',
      'Jogos, vocabulário e revisão',
      `Nuvem: até ${horasDoAlivio()} h por mês, para aparelho fraco, quando disponível`,
    ])

    const premium = document.querySelector<HTMLElement>('.px-plano.px-premium')!
    expect(premium.querySelector('.q-rotulo')!.textContent).toBe('Recomendado Tradução Nuance')
    expect(premium.querySelector('.px-preco b')!.textContent).toBe(brl(PLAN_MATRIX.premium.precoMensalBrl!))
    expect(premium.querySelector('.px-preco span')!.textContent).toBe('por mês')
    expect(premium.querySelector('.px-tudo')!.textContent).toBe('Tudo do Grátis, e:')
    expect(premium.querySelectorAll('li')).toHaveLength(5)
    /* O "sem limite" nunca vai sem a nota do uso justo, com as horas da matriz (CDC). */
    expect(premium.querySelector('li small')!.textContent).toBe(
      `uso justo: até ${horasDoUsoJusto('premium')} h de nuvem por dia e ${horasDeTranscricao('premium')} h por mês; passando disso, a legenda segue no aparelho`,
    )
    expect([...premium.querySelectorAll(':scope > .q-ctl')].map((b) => b.textContent)).toEqual([
      'Testar 14 dias grátis',
      'Assinar Premium',
    ])
    expect(premium.querySelector('.q-ctl.pri')!.textContent).toBe('Testar 14 dias grátis')
    expect(premium.querySelector('.px-nota')!.textContent).toBe(
      'Sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado.',
    )
  })

  it('"Continuar grátis" leva ao Início', async () => {
    await abrir()
    fireEvent.click(botao('Continuar grátis'))
    expect(nav.navegarPara).toHaveBeenCalledWith({ view: 'hub' })
  })

  it('a comparação tem as oito linhas do protótipo, com o que é número vindo da matriz', async () => {
    await abrir()
    const linhas = [...document.querySelectorAll('.px-compara tbody tr')].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    )
    expect(linhas).toEqual([
      ['Legenda bilíngue ao vivo, no aparelho', 'sem limite', 'sem limite'],
      ['Tradução rápida ao vivo', 'Incluído', 'Incluído'],
      ['Tradução Nuance', '—Não incluído', 'Incluído'],
      ['Transcrição e tradução na nuvem', `até ${horasDoAlivio()} h por mês`, 'sem limite no dia a dia*'],
      ['Tutor de IA (iChat)', '—Não incluído', 'Incluído'],
      ['Intérprete', 'cada um toca o seu lado', 'automático'],
      ['Jogos, vocabulário e revisão', 'Incluído', 'Incluído'],
      ['Armazenamento', armazenamentoEmTexto('free'), armazenamentoEmTexto('premium')],
    ])
    expect(texto('.q-secao > .px-nota')).toBe(
      `* uso justo: até ${horasDoUsoJusto('premium')} h de nuvem por dia e ${horasDeTranscricao('premium')} h por mês; passando disso, a legenda segue no aparelho.`,
    )
  })

  it('as quatro perguntas do protótipo, todas fechadas', async () => {
    await abrir()
    const perguntas = [...document.querySelectorAll<HTMLDetailsElement>('.px-faq details.q-cartao')]
    expect(perguntas.map((d) => d.querySelector('summary')!.textContent)).toEqual([
      'O teste cobra sozinho no fim?',
      'Posso cancelar?',
      'O Grátis tem limite?',
      'O que é "uso justo"?',
    ])
    expect(perguntas.some((d) => d.open)).toBe(false)
  })

  it('sem a camada ligada, a pergunta abre do jeito do navegador (nada é impedido)', () => {
    const impedir = vi.fn()
    const faq = document.createElement('div')
    faq.className = 'px-faq'
    const pergunta = faq.appendChild(document.createElement('details'))
    const resumo = pergunta.appendChild(document.createElement('summary'))
    alternarPergunta({ target: resumo, preventDefault: impedir })
    expect(impedir).not.toHaveBeenCalled()
    expect(pergunta.open).toBe(false)
  })
})

describe('Planos no desenho novo: com o anual à venda', () => {
  it('o seletor de período acima dos cartões, o preço do ano e o checkout no período escolhido', async () => {
    venda.anual = true
    const { container } = await abrir()
    const palco = container.querySelector('.q-palco.px-planos-tela')!
    const grupo = screen.getByRole('radiogroup', { name: 'Período de cobrança' })
    expect(grupo.className).toBe('q-abas q-seg px-periodo')
    expect(grupo.nextElementSibling!.className).toBe('q-grade g2 px-planos-grade')
    expect(grupo.parentElement).toBe(palco)
    expect(grupo.textContent).toContain('equivale a 3 meses grátis')
    expect(screen.getByRole('radio', { name: 'Mensal' }).getAttribute('aria-checked')).toBe('true')
    expect(document.querySelector('.px-premium .px-preco b')!.textContent).toBe(
      brl(PLAN_MATRIX.premium.precoMensalBrl!),
    )
    expect(container.querySelectorAll('.px-faq details')).toHaveLength(6)

    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }))
    expect(document.querySelector('.px-premium .px-preco b')!.textContent).toBe(brl(PLAN_MATRIX.premium.precoAnualBrl!))
    expect(document.querySelector('.px-premium .px-preco span')!.textContent).toBe('por ano')
    fireEvent.click(botao('Assinar Premium'))
    expect(sessionStorage.getItem('babel.checkout.forma')).toBe('anual')
  })
})

describe('Planos no desenho novo: o teste de 14 dias', () => {
  it('ativar usa a rota de sempre, vai para "Sua assinatura" e a tela passa a dizer "em teste"', async () => {
    servidor.rotas['/api/billing/teste'] = { teste: { terminaEm: FIM_DO_TESTE } }
    await abrir()
    await act(async () => {
      fireEvent.click(botao('Testar 14 dias grátis'))
    })
    await aguardar()
    const pedido = servidor.chamadas.find((c) => c.url === '/api/billing/teste')
    expect(pedido?.init?.method).toBe('POST')
    expect(aba('Sua assinatura').getAttribute('aria-selected')).toBe('true')
    expect(texto('.px-meu-plano')).toBe('Premium · em teste')
    expect(texto('.px-assinatura h2')).toBe('Premium, em teste')
    expect(texto('.px-assinatura .q-d')).toBe(
      'O teste termina em 14 dias. Depois dele a conta volta ao Grátis sozinha e nada é cobrado. A legenda no aparelho continua sem limite.',
    )
    /* O teste não se cancela nem se repete: sobra assinar. "Voltar ao Grátis agora" não existe no servidor. */
    expect([...document.querySelectorAll('.px-assinatura .q-acoes .q-ctl')].map((b) => b.textContent)).toEqual([
      'Assinar Premium',
    ])

    fireEvent.click(aba('Planos'))
    const premium = document.querySelector<HTMLElement>('.px-plano.px-premium')!
    expect(premium.querySelector('.q-tag')!.textContent).toBe('Em teste')
    expect(premium.querySelector('.px-nota')!.textContent).toBe(
      'Seu teste termina em 14 dias. Depois dele a conta volta ao Grátis sozinha e nada é cobrado.',
    )
    /* Em teste o cartão do Grátis não diz "Seu plano" nem oferece "Continuar grátis". */
    const gratis = document.querySelector<HTMLElement>('.px-plano:not(.px-premium)')!
    expect(gratis.querySelector('.q-rotulo')!.textContent).toBe(' ')
    expect(gratis.querySelector('.q-ctl')).toBeNull()
  })

  it('o servidor recusou: o erro aparece no cartão e a tela não muda de aba', async () => {
    await abrir()
    await act(async () => {
      fireEvent.click(botao('Testar 14 dias grátis'))
    })
    await aguardar()
    expect(aba('Planos').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('alert').textContent).toMatch(/falha/)
  })

  it('quem já usou o teste não o vê prometido em lugar nenhum', async () => {
    servidor.rotas['/api/billing/status'] = {
      configurado: true,
      assinatura: null,
      teste: { estado: 'usado', dias: 14, iniciadoEm: 1, terminaEm: 2 },
    }
    await abrir()
    expect(screen.queryByRole('button', { name: /Testar/ })).toBeNull()
    expect(document.querySelector('.px-premium > .q-ctl.pri')!.textContent).toBe('Assinar Premium')
    fireEvent.click(aba('Sua assinatura'))
    expect(texto('.px-assinatura h2')).toBe('Você está no Grátis')
    expect(texto('.px-assinatura .q-d')).toBe(
      'Ele continua inteiro: legenda no aparelho sem limite, jogos, vocabulário e revisão.',
    )
  })
})

describe('Planos no desenho novo: Sua assinatura e Consumo do mês', () => {
  it('no Grátis: o convite ao teste e "Comparar os planos", que devolve à primeira aba', async () => {
    await abrir()
    fireEvent.click(aba('Sua assinatura'))
    expect(texto('.px-assinatura .q-rotulo')).toBe('Sua assinatura')
    expect(texto('.px-assinatura h2')).toBe('Você está no Grátis')
    expect(texto('.px-assinatura .q-d')).toBe(
      'Ele continua inteiro: legenda no aparelho sem limite, jogos, vocabulário e revisão. Quando quiser ir além, o Premium tem teste de 14 dias, sem cartão.',
    )
    expect([...document.querySelectorAll('.px-assinatura .q-acoes .q-ctl')].map((b) => b.textContent)).toEqual([
      'Testar 14 dias grátis',
      'Comparar os planos',
    ])
    fireEvent.click(botao('Comparar os planos'))
    expect(aba('Planos').getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('.px-planos-grade')).not.toBeNull()
  })

  it('quem assina continua com a assinatura de sempre nessa aba', async () => {
    ents.plan = 'premium'
    servidor.rotas['/api/billing/status'] = {
      configurado: true,
      assinatura: { plano: 'premium', status: 'active', valeAte: FIM_DO_TESTE, provedor: 'asaas', ciclo: 'mensal' },
    }
    servidor.rotas['/api/billing/faturas'] = { faturas: [] }
    await abrir()
    expect(texto('.px-meu-plano')).toBe('Seu plano: Premium')
    expect(document.querySelector('.px-premium .q-tag')!.textContent).toBe('Seu plano')
    fireEvent.click(aba('Sua assinatura'))
    /* A aba de quem assina tem endereço (`/plano/assinatura`) e não é o cartão de quem está no Grátis. */
    expect(document.querySelector('.px-assinatura')).toBeNull()
  })

  it('o consumo do servidor nos cartões do protótipo; o que o plano não inclui vira travessão', async () => {
    await abrir()
    await act(async () => {
      fireEvent.click(aba('Consumo do mês'))
    })
    await aguardar()
    const cartoes = [...document.querySelectorAll<HTMLElement>('.q-cartao.q-num.px-consumo')]
    expect(cartoes.map((c) => c.querySelector('.q-rotulo')!.textContent)).toEqual([
      'Áudio transcrito na nuvem',
      'Chamadas à IA de nuvem',
      'Tokens de IA (tradução e tutor)',
    ])
    expect(cartoes[0].querySelector('b')!.textContent).toBe('42 min')
    expect(cartoes[0].lastElementChild!.textContent).toBe('de 3 h do limite do plano')
    expect(cartoes[0].querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('23')
    expect(cartoes[1].querySelector('b')!.textContent).toBe('—')
    expect(cartoes[1].lastElementChild!.textContent).toBe('não incluído no seu plano')
    expect(cartoes[1].querySelector('[role="progressbar"]')).toBeNull()
    expect(texto('.q-aviso > span')).toBe(
      'Chamadas e tokens de IA de nuvem fazem parte do Premium. A legenda no aparelho continua sem limite.',
    )
    fireEvent.click(botao('Ver planos'))
    expect(aba('Planos').getAttribute('aria-selected')).toBe('true')
  })
})

describe('A oferta no desenho novo', () => {
  const montar = () => {
    const saidas = { agir: vi.fn(), dispensar: vi.fn(), naoMostrar: vi.fn() }
    render(
      <CartaoDeOfertaDoQuest
        aoMontar={() => {}}
        tom="acento"
        icone={Trophy}
        titulo="Mais uma conquista"
        texto="Quer ir além da tradução rápida?"
        cta="Conhecer o Premium"
        selo="Sugerido: 14 dias de Premium grátis, sem cartão"
        aoAgir={saidas.agir}
        aoDispensar={saidas.dispensar}
        aoNaoMostrar={saidas.naoMostrar}
      />,
    )
    return saidas
  }

  it('a marcação do protótipo: o selo acima do título, o fechar e as três saídas', () => {
    montar()
    const oferta = screen.getByTestId('cartao-de-oferta')
    expect(oferta.tagName).toBe('ASIDE')
    expect(oferta.className).toBe('qc-oferta')
    expect(oferta.getAttribute('aria-label')).toBe('Sugestão de plano')
    expect([...oferta.children].map((f) => f.className)).toEqual([
      'q-ic',
      'qc-oferta-texto',
      'q-ctl qc-fechar',
      'q-acoes',
    ])
    expect([...oferta.querySelector('.qc-oferta-texto')!.children].map((f) => f.tagName)).toEqual(['SPAN', 'B', 'P'])
    expect([...oferta.querySelectorAll('.q-acoes > .q-ctl')].map((b) => b.textContent)).toEqual([
      'Conhecer o Premium',
      'Agora não',
      'Não mostrar novamente',
    ])
  })

  it('cada saída chama a sua, uma vez só', () => {
    const a = montar()
    fireEvent.click(botao('Conhecer o Premium'))
    fireEvent.click(botao('Conhecer o Premium'))
    fireEvent.click(botao('Agora não'))
    expect(a.agir).toHaveBeenCalledTimes(1)
    expect(a.dispensar).not.toHaveBeenCalled()
    cleanup()

    const b = montar()
    fireEvent.click(botao('Fechar'))
    expect(b.dispensar).toHaveBeenCalledTimes(1)
    cleanup()

    const c = montar()
    fireEvent.click(botao('Não mostrar novamente'))
    expect(c.naoMostrar).toHaveBeenCalledTimes(1)
    expect(c.dispensar).not.toHaveBeenCalled()
  })
})

describe('A chave da bancada', () => {
  it('só responde com a chave gravada, e só ao valor esperado', () => {
    expect(planoDeProva()).toBeNull()
    localStorage.setItem('babel.px.planoDeProva', 'premium')
    expect(planoDeProva()).toBeNull()
    localStorage.setItem('babel.px.planoDeProva', 'free')
    expect(planoDeProva()).toBe('free')
  })
})
