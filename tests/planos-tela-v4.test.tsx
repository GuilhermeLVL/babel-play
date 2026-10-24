// @vitest-environment jsdom
/**
 * A TELA DE PLANOS v4 (spec `docs/specs/2026-10-24-planos-v4.md`): com a venda do Plus aberta
 * (`venda_planos_v4`), três cartões — Grátis, Plus e Pro ("em breve", sem preço, sem botão de compra) — e a
 * Família como linha sob o Plus. Com ela fechada, a tela de hoje. Perfil protegido: nenhum "R$".
 *
 * A venda é simulada pela prova local (`babel.px.planosAVendaDeProva`), como nos testes v3.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const abertura = vi.hoisted(() => ({ anual: false }))
vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  apiFetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
}))
vi.mock('../src/data/rotas/idade', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/idade')>()),
  lerAbertura: async () => ({ cadastro: true, checkout: true, anual: abertura.anual }),
}))

import Planos from '../src/components/views/Planos'
import { PLAN_MATRIX } from '../src/core/planos'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'
import { definirProtecao } from '../src/lib/protecaoDoMenor'

const aguardar = () => act(async () => {})
const abrir = async (aVenda: string) => {
  localStorage.setItem('babel.px.planosAVendaDeProva', aVenda)
  localStorage.setItem('babel.px.planoDeProva', 'free')
  const tela = render(<Planos />)
  await aguardar()
  return tela
}
const cartoes = () =>
  [...document.querySelectorAll<HTMLElement>('.pl-planos-grade > .pl-plano')].map((c) => c.dataset.plPlano)
const cartao = (id: string) => document.querySelector<HTMLElement>(`[data-pl-plano="${id}"]`)!
const tela = () => document.body.textContent ?? ''

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  _reiniciarIdentidade()
  definirIdentidade('conta')
  abertura.anual = false
})
afterEach(() => {
  cleanup()
  definirEstadoDasFlags(null)
  definirProtecao(null)
})

describe('Planos v4 ligada: Grátis, Plus e Pro, com a Família numa linha', () => {
  it('desenha três cartões (Grátis, Plus, Pro) e nenhum Essencial, Premium ou Ao Vivo', async () => {
    await abrir('plus')
    expect(cartoes()).toEqual(['gratis', 'plus', 'pro4'])
    expect(tela()).not.toMatch(/Essencial|Premium|Ao [Vv]ivo/)
  })

  it('o Plus é o recomendado e custa 14,90 por mês (da matriz)', async () => {
    await abrir('plus')
    expect(PLAN_MATRIX.plus.precoMensalBrl).toBe(14.9)
    expect(cartao('plus').textContent).toContain('R$ 14,90')
    expect(cartao('plus').textContent).toContain('Recomendado aqui')
  })

  it('no anual o Plus custa 149,00 e o cartão diz "2 meses grátis"', async () => {
    abertura.anual = true
    await abrir('plus')
    expect(PLAN_MATRIX.plus.precoAnualBrl).toBe(149)
    expect(tela()).toContain('2 meses grátis')
    const anual = [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) =>
      /Anual/.test(b.textContent ?? ''),
    )!
    await act(async () => anual.click())
    expect(cartao('plus').textContent).toContain('R$ 149,00')
    expect(cartao('plus').textContent).toContain('R$ 12,42 por mês')
  })

  it('com o anual desligado o Plus só tem mensal (sem 149,00 nem "meses grátis")', async () => {
    abertura.anual = false
    await abrir('plus')
    expect(tela()).not.toContain('149,00')
    expect(tela()).not.toMatch(/meses grátis/)
    expect(document.querySelector('[role="radiogroup"][aria-label="Cobrança"]')).toBeNull()
  })

  it('o Plus tem Nuance, tutor por texto e as horas de nuvem da matriz', async () => {
    await abrir('plus')
    const plus = cartao('plus').textContent ?? ''
    expect(plus).toContain('Nuance, polir a sessão e glossário')
    expect(plus).toContain('Tutor de IA por texto (iChat)')
    expect(plus).toContain('8 h de nuvem por mês')
  })

  it('"em breve" fica dentro do cartão do Plus (explicação no contexto e resumo→cartões), nunca no Grátis', async () => {
    definirEstadoDasFlags({ voz_natural: { ligada: true } })
    await abrir('plus')
    const plus = cartao('plus').textContent ?? ''
    expect(plus).toContain('Explicação da frase no contexto')
    expect(plus).toContain('Resumo da sessão que vira cartões')
    expect(cartao('plus').querySelectorAll('.pl-em-breve-tag')).toHaveLength(2)
    const gratis = cartao('gratis').textContent ?? ''
    expect(gratis).not.toMatch(/Explicação da frase|Resumo da sessão|em breve/)
    expect(gratis).toContain('Legenda bilíngue no aparelho, sem limite')
  })

  it('o Pro aparece "em breve", sem preço e sem botão de compra', async () => {
    await abrir('plus')
    const pro = cartao('pro4')
    expect(pro.textContent).toContain('Em breve')
    expect(pro.textContent).not.toContain('R$')
    expect(pro.querySelectorAll('button')).toHaveLength(0)
    expect(pro.textContent).toContain('Conversa por voz com um tutor, a partir da cena')
  })

  it('a Família é uma linha abaixo do cartão do Plus, com preço, "em breve" e sem botão', async () => {
    await abrir('plus')
    const linha = document.querySelector<HTMLElement>('[data-pl-familia]')!
    expect(linha).not.toBeNull()
    expect(linha.textContent).toContain('Família')
    expect(linha.textContent).toContain('para até 4 pessoas · R$ 24,90/mês · em breve')
    expect(linha.querySelectorAll('button')).toHaveLength(0)
    expect(cartoes()).not.toContain('familia')
  })

  it('a comparação tem as colunas Grátis, Plus e Pro, e o Pro diz "em breve" no preço', async () => {
    await abrir('plus')
    const colunas = [...document.querySelectorAll<HTMLElement>('.pl-compara thead th[data-c]')].map((c) => c.dataset.c)
    expect(colunas).toEqual(['gratis', 'plus', 'pro4'])
    const preco = document.querySelector('.pl-compara-preco')!
    expect(preco.querySelector('[data-c="pro4"]')!.textContent).toBe('em breve')
    expect(preco.querySelector('[data-c="plus"]')!.textContent).toBe('R$ 14,90')
  })

  it('o teste de 14 dias é do Plus, sem cartão; não cita Pix Automático (o checkout não o oferece)', async () => {
    await abrir('plus')
    const faq = document.querySelector('.pl-faq')!.textContent ?? ''
    expect(faq).toContain('São 14 dias de Plus, sem cartão')
    expect(faq).not.toMatch(/Premium|Pix Autom/)
  })

  it('a FAQ explica o anual como 10 mensalidades quando o anual está à venda', async () => {
    abertura.anual = true
    await abrir('plus')
    expect(document.querySelector('.pl-faq')!.textContent).toContain(
      'O anual custa 10 mensalidades: são 2 meses grátis',
    )
  })
})

describe('Planos v4 desligada: a tela de hoje', () => {
  it('só Grátis e Premium, sem Plus, Pro nem Família', async () => {
    await abrir('premium')
    expect(cartoes()).toEqual(['gratis', 'premium'])
    expect(document.querySelector('[data-pl-familia]')).toBeNull()
    expect(tela()).not.toMatch(/Plus|Família|em breve\b/)
    expect(cartao('premium').textContent).toContain('R$ 19,90')
  })

  it('o teste continua sendo do Premium', async () => {
    await abrir('premium')
    expect(document.querySelector('.pl-faq')!.textContent).toContain('São 14 dias de Premium, sem cartão')
  })
})

describe('Planos v4 com perfil protegido', () => {
  const menor = {
    nascimentoInformado: true,
    faixa: '12-15' as const,
    protegido: true,
    exigeResponsavel: true,
    exigeConsentimentoEspecifico: true,
    vinculo: { estado: 'nenhum' as const },
    restrita: false,
  }

  it('nenhum preço, nenhuma linha da Família, nenhuma oferta nem "peça ao responsável"', async () => {
    abertura.anual = true
    definirProtecao(menor)
    await abrir('plus')
    expect(tela()).not.toContain('R$')
    expect(document.querySelector('[data-pl-familia]')).toBeNull()
    expect(tela()).not.toMatch(/responsável|pais|Assinar|Testar/)
    expect(document.querySelector('[role="radiogroup"][aria-label="Cobrança"]')).toBeNull()
    expect(cartao('plus').querySelectorAll('button')).toHaveLength(0)
    expect(cartao('pro4').querySelectorAll('button')).toHaveLength(0)
  })

  it('idade não declarada também é perfil protegido: nenhum "R$"', async () => {
    definirProtecao({ ...menor, nascimentoInformado: false, faixa: null })
    await abrir('plus')
    expect(tela()).not.toContain('R$')
    expect(document.querySelector('[data-pl-familia]')).toBeNull()
  })
})

describe('Checkout do Plus', () => {
  it('monta no Plus (14,90 por mês) quando o plano lembrado é o Plus', async () => {
    sessionStorage.setItem('babel.checkout.plano', 'plus')
    window.history.replaceState({}, '', '/plano/assinar')
    await abrir('plus')
    const checkout = document.querySelector<HTMLElement>('[aria-label="Plano e período"]')!
    expect(checkout).not.toBeNull()
    expect(checkout.textContent).toContain('Plus')
    expect(checkout.textContent).toContain('R$ 14,90')
    expect(checkout.textContent).not.toMatch(/Premium|Essencial/)
  })

  it('o plano lembrado que não está à venda (Premium) cai no Plus quando a v4 está ligada', async () => {
    sessionStorage.setItem('babel.checkout.plano', 'premium')
    window.history.replaceState({}, '', '/plano/assinar')
    await abrir('plus')
    const checkout = document.querySelector<HTMLElement>('[aria-label="Plano e período"]')!
    expect(checkout.textContent).toContain('Plus')
    expect(checkout.textContent).not.toContain('Premium')
  })
})

describe('Planos v4 com quem já tem o Premium (staging)', () => {
  it('mostra o plano dele e não quebra; o Plus é oferecido como troca, o Pro segue "em breve"', async () => {
    localStorage.setItem('babel.px.planosAVendaDeProva', 'plus')
    localStorage.setItem('babel.px.planoDeProva', 'premium')
    render(<Planos />)
    await aguardar()
    expect(cartoes()).toEqual(['gratis', 'premium', 'plus', 'pro4'])
    expect(cartao('premium').textContent).toContain('Seu plano')
    expect(cartao('plus').textContent).toContain('Plus')
    expect(cartao('pro4').querySelectorAll('button')).toHaveLength(0)
  })
})

describe('Planos v4: itens "em breve" e voz natural', () => {
  const temCheck = (li: Element) => !!li.querySelector('.lucide-check')
  const itemDe = (id: string, texto: string) =>
    [...cartao(id).querySelectorAll('li')].find((li) => li.textContent?.includes(texto))!

  it('item "em breve" não leva o ✓ dos incluídos: leva o relógio e o texto "em breve"', async () => {
    definirEstadoDasFlags({ voz_natural: { ligada: true } })
    await abrir('plus')
    for (const [id, texto] of [
      ['plus', 'Explicação da frase no contexto'],
      ['plus', 'Resumo da sessão que vira cartões'],
      ['pro4', 'Conversa por voz com um tutor'],
    ]) {
      const li = itemDe(id, texto)
      expect(temCheck(li), texto).toBe(false)
      expect(li.querySelector('.lucide-clock'), texto).not.toBeNull()
      expect(li.textContent).toContain('em breve')
    }
    expect(temCheck(itemDe('plus', 'Tutor de IA por texto (iChat)'))).toBe(true)
  })

  it('com `voz_natural` ligada, a voz do Plus é um item normal com o teto de caracteres', async () => {
    definirEstadoDasFlags({ voz_natural: { ligada: true } })
    await abrir('plus')
    const li = itemDe('plus', 'Voz natural para ouvir as frases')
    expect(li.textContent).toContain('até 150 mil caracteres por mês')
    expect(temCheck(li)).toBe(true)
    expect(li.querySelector('.pl-em-breve-tag')).toBeNull()
    const celula = document.querySelector('.pl-compara tbody')!.textContent ?? ''
    expect(celula).toContain('Voz para ouvir as frases')
  })

  it('com `voz_natural` desligada, a voz do Plus aparece "em breve" (item e comparação)', async () => {
    await abrir('plus')
    const li = itemDe('plus', 'Voz natural para ouvir as frases')
    expect(li.className).toContain('pl-item-breve')
    expect(temCheck(li)).toBe(false)
    expect(li.textContent).toContain('em breve')
    const linha = [...document.querySelectorAll('.pl-compara tbody tr')].find((tr) =>
      tr.textContent?.includes('Voz para ouvir as frases'),
    )!
    expect(linha.querySelector('[data-c="plus"]')!.textContent).toBe('em breve')
    expect(linha.querySelector('[data-c="gratis"]')!.textContent).toBe('do aparelho')
  })
})

describe('Planos v4: IA de estudo (`ia_de_estudo`)', () => {
  const temCheck = (li: Element) => !!li.querySelector('.lucide-check')
  const itemDe = (id: string, texto: string) =>
    [...cartao(id).querySelectorAll('li')].find((li) => li.textContent?.includes(texto))
  const linhaDaComparacao = (texto: string) =>
    [...document.querySelectorAll('.pl-compara tbody tr')].find((tr) => tr.textContent?.includes(texto))!
  const celula = (texto: string, plano: string) =>
    linhaDaComparacao(texto).querySelector(`[data-c="${plano}"]`)!.textContent

  it('desligada: explicação e resumo seguem "em breve", o Grátis não fala da amostra', async () => {
    await abrir('plus')
    for (const texto of ['Explicação da frase no contexto', 'Resumo da sessão que vira cartões']) {
      const li = itemDe('plus', texto)!
      expect(li.className).toContain('pl-item-breve')
      expect(temCheck(li)).toBe(false)
      expect(li.textContent).toContain('em breve')
      expect(celula(texto, 'plus')).toBe('em breve')
      expect(celula(texto, 'gratis')).not.toMatch(/amostra/)
    }
    expect(cartao('gratis').textContent).not.toContain('Amostra da IA')
    expect(itemDe('plus', 'Resumo da sessão que vira cartões')!.textContent).toContain('com a frase da cena')
    expect(tela()).not.toContain('áudio da cena')
  })

  it('ligada: os dois itens do Plus são normais e o Grátis mostra a amostra', async () => {
    definirEstadoDasFlags({ ia_de_estudo: { ligada: true } })
    await abrir('plus')
    for (const texto of ['Explicação da frase no contexto', 'Resumo da sessão que vira cartões']) {
      const li = itemDe('plus', texto)!
      expect(li.className).not.toContain('pl-item-breve')
      expect(temCheck(li)).toBe(true)
      expect(li.querySelector('.pl-em-breve-tag')).toBeNull()
      expect(celula(texto, 'plus')).not.toBe('em breve')
    }
    expect(itemDe('plus', 'Resumo da sessão que vira cartões')!.textContent).toContain('com a frase da cena')
    expect(tela()).not.toContain('áudio da cena')
    expect(itemDe('gratis', 'Amostra da IA')!.textContent).toContain(
      'Amostra da IA: 5 explicações por dia e 1 resumo por semana',
    )
    expect(celula('Explicação da frase no contexto', 'gratis')).toBe('amostra: 5 por dia')
    expect(celula('Resumo da sessão que vira cartões', 'gratis')).toBe('amostra: 1 por semana')
  })

  it('ligada, perfil protegido: a amostra aparece e continua sem preço nem oferta', async () => {
    definirEstadoDasFlags({ ia_de_estudo: { ligada: true } })
    definirProtecao({
      nascimentoInformado: true,
      faixa: '12-15',
      protegido: true,
      exigeResponsavel: true,
      exigeConsentimentoEspecifico: true,
      vinculo: { estado: 'nenhum' },
      restrita: false,
    })
    await abrir('plus')
    expect(itemDe('gratis', 'Amostra da IA')).toBeTruthy()
    expect(tela()).not.toContain('R$')
  })
})

describe('Planos v4 sem o /status (pendente ou com falha)', () => {
  it('com a flag ligada a tela já é a v4: Grátis, Plus e Pro, nunca o Premium', async () => {
    definirEstadoDasFlags({ venda_planos_v4: { ligada: true } })
    localStorage.setItem('babel.px.planoDeProva', 'free')
    render(<Planos />)
    await aguardar()
    expect(cartoes()).toEqual(['gratis', 'plus', 'pro4'])
    expect(tela()).not.toMatch(/Premium/)
  })

  it('o plano do checkout, sem nada guardado, é o Plus', async () => {
    definirEstadoDasFlags({ venda_planos_v4: { ligada: true } })
    localStorage.setItem('babel.px.planoDeProva', 'free')
    window.history.replaceState({}, '', '/plano/assinar')
    render(<Planos />)
    await aguardar()
    const checkout = document.querySelector<HTMLElement>('[aria-label="Plano e período"]')!
    expect(checkout.textContent).toContain('Plus')
    expect(checkout.textContent).not.toContain('Premium')
  })
})

describe('Checkout por endereço com perfil protegido (v4)', () => {
  const protegido = {
    nascimentoInformado: true,
    faixa: '12-15' as const,
    protegido: true,
    exigeResponsavel: true,
    exigeConsentimentoEspecifico: true,
    vinculo: { estado: 'nenhum' as const },
    restrita: false,
  }
  for (const [nome, estado] of [
    ['menor declarado', protegido],
    ['idade não declarada', { ...protegido, nascimentoInformado: false, faixa: null }],
  ] as const)
    it(`${nome}: nenhum "R$", nenhum "responsável", e um caminho de volta`, async () => {
      definirProtecao(estado)
      sessionStorage.setItem('babel.checkout.plano', 'plus')
      window.history.replaceState({}, '', '/plano/assinar')
      await abrir('plus')
      expect(tela()).not.toContain('R$')
      expect(tela()).not.toMatch(/responsável|pais/)
      expect(document.querySelector('[aria-label="Plano e período"]')).toBeNull()
      expect(tela()).toContain('Os planos pagos não estão disponíveis neste perfil')
      expect(document.querySelector('[aria-label="Voltar para Planos"]')).not.toBeNull()
    })
})
