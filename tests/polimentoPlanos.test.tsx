// @vitest-environment jsdom
/**
 * PLANOS E A OFERTA NO DESENHO NOVO — a marcação é a do protótipo (a tela Planos dos quatro planos,
 * `anuncios-no-gratis-src/planos4.js:571-721`; a oferta, `telas.js:495-519`) e os números são os do app
 * (a matriz e o servidor). Só aparece o plano que está à venda para a pessoa.
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
/* O aparelho é o do perfil medido: cada teste diz qual (o padrão é o computador sem placa de vídeo). */
const aparelho = vi.hoisted(() => ({ tipo: 'desktop-sem-gpu' }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }) }
})
/* `ANUAL_ENABLED` do servidor: cada teste diz se o anual está à venda. */
const venda = vi.hoisted(() => ({ anual: false }))
vi.mock('../src/data/rotas/idade', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/idade')>()),
  lerAbertura: async () => ({ cadastro: true, checkout: true, anual: venda.anual }),
}))

import CartaoDeOfertaDoQuest from '../src/components/ofertas/quest/CartaoDeOfertaDoQuest'
import Planos from '../src/components/views/Planos'
import { horasDoAlivio } from '../src/components/views/planos/dados'
import { DIAS_DO_TESTE_PREMIUM, horasDeTranscricao, horasDoUsoJusto, PLAN_MATRIX } from '../src/core/planos'
import { brl, trocarDePlano } from '../src/lib/assinatura'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'
import { alternarPergunta, planoDeProva, provaDosPlanos } from '../src/lib/polimento/planos'

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
  aparelho.tipo = 'desktop-sem-gpu'
  definirEstadoDasFlags(null)
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

const cartoes = () => [...document.querySelectorAll<HTMLElement>('.pl-planos-grade > .pl-plano')]
const cartaoDe = (id: string) => document.querySelector<HTMLElement>(`.pl-plano[data-pl-plano="${id}"]`)!
const itensDe = (id: string) => [...cartaoDe(id).querySelectorAll('li')].map((li) => li.textContent)
const colunas = () =>
  [...document.querySelectorAll<HTMLElement>('.pl-compara thead th[data-c]')].map((th) => th.dataset.c)
const linhas = () => [...document.querySelectorAll('.pl-compara tbody tr')].map((tr) => tr.children[0].textContent)
const celulasDe = (rotulo: string) => {
  const tr = [...document.querySelectorAll('.pl-compara tbody tr')].find((x) => x.children[0].textContent === rotulo)!
  return [...tr.children].slice(1).map((td) => td.textContent)
}
const mensal = (id: 'essencial' | 'premium' | 'aovivo') => brl(PLAN_MATRIX[id].precoMensalBrl!)
const TODOS_A_VENDA = { ...podeTestar, planosAVenda: ['essencial', 'premium', 'aovivo'] }

describe('Planos: só aparece o que está à venda', () => {
  it('de fábrica (as duas flags desligadas): o cabeçalho, as três abas, Grátis e Premium', async () => {
    const { container } = await abrir()
    const palco = container.querySelector('.q-palco.px-planos-tela.pl-planos-tela')!
    expect(palco).not.toBeNull()
    expect(texto('.q-cab .q-sobre')).toBe('Planos')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho',
    )
    expect(texto('.px-meu-plano')).toBe('Seu plano: Grátis')
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual(['Planos', 'Sua assinatura', 'Consumo do mês'])
    /* Sem painel em volta: as peças são filhas do palco, na ordem do protótipo (`planos4.js:666-673`). */
    expect([...palco.children].map((f) => f.className)).toEqual([
      'q-cab',
      'q-abas px-abas-planos',
      'q-cartao pl-aparelho',
      'pl-ciclo-linha',
      'q-grade g2 px-planos-grade pl-planos-grade',
      'px-garantia',
      'q-secao pl-comparar',
      'q-secao pl-faq',
    ])
    expect(cartoes().map((c) => c.dataset.plPlano)).toEqual(['gratis', 'premium'])
    expect(colunas()).toEqual(['gratis', 'premium'])
    expect(texto('.pl-dica-arraste')).toBe('Dois planos: arraste para o lado')
    /* Nada do que não se vende: nem o Essencial, nem o Ao Vivo, nem o nível que só ele tem. */
    expect(palco.textContent).not.toMatch(/Essencial|Ao Vivo|Texto durante a fala/)
  })

  it('o Premium sem o Essencial à vista diz "Tudo do Grátis" e herda a Nuance; horas e preço são da matriz', async () => {
    await abrir()
    const premium = cartaoDe('premium')
    expect(premium.querySelector('.px-preco b')!.textContent).toBe(mensal('premium'))
    expect(premium.querySelector('.px-preco span')!.textContent).toBe('por mês')
    expect(premium.querySelector('.px-tudo')!.textContent).toBe('Tudo do Grátis, e:')
    expect(itensDe('premium')).toEqual([
      'Tradução Nuance rápidaoutras formas de dizer, formal ou informal',
      `${horasDeTranscricao('premium')} h de nuvem por mêstranscrição e tradução no nível Precisão · até ${horasDoUsoJusto('premium')} h por dia`,
      'Intérprete automáticoreconhece sozinho quem fala qual idioma',
      'Voz neural básica no intérprete',
    ])
    const gratis = cartaoDe('gratis')
    expect(gratis.querySelector('.q-rotulo')!.textContent).toBe('Seu plano')
    expect(gratis.querySelector('.px-preco')!.textContent).toBe('R$ 0para sempre')
    expect(gratis.querySelector('.pl-preco-nota')!.textContent).toBe('sem cartão, sem conta')
    expect(itensDe('gratis')).toEqual([
      'Legenda bilíngue no aparelho, sem limite',
      'Tradução rápida ao vivo',
      'Jogos, vocabulário e revisão',
      `Nuvem: até ${horasDoAlivio()} h por mês, para aparelho fraco, quando disponível`,
    ])
    fireEvent.click(botao('Continuar grátis'))
    expect(nav.navegarPara).toHaveBeenCalledWith({ view: 'hub' })
  })

  it('com `venda_planos_v3` entra o Essencial; com `stt_ao_vivo` também, o Ao Vivo', async () => {
    servidor.rotas['/api/billing/status'] = { ...podeTestar, planosAVenda: ['essencial', 'premium'] }
    const tres = await abrir()
    expect(cartoes().map((c) => c.dataset.plPlano)).toEqual(['gratis', 'essencial', 'premium'])
    expect(colunas()).toEqual(['gratis', 'essencial', 'premium'])
    expect(texto('.pl-dica-arraste')).toBe('Três planos: arraste para o lado')
    expect(linhas()).not.toContain('Texto durante a fala (Ao vivo)')
    tres.unmount()

    servidor.rotas['/api/billing/status'] = TODOS_A_VENDA
    await abrir()
    expect(cartoes().map((c) => c.dataset.plPlano)).toEqual(['gratis', 'essencial', 'premium', 'aovivo'])
    expect(document.querySelector('.pl-planos-grade')!.className).toBe('q-grade g4 px-planos-grade pl-planos-grade')
    expect(texto('.pl-dica-arraste')).toBe('Quatro planos: arraste para o lado')
    expect(cartaoDe('premium').querySelector('.px-tudo')!.textContent).toBe('Tudo do Essencial, e:')
    expect(cartaoDe('aovivo').querySelector('.px-tudo')!.textContent).toBe('Tudo do Premium, e:')
  })

  it('servidor anterior (sem `planosAVenda`): quem decide são as duas flags do cache', async () => {
    definirEstadoDasFlags({ venda_planos_v3: { ligada: true } })
    const comUma = await abrir()
    expect(cartoes().map((c) => c.dataset.plPlano)).toEqual(['gratis', 'essencial', 'premium'])
    comUma.unmount()
    definirEstadoDasFlags({ venda_planos_v3: { ligada: true }, stt_ao_vivo: { ligada: true } })
    await abrir()
    expect(cartoes().map((c) => c.dataset.plPlano)).toEqual(['gratis', 'essencial', 'premium', 'aovivo'])
  })

  it('quem já TEM um plano fora de venda (concedido pelo admin) vê o próprio plano como atual', async () => {
    ents.plan = 'essencial'
    servidor.rotas['/api/billing/status'] = { configurado: true, assinatura: null, planosAVenda: ['premium'] }
    await abrir()
    expect(cartoes().map((c) => c.dataset.plPlano)).toEqual(['gratis', 'essencial', 'premium'])
    const meu = cartaoDe('essencial')
    expect(meu.className).toContain('pl-meu')
    expect(meu.querySelector('.q-rotulo')!.textContent).toBe('Seu plano')
    const b = meu.querySelector<HTMLButtonElement>('.pl-plano-pe .q-ctl')!
    expect(b.textContent).toBe('Este é o seu plano')
    expect(b.disabled).toBe(true)
    expect(texto('.px-meu-plano')).toBe('Essencial')
    expect(document.querySelector<HTMLElement>('.pl-compara')!.dataset.meu).toBe('essencial')
    expect(document.querySelector('.pl-compara th[data-c="essencial"] small')!.textContent).toBe('seu plano')
  })
})

describe('Planos: os números vêm da matriz', () => {
  it('preço, horas e capacidades de cada cartão e de cada coluna', async () => {
    venda.anual = true
    /* No computador com placa o recomendado é o Essencial: o Premium mostra o rótulo dele. */
    aparelho.tipo = 'desktop-com-gpu'
    servidor.rotas['/api/billing/status'] = TODOS_A_VENDA
    await abrir()
    for (const id of ['essencial', 'premium', 'aovivo'] as const)
      expect(cartaoDe(id).querySelector('.px-preco b')!.textContent, id).toBe(mensal(id))
    expect(cartaoDe('essencial').querySelector('.pl-preco-nota')!.textContent).toBe(
      `ou ${brl(PLAN_MATRIX.essencial.precoAnualBrl!)} por ano`,
    )
    expect(cartaoDe('aovivo').querySelector('.pl-preco-nota')!.textContent).toBe('só mensal, por enquanto')
    expect(itensDe('essencial')).toEqual([
      'Tradução Nuance rápidaoutras formas de dizer, formal ou informal',
      `${horasDeTranscricao('essencial')} h de nuvem por mêsno nível Precisão, para o áudio difícil`,
    ])
    const horasAoVivo = PLAN_MATRIX.aovivo.quotas.sttAoVivoSegundosMes! / 3600
    expect(itensDe('aovivo')).toEqual([
      `${horasAoVivo} h por mês no nível Ao vivoo texto aparece enquanto a pessoa ainda fala`,
      'Voz neural boa no intérprete',
    ])
    expect(cartaoDe('premium').querySelector('.q-rotulo')!.textContent).toBe(
      `Nuvem · ${horasDeTranscricao('premium')} h`,
    )

    expect(linhas()).toEqual([
      'Legenda bilíngue no aparelho',
      'Horas de nuvem por mês (Precisão)',
      'Texto durante a fala (Ao vivo)',
      'Tradução Nuance',
      'Intérprete',
      'Voz do intérprete',
      'Jogos, vocabulário e revisão',
      'Por mês',
      'Por ano',
    ])
    expect(celulasDe('Horas de nuvem por mês (Precisão)')).toEqual([
      `até ${horasDoAlivio()} h, em aparelho fraco`,
      `${horasDeTranscricao('essencial')} h`,
      `${horasDeTranscricao('premium')} h`,
      `${horasDeTranscricao('aovivo')} h`,
    ])
    expect(celulasDe('Texto durante a fala (Ao vivo)')).toEqual([
      '—Não incluído',
      '—Não incluído',
      '—Não incluído',
      `${horasAoVivo} h`,
    ])
    expect(celulasDe('Tradução Nuance')).toEqual(['—Não incluído', 'rápida', 'rápida', 'rápida'])
    expect(celulasDe('Intérprete')).toEqual([
      'cada um toca o seu lado',
      'cada um toca o seu lado',
      'automático',
      'automático',
    ])
    expect(celulasDe('Voz do intérprete')).toEqual(['do aparelho', 'do aparelho', 'neural básica', 'neural boa'])
    expect(celulasDe('Por mês')).toEqual(['R$ 0', mensal('essencial'), mensal('premium'), mensal('aovivo')])
    expect(celulasDe('Por ano')).toEqual([
      '—Não incluído',
      brl(PLAN_MATRIX.essencial.precoAnualBrl!),
      brl(PLAN_MATRIX.premium.precoAnualBrl!),
      'só mensal',
    ])
    /* O teto do dia não se esconde (CDC): vem ao lado das horas e no pé da tabela, com o número da matriz. */
    expect(texto('.pl-comparar > .px-nota')).toContain(
      `No Premium e Ao Vivo, a nuvem por trechos vai até ${horasDoUsoJusto('premium')} h por dia.`,
    )
  })

  it('decisões de 09/10: sem "Sincronização" e, sem a flag `anuncios`, nenhuma linha de anúncio', async () => {
    servidor.rotas['/api/billing/status'] = TODOS_A_VENDA
    const { container } = await abrir()
    expect(container.textContent).not.toMatch(/Sincroniza/)
    expect(container.textContent).not.toMatch(/an[úu]ncio/i)
    expect(cartaoDe('essencial').querySelector('.q-rotulo')!.textContent).not.toMatch(/Sem anúncios/)
    expect(container.querySelectorAll('.px-faq details')).toHaveLength(5)
  })

  it('com a flag `anuncios` ligada entram as linhas de anúncio do protótipo', async () => {
    definirEstadoDasFlags({ anuncios: { ligada: true } })
    servidor.rotas['/api/billing/status'] = TODOS_A_VENDA
    const { container } = await abrir()
    expect(itensDe('gratis')[3]).toMatch(/^Com anúncios leves/)
    expect(itensDe('essencial')[0]).toMatch(/^Sem anúncios/)
    expect(linhas()[0]).toBe('Anúncios')
    expect(celulasDe('Anúncios')).toEqual(['leves e rotulados', 'sem anúncios', 'sem anúncios', 'sem anúncios'])
    expect(celulasDe('Horas de nuvem por mês (Precisão)')[0]).toBe('amostra por anúncio')
    expect(container.querySelectorAll('.px-faq details')).toHaveLength(6)
    expect(container.textContent).not.toMatch(/Sincroniza/)
  })

  it('o ciclo anual: a etiqueta, o preço do ano, o "dá por mês" e o checkout no anual', async () => {
    venda.anual = true
    servidor.rotas['/api/billing/status'] = TODOS_A_VENDA
    await abrir()
    const { precoMensalBrl: m, precoAnualBrl: a } = PLAN_MATRIX.premium
    const pct = Math.round((1 - a! / (m! * 12)) * 100)
    const grupo = screen.getByRole('radiogroup', { name: 'Cobrança' })
    expect(grupo.className).toBe('q-abas q-seg pl-ciclo')
    expect(grupo.querySelector('.ad-mini-tag')!.textContent).toBe(`até ${pct}% a menos`)
    expect(screen.getByRole('radio', { name: 'Mensal' }).getAttribute('aria-checked')).toBe('true')

    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }))
    const premium = cartaoDe('premium')
    expect(premium.querySelector('.px-preco b')!.textContent).toBe(brl(a!))
    expect(premium.querySelector('.px-preco span')!.textContent).toBe('por ano')
    expect(premium.querySelector('.pl-preco-nota')!.textContent).toBe(
      `dá ${brl(Math.round((a! / 12) * 100) / 100)} por mês · ${pct}% a menos`,
    )
    /* O Ao Vivo não tem anual: continua no preço do mês. */
    expect(cartaoDe('aovivo').querySelector('.px-preco b')!.textContent).toBe(mensal('aovivo'))
    expect(cartaoDe('aovivo').querySelector('.px-preco span')!.textContent).toBe('por mês')
    fireEvent.click(botao('Assinar Essencial'))
    expect(sessionStorage.getItem('babel.checkout.forma')).toBe('anual')
    expect(sessionStorage.getItem('babel.checkout.plano')).toBe('essencial')
  })

  it('sem o anual à venda não há seletor, "ou … por ano" nem a linha "Por ano"', async () => {
    servidor.rotas['/api/billing/status'] = TODOS_A_VENDA
    await abrir()
    expect(screen.queryByRole('radiogroup', { name: 'Cobrança' })).toBeNull()
    expect(cartaoDe('premium').querySelector('.pl-preco-nota')).toBeNull()
    expect(linhas()).not.toContain('Por ano')
  })
})

describe('Planos: o aparelho', () => {
  it('"Recomendado aqui" muda com o aparelho', async () => {
    servidor.rotas['/api/billing/status'] = TODOS_A_VENDA
    const recomendado = () => {
      const r = document.querySelectorAll<HTMLElement>('.pl-plano.px-premium')
      expect(r).toHaveLength(1)
      expect(r[0].querySelector('.q-rotulo .q-tag')!.textContent).toBe('Recomendado aqui')
      return r[0].dataset.plPlano
    }
    const esperado = {
      'desktop-com-gpu': ['pc', 'essencial', 'Você está num computador com placa de vídeo'],
      'desktop-sem-gpu': ['fraco', 'premium', 'Você está num computador fraco'],
      'celular-bom': ['celular', 'premium', 'Você está num celular'],
      'celular-fraco': ['celular', 'premium', 'Você está num celular'],
      quest: ['quest', 'premium', 'Você está num Meta Quest'],
    }
    for (const [tipo, [caixa, plano, titulo]] of Object.entries(esperado)) {
      aparelho.tipo = tipo
      const tela = await abrir()
      expect(recomendado(), tipo).toBe(plano)
      expect(document.querySelector<HTMLElement>('.pl-aparelho')!.dataset.plAparelho, tipo).toBe(caixa)
      expect(texto('.pl-aparelho .q-rotulo'), tipo).toBe(titulo)
      /* No celular, a tabela compara o seu plano com o recomendado até a pessoa escolher outro. */
      expect(document.querySelector<HTMLElement>('.pl-compara')!.dataset.ver, tipo).toBe(plano)
      tela.unmount()
    }
  })

  it('no computador com placa, sem o Essencial à venda, o recomendado é o Premium e a frase não cita o Essencial', async () => {
    aparelho.tipo = 'desktop-com-gpu'
    await abrir()
    expect(document.querySelector<HTMLElement>('.pl-plano.px-premium')!.dataset.plPlano).toBe('premium')
    expect(texto('.pl-aparelho-frase')).toBe(
      'Este computador tem placa de vídeo: a legenda roda aqui mesmo, sem limite e sem custo. Para estudar inglês, o Grátis já resolve. O Premium abre a Nuance e a nuvem para o áudio difícil.',
    )
  })

  it('no Quest a frase não diz que não há legenda no Grátis: o inglês roda no aparelho', async () => {
    aparelho.tipo = 'quest'
    await abrir()
    const cartao = document.querySelector<HTMLElement>('.pl-aparelho')!
    expect(cartao.textContent).not.toMatch(/não há legenda|Não existe de graça/)
    expect(texto('.pl-aparelho-frase')).toMatch(/^No Quest a legenda em inglês roda no aparelho\./)
    const sinais = [...cartao.querySelectorAll('.pl-aparelho-det li')].map((li) => [
      li.querySelector('b')!.textContent,
      li.querySelector('.pl-sinal')!.className,
    ])
    expect(sinais).toEqual([
      ['Transcrição.', 'pl-sinal meio'],
      ['Tradução.', 'pl-sinal meio'],
      ['Voz.', 'pl-sinal nao'],
      ['Som do headset.', 'pl-sinal ok'],
    ])
  })

  it('a comparação um contra um: o próprio plano não se escolhe, e a escolha troca a coluna', async () => {
    servidor.rotas['/api/billing/status'] = TODOS_A_VENDA
    await abrir()
    const grupo = screen.getByRole('radiogroup', { name: 'Comparar o seu plano com' })
    const opcoes = [...grupo.querySelectorAll<HTMLButtonElement>('.q-aba')]
    expect(opcoes.map((b) => [b.textContent, b.disabled])).toEqual([
      ['Grátis', true],
      ['Essencial', false],
      ['Premium', false],
      ['Ao Vivo', false],
    ])
    fireEvent.click(opcoes[3])
    expect(document.querySelector<HTMLElement>('.pl-compara')!.dataset.ver).toBe('aovivo')
    expect(opcoes[3].getAttribute('aria-checked')).toBe('true')
  })
})

describe('Planos: as perguntas', () => {
  it('as do protótipo, todas fechadas, com os dias do teste da matriz', async () => {
    const { container } = await abrir()
    const perguntas = [...container.querySelectorAll<HTMLDetailsElement>('.px-faq details.q-cartao')]
    expect(perguntas.map((d) => d.querySelector('summary')!.textContent)).toEqual([
      'O que quer dizer "no aparelho"?',
      'O que acontece quando as horas de nuvem acabam?',
      'Posso cancelar?',
      'O teste cobra sozinho no fim?',
      'Meu áudio fica guardado na nuvem?',
    ])
    expect(perguntas.some((d) => d.open)).toBe(false)
    expect(perguntas[3].querySelector('p')!.textContent).toBe(
      `Não. São ${DIAS_DO_TESTE_PREMIUM} dias de Premium, sem cartão. No fim, a conta volta ao Grátis sozinha e nada é cobrado.`,
    )
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

describe('Planos: o teste de 14 dias', () => {
  it('é do Premium: o botão está no cartão dele, com "Assinar" ao lado', async () => {
    servidor.rotas['/api/billing/status'] = TODOS_A_VENDA
    await abrir()
    expect([...cartaoDe('premium').querySelectorAll('.pl-plano-pe > *')].map((x) => x.textContent)).toEqual([
      'Testar 14 dias grátis',
      'Assinar Premium',
      'Sem cartão. No fim, volta ao Grátis sozinha.',
    ])
    expect(cartaoDe('essencial').querySelector('.pl-plano-pe')!.textContent).toBe('Assinar Essencial')
    expect(cartaoDe('aovivo').querySelector('.pl-plano-pe')!.textContent).toBe('Assinar Ao Vivo')
  })

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
    const premium = cartaoDe('premium')
    expect(premium.querySelector('.q-rotulo')!.textContent).toBe('Seu plano · em teste · indicado aqui')
    expect(premium.querySelector('.px-nota')!.textContent).toBe(
      'Seu teste termina em 14 dias. Depois dele a conta volta ao Grátis sozinha.',
    )
    /* Em teste o cartão do Grátis não é "Seu plano", e o teste não se encerra por ali. */
    const gratis = cartaoDe('gratis')
    expect(gratis.querySelector('.q-rotulo')!.textContent).toBe('Tudo no aparelho')
    const voltar = gratis.querySelector<HTMLButtonElement>('.q-ctl')!
    expect(voltar.textContent).toBe('Volta sozinho no fim do teste')
    expect(voltar.disabled).toBe(true)
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
    expect(cartaoDe('premium').querySelector('.pl-plano-pe .q-ctl.pri')!.textContent).toBe('Assinar Premium')
    fireEvent.click(aba('Sua assinatura'))
    expect(texto('.px-assinatura h2')).toBe('Você está no Grátis')
    expect(texto('.px-assinatura .q-d')).toBe(
      'Ele continua inteiro: legenda no aparelho sem limite, jogos, vocabulário e revisão.',
    )
  })
})

describe('Planos: Sua assinatura e Consumo do mês', () => {
  const assinante = (plano: string, extra: Record<string, unknown> = {}) => {
    ents.plan = plano
    servidor.rotas['/api/billing/status'] = {
      configurado: true,
      assinatura: {
        plano,
        status: 'active',
        valeAte: FIM_DO_TESTE,
        provedor: 'asaas',
        ciclo: 'mensal',
        meio: 'assinatura',
      },
      proximaCobranca: '2026-11-09',
      planosAVenda: ['essencial', 'premium', 'aovivo'],
      ...extra,
    }
    servidor.rotas['/api/billing/faturas'] = { faturas: [] }
  }

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

  it('quem assina: o cartão do protótipo com o preço da matriz e o dia da cobrança do servidor', async () => {
    venda.anual = true
    assinante('premium')
    await abrir()
    expect(texto('.px-meu-plano')).toBe('Premium')
    expect(cartaoDe('premium').querySelector('.pl-plano-pe .q-ctl')!.textContent).toBe('Este é o seu plano')
    await act(async () => {
      fireEvent.click(aba('Sua assinatura'))
    })
    await aguardar()
    expect(texto('.px-assinatura h2')).toBe('Plano Premium')
    expect(texto('.px-assinatura .q-d')).toBe(
      `${mensal('premium')} por mês, renovado no dia 9. Para quem depende de nuvem: celular, notebook fraco, Quest. Cancele quando quiser: o plano vale até o fim do período pago.`,
    )
    expect([...document.querySelectorAll('.px-assinatura .q-acoes .q-ctl')].map((b) => b.textContent)).toEqual([
      'Mudar de plano',
      `Passar para o anual · ${brl(PLAN_MATRIX.premium.precoAnualBrl!)}`,
      'Cancelar a assinatura',
    ])
    /* O que é da cobrança e o protótipo não mostra continua abaixo: pagamento e faturas. */
    expect(screen.getByRole('heading', { name: 'Faturas' })).not.toBeNull()
    await act(async () => {
      fireEvent.click(botao('Mudar de plano'))
    })
    expect(aba('Planos').getAttribute('aria-selected')).toBe('true')
    /* Quem assina não abre outro checkout: o plano de baixo é "Mudar para o", o de cima "Assinar". */
    expect(cartaoDe('essencial').querySelector('.pl-plano-pe')!.textContent).toBe('Mudar para o Essencial')
    expect(cartaoDe('aovivo').querySelector('.pl-plano-pe')!.textContent).toBe('Assinar Ao Vivo')
  })

  it('a troca pedida aparece com a data, e dá para desistir dela', async () => {
    assinante('essencial', { trocaPendente: { plano: 'premium', aPartirDe: '2026-11-09' } })
    servidor.rotas['/api/billing/trocar/cancelar'] = { ok: true, planoAtual: 'essencial', trocaPendente: null }
    await abrir()
    await act(async () => {
      fireEvent.click(aba('Sua assinatura'))
    })
    await aguardar()
    expect(texto('.px-assinatura .q-d')).toMatch(/Troca pedida: o Premium passa a valer em /)
    await act(async () => {
      fireEvent.click(botao('Desistir da troca'))
    })
    await aguardar()
    expect(servidor.chamadas.find((c) => c.url === '/api/billing/trocar/cancelar')?.init?.method).toBe('POST')
  })

  it('o consumo por nível, do servidor; o nível Ao vivo só aparece com o Ao Vivo à vista', async () => {
    assinante('premium', { planosAVenda: ['premium'] })
    servidor.rotas['/api/me/uso'] = {
      ...usoDoGratis,
      plano: 'premium',
      segundosDeAudio: { usado: 23_760, teto: 72_000 },
      porNivel: {
        trechos: { usado: 23_760, teto: 72_000, restante: 48_240 },
        aovivo: { usado: 0, teto: 0, restante: 0 },
      },
    }
    await abrir()
    await act(async () => {
      fireEvent.click(aba('Consumo do mês'))
    })
    await aguardar()
    const medidores = [...document.querySelectorAll<HTMLElement>('.pl-consumo > .q-cartao.q-num.px-consumo')]
    expect(medidores.map((c) => c.querySelector('.q-rotulo')!.textContent)).toEqual([
      'Nuvem · Precisão',
      'Tradução Nuance',
    ])
    expect(medidores[0].querySelector('b')!.textContent).toBe('6 h 36')
    expect(medidores[0].lastElementChild!.textContent).toBe('de 20 h do plano · restam 13 h 24')
    expect(medidores[0].querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('33')
    expect(medidores[1].querySelector('b')!.textContent).toBe('Incluída')
    expect(texto('.pl-renova')).toBe(
      `As horas de nuvem voltam no dia 1º. O que roda no aparelho não entra nesta conta. Por dia, a nuvem por trechos vai até ${horasDoUsoJusto('premium')} h.`,
    )
  })

  it('os dois medidores do Ao Vivo, com o tom de "no fim" e de "acabou"', async () => {
    assinante('aovivo')
    servidor.rotas['/api/me/uso'] = {
      ...usoDoGratis,
      plano: 'aovivo',
      segundosDeAudio: { usado: 72_000, teto: 72_000 },
      porNivel: {
        trechos: { usado: 72_000, teto: 72_000, restante: 0 },
        aovivo: { usado: 33_600, teto: 36_000, restante: 2_400 },
      },
    }
    await abrir()
    await act(async () => {
      fireEvent.click(aba('Consumo do mês'))
    })
    await aguardar()
    const [precisao, aoVivo] = [...document.querySelectorAll<HTMLElement>('.pl-consumo > .px-consumo')]
    expect(precisao.dataset.tom).toBe('fim')
    expect(precisao.lastElementChild!.textContent).toBe('de 20 h · acabou: a legenda segue no aparelho')
    expect(aoVivo.querySelector('.q-rotulo')!.textContent).toBe('Nuvem · Ao vivo')
    expect(aoVivo.dataset.tom).toBe('pouco')
    expect(aoVivo.querySelector('b')!.textContent).toBe('9 h 20')
    expect(aoVivo.lastElementChild!.textContent).toBe('de 10 h do plano · restam 40 min')
  })

  it('no Grátis: a nuvem não faz parte do plano, e "Ver planos" devolve à primeira aba', async () => {
    servidor.rotas['/api/me/uso'] = { ...usoDoGratis, segundosDeAudio: { usado: 0, teto: 0 } }
    await abrir()
    await act(async () => {
      fireEvent.click(aba('Consumo do mês'))
    })
    await aguardar()
    const medidores = [...document.querySelectorAll<HTMLElement>('.pl-consumo > .px-consumo')]
    expect(medidores[0].querySelector('b')!.textContent).toBe('—')
    expect(medidores[0].lastElementChild!.textContent).toBe('não faz parte do Grátis')
    expect(medidores[0].querySelector('[role="progressbar"]')).toBeNull()
    expect(medidores[1].lastElementChild!.textContent).toBe('faz parte do Premium')
    expect(texto('.pl-aviso-linha > span')).toBe(
      'As horas de nuvem fazem parte dos planos pagos. A legenda no aparelho continua sem limite.',
    )
    fireEvent.click(botao('Ver planos'))
    expect(aba('Planos').getAttribute('aria-selected')).toBe('true')
  })
})

describe('A troca de plano no cliente (`POST /api/billing/trocar`)', () => {
  it('manda o plano e devolve a troca pedida', async () => {
    servidor.rotas['/api/billing/trocar'] = {
      ok: true,
      planoAtual: 'essencial',
      trocaPendente: { plano: 'premium', aPartirDe: '2026-11-12' },
    }
    const r = await trocarDePlano('premium')
    expect(r).toEqual({ ok: true, trocaPendente: { plano: 'premium', aPartirDe: '2026-11-12' } })
    const pedido = servidor.chamadas.find((c) => c.url === '/api/billing/trocar')!
    expect(pedido.init?.method).toBe('POST')
    expect(JSON.parse(String(pedido.init?.body))).toEqual({ plano: 'premium' })
  })

  it('rota ausente (404 sem código) é "ainda não disponível", não um erro qualquer', async () => {
    const r = await trocarDePlano('premium')
    expect(r.ok).toBe(false)
    expect(r.indisponivel).toBe(true)
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
  it('só responde com as chaves gravadas, e só aos valores esperados', () => {
    expect(planoDeProva()).toBeNull()
    expect(provaDosPlanos()).toEqual({ plano: null, teste: false, aVenda: null, aparelho: null, anuncios: false })
    localStorage.setItem('babel.px.planoDeProva', 'selfhost')
    expect(planoDeProva()).toBeNull()
    for (const plano of ['free', 'essencial', 'premium', 'aovivo']) {
      localStorage.setItem('babel.px.planoDeProva', plano)
      expect(planoDeProva()).toBe(plano)
    }
    localStorage.setItem('babel.px.planosAVendaDeProva', 'aovivo, essencial,qualquer')
    localStorage.setItem('babel.px.aparelhoDeProva', 'quest')
    localStorage.setItem('babel.px.testeDeProva', '1')
    localStorage.setItem('babel.px.anunciosDeProva', '1')
    /* A lista sai na ordem da matriz, só com planos pagos de verdade. */
    expect(provaDosPlanos()).toEqual({
      plano: 'aovivo',
      teste: true,
      aVenda: ['essencial', 'aovivo'],
      aparelho: 'quest',
      anuncios: true,
    })
    localStorage.setItem('babel.px.aparelhoDeProva', 'geladeira')
    expect(provaDosPlanos().aparelho).toBeNull()
  })

  it('a tela desenha o que a prova pede: quatro planos, o Essencial como o da pessoa, no Quest', async () => {
    localStorage.setItem('babel.px.planoDeProva', 'essencial')
    localStorage.setItem('babel.px.planosAVendaDeProva', 'essencial,premium,aovivo')
    localStorage.setItem('babel.px.aparelhoDeProva', 'quest')
    await abrir()
    expect(cartoes().map((c) => c.dataset.plPlano)).toEqual(['gratis', 'essencial', 'premium', 'aovivo'])
    expect(cartaoDe('essencial').className).toContain('pl-meu')
    expect(document.querySelector<HTMLElement>('.pl-aparelho')!.dataset.plAparelho).toBe('quest')
    expect(document.querySelector<HTMLElement>('.pl-plano.px-premium')!.dataset.plPlano).toBe('premium')
  })
})
