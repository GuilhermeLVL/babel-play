// @vitest-environment jsdom
/**
 * O FIM DO TESTE DE 14 DIAS NAS OFERTAS (C6) — o momento `fim_do_teste`, em D-3 e em D0.
 *
 * É FUNCIONAL, não promocional: informa um fato da conta ("o teste termina em 3 dias", "termina
 * hoje") e que nada será cobrado. Vale com a flag `oferta_planos` desligada, com os textos embutidos,
 * e o botão leva a Planos sem destacar venda nenhuma. Só dispara para quem está NO TESTE (o fim vem
 * de `GET /api/me/entitlements`): o Premium pago nunca ouve isso.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GATILHOS_FUNCIONAIS, momentoFuncional } from '../src/core/ofertas'
import { decidirOferta, HISTORICO_VAZIO } from '../src/lib/ofertas/motor'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const DIA = 86_400_000

const estado = vi.hoisted(() => ({
  teste: null as { terminaEm: number } | null,
  plan: 'premium',
}))

vi.mock('../src/lib/flags', () => ({
  useFlag: () => false,
  useConfigRemota: () => ({ gatilhos: [] }),
  ehConfigDeOfertas: () => true,
}))
vi.mock('../src/lib/ofertas/plano', () => ({ planoDaOferta: () => 'premium' }))
vi.mock('../src/lib/ofertas/cota', () => ({ verificarCota: async () => null }))
vi.mock('../src/lib/identidade', () => ({ estadoDeIdentidade: () => 'conta', estaAnonimo: () => false }))
vi.mock('../src/lib/entitlements', async (original) => {
  const real = await original<typeof import('../src/lib/entitlements')>()
  return { ...real, getEntitlements: () => ({ ...real.getEntitlements(), plan: estado.plan, teste: estado.teste }) }
})

const { faseDoFimDoTeste, faseDoTesteAgora } = await import('../src/lib/ofertas/fimDoTeste')
const { default: HostDeOfertas } = await import('../src/components/ofertas/HostDeOfertas')
const { dispararOferta } = await import('../src/lib/ofertas/eventos')
const { consumirDestaqueEmPlanos } = await import('../src/lib/ofertas/destaque')
const { _esquecerOfertas } = await import('../src/lib/ofertas/historico')

/** Meio-dia local de hoje + `dias` — longe da virada do dia, em qualquer fuso do teste. */
const meioDia = (dias = 0) => {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  return d.getTime() + dias * DIA
}

beforeEach(() => {
  prepararDialogoNoJsdom()
  localStorage.clear()
  sessionStorage.clear()
  _esquecerOfertas()
  sessionStorage.setItem('babel.ofertas.sessao', JSON.stringify({ inicio: Date.now() - 10 * 60_000, promocionais: 0 }))
  estado.teste = null
  estado.plan = 'premium'
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a fase do fim do teste, no calendário da pessoa', () => {
  it('três dias antes do último dia é D-3; o último dia é D0; os outros dias, nada', () => {
    const agora = meioDia()
    expect(faseDoFimDoTeste(meioDia(3), agora)).toBe('d3')
    expect(faseDoFimDoTeste(meioDia(0) + 3 * 3_600_000, agora)).toBe('d0')
    expect(faseDoFimDoTeste(meioDia(2), agora)).toBeNull()
    expect(faseDoFimDoTeste(meioDia(10), agora)).toBeNull()
    // Já terminou: não há o que avisar (a conta já voltou ao Grátis).
    expect(faseDoFimDoTeste(agora - 60_000, agora)).toBeNull()
  })

  it('sem teste nos entitlements (Grátis, ou Premium pago) não há fase', () => {
    estado.teste = null
    expect(faseDoTesteAgora()).toBeNull()
    estado.teste = { terminaEm: meioDia(3) }
    expect(faseDoTesteAgora(meioDia())).toBe('d3')
  })
})

describe('o motor', () => {
  const entrada = (fase: string) => ({
    momento: 'fim_do_teste' as const,
    fase,
    flagLigada: false,
    config: { gatilhos: [] },
    plano: 'premium' as const,
    historico: HISTORICO_VAZIO,
    sessao: { inicio: 0, promocionais: 0 },
    tela: { capturaAtiva: false, jogoAtivo: false, dialogoAberto: false },
    agora: Date.now(),
  })

  it('é momento funcional: vale com a flag desligada, com o texto de cada fase', () => {
    expect(momentoFuncional('fim_do_teste')).toBe(true)
    const d3 = decidirOferta(entrada('d3'))
    const d0 = decidirOferta(entrada('d0'))
    expect(d3.mostrar && d3.gatilho.id).toBe('funcional_fim_do_teste_d3')
    expect(d0.mostrar && d0.gatilho.id).toBe('funcional_fim_do_teste_d0')
    expect(d3.mostrar && d3.funcional).toBe(true)
  })

  it('os textos embutidos dizem que nada é cobrado — e não vendem', () => {
    const doTeste = GATILHOS_FUNCIONAIS.filter((g) => g.momento === 'fim_do_teste')
    expect(doTeste.map((g) => g.fase).sort()).toEqual(['d0', 'd3'])
    for (const g of doTeste) {
      expect(String(g.texto)).toMatch(/nada é cobrado|sem cobrança/)
      expect(g.planos).toEqual(['premium'])
    }
  })
})

describe('o host', () => {
  it('D-3: o aviso aparece sozinho para quem está no teste, e "Ver planos" leva a Planos sem destaque de venda', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    estado.teste = { terminaEm: meioDia(3) }
    const aoVerPlanos = vi.fn()
    render(<HostDeOfertas aoEntrar={() => {}} aoVerPlanos={aoVerPlanos} />)
    await act(async () => {
      vi.advanceTimersByTime(6_000)
    })
    expect(screen.getByText('Seu teste do Premium termina em 3 dias')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(aoVerPlanos).toHaveBeenCalledTimes(1)
    expect(consumirDestaqueEmPlanos()).toBeNull()
  })

  it('D0 disparado pelo canal mostra o texto do último dia', () => {
    render(<HostDeOfertas aoEntrar={() => {}} aoVerPlanos={() => {}} />)
    act(() => dispararOferta('fim_do_teste', { fase: 'd0' }))
    expect(screen.getByText('Seu teste do Premium termina hoje')).toBeTruthy()
  })

  it('quem paga o Premium (sem teste) não ouve nada', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    estado.teste = null
    render(<HostDeOfertas aoEntrar={() => {}} aoVerPlanos={() => {}} />)
    await act(async () => {
      vi.advanceTimersByTime(6_000)
    })
    expect(screen.queryByText(/Seu teste do Premium/)).toBeNull()
  })
})
