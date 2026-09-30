/**
 * B4 (Fase B, 29/09/2026) — A ADMISSÃO LÊ OS LIMITES QUE O REGISTRO DECLARA, POR PROVEDOR.
 *
 * Até aqui o balde de cada `provedor·modelo` tinha os limites das `IA_ADMISSAO_*` — os da camada da
 * Groq (30 RPM, 1K RPD, 200K TPD), valendo para QUALQUER provedor. Com a cascata barata isso erra
 * para os dois lados: a DeepInfra aceita muito mais que 30 por minuto (o balde recusaria à toa), e
 * uma conta nova do Workers AI tem outro teto (o balde deixaria passar até o 429). O registro já
 * declarava `limites` (B1); faltava a admissão ler:
 *
 *   - limites do MODELO: o balde do modelo, com eles;
 *   - limites do PROVEDOR (sem os do modelo): UM balde para todos os modelos dele naquela função —
 *     é a conta que tem o teto, e dois baldes cheios somariam o dobro;
 *   - sem nenhum: as `IA_ADMISSAO_*`, como sempre (o legado inteiro);
 *   - `tpm` (tokens por minuto), que a admissão não tinha: um balde de tokens ao lado do de pedidos.
 *
 * As faixas continuam valendo sobre o que foi declarado: a reserva do Pro, a metade do convidado e
 * os 20% de cima do alívio (A10) — 80% de qualquer balde é de quem paga.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { admitirNoBalde, esquecerAdmissao, fracaoDoBalde, registrarLimiteNaAdmissao } from '../../server/ai/admissao'

const T0 = Date.UTC(2026, 8, 29, 12)
const ENVS = ['IA_ADMISSAO_LLM_RPM', 'IA_ADMISSAO_LLM_RPD', 'IA_ADMISSAO_LLM_TPD', 'IA_ADMISSAO_RESERVA_PRO']

beforeEach(() => {
  for (const e of ENVS) process.env[e] = ''
  esquecerAdmissao()
})
afterEach(() => {
  for (const e of ENVS) process.env[e] = ''
  esquecerAdmissao()
})

/** Quantos pedidos o plano consegue no mesmo instante. */
function contar(p: Record<string, unknown>, plano = 'premium', tokens = 0): number {
  let n = 0
  while (
    admitirNoBalde({ tipo: 'llm', provedor: 'deepinfra', modelo: 'm', plano, tokens, agora: T0, ...p } as any).ok
  ) {
    n++
    if (n > 10_000) break
  }
  return n
}

describe('limites declarados no MODELO', () => {
  it('o rpm declarado é a capacidade do balde — não o das IA_ADMISSAO_*', () => {
    process.env.IA_ADMISSAO_LLM_RPM = '30'
    expect(contar({ limites: { rpm: 120 } })).toBe(120)
  })

  it('sem limites declarados, valem as IA_ADMISSAO_* (o legado)', () => {
    process.env.IA_ADMISSAO_LLM_RPM = '7'
    expect(contar({})).toBe(7)
  })

  it('dimensão não declarada é sem teto nela: só rpd declarado não herda o rpm da Groq', () => {
    process.env.IA_ADMISSAO_LLM_RPM = '2'
    expect(contar({ limites: { rpd: 50 } })).toBe(50)
  })

  it('rpd declarado fecha o dia', () => {
    const lim = { rpm: 100, rpd: 3 }
    const pedir = () =>
      admitirNoBalde({ tipo: 'llm', provedor: 'x', modelo: 'd', plano: 'premium', limites: lim, agora: T0 })
    expect([pedir().ok, pedir().ok, pedir().ok]).toEqual([true, true, true])
    const r = pedir()
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.recusa.motivo).toBe('dia')
  })

  /* Matriz v2: três faixas. O Premium usa o balde inteiro; o grátis (e o convidado) para na metade;
     o alívio do Grátis só nos 20% de cima (a reserva de 80% dos pagantes). */
  it('as faixas valem sobre o declarado: grátis para na metade, alívio só nos 20% de cima', () => {
    const lim = { rpm: 10 }
    expect(contar({ limites: lim, modelo: 'a' }, 'premium')).toBe(10)
    expect(contar({ limites: lim, modelo: 'b' }, 'gratis')).toBe(5)
    expect(contar({ limites: lim, modelo: 'c' }, 'alivio')).toBe(2)
  })
})

describe('tokens por minuto (tpm) — o balde de tokens', () => {
  it('pedidos de 400 tokens num tpm de 1.000: dois passam, o terceiro espera', () => {
    const lim = { rpm: 100, tpm: 1000 }
    const pedir = (agora = T0) =>
      admitirNoBalde({ tipo: 'llm', provedor: 'x', modelo: 'm', plano: 'premium', tokens: 400, limites: lim, agora })
    expect(pedir().ok).toBe(true)
    expect(pedir().ok).toBe(true)
    const r = pedir()
    expect(r.ok).toBe(false)
    if (r.ok === false) {
      expect(r.recusa.motivo).toBe('tokens_minuto')
      // Faltam 200 tokens a 1.000/min: 12 s.
      expect(r.recusa.retryAfterS).toBe(12)
    }
    expect(pedir(T0 + 12_000).ok).toBe(true)
  })

  it('o acerto pelo uso REAL devolve ao balde de tokens o que a estimativa superestimou', () => {
    const lim = { tpm: 1000 }
    const pedir = () =>
      admitirNoBalde({
        tipo: 'llm',
        provedor: 'x',
        modelo: 'm',
        plano: 'premium',
        tokens: 600,
        limites: lim,
        agora: T0,
      })
    const a = pedir()
    expect(a.ok).toBe(true)
    expect(pedir().ok).toBe(false)
    if (a.ok) a.ticket.acertarTokens(100)
    expect(pedir().ok).toBe(true)
  })

  it('um pedido maior que o balde inteiro passa com o balde cheio (senão nunca passaria)', () => {
    const r = admitirNoBalde({
      tipo: 'llm',
      provedor: 'x',
      modelo: 'm',
      plano: 'premium',
      tokens: 5000,
      limites: { tpm: 1000 },
      agora: T0,
    })
    expect(r.ok).toBe(true)
  })

  it('ticket devolvido repõe os tokens', () => {
    const lim = { tpm: 1000 }
    const pedir = () =>
      admitirNoBalde({
        tipo: 'llm',
        provedor: 'x',
        modelo: 'm',
        plano: 'premium',
        tokens: 800,
        limites: lim,
        agora: T0,
      })
    const a = pedir()
    expect(pedir().ok).toBe(false)
    if (a.ok) a.ticket.devolver()
    expect(pedir().ok).toBe(true)
  })
})

describe('limites do PROVEDOR: um balde só para os modelos dele', () => {
  it('rpm 4 da conta, dois modelos: 4 pedidos no total, não 4 por modelo', () => {
    const lim = { rpm: 4 }
    const pedir = (modelo: string) =>
      admitirNoBalde({
        tipo: 'llm',
        provedor: 'cf',
        modelo,
        plano: 'premium',
        limites: lim,
        compartilhado: true,
        agora: T0,
      })
    const oks = ['a', 'b', 'a', 'b', 'a', 'b'].map((m) => pedir(m).ok)
    expect(oks).toEqual([true, true, true, true, false, false])
  })

  it('o 429 do provedor fecha o balde da conta para todos os modelos dele', () => {
    const alvo = { limites: { rpm: 60 }, compartilhado: true }
    registrarLimiteNaAdmissao('llm', 'cf', 'a', 5, T0, alvo)
    const r = admitirNoBalde({ tipo: 'llm', provedor: 'cf', modelo: 'b', plano: 'premium', ...alvo, agora: T0 + 1000 })
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.recusa.motivo).toBe('provedor_limitou')
  })
})

describe('fracaoDoBalde — quanto sobra, para a política de custo (B4)', () => {
  it('balde novo está cheio; consumido, a fração cai; fechado pelo 429, zero', () => {
    const alvo = { tipo: 'llm' as const, provedor: 'x', modelo: 'm', limites: { rpm: 10 } }
    expect(fracaoDoBalde({ ...alvo, agora: T0 })).toBe(1)
    for (let i = 0; i < 9; i++) admitirNoBalde({ ...alvo, plano: 'premium', agora: T0 })
    expect(fracaoDoBalde({ ...alvo, agora: T0 })).toBeCloseTo(0.1, 5)
    registrarLimiteNaAdmissao('llm', 'x', 'm', 5, T0, { limites: alvo.limites })
    expect(fracaoDoBalde({ ...alvo, agora: T0 + 1000 })).toBe(0)
  })

  it('a menor das dimensões manda: pedidos sobrando e tokens do minuto no fim', () => {
    const alvo = { tipo: 'llm' as const, provedor: 'x', modelo: 't', limites: { rpm: 100, tpm: 1000 } }
    admitirNoBalde({ ...alvo, plano: 'premium', tokens: 900, agora: T0 })
    expect(fracaoDoBalde({ ...alvo, agora: T0 })).toBeCloseTo(0.1, 5)
  })

  it('sem teto nenhum, a fração é 1 (não há o que esgotar)', () => {
    process.env.IA_ADMISSAO_LLM_RPM = '0'
    process.env.IA_ADMISSAO_LLM_RPD = '0'
    process.env.IA_ADMISSAO_LLM_TPD = '0'
    expect(fracaoDoBalde({ tipo: 'llm', provedor: 'x', modelo: 'livre', agora: T0 })).toBe(1)
  })
})
