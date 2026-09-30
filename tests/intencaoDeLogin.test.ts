// @vitest-environment jsdom
/**
 * A intenção que sobrevive ao login: guarda a rota interna, vale por uma hora, é consumida uma vez
 * e recusa qualquer coisa que não seja caminho do próprio app.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { consumirIntencao, guardarIntencao, lerIntencao, VALIDADE_DA_INTENCAO_MS } from '../src/lib/intencaoDeLogin'

beforeEach(() => localStorage.clear())

describe('intenção de login', () => {
  it('guarda a rota e o plano, e o consumo acontece uma vez só', () => {
    guardarIntencao({ rota: '/plano/assinar', plano: 'premium' }, 1000)
    expect(lerIntencao(2000)).toMatchObject({ rota: '/plano/assinar', plano: 'premium' })
    expect(consumirIntencao(2000)?.rota).toBe('/plano/assinar')
    expect(consumirIntencao(2000)).toBeNull()
  })

  it('matriz v2: a intenção de antes do deploy ("assinar o Pro") volta como Premium; plano que não existe, sem plano', () => {
    guardarIntencao({ rota: '/plano/assinar', plano: 'pro' }, 1000)
    expect(lerIntencao(2000)).toMatchObject({ rota: '/plano/assinar', plano: 'premium' })
    guardarIntencao({ rota: '/plano/assinar', plano: 'ouro' }, 1000)
    const i = lerIntencao(2000)
    expect(i?.rota).toBe('/plano/assinar')
    expect(i?.plano).toBeUndefined()
  })

  it('vence depois de uma hora', () => {
    guardarIntencao({ rota: '/plano/assinar' }, 0)
    expect(lerIntencao(VALIDADE_DA_INTENCAO_MS + 1)).toBeNull()
  })

  it('recusa rota externa, protocolo-relativa ou lixo', () => {
    for (const rota of ['https://evil.com', '//evil.com', 'plano', '/\\evil.com']) {
      guardarIntencao({ rota }, 0)
      expect(lerIntencao(1)).toBeNull()
    }
    localStorage.setItem('babel.intencaoDeLogin', '{"rota":"//x","criadaEm":0}')
    expect(lerIntencao(1)).toBeNull()
    localStorage.setItem('babel.intencaoDeLogin', 'não é json')
    expect(lerIntencao(1)).toBeNull()
  })
})
