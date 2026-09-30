/**
 * D6 (Fase D, 30/09/2026) — AS PREFERÊNCIAS DA TRADUÇÃO NUANCE (Ajustes → Idiomas) E O QUE ELAS PÕEM
 * NUM PEDIDO DE TRADUÇÃO.
 *
 * O ponto que importa: SÓ O QUE NÃO É O PADRÃO VAI ao servidor. "Automático", pt-BR e es-419 não
 * mandam nada — o pedido fica igual ao de quem nunca abriu os Ajustes, e a legenda ao vivo continua
 * dividindo o cache do servidor com todo mundo (registro e variante entram na chave). E sem a
 * capacidade `traducaoNuance`, nada vai.
 */
import { describe, expect, it } from 'vitest'

import { normalizar, PADRAO } from '../src/lib/preferencias'
import { nuanceDoPedido, nuanceDoPolimento } from '../src/lib/traducao/preferenciasDaNuance'

describe('a preferência guardada', () => {
  it('o padrão: automático, pt-BR e es-419', () => {
    expect(PADRAO.nuance).toEqual({ registro: 'automatico', variantes: { pt: 'pt-BR', es: 'es-419' } })
    expect(normalizar(null).nuance).toEqual(PADRAO.nuance)
  })

  it('valor desconhecido (versão antiga, blob editado) cai no padrão, campo a campo', () => {
    expect(normalizar({ nuance: { registro: 'solene', variantes: { pt: 'pt-AO', es: 'es-ES' } } }).nuance).toEqual({
      registro: 'automatico',
      variantes: { pt: 'pt-BR', es: 'es-ES' },
    })
  })
})

describe('o que vai no pedido', () => {
  const com = (registro: 'automatico' | 'formal' | 'informal', pt: 'pt-BR' | 'pt-PT', es: 'es-419' | 'es-ES') => ({
    registro,
    variantes: { pt, es },
  })

  it('o padrão não manda nada', () => {
    expect(nuanceDoPedido('pt-BR', com('automatico', 'pt-BR', 'es-419'), true)).toEqual({})
  })

  it('registro e variante fora do padrão vão — a variante só para o idioma do destino', () => {
    const p = com('formal', 'pt-PT', 'es-ES')
    expect(nuanceDoPedido('pt', p, true)).toEqual({ registro: 'formal', variante: 'pt-PT' })
    expect(nuanceDoPedido('es-MX', p, true)).toEqual({ registro: 'formal', variante: 'es-ES' })
    expect(nuanceDoPedido('en-US', p, true)).toEqual({ registro: 'formal' })
  })

  it('sem a Tradução Nuance, nada vai', () => {
    expect(nuanceDoPedido('pt', com('formal', 'pt-PT', 'es-ES'), false)).toEqual({})
  })
})

describe('o que vai no "polir a sessão" (D5)', () => {
  const com = (registro: 'automatico' | 'formal' | 'informal', pt: 'pt-BR' | 'pt-PT', es: 'es-419' | 'es-ES') => ({
    registro,
    variantes: { pt, es },
  })

  it('o padrão não manda nada; fora dele, o registro e as variantes (o servidor aplica cada uma à linha dela)', () => {
    expect(nuanceDoPolimento(com('automatico', 'pt-BR', 'es-419'), true)).toEqual({})
    expect(nuanceDoPolimento(com('informal', 'pt-PT', 'es-ES'), true)).toEqual({
      registro: 'informal',
      variantes: ['pt-PT', 'es-ES'],
    })
    expect(nuanceDoPolimento(com('automatico', 'pt-BR', 'es-ES'), true)).toEqual({ variantes: ['es-ES'] })
  })

  it('sem a Tradução Nuance, nada vai', () => {
    expect(nuanceDoPolimento(com('formal', 'pt-PT', 'es-ES'), false)).toEqual({})
  })
})
