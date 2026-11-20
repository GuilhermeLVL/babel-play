/**
 * O FREIO DO TESTE DO PREMIUM CONTRA A FÁBRICA DE CONTAS (change `teste-de-3-dias`), nas regras puras:
 *
 * 1. A MARCA é a da caixa de entrada, não a do texto digitado: caixa, espaços, `+etiqueta` (qualquer domínio), os
 *    pontos do Gmail e o `googlemail.com` não fazem "outra pessoa". Fora do Gmail, o ponto conta.
 * 2. A lista curta de caixas descartáveis barra o domínio e os subdomínios dele, e nada além.
 * 3. O teste dura 3 dias e a nuvem dele é 1 h — os números saem de `src/core/planos.ts`.
 *
 * O caminho HTTP inteiro (e-mail confirmado, teto por IP) está em `tests/integration/teste-premium.test.ts`.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { DIAS_DO_TESTE_PREMIUM, FRANQUIA_DO_TESTE } from '../src/core/planos'

type Modulo = typeof import('../server/lib/testePremium')
let m: Modulo

beforeAll(async () => {
  /* A marca é um HMAC com a chave do servidor: uma chave de teste, para não ler nem gravar `data/`. */
  process.env.SECRET_KEY ??= 'chave-de-teste-do-antiabuso-com-32-caracteres-ou-mais'
  m = await import('../server/lib/testePremium')
})

describe('a marca do e-mail', () => {
  it('a.b+x@GoogleMail.com e ab@gmail.com são a mesma pessoa (e a mesma marca)', async () => {
    expect(m.normalizarEmailDaMarca('a.b+x@GoogleMail.com')).toBe('ab@gmail.com')
    expect(m.normalizarEmailDaMarca('ab@gmail.com')).toBe('ab@gmail.com')
    const a = await m.marcaDoTeste('a.b+x@GoogleMail.com', 'conta')
    const b = await m.marcaDoTeste('ab@gmail.com', 'conta')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).toBe(b)
  })

  it('caixa, espaços e +etiqueta saem em qualquer domínio; os pontos, só no Gmail', () => {
    expect(m.normalizarEmailDaMarca('  Fulano+promo@Exemplo.COM ')).toBe('fulano@exemplo.com')
    expect(m.normalizarEmailDaMarca('fu.la.no@exemplo.com')).toBe('fu.la.no@exemplo.com')
    expect(m.normalizarEmailDaMarca('F.U.L.A.N.O+1+2@gmail.com')).toBe('fulano@gmail.com')
  })

  it('o que não parece e-mail não vira marca', async () => {
    for (const ruim of ['', 'sem-arroba', '@exemplo.com', 'fulano@', '+so-etiqueta@'])
      expect(m.normalizarEmailDaMarca(ruim), ruim).toBeNull()
    expect(await m.marcaDoTeste('sem-arroba', 'conta')).toBeNull()
  })

  it('a origem separa os espaços: o responsável que ativa para o menor não gasta o teste dele', async () => {
    expect(await m.marcaDoTeste('mae@exemplo.com', 'conta')).not.toBe(
      await m.marcaDoTeste('mae@exemplo.com', 'responsavel'),
    )
  })
})

describe('a caixa descartável', () => {
  it('barra o domínio da lista e os subdomínios dele', async () => {
    const { emailDescartavel } = await import('../server/lib/dominiosDescartaveis')
    expect(emailDescartavel('alguem@mailinator.com')).toBe(true)
    expect(emailDescartavel(' Alguem@YOPMAIL.com ')).toBe(true)
    expect(emailDescartavel('alguem@caixa.guerrillamail.com')).toBe(true)
  })

  it('não barra o e-mail de sempre nem o domínio que só parece', async () => {
    const { emailDescartavel } = await import('../server/lib/dominiosDescartaveis')
    for (const ok of [
      'alguem@gmail.com',
      'alguem@outlook.com.br',
      'alguem@notmailinator.com',
      'mailinator.com@gmail.com',
      'sem-arroba',
    ])
      expect(emailDescartavel(ok), ok).toBe(false)
  })
})

describe('o tamanho do teste', () => {
  it('3 dias, e a nuvem é uma amostra de 1 h', () => {
    expect(DIAS_DO_TESTE_PREMIUM).toBe(3)
    expect(m.DURACAO_DO_TESTE_MS).toBe(3 * 86_400_000)
    expect(FRANQUIA_DO_TESTE).toEqual({
      sttSegundosMes: 3_600,
      tokensMes: 150_000,
      chamadasMes: 1_400,
      vozCaracteresMes: 0,
    })
  })

  it('a franquia cabe na 1 h que promete: 150 mil tokens por hora de fala, duas chamadas por fala de ~6 s', () => {
    const horas = FRANQUIA_DO_TESTE.sttSegundosMes / 3_600
    expect(FRANQUIA_DO_TESTE.tokensMes).toBeGreaterThanOrEqual(horas * 150_000)
    expect(FRANQUIA_DO_TESTE.chamadasMes).toBeGreaterThanOrEqual((FRANQUIA_DO_TESTE.sttSegundosMes / 6) * 2)
  })
})
