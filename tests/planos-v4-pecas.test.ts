// @vitest-environment jsdom
/**
 * AS PEÇAS PURAS DA TELA v4: o plano de entrada, os planos "em breve", a troca do nome do plano nas
 * frases, o plano que o checkout lembra, o plano do teste na conta, e o motor de ofertas com o Plus.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GATILHOS_FUNCIONAIS } from '../src/core/ofertas'
import {
  FLAG_VENDA_FAMILIA,
  FLAG_VENDA_PLANOS_V4,
  PLANO_DO_TESTE,
  planoDeEntrada,
  planoDoTeste,
  planosAVenda,
  planosEmBreve,
} from '../src/core/planos'
import { estadoDaConta } from '../src/lib/assinatura'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'
import { decidirOferta, HISTORICO_VAZIO } from '../src/lib/ofertas/motor'
import { comNomeDoPlano, planoParaNome } from '../src/lib/planoDeEntrada'
import { CHAVE_DO_PLANO_DO_CHECKOUT, lembrarPlanoDoCheckout } from '../src/lib/planoDoCheckout'

const v4 = (chave: string) => chave === FLAG_VENDA_PLANOS_V4

describe('planoDeEntrada e planosEmBreve', () => {
  it('com a v4 é o Plus (como o do teste); sem ela, o Premium de hoje', () => {
    expect(planoDeEntrada(v4)).toBe('plus')
    expect(planoDeEntrada(() => false)).toBe(PLANO_DO_TESTE)
    expect(planoDoTeste(v4)).toBe(planoDeEntrada(v4))
  })

  it('a Família e o Pro ficam "em breve" com a v4; sem a v4 (ou com a Família aberta) a lista muda', () => {
    expect(planosEmBreve(planosAVenda(v4))).toEqual(['familia', 'pro4'])
    expect(planosEmBreve(planosAVenda(() => false))).toEqual([])
    expect(planosEmBreve(planosAVenda((c) => v4(c) || c === FLAG_VENDA_FAMILIA))).toEqual(['pro4'])
  })
})

describe('comNomeDoPlano', () => {
  it('troca "Premium" pelo nome do plano e deixa o Premium como veio', () => {
    expect(comNomeDoPlano('Conhecer o Premium', 'plus')).toBe('Conhecer o Plus')
    expect(comNomeDoPlano('Conhecer o Premium', 'premium')).toBe('Conhecer o Premium')
    expect(comNomeDoPlano('Premium em teste · 3 dias', 'pro4')).toBe('Pro em teste · 3 dias')
  })

  it('o selo da conta só muda de nome para os planos da v4', () => {
    expect(planoParaNome('plus')).toBe('plus')
    expect(planoParaNome('essencial')).toBe('premium')
    expect(planoParaNome('premium')).toBe('premium')
  })
})

describe('o checkout lembra o Plus', () => {
  beforeEach(() => sessionStorage.clear())
  it('grava o plus e continua gravando o premium; recusa o que não existe', () => {
    lembrarPlanoDoCheckout('plus')
    expect(sessionStorage.getItem(CHAVE_DO_PLANO_DO_CHECKOUT)).toBe('plus')
    lembrarPlanoDoCheckout('premium')
    expect(sessionStorage.getItem(CHAVE_DO_PLANO_DO_CHECKOUT)).toBe('premium')
    sessionStorage.clear()
    lembrarPlanoDoCheckout('pro')
    expect(sessionStorage.getItem(CHAVE_DO_PLANO_DO_CHECKOUT)).toBe('premium')
    sessionStorage.clear()
    lembrarPlanoDoCheckout('gratis')
    expect(sessionStorage.getItem(CHAVE_DO_PLANO_DO_CHECKOUT)).toBeNull()
  })
})

describe('o plano do teste na conta', () => {
  const agora = 1_800_000_000_000
  const status = (plano: 'plus' | 'premium') => ({
    configurado: true,
    assinatura: null,
    teste: { estado: 'ativo' as const, dias: 14, plano, iniciadoEm: agora - 1000, terminaEm: agora + 86_400_000 },
  })
  it('é o gravado pelo servidor: Plus com a v4, Premium nos testes de antes', () => {
    expect(estadoDaConta('plus', status('plus'), agora)).toMatchObject({ estado: 'teste', plano: 'plus' })
    expect(estadoDaConta('premium', status('premium'), agora)).toMatchObject({ estado: 'teste', plano: 'premium' })
  })
  it('sem o status, vale o plano que os entitlements já dão durante o teste', () => {
    expect(estadoDaConta('plus', null, agora, { terminaEm: agora + 1000 })).toMatchObject({ plano: 'plus' })
    expect(estadoDaConta('premium', null, agora, { terminaEm: agora + 1000 })).toMatchObject({ plano: 'premium' })
  })
})

describe('ofertas com o Plus', () => {
  afterEach(() => definirEstadoDasFlags(null))
  const entrada = (plano: 'plus' | 'premium', fase: string) => ({
    momento: 'fim_do_teste' as const,
    fase,
    flagLigada: false,
    config: { gatilhos: [] },
    plano,
    historico: { ...HISTORICO_VAZIO },
    sessao: { inicio: 0, promocionais: 0 },
    tela: { capturaAtiva: false, jogoAtivo: false, dialogoAberto: false },
    agora: 1_800_000_000_000,
  })

  it('quem testa o Plus recebe o aviso do fim do teste, como quem testa o Premium', () => {
    for (const plano of ['plus', 'premium'] as const) {
      const d = decidirOferta(entrada(plano, 'd3'))
      expect(d, plano).toMatchObject({ mostrar: true, gatilho: { id: 'funcional_fim_do_teste_d3' } })
    }
    expect(
      GATILHOS_FUNCIONAIS.filter((g) => g.momento === 'fim_do_teste').every((g) => g.planos.includes('plus')),
    ).toBe(true)
  })

  it('o perfil protegido não recebe oferta promocional de plano nenhum', () => {
    const d = decidirOferta({
      ...entrada('plus', 'd3'),
      plano: 'free',
      momento: 'modelo_premium',
      flagLigada: true,
      protegido: true,
      config: {
        gatilhos: [
          {
            id: 'promo',
            momento: 'modelo_premium',
            componente: 'banner',
            titulo: 'x',
            texto: 'y',
            cta: 'Ver',
            maxPorDia: 1,
            maxPorSemana: 1,
            intervaloMinHoras: 1,
            planos: ['free'],
          },
        ],
      },
    })
    expect(d).toMatchObject({ mostrar: false, motivo: 'perfil_protegido' })
  })
})
