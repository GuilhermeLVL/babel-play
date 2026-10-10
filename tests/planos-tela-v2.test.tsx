// @vitest-environment jsdom
/**
 * A TELA DE PLANOS — o que ela promete, e como. Nasceu no C7 da change `planos-v2` (duas colunas) e
 * hoje cobre a tela dos quatro planos (`planos-v3-e-rota-inteligente`), no estado de fábrica: Grátis e
 * Premium. Os casos de quatro planos, do aparelho e do consumo estão em `polimentoPlanos.test.tsx`.
 *
 * 1. O título do produto ("Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho") e
 *    o seletor Mensal/Anual, com "até N% a menos" calculado da matriz.
 * 2. Duas colunas: Grátis (o aparelho sem limite e as horas de nuvem para aparelho fraco) e Premium
 *    (a Nuance, as horas de nuvem do mês, o intérprete automático e a voz neural).
 * 3. CÓDIGO DE DEFESA DO CONSUMIDOR: as horas de nuvem do mês nunca aparecem sem o teto do dia — no
 *    mesmo item do cartão e no pé da tabela, com os números da matriz.
 * 4. Sem "qualidade" e sem número de qualidade na tela; o único `%` é o desconto do anual.
 * 5. O teste de 14 dias começa com UM toque no cartão do Premium, para quem o servidor deixa testar;
 *    o perfil protegido recebe o caminho do responsável, e quem está testando vê até quando vale.
 * 6. O período escolhido na tela é o período com que o checkout abre.
 */
import { readFileSync } from 'node:fs'

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { horasDeTranscricao, horasDoUsoJusto, PLAN_MATRIX } from '../src/core/planos'

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
/* O teste acaba daqui a alguns dias: a tela fala em dias que faltam, não numa data. */
const TERMINA = Date.now() + 5 * 86_400_000 + 3_600_000

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

const cartao = (id: 'gratis' | 'premium') => document.querySelector<HTMLElement>(`.pl-plano[data-pl-plano="${id}"]`)!

describe('o título e o período', () => {
  it('o título do produto e o seletor Mensal/Anual, com o desconto do anual calculado da matriz', async () => {
    montarMocks()
    await abrirPlanos()
    const grupo = screen.getByRole('radiogroup', { name: 'Cobrança' })
    const mensal = within(grupo).getByRole('radio', { name: 'Mensal' })
    const anual = within(grupo).getByRole('radio', { name: /Anual/ })
    expect(mensal.getAttribute('aria-checked')).toBe('true')
    const { precoMensalBrl, precoAnualBrl } = PLAN_MATRIX.premium
    const pct = Math.round((1 - precoAnualBrl! / (precoMensalBrl! * 12)) * 100)
    expect(pct).toBeGreaterThan(0)
    expect(anual.textContent).toContain(`até ${pct}% a menos`)
  })

  it('no anual o Premium mostra o preço do ano e a economia; no mensal, o do mês', async () => {
    montarMocks()
    await abrirPlanos()
    expect(cartao('premium').textContent).toContain('19,90')
    expect(cartao('premium').textContent).toContain('por mês')
    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }))
    const texto = cartao('premium').textContent ?? ''
    expect(texto).toContain('149,90')
    expect(texto).toContain('por ano')
    expect(texto).toContain('dá R$ 12,49 por mês')
  })
})

describe('as duas colunas', () => {
  it('Grátis: "Tradução rápida ao vivo", o aparelho sem limite e 3 h por mês de nuvem para aparelho fraco', async () => {
    montarMocks()
    await abrirPlanos()
    const texto = cartao('gratis').textContent ?? ''
    expect(texto).toContain('Tradução rápida ao vivo')
    expect(texto).toMatch(/no aparelho, sem limite/)
    expect(texto).toMatch(/até 3 h por mês, para aparelho fraco/)
  })

  it('Premium: a Nuance com outras formas, formal ou informal, as horas de nuvem, o intérprete automático e a voz neural', async () => {
    montarMocks()
    await abrirPlanos()
    const texto = cartao('premium').textContent ?? ''
    expect(texto).toContain('Tradução Nuance')
    expect(texto).toMatch(/outras formas de dizer/i)
    expect(texto).toMatch(/formal ou informal/)
    expect(texto).toContain(`${horasDeTranscricao('premium')} h de nuvem por mês`)
    expect(texto).toContain('Intérprete automático')
    expect(texto).toContain('Voz neural básica no intérprete')
    /* Nada do que o plano não entrega hoje. */
    expect(texto).not.toMatch(/em breve|sem limite no dia a dia/i)
  })

  it('CDC: as horas de nuvem do mês vêm com o teto do dia junto (no item do cartão e no pé da tabela)', async () => {
    montarMocks()
    await abrirPlanos()
    const dia = horasDoUsoJusto('premium')
    const mes = horasDeTranscricao('premium')
    expect(dia).not.toBeNull()
    const item = [...cartao('premium').querySelectorAll('li')].find((li) =>
      (li.textContent ?? '').includes(`${mes} h de nuvem por mês`),
    )
    expect(item, 'o item das horas de nuvem').toBeTruthy()
    expect(item!.textContent).toContain(`até ${dia} h por dia`)
    const nota = document.querySelector('.pl-comparar > .px-nota')!
    expect(nota.textContent).toContain(`a nuvem por trechos vai até ${dia} h por dia`)
    expect(nota.textContent).toMatch(/segue no aparelho/)
    /* E a tela não promete nuvem "sem limite": o que não tem limite é a legenda no aparelho. */
    expect(screen.getByTestId('planos-do-quest').textContent).not.toMatch(/nuvem sem limite|sem limite no dia a dia/i)
  })
})

describe('sem % e sem "qualidade"', () => {
  it('a aba Planos renderizada não tem "qualidade" nem o medidor; o único `%` é o desconto do anual', async () => {
    montarMocks()
    await abrirPlanos()
    const painel = screen.getByTestId('planos-do-quest')
    const tudo = [
      painel.textContent ?? '',
      ...[...painel.querySelectorAll('[aria-label],[title]')].map(
        (e) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('title') ?? ''}`,
      ),
    ].join('\n')
    expect(tudo.replace(/\d+% a menos/g, '')).not.toContain('%')
    expect(tudo).not.toMatch(/qualidade (melhor|superior|maior)|% de qualidade/i)
    /* A palavra só aparece no cartão do aparelho, falando da VOZ do sistema ("a qualidade varia de um
       aparelho para outro", texto do protótipo): não é a venda de qualidade que a decisão do dono tirou. */
    const semOAparelho = painel.cloneNode(true) as HTMLElement
    semOAparelho.querySelector('.pl-aparelho')?.remove()
    expect(semOAparelho.textContent).not.toMatch(/qualidade/i)
    expect(tudo).not.toMatch(/CORAA|chrF/i)
    expect(painel.querySelector('.medidor')).toBeNull()
  })

  it('o código da tela também não traz de volta o medidor nem os números de qualidade', () => {
    const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const arquivo of ['src/components/views/Planos.tsx', 'src/components/views/planos/dados.ts']) {
      const texto = semComentarios(readFileSync(arquivo, 'utf8'))
      expect(texto, arquivo).not.toMatch(/qualidade/i)
      expect(texto, arquivo).not.toMatch(/CORAA|chrF|WER\b/)
      /* O `Medidor` era o componente dos números de qualidade; os medidores de CONSUMO são outra coisa. */
      expect(texto, arquivo).not.toMatch(/<Medidor\b|className="medidor/)
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
    /* A tela vai para "Sua assinatura", e lá diz quando o teste acaba e que nada é cobrado. */
    expect(await screen.findByRole('tab', { name: 'Sua assinatura', selected: true })).toBeTruthy()
    const tela = screen.getByTestId('planos-do-quest')
    await waitFor(() => expect(tela.textContent).toMatch(/O teste termina em \d+ dias?/))
    expect(tela.textContent).toMatch(/nada é cobrado/)
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

  it('quem está testando vê no cartão quando o teste acaba e que a conta volta ao Grátis; o Premium segue assinável', async () => {
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
    await waitFor(() => expect(cartao('premium').textContent).toMatch(/Seu teste termina em \d+ dias?/))
    expect(cartao('premium').textContent).toMatch(/a conta volta ao Grátis sozinha/)
    expect(screen.getByTestId('planos-do-quest').textContent).toMatch(/Premium · em teste/)
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
