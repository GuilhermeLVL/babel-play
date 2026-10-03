// @vitest-environment jsdom
/**
 * O USO JUSTO DO DIA NA TELA (`uso.hoje`): o medidor "Hoje" em Planos → Consumo do mês e o aviso
 * discreto (uma vez por dia, a partir de 80 %) na captura PARADA.
 *
 * Regras de `docs/ofertas.md` que valem aqui: nada de venda, nada por cima da captura ou da rodada,
 * sem "%" nem "qualidade" na tela, e o "sem limite" nunca sozinho (a nota do uso justo vem junto).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const usoDoServidor = vi.hoisted(() => ({
  valor: null as unknown,
  chamadas: 0,
}))

vi.mock('../src/data/api', () => ({
  apiFetch: vi.fn(async (url: string) => {
    if (url.includes('/api/me/uso')) {
      usoDoServidor.chamadas++
      return { ok: true, status: 200, json: async () => usoDoServidor.valor }
    }
    if (url.includes('/api/billing/status'))
      return { ok: true, status: 200, json: async () => ({ configurado: true, assinatura: null }) }
    return { ok: false, status: 404, json: async () => ({}) }
  }),
}))
vi.mock('../src/data/rotas/idade', () => ({
  lerAbertura: async () => ({ cadastro: true, checkout: true }),
  declararNascimento: vi.fn(),
  carregarProtecao: async () => null,
  ehFalha: (r: { ok: boolean }) => r.ok === false,
}))
vi.mock('../src/lib/entitlements', async (original) => {
  const real = (await original()) as typeof import('../src/lib/entitlements')
  const ents = {
    plan: 'premium',
    youtubeImport: true,
    managedCloudStt: true,
    managedCloudLlm: true,
    largerModels: true,
    traducaoNuance: true,
    vozNatural: false,
    armazenamento: null,
    teste: null,
  }
  return { ...real, getEntitlements: () => ents, carregarEntitlements: async () => ents }
})

const contador = (usado: number, teto: number | null) => ({ usado, teto })

function uso(hoje: unknown) {
  return {
    plano: 'premium',
    janela: '2026-10',
    chamadas: contador(10, 4000),
    segundosDeAudio: contador(3600, 144_000),
    tokensDeLlm: contador(1000, 4_000_000),
    hoje,
  }
}

const hojeCom = (segundos: number, tokens = 1000) => ({
  janela: '2026-10-03',
  fuso: 'America/Sao_Paulo',
  segundosDeAudio: contador(segundos, 7200),
  tokensDeLlm: contador(tokens, 400_000),
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  usoDoServidor.chamadas = 0
})
afterEach(() => {
  cleanup()
  vi.resetModules()
  window.history.replaceState({}, '', '/')
})

describe('Planos → Consumo do mês: o medidor "Hoje"', () => {
  async function abrirConsumo() {
    const { default: Planos } = await import('../src/components/views/Planos')
    render(<Planos />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Consumo do mês' }))
  }

  it('mostra a nuvem de hoje contra o teto de 2 h, ao lado dos do mês, com a nota do uso justo', async () => {
    usoDoServidor.valor = uso(hojeCom(5400))
    await abrirConsumo()
    const medidor = await screen.findByRole('progressbar', { name: 'Nuvem hoje' })
    expect(medidor.getAttribute('aria-valuetext')).toBe('1 h 30 min de 2 h')
    expect(medidor.getAttribute('aria-valuenow')).toBe('75')
    // os do mês continuam lá
    expect(screen.getByRole('progressbar', { name: 'Áudio transcrito na nuvem' })).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'IA hoje (tradução e tutor)' })).toBeTruthy()
    const nota = screen.getByTestId('uso-justo-do-dia').textContent ?? ''
    expect(nota).toContain('até 2 h de nuvem por dia e 40 h por mês; passando disso, a legenda segue no aparelho')
    // sem "%" e sem "qualidade" no texto da tela
    expect(document.body.textContent).not.toMatch(/%|qualidade/i)
  })

  it('sem `hoje` (plano sem teto no dia), nenhum medidor do dia e nenhuma nota', async () => {
    usoDoServidor.valor = uso(null)
    await abrirConsumo()
    await screen.findByRole('progressbar', { name: 'Áudio transcrito na nuvem' })
    expect(screen.queryByRole('progressbar', { name: 'Nuvem hoje' })).toBeNull()
    expect(screen.queryByTestId('uso-justo-do-dia')).toBeNull()
  })
})

describe('lib/avisoDoUsoDoDia: quando vale o recado', () => {
  it('só a partir de 80 %, pelo contador do dia mais cheio', async () => {
    const { avisoDoDia } = await import('../src/lib/avisoDoUsoDoDia')
    expect(avisoDoDia(uso(hojeCom(5000)) as never)).toBeNull() // 69 %
    expect(avisoDoDia(uso(hojeCom(5760)) as never)).toMatchObject({ contador: 'nuvem', esgotado: false })
    expect(avisoDoDia(uso(hojeCom(7200)) as never)).toMatchObject({ contador: 'nuvem', esgotado: true })
    expect(avisoDoDia(uso(hojeCom(100, 380_000)) as never)).toMatchObject({ contador: 'ia', esgotado: false })
    expect(avisoDoDia(uso(null) as never)).toBeNull()
    expect(avisoDoDia(null)).toBeNull()
  })

  it('uma vez por dia: depois de marcado, não pergunta nem repete', async () => {
    const lib = await import('../src/lib/avisoDoUsoDoDia')
    usoDoServidor.valor = uso(hojeCom(6000))
    expect(await lib.verificarUsoDoDia()).not.toBeNull()
    lib.marcarAvisoDoDia()
    expect(await lib.verificarUsoDoDia()).toBeNull()
  })

  it('a pergunta à rede é espaçada', async () => {
    const lib = await import('../src/lib/avisoDoUsoDoDia')
    usoDoServidor.valor = uso(hojeCom(100))
    await lib.verificarUsoDoDia(1_000_000)
    await lib.verificarUsoDoDia(1_000_000 + 60_000)
    expect(usoDoServidor.chamadas).toBe(1)
    await lib.verificarUsoDoDia(1_000_000 + lib.ESPACO_ENTRE_CHECAGENS_MS + 1)
    expect(usoDoServidor.chamadas).toBe(2)
  })

  it('não repete o que o 429 já avisou hoje', async () => {
    const lib = await import('../src/lib/avisoDoUsoDoDia')
    const { avisarUsoJustoDoDia, _esquecerUsoJusto } = await import('../src/lib/usoJustoDoDia')
    _esquecerUsoJusto()
    usoDoServidor.valor = uso(hojeCom(7000))
    avisarUsoJustoDoDia()
    expect(await lib.verificarUsoDoDia()).toBeNull()
    expect(usoDoServidor.chamadas).toBe(0)
  })
})

describe('o aviso na captura parada', () => {
  async function montar() {
    const { default: Aviso } = await import('../src/components/views/captura/AvisoDoUsoDoDia')
    render(<Aviso />)
  }

  it('perto do teto: um recado funcional, sem venda e sem "%", dispensável', async () => {
    usoDoServidor.valor = uso(hojeCom(6200))
    await montar()
    const aviso = await screen.findByTestId('aviso-do-uso-do-dia')
    expect(aviso.getAttribute('role')).toBe('status')
    expect(aviso.textContent).toContain('A nuvem de hoje está perto do limite: 1 h 43 min de 2 h')
    expect(aviso.textContent).toContain('a legenda segue no aparelho')
    expect(aviso.textContent).not.toMatch(/%|Premium|assin|plano/i)
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar aviso' }))
    expect(screen.queryByTestId('aviso-do-uso-do-dia')).toBeNull()
  })

  it('no teto: diz que volta amanhã', async () => {
    usoDoServidor.valor = uso(hojeCom(7200))
    await montar()
    expect((await screen.findByTestId('aviso-do-uso-do-dia')).textContent).toContain('volta amanhã')
  })

  it('abaixo de 80 %: nada', async () => {
    usoDoServidor.valor = uso(hojeCom(3000))
    await montar()
    await waitFor(() => expect(usoDoServidor.chamadas).toBe(1))
    expect(screen.queryByTestId('aviso-do-uso-do-dia')).toBeNull()
  })

  it('uma vez por dia: o segundo aparecimento no mesmo dia não mostra', async () => {
    usoDoServidor.valor = uso(hojeCom(6200))
    await montar()
    await screen.findByTestId('aviso-do-uso-do-dia')
    cleanup()
    await montar()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByTestId('aviso-do-uso-do-dia')).toBeNull()
  })
})

describe('onde o aviso mora', () => {
  it('só no aviso do fim de `LiveCapture`, que não existe gravando nem abrindo a captura', async () => {
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync('src/components/views/LiveCapture.tsx', 'utf8')
    expect(fonte).toMatch(/!isRecording && !abrindoCaptura \? \(\s*\/\*[\s\S]*?<AvisoDoUsoDoDia \/>/)
  })
})

describe('o pacote inicial', () => {
  it('o gate de conta, o host das ofertas, a pergunta de idade e o convite saem do import estático do App', async () => {
    const { readFileSync } = await import('node:fs')
    const app = readFileSync('src/App.tsx', 'utf8')
    for (const modulo of [
      'conta/GateDeConta',
      'ofertas/HostDeOfertas',
      'conta/PerguntaDeIdade',
      'conta/CartaoDeConvite',
    ])
      expect(app, modulo).not.toMatch(new RegExp(`^import .* from '\\./components/${modulo}'`, 'm'))
    // o gate só desce quando o evento abre (`gate !== null`), sem recarregar a página se o arquivo falhar
    expect(app).toMatch(/usePedacoDoQuest\(carregarGateDeConta, gate !== null\)/)
    expect(app).not.toMatch(/lazyComRecarga\(\(\) => import\('\.\/components\/conta\/GateDeConta'\)\)/)
  })
})

describe('IChat: o aviso de plano aponta para a tela Planos', () => {
  it('o link interno leva a /plano sem recarregar a página', async () => {
    const { TextoDoChat } = await import('../src/components/ichat/textoDoChat')
    render(
      <TextoDoChat texto="**O tutor de IA faz parte dos planos pagos.** Veja como assinar na tela [Planos](/plano)." />,
    )
    const link = screen.getByRole('link', { name: 'Planos' })
    expect(link.getAttribute('href')).toBe('/plano')
    expect(link.getAttribute('target')).toBeNull()
    fireEvent.click(link)
    expect(window.location.pathname).toBe('/plano')
  })

  it('nenhum texto do tutor manda para "Ajustes → Plano"', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('src/components/IChat.tsx', 'utf8')).not.toContain('Ajustes → Plano')
  })
})
