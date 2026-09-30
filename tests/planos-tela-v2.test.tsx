// @vitest-environment jsdom
/**
 * A TELA DE PLANOS NOVA (C7 da change `planos-v2`) — o que ela promete, e como.
 *
 * 1. O título do produto ("Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho") e
 *    o seletor Mensal/Anual, com "equivale a 3 meses grátis" no anual (R$ 179 contra 12 × R$ 19,90).
 * 2. Duas colunas: Grátis ("Tradução rápida ao vivo": o aparelho sem limite e as horas de nuvem para
 *    aparelho fraco) e Premium ("Tradução Nuance": outras formas, formal ou informal, variantes e
 *    glossário; a voz natural do intérprete dita como "em breve").
 * 3. CÓDIGO DE DEFESA DO CONSUMIDOR: "sem limite no dia a dia" nunca aparece sozinho — a nota do uso
 *    justo fica AO LADO, no mesmo item (e na mesma linha da tabela), com o dia e o mês.
 * 4. Sem `%` e sem "qualidade" na tela: saíram o grupo de qualidade, o `Medidor` e os textos
 *    CORAA/chrF++ (vender "qualidade melhor" pega mal, decisão do dono).
 * 5. O teste de 14 dias começa com UM toque no cartão do Premium, para quem o servidor deixa testar;
 *    o perfil protegido recebe o caminho do responsável, e quem está testando vê até quando vale.
 * 6. O período escolhido na tela é o período com que o checkout abre.
 */
import { readFileSync } from 'node:fs'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.restoreAllMocks()
  vi.doUnmock('../src/data/api')
  vi.doUnmock('../src/data/rotas/idade')
  vi.doUnmock('../src/lib/entitlements')
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

const TITULO = 'Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho'
const TERMINA = new Date(2026, 9, 14, 15, 0).getTime()

type Resposta = { ok: boolean; status: number; json: () => Promise<unknown> }

function montarMocks(o: { status?: unknown; plano?: string; teste?: { terminaEm: number } | null } = {}) {
  const chamadas: { url: string; init?: RequestInit }[] = []
  vi.doMock('../src/data/api', () => ({
    apiFetch: vi.fn(async (url: string, init?: RequestInit): Promise<Resposta> => {
      chamadas.push({ url, init })
      if (url.includes('/api/billing/status'))
        return { ok: true, status: 200, json: async () => o.status ?? { configurado: true, assinatura: null } }
      if (url.includes('/api/billing/teste'))
        return {
          ok: true,
          status: 200,
          json: async () => ({ teste: { iniciadoEm: 1, terminaEm: TERMINA, dias: 14 } }),
        }
      return { ok: false, status: 404, json: async () => ({}) }
    }),
  }))
  vi.doMock('../src/data/rotas/idade', () => ({
    lerAbertura: async () => ({ cadastro: true, checkout: true }),
    declararNascimento: vi.fn(),
    carregarProtecao: async () => null,
    ehFalha: (r: { ok: boolean }) => r.ok === false,
  }))
  /* Nos testes `authRequired` é falso (self-host); a tela nova precisa da conta hospedada. */
  vi.doMock('../src/lib/entitlements', async (original) => {
    const real = (await original()) as typeof import('../src/lib/entitlements')
    const ents = {
      plan: o.plano ?? 'free',
      youtubeImport: false,
      managedCloudStt: false,
      managedCloudLlm: false,
      largerModels: false,
      traducaoNuance: false,
      vozNatural: false,
      armazenamento: null,
      teste: o.teste ?? null,
    }
    return { ...real, getEntitlements: () => ents, carregarEntitlements: async () => ents }
  })
  return chamadas
}

async function abrirPlanos() {
  const { default: Planos } = await import('../src/components/views/Planos')
  render(<Planos />)
  await screen.findByRole('heading', { name: TITULO })
}

const cartao = (id: 'gratis' | 'premium') => document.querySelector<HTMLElement>(`[data-plano="${id}"]`)!

describe('o título e o período', () => {
  it('o título do produto e o seletor Mensal/Anual, com "equivale a 3 meses grátis" no anual', async () => {
    montarMocks()
    await abrirPlanos()
    const grupo = screen.getByRole('radiogroup', { name: 'Período de cobrança' })
    const mensal = within(grupo).getByRole('radio', { name: 'Mensal' })
    const anual = within(grupo).getByRole('radio', { name: /Anual/ })
    expect(mensal.getAttribute('aria-checked')).toBe('true')
    expect(anual.textContent).toContain('equivale a 3 meses grátis')
  })

  it('no anual o Premium mostra o preço do ano e a economia; no mensal, o do mês', async () => {
    montarMocks()
    await abrirPlanos()
    expect(cartao('premium').textContent).toContain('19,90')
    expect(cartao('premium').textContent).toContain('por mês')
    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }))
    const texto = cartao('premium').textContent ?? ''
    expect(texto).toContain('179,00')
    expect(texto).toContain('por ano')
    expect(texto).toContain('economize R$ 59,80')
    expect(texto).toMatch(/12x no cartão/)
  })
})

describe('as duas colunas', () => {
  it('Grátis: "Tradução rápida ao vivo", o aparelho sem limite e 3 h por mês de nuvem para aparelho fraco', async () => {
    montarMocks()
    await abrirPlanos()
    const texto = cartao('gratis').textContent ?? ''
    expect(texto).toContain('Tradução rápida ao vivo')
    expect(texto).toMatch(/no seu aparelho, sem limite/)
    expect(texto).toMatch(/3 h por mês de nuvem grátis para aparelho fraco/)
  })

  it('Premium: "Tradução Nuance" com outras formas, formal ou informal, variantes e glossário; a voz natural é "em breve"', async () => {
    montarMocks()
    await abrirPlanos()
    const texto = cartao('premium').textContent ?? ''
    expect(texto).toContain('Tradução Nuance')
    expect(texto).toMatch(/outras formas de dizer/i)
    expect(texto).toMatch(/formal ou informal/)
    expect(texto).toMatch(/variantes/)
    expect(texto).toMatch(/glossário/)
    expect(texto).toMatch(/voz natural no modo intérprete \(em breve\)/i)
  })

  it('CDC: todo "sem limite no dia a dia" tem a nota do uso justo AO LADO (o mesmo item ou a mesma linha)', async () => {
    montarMocks()
    await abrirPlanos()
    /* O elemento mais fundo que diz "sem limite no dia a dia"; o bloco dele é o item ou a linha. */
    const diz = (e: Element) => /sem limite no dia a dia/.test(e.textContent ?? '')
    const onde = [...document.querySelectorAll<HTMLElement>('#painel-planos *')].filter(
      (e) => diz(e) && ![...e.children].some(diz),
    )
    expect(onde.length).toBeGreaterThanOrEqual(2) // o cartão e a tabela
    for (const e of onde) {
      const bloco = e.closest('li, tr') ?? e
      expect(bloco.textContent, bloco.outerHTML).toMatch(/uso justo/)
      expect(bloco.textContent).toMatch(/2 h de nuvem por dia/)
      expect(bloco.textContent).toMatch(/40 h por mês/)
      expect(bloco.textContent).toMatch(/segue no aparelho/)
    }
  })
})

describe('sem % e sem "qualidade"', () => {
  it('a aba Planos renderizada não tem `%`, "qualidade" nem o medidor', async () => {
    montarMocks()
    await abrirPlanos()
    const painel = document.querySelector<HTMLElement>('#painel-planos, [role="tabpanel"]')!
    const tudo = [
      painel.textContent ?? '',
      ...[...painel.querySelectorAll('[aria-label],[title]')].map(
        (e) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('title') ?? ''}`,
      ),
    ].join('\n')
    expect(tudo).not.toContain('%')
    expect(tudo).not.toMatch(/qualidade/i)
    expect(tudo).not.toMatch(/CORAA|chrF/i)
    expect(painel.querySelector('.medidor')).toBeNull()
  })

  it('o código da tela também não traz de volta o medidor nem os números de qualidade', () => {
    const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const arquivo of ['src/components/views/Planos.tsx', 'src/components/views/planos/dados.ts']) {
      const texto = semComentarios(readFileSync(arquivo, 'utf8'))
      expect(texto, arquivo).not.toMatch(/qualidade/i)
      expect(texto, arquivo).not.toMatch(/CORAA|chrF|WER\b/)
      expect(texto, arquivo).not.toMatch(/Medidor|medidor/)
    }
  })
})

describe('o teste de 14 dias na tela', () => {
  it('quem pode testar começa com UM toque, sem cartão, e a tela diz até quando vale', async () => {
    const chamadas = montarMocks({
      status: { configurado: true, assinatura: null, teste: { estado: 'disponivel', dias: 14 } },
    })
    await abrirPlanos()
    const premium = cartao('premium')
    const botao = within(premium).getByRole('button', { name: 'Testar 14 dias grátis' })
    expect(within(premium).getByRole('button', { name: 'Assinar Premium' })).toBeTruthy()
    expect(premium.textContent).toMatch(/Sem cartão/)
    fireEvent.click(botao)
    await waitFor(() => expect(chamadas.some((c) => c.url === '/api/billing/teste')).toBe(true))
    const pedido = chamadas.find((c) => c.url === '/api/billing/teste')!
    expect(JSON.parse(String(pedido.init?.body))).toEqual({})
    expect(await screen.findByText(/o Premium vale até 14\/10\/2026/)).toBeTruthy()
  })

  it('perfil protegido: nem teste nem assinatura no cartão — o caminho do responsável', async () => {
    montarMocks({
      status: {
        configurado: true,
        assinatura: null,
        teste: { estado: 'indisponivel', dias: 14, motivo: 'perfil_protegido' },
      },
    })
    await abrirPlanos()
    const premium = cartao('premium')
    expect(within(premium).queryByRole('button', { name: /Testar/ })).toBeNull()
    expect(within(premium).queryByRole('button', { name: 'Assinar Premium' })).toBeNull()
    expect(premium.textContent).toMatch(/Peça ao seu responsável/)
  })

  it('quem está testando vê na faixa até quando vale e que nada é cobrado; o Premium segue assinável', async () => {
    montarMocks({
      plano: 'premium',
      teste: { terminaEm: TERMINA },
      status: {
        configurado: true,
        assinatura: null,
        teste: { estado: 'ativo', dias: 14, iniciadoEm: TERMINA - 14 * 86_400_000, terminaEm: TERMINA },
      },
    })
    await abrirPlanos()
    const faixa = await screen.findByRole('region', { name: 'Seu plano agora' })
    await waitFor(() => expect(faixa.textContent).toMatch(/teste/i))
    expect(faixa.textContent).toContain('14/10/2026')
    expect(faixa.textContent).toMatch(/nada é cobrado/)
    expect(screen.queryByRole('tab', { name: 'Sua assinatura' })).toBeNull()
    expect(within(cartao('premium')).getByRole('button', { name: 'Assinar Premium' })).toBeTruthy()
    expect(within(cartao('premium')).queryByRole('button', { name: /Testar/ })).toBeNull()
  })
})

describe('o período vai para o checkout', () => {
  it('Anual escolhido na tela: o checkout abre no anual em uma vez', async () => {
    montarMocks()
    await abrirPlanos()
    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }))
    fireEvent.click(within(cartao('premium')).getByRole('button', { name: 'Assinar Premium' }))
    const anual = await screen.findByRole('button', { name: /Anual em uma vez/ })
    expect(anual.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Mensal recorrente/ }).getAttribute('aria-pressed')).toBe('false')
  })
})
