// @vitest-environment jsdom
/**
 * A TELA DA TEMPORADA (recompensas v2, onda 5; spec 8.3), na aba Temporada de Personalizar:
 * 1. Fora das datas, diz quando vem a próxima — com a contagem de dias para adulto e SEM contagem
 *    para o perfil protegido (a data, e nada correndo). E não mostra progresso nenhum.
 * 2. Durante a temporada, o nível e o XP são os DA TEMPORADA (o XP ganho dentro da janela, somado no
 *    servidor — `GET /api/metrics/temporada`), nunca os da conta.
 * 3. As duas trilhas aparecem; nada na tela vende nível nem Créditos.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const perfil = vi.hoisted(() => ({ protegido: false }))
vi.mock('../src/lib/protecaoDoMenor', async (orig) => ({
  ...(await orig<typeof import('../src/lib/protecaoDoMenor')>()),
  perfilProtegido: () => perfil.protegido,
}))

import TemporadaDoPrototipo from '../src/components/views/personalizar/polimento/TemporadaDoPrototipo'
import { TEMPORADAS } from '../src/core/temporada'
import type { TemporadaNoServidor } from '../src/data/api'

const T1 = TEMPORADAS[0]

function montar(estado: TemporadaNoServidor | null | undefined, protegido = false) {
  perfil.protegido = protegido
  return render(
    <TemporadaDoPrototipo
      estado={estado}
      saldo={42}
      aoContarSeeds={() => {}}
      aoUsar={() => {}}
      aoVerPlanos={() => {}}
    />,
  )
}
const faixa = () => screen.getByTestId('faixa-da-temporada').textContent ?? ''

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T12:00:00-03:00'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  perfil.protegido = false
})

const antes: TemporadaNoServidor = { temporada: null, proxima: T1, xp: 0, nivel: 0, assinante: false, creditados: [] }

describe('fora das datas', () => {
  it('adulto: "próxima temporada em N dias", com a data', () => {
    montar(antes)
    expect(faixa()).toMatch(/Próxima temporada em 4 dias/)
    expect(faixa()).toMatch(/outubro/)
  })

  it('perfil protegido: a data, sem contagem de dias', () => {
    montar(antes, true)
    expect(faixa()).toMatch(/Próxima temporada em/)
    expect(faixa()).toMatch(/outubro/)
    expect(faixa()).not.toMatch(/\bdias?\b/)
  })

  it('antes da temporada: nenhum progresso (nem o da conta), só o nome e o nível zero', () => {
    montar({ ...antes, xp: 999, nivel: 7 })
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByTestId('temporada').textContent).not.toMatch(/\d+ \/ \d+ XP/)
    expect(screen.getByTestId('nivel-da-temporada').textContent).toMatch(/Nível 0 de 30/)
    expect(screen.getByTestId('temporada').textContent).toContain(T1.nome)
  })

  it('sem temporada anunciada, diz que ainda não tem data — e não desenha trilha', () => {
    montar({ ...antes, proxima: null })
    expect(screen.getByTestId('temporada').textContent).toMatch(/ainda não tem data/)
    expect(document.querySelector('[data-px-premio]')).toBeNull()
  })

  it('carregando ou sem resposta: nada de nível inventado', () => {
    montar(undefined)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByTestId('nivel-da-temporada')).toBeNull()
    cleanup()
    montar(null)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByTestId('nivel-da-temporada')).toBeNull()
    expect(screen.getByTestId('temporada').textContent).not.toMatch(/XP/)
  })
})

describe('durante a temporada', () => {
  const durante: TemporadaNoServidor = {
    temporada: T1,
    proxima: null,
    xp: 320,
    nivel: 2,
    assinante: false,
    creditados: [],
  }
  beforeEach(() => vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00')))

  it('o nível e o XP DA TEMPORADA, com o que falta e a próxima casa da trilha grátis', () => {
    montar(durante)
    expect(screen.getByTestId('nivel-da-temporada').textContent).toMatch(/Nível 2 de 30/)
    const texto = screen.getByTestId('temporada').textContent ?? ''
    expect(texto).toMatch(/20 \/ 150 XP · faltam 130 XP/)
    // A próxima casa com recompensa na trilha grátis (as pares): o nível 4.
    expect(texto).toMatch(/a seguir: .+, no nível 4/)
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })

  it('as duas trilhas aparecem: os prêmios do grátis e os do assinante, estes trancados para quem não assina', () => {
    montar(durante)
    expect(document.querySelectorAll('[data-px-premio^="g"]').length).toBeGreaterThan(0)
    const doAssinante = [...document.querySelectorAll<HTMLElement>('[data-px-premio^="a"]')]
    expect(doAssinante.length).toBeGreaterThan(0)
    for (const p of doAssinante) expect(p.className, p.dataset.pxPremio).toContain('trancado')
  })

  it('adulto vê "termina em N dias"; o perfil protegido vê o período, sem contagem', () => {
    montar(durante)
    expect(faixa()).toMatch(/termina em \d+ dias/)
    cleanup()
    montar(durante, true)
    expect(faixa()).not.toMatch(/termina em/)
    expect(faixa()).not.toMatch(/\bdias?\b/)
  })

  it('nada na tela vende nível nem Créditos', () => {
    montar(durante)
    const texto = document.body.textContent ?? ''
    expect(texto).not.toMatch(/Créditos|comprar n[ií]vel|Passe Premium/i)
  })
})
