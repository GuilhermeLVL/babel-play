// @vitest-environment jsdom
/**
 * QUEM PODE TESTAR E QUEM É PROTEGIDO — o que o motor de ofertas recebe da pessoa (C8).
 *
 * 1. "Pode testar" é o que o SERVIDOR disse (`GET /api/billing/status` → `teste.estado: 'disponivel'`),
 *    guardado no aparelho por 1 hora. Sem resposta guardada, não se sabe — e não se promete o teste.
 * 2. A tela de Planos e o checkout já perguntam o status: cada resposta atualiza o que o motor sabe
 *    (quem acabou de começar o teste deixa de ouvir "teste 14 dias").
 * 3. O host pergunta por conta própria só com o cache vencido (uma pergunta por hora, no máximo).
 * 4. Protegido é a CONTA de perfil protegido (menor, ou idade não declarada). O convidado não entra
 *    aqui: para ele a única promocional já é criar a conta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const HORA = 60 * 60_000

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  vi.doUnmock('../src/data/api')
  vi.doUnmock('../src/lib/protecaoDoMenor')
  vi.doUnmock('../src/lib/identidade')
})

function mockStatus(teste: unknown) {
  const chamadas: string[] = []
  vi.doMock('../src/data/api', () => ({
    apiFetch: vi.fn(async (url: string) => {
      chamadas.push(url)
      return { ok: true, status: 200, json: async () => ({ configurado: true, assinatura: null, teste }) }
    }),
  }))
  return chamadas
}

describe('pode testar', () => {
  it('sem nada guardado, não se sabe: o motor não ouve "teste"', async () => {
    const { podeTestarConhecido } = await import('../src/lib/ofertas/teste')
    expect(podeTestarConhecido()).toBe(false)
  })

  it('só "disponivel" pode; o resto não; e a lembrança vence em 1 hora', async () => {
    const { lembrarSituacaoDoTeste, podeTestarConhecido } = await import('../src/lib/ofertas/teste')
    const agora = 1_800_000_000_000
    lembrarSituacaoDoTeste('disponivel', agora)
    expect(podeTestarConhecido(agora + 10 * 60_000)).toBe(true)
    expect(podeTestarConhecido(agora + HORA + 1)).toBe(false)
    for (const estado of ['ativo', 'usado', 'indisponivel', undefined]) {
      lembrarSituacaoDoTeste(estado, agora)
      expect(podeTestarConhecido(agora), String(estado)).toBe(false)
    }
  })

  it('o status carregado pela tela de Planos atualiza o que o motor sabe', async () => {
    mockStatus({ estado: 'disponivel', dias: 14 })
    const { carregarStatusDeBilling } = await import('../src/lib/assinatura')
    const { podeTestarConhecido } = await import('../src/lib/ofertas/teste')
    await carregarStatusDeBilling()
    expect(podeTestarConhecido()).toBe(true)
  })

  it('o host pergunta ao servidor só com o cache vencido', async () => {
    const chamadas = mockStatus({ estado: 'disponivel', dias: 14 })
    const { verificarTeste, podeTestarConhecido } = await import('../src/lib/ofertas/teste')
    const agora = Date.now()
    await verificarTeste(agora)
    await verificarTeste(agora + 10 * 60_000)
    expect(chamadas.filter((u) => u === '/api/billing/status')).toHaveLength(1)
    expect(podeTestarConhecido(agora + 10 * 60_000)).toBe(true)
    await verificarTeste(agora + HORA + 1)
    expect(chamadas.filter((u) => u === '/api/billing/status')).toHaveLength(2)
  })
})

describe('protegido', () => {
  it('a conta de perfil protegido é protegida; o convidado (sem conta) não entra aqui', async () => {
    let identidade = 'conta'
    vi.doMock('../src/lib/protecaoDoMenor', async (original) => ({
      ...(await original<typeof import('../src/lib/protecaoDoMenor')>()),
      perfilProtegido: () => true,
    }))
    vi.doMock('../src/lib/identidade', async (original) => ({
      ...(await original<typeof import('../src/lib/identidade')>()),
      estadoDeIdentidade: () => identidade,
      estaAnonimo: () => identidade === 'anonimo',
    }))
    const { pessoaDaOferta } = await import('../src/lib/ofertas/plano')
    expect(pessoaDaOferta().protegido).toBe(true)
    identidade = 'anonimo'
    expect(pessoaDaOferta().protegido).toBe(false)
  })
})
