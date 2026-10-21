// @vitest-environment jsdom
/**
 * "GANHE 30 MIN DE NUVEM" NA CAPTURA (espaço `nuvem-30`): o cartão só aparece quando a nuvem de alívio está
 * DISPONÍVEL para a conta (a recompensa soma à franquia dela; spec "Amostra de nuvem com teto global": teto
 * atingido, a oferta não aparece). Sem provedor, nem se pergunta ao servidor; perfil protegido, também não.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DIA = 24 * 60 * 60_000
const mundo = vi.hoisted(() => ({
  protegido: false,
  alivio: null as { disponivel: boolean; restanteSegundos: number } | null,
}))

vi.mock('../src/lib/flags', () => ({ useFlag: () => true }))
vi.mock('../src/lib/flagsCache', () => ({ flagLigada: (chave: string) => chave === 'anuncios' }))
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => ({ plan: 'free', semAnuncios: false, teste: null, contaCriadaEm: Date.now() - 10 * DIA }),
  onPlanChange: () => () => undefined,
}))
vi.mock('../src/lib/protecaoDoMenor', () => ({
  perfilProtegido: () => mundo.protegido,
  aoMudarProtecao: () => () => undefined,
}))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', () => ({ noHeadset: () => false }))
vi.mock('../src/lib/edicaoEstatica', () => ({ edicaoEstatica: () => false }))
vi.mock('../src/lib/sessaoDeCaptura', () => ({ capturaAtiva: () => false }))
vi.mock('../src/lib/preferencias', () => {
  const prefs = () => ({ consentimentos: { anuncios: true }, registroDeConsentimentos: [] })
  return { usePreferencias: prefs, lerPreferencias: prefs }
})
const consultarAlivio = vi.hoisted(() => vi.fn(async () => mundo.alivio))
vi.mock('../src/lib/nuvemDeAlivio/consulta', () => ({ consultarAlivio }))

const { default: NuvemPremiadaNaCaptura } = await import('../src/components/views/captura/NuvemPremiadaNaCaptura')
const { registrarProvedorDeAnuncios } = await import('../src/lib/anuncios/provedor')

const PROVEDOR_FALSO = { id: 'falso', Espaco: ({ espaco }: { espaco: string }) => <i data-ad-falso={espaco} /> }

async function montar() {
  const r = render(<NuvemPremiadaNaCaptura />)
  await act(async () => {
    await new Promise((ok) => setTimeout(ok, 0))
  })
  return r.container
}

beforeEach(() => {
  Object.assign(mundo, { protegido: false, alivio: null })
  consultarAlivio.mockClear()
  registrarProvedorDeAnuncios(PROVEDOR_FALSO)
})
afterEach(() => {
  cleanup()
  registrarProvedorDeAnuncios(null)
})

describe('nuvem-30 na captura', () => {
  it('com o alívio disponível, o cartão aparece', async () => {
    mundo.alivio = { disponivel: true, restanteSegundos: 3600 }
    const c = await montar()
    expect(c.querySelector('[data-ad-falso="nuvem-30"]')).not.toBeNull()
    expect(consultarAlivio).toHaveBeenCalledTimes(1)
  })

  it('alívio indisponível (teto, pool ou nuvem fechada): nada', async () => {
    mundo.alivio = { disponivel: false, restanteSegundos: 0 }
    const c = await montar()
    expect(c.innerHTML).toBe('')
  })

  it('sem alívio para esta conta (flag dele, plano, sem conta): nada', async () => {
    mundo.alivio = null
    const c = await montar()
    expect(c.innerHTML).toBe('')
  })

  it('perfil protegido: nada, e nem se pergunta ao servidor', async () => {
    mundo.protegido = true
    mundo.alivio = { disponivel: true, restanteSegundos: 3600 }
    const c = await montar()
    expect(c.innerHTML).toBe('')
    expect(consultarAlivio).not.toHaveBeenCalled()
  })

  it('estado de fábrica (sem provedor): nada, e nenhuma pergunta à rede', async () => {
    registrarProvedorDeAnuncios(null)
    mundo.alivio = { disponivel: true, restanteSegundos: 3600 }
    const c = await montar()
    expect(c.innerHTML).toBe('')
    expect(consultarAlivio).not.toHaveBeenCalled()
  })
})
