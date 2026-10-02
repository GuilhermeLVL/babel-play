// @vitest-environment jsdom
/**
 * A CONTA NO META QUEST (segunda rodada do headset, 02/10/2026): Perfil, Planos (com o checkout, a
 * confirmação, a assinatura e o cancelamento) e os avisos de conta.
 *
 * A regra do guia (`docs/design/quest-desenho.md`): NENHUMA FUNÇÃO SOME. Cada teste monta a tela no
 * desenho do headset e confere que o que a tela de sempre oferece continua alcançável e chama o MESMO
 * caminho (a gravação do perfil, a cobrança, o cancelamento). Fora do Quest, a tela de sempre.
 */
import { readFileSync } from 'node:fs'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CloudOff } from 'lucide-react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { PADRAO, type Preferencias } from '../src/lib/preferencias'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const quest = vi.hoisted(() => ({ ligado: true }))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()
  return { ...real, useQuestNovo: () => quest.ligado }
})

/* O servidor: cada teste diz o que cada rota responde; rota sem resposta devolve 404. */
type Resposta = { ok: boolean; status: number; json: () => Promise<unknown> }
const servidor = vi.hoisted(() => ({
  rotas: {} as Record<string, unknown>,
  chamadas: [] as { url: string; init?: RequestInit }[],
  /** Segura a resposta de `/api/me/uso` até o teste soltar (para ver a tela enquanto carrega). */
  esperaDoUso: null as Promise<void> | null,
}))
const api = vi.hoisted(() => ({ fetchDeck: vi.fn(), exportarConta: vi.fn() }))
vi.mock('../src/data/api', async (original) => ({
  ...(await original<typeof import('../src/data/api')>()),
  ...api,
  apiFetch: async (url: string, init?: RequestInit): Promise<Resposta> => {
    servidor.chamadas.push({ url, init })
    if (url.includes('/api/me/uso') && servidor.esperaDoUso) await servidor.esperaDoUso
    const chave = Object.keys(servidor.rotas).find((k) => url.includes(k))
    return chave
      ? { ok: true, status: 200, json: async () => servidor.rotas[chave] }
      : { ok: false, status: 404, json: async () => ({}) }
  },
}))

const ents = vi.hoisted(() => ({ plan: 'free' as string, armazenamento: null as unknown }))
vi.mock('../src/lib/entitlements', async (original) => {
  const real = await original<typeof import('../src/lib/entitlements')>()
  const ler = () => ({ ...real.getEntitlements(), plan: ents.plan, armazenamento: ents.armazenamento, teste: null })
  return { ...real, getEntitlements: ler, carregarEntitlements: async () => ler() }
})

const perfil = vi.hoisted(() => ({
  atual: null as unknown,
  carregando: false,
  salvar: vi.fn(),
}))
vi.mock('../src/lib/usePerfil', () => ({
  usePerfil: () => ({ perfil: perfil.atual, carregando: perfil.carregando, iniciais: 'AS' }),
  salvarPerfil: perfil.salvar,
  iniciaisDe: () => 'AS',
}))

const prefs = vi.hoisted(() => ({ atual: null as unknown, salvar: vi.fn() }))
vi.mock('../src/lib/preferencias', async (original) => {
  const real = await original<typeof import('../src/lib/preferencias')>()
  return {
    ...real,
    usePreferencias: () => prefs.atual,
    salvarPreferencias: (fn: (p: Preferencias) => Preferencias) => {
      prefs.atual = fn(prefs.atual as Preferencias)
      prefs.salvar(prefs.atual)
      return Promise.resolve(true)
    },
  }
})

vi.mock('../src/lib/langConfig', async (original) => ({
  ...(await original<typeof import('../src/lib/langConfig')>()),
  fetchLangConfig: async () => ({ mine: 'pt-BR', studying: 'en-US', daInterface: 'pt' }),
}))

const xp = vi.hoisted(() => ({ historico: null as unknown }))
vi.mock('../src/data/me', async (original) => ({
  ...(await original<typeof import('../src/data/me')>()),
  fetchHistoricoDeXp: async () => xp.historico,
}))

const nav = vi.hoisted(() => ({ irPara: vi.fn(), navegarPara: vi.fn() }))
vi.mock('../src/lib/irPara', () => ({ irPara: nav.irPara }))
vi.mock('../src/lib/rotas', async (original) => ({
  ...(await original<typeof import('../src/lib/rotas')>()),
  navegarPara: nav.navegarPara,
}))

const idade = vi.hoisted(() => ({ convidarResponsavel: vi.fn(), carregarProtecao: vi.fn() }))
vi.mock('../src/data/rotas/idade', async (original) => ({
  ...(await original<typeof import('../src/data/rotas/idade')>()),
  lerAbertura: async () => ({ cadastro: true, checkout: true }),
  ...idade,
}))

const migracao = vi.hoisted(() => ({ inventarioLocal: vi.fn(), migrarParaConta: vi.fn() }))
vi.mock('../src/data/migracao', () => migracao)

const marcos = vi.hoisted(() => ({ avisoPendente: vi.fn(), marcarVisto: vi.fn() }))
vi.mock('../src/lib/marcosDeConta', async (original) => ({
  ...(await original<typeof import('../src/lib/marcosDeConta')>()),
  ...marcos,
}))

import CardDePlanos from '../src/components/CardDePlanos'
import AvisoDeConta from '../src/components/conta/AvisoDeConta'
import AvisoDePagamentoAtrasado from '../src/components/conta/AvisoDePagamentoAtrasado'
import AvisoDoResponsavel from '../src/components/conta/AvisoDoResponsavel'
import GateDeConta from '../src/components/conta/GateDeConta'
import ModalDeMigracao from '../src/components/conta/ModalDeMigracao'
import CartaoDeOferta from '../src/components/ofertas/CartaoDeOferta'
import Perfil from '../src/components/views/Perfil'
import Planos from '../src/components/views/Planos'
import Assinado from '../src/components/views/planos/Assinado'
import Cancelar from '../src/components/views/planos/Cancelar'
import Checkout from '../src/components/views/planos/Checkout'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'
import type { DerivedProgress } from '../src/lib/progress'

const aguardar = () => act(async () => {})
const aba = (nome: string) => screen.getByRole('tab', { name: nome })
const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome })
const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement
const pedido = (rota: string) => servidor.chamadas.find((c) => c.url === rota)
const fecharDialogo = async (nomeDoBotao: string | RegExp) => {
  await act(async () => {
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: nomeDoBotao }))
  })
}

const progresso = {
  available: true,
  level: 7,
  xp: 1200,
  seeds: 340,
  streakDays: 5,
  levelPct: 40,
  xpIntoLevel: 80,
  xpForLevel: 200,
  palavrasNovas: 0,
} as unknown as DerivedProgress

const VALE_ATE = new Date(2026, 9, 22).getTime()
const contaGratis = { estado: 'gratis', plano: null, valeAte: null } as const
const contaAtiva = { estado: 'ativa', plano: 'premium', valeAte: VALE_ATE } as const
const statusAtivo = {
  configurado: true,
  assinatura: {
    plano: 'premium',
    status: 'active',
    valeAte: VALE_ATE,
    provedor: 'asaas',
    ciclo: 'mensal',
    meio: 'assinatura',
  },
  proximaCobranca: '2026-10-22',
}
const faturaAntiga = {
  id: 'pay_1',
  data: '2026-08-22',
  descricao: 'Premium · mensal',
  valor: 19.9,
  metodo: 'pix',
  status: 'paga',
  recibo: null,
  link: null,
}
const uso = {
  plano: 'free',
  janela: '2026-10',
  chamadas: { usado: 12, teto: 100 },
  segundosDeAudio: { usado: 600, teto: 3600 },
  tokensDeLlm: { usado: 5000, teto: null },
}

beforeAll(() => {
  prepararDialogoNoJsdom()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
beforeEach(() => {
  quest.ligado = true
  servidor.rotas = { '/api/billing/status': { configurado: true, assinatura: null } }
  servidor.chamadas = []
  servidor.esperaDoUso = null
  ents.plan = 'free'
  ents.armazenamento = null
  perfil.atual = { id: 'u1', displayName: 'Ana Souza', bio: '', goal: '', interests: [], email: 'ana@exemplo.com' }
  perfil.carregando = false
  perfil.salvar.mockReset().mockResolvedValue(true)
  prefs.atual = JSON.parse(JSON.stringify(PADRAO))
  prefs.salvar.mockReset()
  api.fetchDeck.mockReset().mockResolvedValue([])
  api.exportarConta.mockReset().mockResolvedValue(null)
  xp.historico = { xpTotal: 1200, pontos: [], marcos: [] }
  for (const f of [
    ...Object.values(nav),
    ...Object.values(idade),
    ...Object.values(migracao),
    ...Object.values(marcos),
  ])
    f.mockReset()
  _reiniciarIdentidade()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/* ═════════════════════════════════════════ PERFIL ═════════════════════════════════════════ */
describe('Perfil no Quest: a casca', () => {
  it('monta no desenho do headset, com as três abas na ordem de sempre', async () => {
    const { container } = render(<Perfil progress={progresso} ageProfile={'adult' as never} />)
    await aguardar()
    expect(container.querySelector('.q-palco.qc')).not.toBeNull()
    expect(container.querySelector('.tela')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Seu perfil' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual(['Você', 'Progresso', 'Seus dados'])
    expect(aba('Você').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(aba('Você'), { key: 'ArrowRight' })
    expect(aba('Progresso').getAttribute('aria-selected')).toBe('true')
  })

  it('fora do Quest, a tela de sempre', async () => {
    quest.ligado = false
    const { container } = render(<Perfil progress={progresso} ageProfile={'adult' as never} />)
    await aguardar()
    expect(container.querySelector('.q-palco')).toBeNull()
    expect(container.querySelector('.tela')).not.toBeNull()
    expect(container.querySelector('.barra-salvar')).not.toBeNull()
  })
})

describe('Perfil no Quest: Você', () => {
  it('os três campos, a foto, a barra de salvar com Descartar e Salvar pelo mesmo caminho', async () => {
    const { container } = render(<Perfil progress={progresso} ageProfile={'adult' as never} />)
    await aguardar()
    expect(campo('Como você quer ser chamado').value).toBe('Ana Souza')
    expect(campo('O que você quer alcançar')).toBeTruthy()
    expect(campo('Sobre você')).toBeTruthy()
    // A foto: sem foto, a inicial e "Enviar foto" (um campo de arquivo de verdade).
    expect(screen.getByText('Enviar foto').closest('label')!.querySelector('input[type="file"]')).not.toBeNull()
    // Nada mudou: nenhuma barra de salvar.
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull()

    fireEvent.change(campo('Como você quer ser chamado'), { target: { value: 'Ana' } })
    expect(screen.getByText('Alterações não salvas')).toBeTruthy()
    fireEvent.click(botao('Descartar'))
    expect(campo('Como você quer ser chamado').value).toBe('Ana Souza')
    expect(screen.queryByText('Alterações não salvas')).toBeNull()

    fireEvent.change(campo('Como você quer ser chamado'), { target: { value: 'Ana' } })
    fireEvent.change(campo('Sobre você'), { target: { value: 'Estudo inglês.' } })
    // Uma única ação principal na aba.
    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    await act(async () => {
      fireEvent.click(botao(/Salvar/))
    })
    expect(perfil.salvar).toHaveBeenCalledWith({ displayName: 'Ana', bio: 'Estudo inglês.', goal: '' })
    expect(prefs.salvar).toHaveBeenCalledTimes(1)
  })

  it('a meta diária, o nível por idioma e os interesses (salvos ao marcar)', async () => {
    render(<Perfil progress={progresso} ageProfile={'adult' as never} />)
    await aguardar()
    const meta = within(screen.getByRole('group', { name: 'Meta diária' }))
    expect(meta.getAllByRole('button')).toHaveLength(5)
    fireEvent.click(meta.getByRole('button', { name: /^30 min/ }))
    expect(meta.getByRole('button', { name: /^30 min/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Alterações não salvas')).toBeTruthy()

    const nivel = within(await screen.findByRole('radiogroup', { name: /^Nível em/ }))
    expect(nivel.getAllByRole('radio').map((r) => r.textContent)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
    fireEvent.click(nivel.getByRole('radio', { name: 'B1' }))
    expect(nivel.getByRole('radio', { name: 'B1' }).getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      fireEvent.click(botao(/Salvar/))
    })
    const salvo = prefs.atual as Preferencias
    expect(salvo.metaMin).toBe(30)
    expect(Object.values(salvo.niveis)).toContain('B1')

    await act(async () => {
      fireEvent.click(botao('Música'))
    })
    expect(perfil.salvar).toHaveBeenCalledWith({ interests: ['musica'] })
  })

  it('enquanto o perfil chega, diz que está carregando', async () => {
    perfil.atual = null
    perfil.carregando = true
    render(<Perfil progress={progresso} ageProfile={'adult' as never} />)
    expect(screen.getByRole('status').textContent).toMatch(/Carregando o seu perfil/)
  })
})

describe('Perfil no Quest: Progresso', () => {
  it('os quatro números, as conquistas (vazio com a saída), a curva sem dias e a fluência', async () => {
    render(<Perfil progress={progresso} ageProfile={'adult' as never} />)
    fireEvent.click(aba('Progresso'))
    await aguardar()
    const numeros = screen.getByTestId('numeros-do-perfil')
    expect(numeros.querySelectorAll('.q-num')).toHaveLength(4)
    expect(numeros.textContent).toContain('1.200')
    expect(numeros.textContent).toContain('Seeds')
    expect(numeros.textContent).toContain('Ofensiva')

    expect(screen.getByRole('heading', { name: 'Nenhuma conquista ainda' })).toBeTruthy()
    fireEvent.click(botao(/Revisar agora/))
    expect(nav.irPara).toHaveBeenCalledWith({ view: 'analysis', subTab: 'study' })
    fireEvent.click(botao(/Ver todas/))
    expect(nav.irPara).toHaveBeenCalledWith({ view: 'loja', lojaTab: 'conquistas' })

    expect(screen.getByText(/Ainda não há dias suficientes para desenhar uma curva/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Onde você está no idioma' })).toBeTruthy()
    expect(screen.getByTestId('fluencia-do-perfil')).toBeTruthy()
  })

  it('com dias suficientes, a curva e as subidas de nível', async () => {
    xp.historico = {
      xpTotal: 300,
      pontos: [
        { em: Date.UTC(2026, 8, 1, 12), xpNoPeriodo: 100, xpAcumulado: 100, nivel: 1 },
        { em: Date.UTC(2026, 8, 2, 12), xpNoPeriodo: 200, xpAcumulado: 300, nivel: 2 },
      ],
      marcos: [{ em: Date.UTC(2026, 8, 2, 12), nivel: 2 }],
    }
    const { container } = render(<Perfil progress={progresso} ageProfile={'adult' as never} />)
    fireEvent.click(aba('Progresso'))
    await aguardar()
    expect(container.querySelector('.qc-grafico')).not.toBeNull()
    expect(within(screen.getByRole('list', { name: 'Subidas de nível' })).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText(/Se a fórmula de pontos mudar, este gráfico muda junto/)).toBeTruthy()

    // O XP de cada dia só existia na dica do gráfico (hover): no headset, a mesma curva como tabela.
    fireEvent.click(botao(/Ver como tabela/))
    expect(container.querySelector('.qc-grafico')).toBeNull()
    const linhas = within(screen.getByRole('table', { name: 'XP por dia' })).getAllByRole('row')
    expect(linhas).toHaveLength(3)
    expect(linhas[0].textContent).toBe('DiaXP do diaTotal')
    // O dia mais recente primeiro: o do dia e o total.
    expect(linhas[1].textContent).toContain('+200 XP')
    expect(linhas[1].textContent).toContain('300 XP')
    expect(linhas[2].textContent).toContain('+100 XP')
    fireEvent.click(botao(/Ver gráfico/))
    expect(container.querySelector('.qc-grafico')).not.toBeNull()
  })

  it('sem dias suficientes para a curva, não oferece a tabela', async () => {
    render(<Perfil progress={progresso} ageProfile={'adult' as never} />)
    fireEvent.click(aba('Progresso'))
    await aguardar()
    expect(screen.queryByRole('button', { name: /Ver como tabela/ })).toBeNull()
  })
})

describe('Perfil no Quest: Seus dados', () => {
  it('onde ficam e "Baixar uma cópia"; quando o servidor não gera o arquivo, o erro aparece', async () => {
    render(<Perfil progress={progresso} ageProfile={'adult' as never} />)
    fireEvent.click(aba('Seus dados'))
    expect(screen.getByText('Onde ficam')).toBeTruthy()
    await act(async () => {
      fireEvent.click(botao(/Baixar/))
    })
    expect(api.exportarConta).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toMatch(/Não consegui gerar o arquivo agora/)
  })
})

/* ═════════════════════════════════════════ PLANOS ═════════════════════════════════════════ */
const abrirPlanos = async () => {
  const tela = render(<Planos />)
  await aguardar()
  return tela
}
const cartao = (id: 'gratis' | 'premium') => document.querySelector<HTMLElement>(`[data-plano="${id}"]`)!

describe('Planos no Quest: a aba Planos', () => {
  it('a conta agora, o período, os dois cartões, a comparação e as perguntas', async () => {
    const { container } = await abrirPlanos()
    expect(container.querySelector('.q-palco.qc')).not.toBeNull()
    expect(container.querySelector('.tela')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Planos' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual(['Planos', 'Consumo do mês'])

    expect(screen.getByRole('region', { name: 'Seu plano agora' }).textContent).toContain('Grátis')
    expect(
      screen.getByRole('heading', {
        name: 'Legenda bilíngue de qualquer coisa que você ouve, em qualquer aparelho',
      }),
    ).toBeTruthy()

    const periodo = within(screen.getByRole('radiogroup', { name: 'Período de cobrança' }))
    expect(periodo.getByRole('radio', { name: 'Mensal' }).getAttribute('aria-checked')).toBe('true')
    expect(cartao('premium').textContent).toContain('19,90')
    fireEvent.click(periodo.getByRole('radio', { name: /Anual/ }))
    expect(cartao('premium').textContent).toContain('179,00')
    expect(cartao('premium').textContent).toContain('economize R$ 59,80')

    expect(cartao('gratis').textContent).toContain('Tradução rápida ao vivo')
    expect(cartao('premium').textContent).toContain('Recomendado')
    // Um único botão principal na tela: o do cartão em destaque.
    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    expect(within(cartao('premium')).getByRole('button', { name: /Assinar Premium/ }).className).toContain('pri')
    expect(within(cartao('gratis')).getByRole('button', { name: 'Continuar grátis' })).toBeTruthy()

    const tabela = within(screen.getByRole('table'))
    expect(tabela.getByRole('rowheader', { name: /Tutor de IA/ })).toBeTruthy()
    expect(tabela.getAllByText('Incluído').length).toBeGreaterThan(3)
    expect(container.querySelectorAll('details.qc-faq')).toHaveLength(8)
    expect(screen.getByText('Posso cancelar quando quiser?')).toBeTruthy()
  })

  it('CDC: todo "sem limite no dia a dia" tem a nota do uso justo no mesmo item ou na mesma linha', async () => {
    await abrirPlanos()
    const diz = (e: Element) => /sem limite no dia a dia/.test(e.textContent ?? '')
    const onde = [...document.querySelectorAll<HTMLElement>('#painel-planos *')].filter(
      (e) => diz(e) && ![...e.children].some(diz),
    )
    expect(onde.length).toBeGreaterThanOrEqual(2)
    for (const e of onde) {
      const bloco = e.closest('li, tr') ?? e
      expect(bloco.textContent, bloco.outerHTML).toMatch(/uso justo/)
      expect(bloco.textContent).toMatch(/segue no aparelho/)
    }
    // Sem `%` nem "qualidade" na aba, como na tela de sempre.
    const painel = document.querySelector<HTMLElement>('#painel-planos')!
    expect(painel.textContent).not.toContain('%')
    expect(painel.textContent).not.toMatch(/qualidade/i)
  })

  it('o teste de 14 dias começa com um toque, e a tela diz até quando vale', async () => {
    const termina = new Date(2026, 9, 14, 15, 0).getTime()
    servidor.rotas = {
      '/api/billing/status': { configurado: true, assinatura: null, teste: { estado: 'disponivel', dias: 14 } },
      '/api/billing/teste': { teste: { iniciadoEm: 1, terminaEm: termina, dias: 14 } },
    }
    await abrirPlanos()
    const premium = within(cartao('premium'))
    expect(premium.getByRole('button', { name: 'Assinar Premium' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(premium.getByRole('button', { name: 'Testar 14 dias grátis' }))
    })
    expect(pedido('/api/billing/teste')).toBeTruthy()
    expect(await screen.findByText(/o Premium vale até 14\/10\/2026/)).toBeTruthy()
  })

  it('o período escolhido abre o checkout do headset já no anual', async () => {
    await abrirPlanos()
    fireEvent.click(screen.getByRole('radio', { name: /Anual/ }))
    await act(async () => {
      fireEvent.click(within(cartao('premium')).getByRole('button', { name: /Assinar Premium/ }))
    })
    expect(await screen.findByTestId('checkout-do-quest')).toBeTruthy()
    expect(botao(/Anual em uma vez/).getAttribute('aria-pressed')).toBe('true')
    expect(botao(/Mensal recorrente/).getAttribute('aria-pressed')).toBe('false')
    // O voltar diz para onde volta, à vista ("Planos"), e devolve a tela de Planos.
    expect(botao('Voltar para Planos').textContent).toContain('Planos')
    await act(async () => {
      fireEvent.click(botao('Voltar para Planos'))
    })
    expect(await screen.findByTestId('planos-do-quest')).toBeTruthy()
  })

  it('sem conta, o cartão leva ao login com a intenção guardada', async () => {
    ents.plan = 'anonimo'
    const aoEntrar = vi.fn()
    render(<Planos onEntrar={aoEntrar} />)
    await aguardar()
    fireEvent.click(within(cartao('premium')).getByRole('button', { name: 'Entrar e assinar o Premium' }))
    expect(aoEntrar).toHaveBeenCalledTimes(1)
  })

  it('fora do Quest, a tela de sempre', async () => {
    quest.ligado = false
    const { container } = await abrirPlanos()
    expect(container.querySelector('.q-palco')).toBeNull()
    expect(container.querySelector('.tela')).not.toBeNull()
    expect(container.querySelector('.plano2')).not.toBeNull()
  })
})

describe('Planos no Quest: Consumo do mês', () => {
  it('um cartão por contador, com barra só onde há teto, e a janela do mês', async () => {
    servidor.rotas['/api/me/uso'] = uso
    const { container } = await abrirPlanos()
    fireEvent.click(aba('Consumo do mês'))
    expect(container.querySelectorAll('.qc-consumo')).toHaveLength(3)
    expect(screen.getByRole('progressbar', { name: 'Áudio transcrito na nuvem' })).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Chamadas à IA de nuvem' })).toBeTruthy()
    // Sem teto NÃO vira barra vazia.
    expect(screen.queryByRole('progressbar', { name: 'Tokens de IA (tradução e tutor)' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Janela 2026-10' })).toBeTruthy()
  })

  it('enquanto os contadores não chegam, a tela DIZ que está carregando (não só no nome acessível)', async () => {
    servidor.rotas['/api/me/uso'] = uso
    let soltar = () => {}
    servidor.esperaDoUso = new Promise<void>((r) => (soltar = r))
    const { container } = await abrirPlanos()
    fireEvent.click(aba('Consumo do mês'))
    const espera = screen.getByRole('status')
    expect(espera.textContent).toContain('Carregando…')
    expect(espera.textContent).toContain('Buscando os contadores deste mês no servidor.')
    expect(container.querySelectorAll('.q-esqueleto')).toHaveLength(2)
    await act(async () => {
      soltar()
    })
    await waitFor(() => expect(container.querySelectorAll('.qc-consumo')).toHaveLength(3))
    expect(container.querySelector('.q-esqueleto')).toBeNull()
  })

  it('sem resposta do servidor, diz que não sabe o número', async () => {
    await abrirPlanos()
    fireEvent.click(aba('Consumo do mês'))
    expect(screen.getByRole('heading', { name: 'Consumo indisponível' })).toBeTruthy()
    expect(screen.getByText(/NÃO significa consumo zero/)).toBeTruthy()
  })
})

describe('Planos no Quest: Sua assinatura', () => {
  const abrirAssinatura = async () => {
    ents.plan = 'premium'
    servidor.rotas = {
      '/api/billing/status': statusAtivo,
      '/api/billing/faturas': { faturas: [faturaAntiga] },
    }
    const tela = await abrirPlanos()
    await act(async () => {
      fireEvent.click(aba('Sua assinatura'))
    })
    return tela
  }

  it('o resumo, as três ações com os diálogos de sempre, as faturas com o recibo', async () => {
    await abrirAssinatura()
    expect(screen.getAllByRole('tab').map((a) => a.textContent)).toEqual(['Planos', 'Sua assinatura', 'Consumo do mês'])
    const resumo = screen.getByRole('region', { name: 'Resumo da assinatura' })
    expect(resumo.textContent).toContain('Premium · mensal')
    expect(resumo.textContent).toContain('R$ 19,90 por mês')
    expect(resumo.textContent).toContain('22/10/2026')
    expect(resumo.textContent).toContain('Pix')

    fireEvent.click(botao(/Passar para o anual/))
    expect(screen.getByRole('dialog', { name: 'Passar para o anual' })).toBeTruthy()
    await fecharDialogo('Agora não')
    fireEvent.click(botao(/Forma de pagamento/))
    expect(screen.getByRole('dialog', { name: 'Forma de pagamento' })).toBeTruthy()
    await fecharDialogo('Cancelar')
    fireEvent.click(botao(/Pausar a assinatura/))
    expect(screen.getByRole('dialog', { name: 'Pausar a assinatura' })).toBeTruthy()
    await fecharDialogo('Cancelar')

    const faturas = within(screen.getByRole('list', { name: 'Faturas' }))
    expect(faturas.getAllByRole('listitem')).toHaveLength(1)
    expect(faturas.getByText('Paga')).toBeTruthy()
    fireEvent.click(faturas.getByRole('button', { name: /Recibo/ }))
    expect(screen.getByRole('dialog', { name: 'Recibo pay_1' })).toBeTruthy()
  })

  it('"Cancelar assinatura" abre o cancelamento do headset', async () => {
    await abrirAssinatura()
    await act(async () => {
      fireEvent.click(botao(/Cancelar assinatura/))
    })
    expect(await screen.findByTestId('cancelar-do-quest')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Cancelar assinatura' })).toBeTruthy()
  })

  it('fatura que falhou: "Tentar de novo" é a ação principal do bloco e abre a página da fatura', async () => {
    ents.plan = 'premium'
    servidor.rotas = {
      '/api/billing/status': { ...statusAtivo, assinatura: { ...statusAtivo.assinatura, status: 'past_due' } },
      '/api/billing/faturas': {
        faturas: [
          { ...faturaAntiga, id: 'pay_2', data: '2026-09-22', status: 'falhou', link: 'https://asaas.exemplo/i/2' },
          faturaAntiga,
        ],
      },
    }
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    await abrirPlanos()
    await act(async () => {
      fireEvent.click(aba('Sua assinatura'))
    })
    const faturas = within(screen.getByRole('list', { name: 'Faturas' }))
    const tentar = faturas.getByRole('button', { name: /Tentar de novo/ })
    expect(tentar.className).toContain('pri')
    // A única principal das faturas: o recibo da que foi paga continua de contorno.
    expect(faturas.getAllByRole('button').filter((b) => b.className.includes('pri'))).toHaveLength(1)
    fireEvent.click(tentar)
    expect(abrir).toHaveBeenCalledWith('https://asaas.exemplo/i/2', '_blank', 'noopener')
  })

  it('faturas que o servidor não entregou: a tela diz que não sabe', async () => {
    ents.plan = 'premium'
    servidor.rotas = { '/api/billing/status': statusAtivo }
    await abrirPlanos()
    await act(async () => {
      fireEvent.click(aba('Sua assinatura'))
    })
    expect(screen.getByText(/Não consegui buscar as faturas agora/)).toBeTruthy()
  })
})

/* ═══════════════════════════ CHECKOUT, CONFIRMAÇÃO, CANCELAMENTO ═══════════════════════════ */
describe('Checkout no Quest', () => {
  const montarCheckout = (extra: Partial<React.ComponentProps<typeof Checkout>> = {}) =>
    render(
      <Checkout
        plano="premium"
        aoTrocarPlano={() => {}}
        plan="free"
        conta={contaGratis}
        status={{ configurado: true, assinatura: null }}
        {...extra}
      />,
    )

  it('os dois passos, o resumo sempre à vista, e o pagamento pelo mesmo caminho', async () => {
    servidor.rotas['/api/billing/assinar'] = { linkDePagamento: 'https://sandbox.asaas.com/i/1' }
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    const { container } = montarCheckout()
    await aguardar()
    expect(container.querySelector('.q-palco.qc')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: 'Assinar o Premium' })).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Etapas' }).querySelector('[aria-current="step"]')!.textContent).toContain(
      'Plano e período',
    )
    const resumo = screen.getByRole('complementary', { name: 'Resumo do pedido' })
    expect(resumo.textContent).toContain('Total hoje')
    expect(resumo.textContent).toContain('R$ 19,90')

    // As três formas de pagar; a escolha muda o resumo.
    expect(botao(/Mensal recorrente/).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(botao(/Anual em 12x no cartão/))
    expect(resumo.textContent).toContain('Por mês no cartão')
    fireEvent.click(botao(/Mensal recorrente/))

    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    fireEvent.click(botao(/Ir para o pagamento/))
    expect(screen.getByRole('list', { name: 'Etapas' }).querySelector('[aria-current="step"]')!.textContent).toContain(
      'Pagamento',
    )

    // CPF incompleto não chega ao servidor.
    fireEvent.change(campo('Nome completo'), { target: { value: 'Ana Souza' } })
    fireEvent.change(campo('CPF'), { target: { value: '123' } })
    fireEvent.change(campo('E-mail para o recibo'), { target: { value: 'ana@exemplo.com' } })
    fireEvent.click(botao(/Assinar e pagar/))
    expect(await screen.findByText('O CPF tem 11 dígitos.')).toBeTruthy()
    expect(pedido('/api/billing/assinar')).toBeUndefined()

    fireEvent.change(campo('CPF'), { target: { value: '12345678901' } })
    expect(campo('CPF').value).toBe('123.456.789-01')
    await act(async () => {
      fireEvent.click(botao(/Assinar e pagar/))
    })
    await waitFor(() => expect(abrir).toHaveBeenCalledWith('https://sandbox.asaas.com/i/1', '_blank', 'noopener'))
    expect(JSON.parse(String(pedido('/api/billing/assinar')!.init?.body))).toEqual({
      plano: 'premium',
      nome: 'Ana Souza',
      cpfCnpj: '12345678901',
      email: 'ana@exemplo.com',
      ciclo: 'mensal',
      meio: 'assinatura',
    })
    expect(screen.getByText(/Aguardando a confirmação do pagamento/)).toBeTruthy()
    fireEvent.click(botao(/Abrir a página de pagamento de novo/))
    expect(abrir).toHaveBeenCalledTimes(2)
  })

  it('sem conta: o passo de pagamento diz por quê e leva ao login', async () => {
    const aoEntrar = vi.fn()
    montarCheckout({ plan: 'anonimo', aoEntrar })
    await aguardar()
    fireEvent.click(botao(/Ir para o pagamento/))
    expect(screen.getByRole('heading', { name: 'Entre na sua conta para assinar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Assinar e pagar/ })).toBeNull()
    fireEvent.click(botao(/Entrar ou criar conta/))
    expect(aoEntrar).toHaveBeenCalledTimes(1)
    fireEvent.click(botao(/Voltar$/))
    expect(botao(/Ir para o pagamento/)).toBeTruthy()
  })

  it('o teste de 14 dias continua oferecido no checkout', async () => {
    montarCheckout({ status: { configurado: true, assinatura: null, teste: { estado: 'disponivel', dias: 14 } } })
    await aguardar()
    expect(botao(/Testar 14 dias grátis/).className).toContain('q-ctl')
  })

  it('fora do Quest, o checkout de sempre', async () => {
    quest.ligado = false
    const { container } = montarCheckout()
    await aguardar()
    expect(container.querySelector('.q-palco')).toBeNull()
    expect(container.querySelector('.checkout-grade')).not.toBeNull()
  })
})

describe('Assinatura confirmada no Quest', () => {
  it('não comemora se o servidor não disser active', async () => {
    servidor.rotas['/api/billing/status'] = {
      configurado: true,
      assinatura: { plano: 'premium', status: 'trialing', valeAte: null },
    }
    render(<Assinado />)
    expect(await screen.findByRole('heading', { name: 'Ainda não recebemos a confirmação' })).toBeTruthy()
    expect(screen.getByTestId('assinado-do-quest')).toBeTruthy()
    expect(screen.queryByText(/Bem-vindo/)).toBeNull()
    expect(botao('Ver planos')).toBeTruthy()
  })

  it('comemora quando o servidor confirma, com o que ficou liberado e os dois caminhos', async () => {
    servidor.rotas = { '/api/billing/status': statusAtivo, '/api/billing/faturas': { faturas: [] } }
    const { container } = render(<Assinado />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Bem-vindo ao Premium!' })).toBeTruthy()
    expect(container.querySelectorAll('.q-ctl.pri')).toHaveLength(1)
    expect(screen.getByText(/Tutor de IA \(iChat\)/)).toBeTruthy()
    fireEvent.click(botao(/Começar a usar/))
    expect(nav.navegarPara).toHaveBeenCalledWith({ view: 'capture' })
    expect(botao(/Ver minha assinatura/)).toBeTruthy()
  })
})

describe('Cancelar no Quest', () => {
  it('os passos (o que muda, motivo, oferta, confirmar) e o cancelamento só na confirmação', async () => {
    servidor.rotas['/api/billing/cancelar'] = { ok: true, valeAte: VALE_ATE }
    const aoReativar = vi.fn()
    const aoCancelado = vi.fn()
    const { container } = render(
      <Cancelar conta={contaAtiva} faturas={[]} aoCancelado={aoCancelado} aoReativar={aoReativar} />,
    )
    expect(container.querySelector('.q-palco.qc')).not.toBeNull()
    expect(botao('Voltar para Planos').textContent).toContain('Planos')
    expect(screen.getByRole('heading', { name: 'Antes de cancelar, veja o que muda' })).toBeTruthy()
    expect(screen.getByText('Você deixa de ter')).toBeTruthy()
    expect(screen.getByText('O Premium até 22/10/2026')).toBeTruthy()
    expect(botao(/Pausar a assinatura/)).toBeTruthy()
    expect(botao('Manter o Premium').className).toContain('pri')

    fireEvent.click(botao(/Continuar cancelamento/))
    expect(screen.getByRole('heading', { name: 'Por que você está cancelando?' })).toBeTruthy()
    expect((botao(/^Continuar/) as HTMLButtonElement).disabled).toBe(true)
    expect(botao('Pular')).toBeTruthy()
    fireEvent.click(botao('Tive problemas técnicos'))
    expect(botao('Tive problemas técnicos').getAttribute('aria-pressed')).toBe('true')
    expect(campo('Quer contar mais? (opcional)')).toBeTruthy()
    fireEvent.click(botao(/^Continuar/))

    // A oferta coerente com o motivo leva ao suporte; "Não, quero cancelar" tem o mesmo peso.
    expect(screen.getByRole('heading', { name: 'Podemos resolver isso?' })).toBeTruthy()
    fireEvent.click(botao(/Falar com o suporte/))
    expect(nav.navegarPara).toHaveBeenCalledWith({ view: 'ajuda' })
    fireEvent.click(botao(/Não, quero cancelar/))

    expect(screen.getByRole('heading', { name: 'Confirme o cancelamento' })).toBeTruthy()
    expect(pedido('/api/billing/cancelar')).toBeUndefined()
    await act(async () => {
      fireEvent.click(botao(/Confirmar cancelamento/))
    })
    expect(await screen.findByRole('heading', { name: 'Assinatura cancelada' })).toBeTruthy()
    expect(servidor.chamadas.filter((c) => c.url === '/api/billing/cancelar')).toHaveLength(1)
    expect(aoCancelado).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Pronto' })).toBeTruthy()
    fireEvent.click(botao(/Reativar o Premium/))
    expect(aoReativar).toHaveBeenCalledTimes(1)
  })

  it('dentro dos 7 dias: avisa o reembolso integral e confirma com protocolo', async () => {
    servidor.rotas['/api/billing/cancelar'] = {
      ok: true,
      valeAte: null,
      arrependimento: { valor: 19.9, estornado: true, protocolo: 'arrependimento:pay_1', registradoEm: Date.now() },
    }
    const recente = [{ ...faturaAntiga, data: new Date().toISOString().slice(0, 10) }]
    render(<Cancelar conta={contaAtiva} faturas={recente as never} aoCancelado={() => {}} aoReativar={() => {}} />)
    fireEvent.click(botao(/Continuar cancelamento/))
    fireEvent.click(botao('Pular'))
    expect(screen.getByText(/reembolso integral de R\$ 19,90/)).toBeTruthy()
    await act(async () => {
      fireEvent.click(botao(/Confirmar cancelamento/))
    })
    expect(await screen.findByRole('heading', { name: 'Reembolso solicitado' })).toBeTruthy()
    expect(screen.getByText('arrependimento:pay_1')).toBeTruthy()
  })

  it('sem assinatura para cancelar, a tela diz isso e volta aos planos', () => {
    render(<Cancelar conta={contaGratis} faturas={[]} aoCancelado={() => {}} aoReativar={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Não há assinatura para cancelar' })).toBeTruthy()
    expect(botao(/Ver planos/)).toBeTruthy()
  })
})

/* ═════════════════════════════════════════ AVISOS ═════════════════════════════════════════ */
describe('Os avisos de conta no Quest', () => {
  it('"Isto precisa de conta": no centro, com as três saídas; o Esc fecha', async () => {
    const aoFechar = vi.fn()
    const aoEntrar = vi.fn()
    render(<GateDeConta aberto motivo="Importar precisa de conta." onFechar={aoFechar} onEntrar={aoEntrar} />)
    // Entre o toque e a chegada do desenho do headset, a tela responde: uma espera visível.
    expect(screen.getByRole('status').textContent).toContain('Carregando…')
    const caixa = await screen.findByRole('dialog', { name: 'Isto precisa de conta' })
    expect(caixa.className).toContain('qc-caixa')
    expect(caixa.textContent).toContain('Importar precisa de conta.')
    await waitFor(() => expect(document.activeElement).toBe(botao('Entrar ou criar conta')))
    fireEvent.click(botao('Entrar ou criar conta'))
    expect(aoEntrar).toHaveBeenCalledTimes(1)
    fireEvent.click(botao('Continuar sem conta'))
    fireEvent.click(botao('Fechar'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(aoFechar).toHaveBeenCalledTimes(3)
  })

  it('"Isto precisa de conta" na edição estática: informa e a única saída é fechar', async () => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
    const aoFechar = vi.fn()
    render(
      <GateDeConta aberto motivo="A biblioteca fica na versão completa." onFechar={aoFechar} onEntrar={() => {}} />,
    )
    expect(await screen.findByRole('dialog', { name: 'Disponível na versão completa' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Entrar ou criar conta' })).toBeNull()
    fireEvent.click(botao('Entendi'))
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('fechado, o aviso não existe; fora do Quest, o modal de sempre', () => {
    const { container, rerender } = render(
      <GateDeConta aberto={false} motivo="" onFechar={() => {}} onEntrar={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
    quest.ligado = false
    rerender(<GateDeConta aberto motivo="x" onFechar={() => {}} onEntrar={() => {}} />)
    expect(screen.getByRole('dialog').className).toContain('card-panel')
  })

  it('o aviso por marco de uso: as duas saídas e a dispensa', async () => {
    marcos.avisoPendente.mockReturnValue({
      marco: 'segunda-sessao',
      titulo: 'Suas sessões estão só neste navegador',
      texto: 'Crie uma conta para não perder.',
    })
    const aoEntrar = vi.fn()
    render(<AvisoDeConta metrics={null} onEntrar={aoEntrar} />)
    const aviso = await screen.findByTestId('aviso-de-conta')
    expect(aviso.className).toContain('q-aviso')
    expect(aviso.textContent).toContain('Suas sessões estão só neste navegador')
    fireEvent.click(botao('Criar conta ou entrar'))
    expect(aoEntrar).toHaveBeenCalledTimes(1)
    fireEvent.click(botao('Agora não'))
    expect(marcos.marcarVisto).toHaveBeenCalledWith('segunda-sessao')
    expect(screen.queryByTestId('aviso-de-conta')).toBeNull()
  })

  it('o card de planos: ver planos e dispensar, com o preço da matriz', async () => {
    const aoVer = vi.fn()
    render(<CardDePlanos onVerPlanos={aoVer} />)
    const card = await screen.findByTestId('card-de-planos')
    expect(card.className).toContain('q-aviso')
    expect(card.textContent).toMatch(/Planos a partir de R\$ 19,90\/mês/)
    fireEvent.click(botao('Ver planos'))
    expect(aoVer).toHaveBeenCalledTimes(1)
    fireEvent.click(botao('Dispensar este aviso de planos'))
    expect(screen.queryByTestId('card-de-planos')).toBeNull()
    expect(localStorage.getItem('babel.card_planos_dispensado')).toBe('1')
  })

  it('o pagamento atrasado: a frase, "Ver minha assinatura" e a dispensa da sessão', async () => {
    ents.plan = 'premium'
    definirIdentidade('conta')
    servidor.rotas['/api/billing/status'] = {
      configurado: true,
      assinatura: { plano: 'premium', status: 'past_due', valeAte: null, provedor: 'asaas' },
    }
    render(<AvisoDePagamentoAtrasado />)
    const aviso = await screen.findByTestId('aviso-de-pagamento-atrasado')
    expect(aviso.className).toContain('q-aviso')
    expect(aviso.className).toContain('qc-topo')
    expect(aviso.textContent).toContain('Pague a fatura para continuar com o Premium.')
    fireEvent.click(botao('Ver minha assinatura'))
    expect(nav.navegarPara).toHaveBeenCalledWith({ view: 'planos', planosTela: 'assinatura' })
    fireEvent.click(botao('Dispensar aviso'))
    expect(screen.queryByTestId('aviso-de-pagamento-atrasado')).toBeNull()
  })

  it('conta de menor à espera do responsável: o convite por e-mail, o erro e o resultado', async () => {
    idade.convidarResponsavel.mockResolvedValue({
      ok: true,
      enviado: true,
      expiraEm: Date.now() + 1000,
      emailMascarado: 'm***@exemplo.com',
    })
    const estado = {
      nascimentoInformado: true,
      faixa: '12-15',
      protegido: true,
      exigeResponsavel: true,
      exigeConsentimentoEspecifico: false,
      vinculo: { estado: 'nenhum' },
      restrita: true,
    }
    render(<AvisoDoResponsavel estado={estado as never} />)
    const aviso = screen.getByTestId('aviso-do-responsavel')
    expect(aviso.className).toContain('q-cartao')
    expect(screen.getByRole('heading', { name: 'Falta vincular a conta ao seu responsável' })).toBeTruthy()

    const email = campo('E-mail do seu responsável')
    fireEvent.change(email, { target: { value: 'nao-e-email' } })
    await act(async () => {
      fireEvent.submit(email.closest('form')!)
    })
    expect(screen.getByRole('alert').textContent).toMatch(/Confira o e-mail/)
    expect(idade.convidarResponsavel).not.toHaveBeenCalled()

    fireEvent.change(email, { target: { value: 'mae@exemplo.com' } })
    await act(async () => {
      fireEvent.submit(email.closest('form')!)
    })
    expect(idade.convidarResponsavel).toHaveBeenCalledWith('mae@exemplo.com')
    expect(screen.getByRole('status').textContent).toContain('Convite enviado para m***@exemplo.com')
  })

  it('guardar na conta o que ficou no navegador: o inventário, a subida e o resultado', async () => {
    migracao.inventarioLocal.mockResolvedValue({ sessoes: 2, cartoes: 5, comAudio: 1, rodadas: 3 })
    migracao.migrarParaConta.mockResolvedValue({
      sessoes: 2,
      jaExistiam: 0,
      audios: 1,
      cartoes: 5,
      audiosPendentes: 1,
      falhas: [],
    })
    const aoFechar = vi.fn()
    const aoMigrar = vi.fn()
    render(<ModalDeMigracao aberto onFechar={aoFechar} onMigrou={aoMigrar} />)
    const caixa = screen.getByRole('dialog', { name: 'Guardar na sua conta o que ficou neste navegador' })
    expect(caixa.className).toContain('qc-caixa')
    await waitFor(() => expect(caixa.textContent).toMatch(/Encontrei 2 sessões \(1 com áudio\) e 5 cartões/))
    expect(caixa.textContent).toMatch(/3 rodadas jogadas sem conta não sobem/)
    expect(botao('Agora não')).toBeTruthy()
    await act(async () => {
      fireEvent.click(botao('Guardar na conta'))
    })
    expect(migracao.migrarParaConta).toHaveBeenCalledTimes(1)
    expect(aoMigrar).toHaveBeenCalledTimes(1)
    expect(caixa.textContent).toMatch(/Subiram 2 sessões novas, 1 áudios e 5 cartões/)
    expect(caixa.textContent).toMatch(/não couberam no seu plano/)
    fireEvent.click(within(caixa).getAllByRole('button', { name: 'Fechar' })[1])
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })

  it('a oferta que não bloqueia: as três saídas, o fechar e o Esc', async () => {
    const aoAgir = vi.fn()
    const aoDispensar = vi.fn()
    const aoNaoMostrar = vi.fn()
    render(
      <CartaoDeOferta
        tom="alerta"
        icone={CloudOff}
        titulo="A IA de nuvem do seu plano acabou neste mês"
        texto="A legenda segue no aparelho."
        cta="Ver planos"
        selo="Sugerido: Premium"
        aoAgir={aoAgir}
        aoDispensar={aoDispensar}
        aoNaoMostrar={aoNaoMostrar}
      />,
    )
    const cartaoDaOferta = await screen.findByTestId('cartao-de-oferta')
    expect(cartaoDaOferta.className).toContain('qc-oferta')
    expect(cartaoDaOferta.getAttribute('role')).toBe('status')
    expect(cartaoDaOferta.textContent).toContain('Sugerido: Premium')
    fireEvent.click(botao('Ver planos'))
    expect(aoAgir).toHaveBeenCalledTimes(1)
    fireEvent.click(botao('Não mostrar novamente'))
    expect(aoNaoMostrar).toHaveBeenCalledTimes(1)
    fireEvent.click(botao('Agora não'))
    fireEvent.click(botao('Dispensar aviso'))
    await waitFor(() => {
      fireEvent.keyDown(cartaoDaOferta, { key: 'Escape' })
      expect(aoDispensar.mock.calls.length).toBeGreaterThanOrEqual(3)
    })
  })
})

/* ═══════════════ O DESENHO DO HEADSET QUE NÃO CHEGA (aba de antes de um deploy, sem rede) ═══════════════
   Estes componentes moram no pacote inicial e buscam o ramo do Quest sob demanda. Se o arquivo não
   chegar, NADA recarrega a página: vale o desenho de sempre, que já está no pacote. */
describe('Quando o desenho do headset não chega', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.doUnmock('../src/components/conta/quest/GateDeContaDoQuest')
    vi.doUnmock('../src/components/conta/quest/FaixaDeAvisoDoQuest')
    vi.doUnmock('../src/components/ofertas/quest/CartaoDeOfertaDoQuest')
  })
  const falhar = () => {
    throw new Error('Failed to fetch dynamically imported module')
  }

  it('nenhum dos cinco usa o `lazy` que recarrega a página quando o arquivo falha', () => {
    for (const arquivo of [
      'src/components/conta/GateDeConta.tsx',
      'src/components/conta/PerguntaDeIdade.tsx',
      'src/components/conta/AvisoDeConta.tsx',
      'src/components/CardDePlanos.tsx',
      'src/components/ofertas/CartaoDeOferta.tsx',
    ]) {
      const fonte = readFileSync(arquivo, 'utf8')
      expect(fonte, arquivo).not.toContain('lazyComRecarga')
      expect(fonte, arquivo).toContain('usePedacoDoQuest')
    }
  })

  it('"Isto precisa de conta" cai no aviso de sempre, com as mesmas saídas', async () => {
    vi.doMock('../src/components/conta/quest/GateDeContaDoQuest', falhar)
    const { default: Gate } = await import('../src/components/conta/GateDeConta')
    const aoEntrar = vi.fn()
    render(<Gate aberto motivo="Importar precisa de conta." onFechar={() => {}} onEntrar={aoEntrar} />)
    const caixa = await screen.findByRole('dialog', { name: 'Isto precisa de conta' })
    expect(caixa.className).toContain('card-panel')
    fireEvent.click(botao('Entrar ou criar conta'))
    expect(aoEntrar).toHaveBeenCalledTimes(1)
  })

  it('a oferta cai no cartão de sempre, e o Esc continua dispensando', async () => {
    vi.doMock('../src/components/ofertas/quest/CartaoDeOfertaDoQuest', falhar)
    const { default: Cartao } = await import('../src/components/ofertas/CartaoDeOferta')
    const aoDispensar = vi.fn()
    render(
      <Cartao
        tom="acento"
        icone={CloudOff}
        titulo="Você está indo longe"
        texto="Com o Premium a tradução de nuvem vem junto."
        cta="Ver planos"
        aoAgir={() => {}}
        aoDispensar={aoDispensar}
        aoNaoMostrar={() => {}}
      />,
    )
    const cartaoDaOferta = await screen.findByTestId('cartao-de-oferta')
    expect(cartaoDaOferta.className).not.toContain('qc-oferta')
    expect(cartaoDaOferta.className).toContain('fixed')
    await waitFor(() => {
      fireEvent.keyDown(cartaoDaOferta, { key: 'Escape' })
      expect(aoDispensar).toHaveBeenCalled()
    })
  })

  it('o aviso de conta e o card de planos caem no desenho de sempre', async () => {
    vi.doMock('../src/components/conta/quest/FaixaDeAvisoDoQuest', falhar)
    marcos.avisoPendente.mockReturnValue({ marco: 'segunda-sessao', titulo: 'Suas sessões', texto: 'Crie uma conta.' })
    const { default: Aviso } = await import('../src/components/conta/AvisoDeConta')
    const { default: Card } = await import('../src/components/CardDePlanos')
    render(
      <>
        <Aviso metrics={null} onEntrar={() => {}} />
        <Card onVerPlanos={() => {}} />
      </>,
    )
    expect((await screen.findByTestId('aviso-de-conta')).className).not.toContain('q-aviso')
    expect((await screen.findByTestId('card-de-planos')).className).toContain('card-panel')
  })
})
