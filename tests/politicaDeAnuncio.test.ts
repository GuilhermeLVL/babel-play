/**
 * A POLÍTICA DE ANÚNCIOS (change `planos-v3-e-rota-inteligente`, spec `anuncios-no-gratis`) — a tabela.
 *
 * `podeMostrar` é pura: tudo o que ela sabe entra pelo pedido. Cada linha desta tabela parte do pedido
 * que PODE (Grátis adulto, com conta de dez dias, consentimento dado, flag ligada, tela de descanso) e
 * muda UMA coisa. É assim que se prova que cada regra nega sozinha, e não por carona de outra.
 */
import { describe, expect, it } from 'vitest'

import {
  ESPACOS_DE_ANUNCIO,
  FORMATO_DO_ESPACO,
  FORMATOS_DE_ANUNCIO,
  IDADE_MINIMA_DA_CONTA_MS,
  INTERVALO_DO_INTERSTICIAL_MS,
  type MotivoDoAnuncio,
  type PedidoDeAnuncio,
  podeMostrar,
} from '../src/core/anuncios/politicaDeAnuncio'

const DIA = 24 * 60 * 60_000
const AGORA = 1_800_000_000_000

const pedido = (p: Partial<PedidoDeAnuncio> = {}): PedidoDeAnuncio => ({
  espaco: 'inicio-nativo',
  formato: 'nativo',
  flagLigada: true,
  semAnuncios: false,
  emTeste: false,
  perfilProtegido: false,
  noHeadset: false,
  edicaoEstatica: false,
  tela: { capturaAtiva: false, interpreteAberto: false, rodadaEmAndamento: false },
  contaCriadaEm: AGORA - 10 * DIA,
  consentimento: true,
  ultimoIntersticialEm: null,
  agora: AGORA,
  ...p,
})

const premiado = (p: Partial<PedidoDeAnuncio> = {}) => pedido({ espaco: 'fim-premiado', formato: 'premiado', ...p })
const intersticial = (p: Partial<PedidoDeAnuncio> = {}) =>
  pedido({ espaco: 'intersticial', formato: 'intersticial', ...p })

describe('podeMostrar — o pedido que pode', () => {
  it('Grátis adulto, conta antiga, consentimento, flag ligada, tela de descanso', () => {
    expect(podeMostrar(pedido())).toEqual({ pode: true, motivo: 'pode' })
    expect(podeMostrar(premiado())).toEqual({ pode: true, motivo: 'pode' })
    expect(podeMostrar(intersticial())).toEqual({ pode: true, motivo: 'pode' })
  })
})

describe('podeMostrar — a tabela das negativas (uma mudança por linha)', () => {
  const TABELA: Array<[string, Partial<PedidoDeAnuncio>, MotivoDoAnuncio]> = [
    ['flag `anuncios` desligada', { flagLigada: false }, 'flag_desligada'],
    ['plano com `semAnuncios`', { semAnuncios: true }, 'sem_anuncios_no_plano'],
    ['teste de 14 dias valendo', { emTeste: true }, 'em_teste'],
    ['perfil protegido (menor, idade não declarada, sem conta)', { perfilProtegido: true }, 'perfil_protegido'],
    ['headset', { noHeadset: true }, 'headset'],
    ['edição estática', { edicaoEstatica: true }, 'edicao_estatica'],
    [
      'captura ativa',
      { tela: { capturaAtiva: true, interpreteAberto: false, rodadaEmAndamento: false } },
      'captura_ativa',
    ],
    [
      'intérprete aberto',
      { tela: { capturaAtiva: false, interpreteAberto: true, rodadaEmAndamento: false } },
      'interprete_aberto',
    ],
    [
      'rodada em andamento',
      { tela: { capturaAtiva: false, interpreteAberto: false, rodadaEmAndamento: true } },
      'rodada_em_andamento',
    ],
    ['conta com dois dias', { contaCriadaEm: AGORA - 2 * DIA }, 'conta_nova'],
    ['conta criada agora', { contaCriadaEm: AGORA }, 'conta_nova'],
    ['data de criação desconhecida', { contaCriadaEm: null }, 'conta_nova'],
    ['data de criação no futuro (relógio errado)', { contaCriadaEm: AGORA + DIA }, 'conta_nova'],
    ['sem consentimento de anúncios', { consentimento: false }, 'sem_consentimento'],
  ]

  it.each(TABELA)('%s → nega', (_nome, mudanca, motivo) => {
    expect(podeMostrar(pedido(mudanca))).toEqual({ pode: false, motivo })
  })

  it.each(TABELA)('%s → nega também o PREMIADO (ele é escolha, mas não fura a política)', (_n, mudanca, motivo) => {
    expect(podeMostrar(premiado(mudanca))).toEqual({ pode: false, motivo })
  })

  it.each(TABELA)('%s → nega também o intersticial', (_nome, mudanca, motivo) => {
    expect(podeMostrar(intersticial(mudanca))).toEqual({ pode: false, motivo })
  })
})

describe('podeMostrar — a conta de três dias', () => {
  it('três dias exatos já pode; um milissegundo antes, não', () => {
    expect(IDADE_MINIMA_DA_CONTA_MS).toBe(3 * DIA)
    expect(podeMostrar(pedido({ contaCriadaEm: AGORA - 3 * DIA })).pode).toBe(true)
    expect(podeMostrar(pedido({ contaCriadaEm: AGORA - 3 * DIA + 1 }))).toEqual({ pode: false, motivo: 'conta_nova' })
  })
})

describe('podeMostrar — o intersticial tem intervalo', () => {
  it('o último há menos de cinco minutos nega; aos cinco minutos volta a poder', () => {
    expect(INTERVALO_DO_INTERSTICIAL_MS).toBe(5 * 60_000)
    expect(podeMostrar(intersticial({ ultimoIntersticialEm: AGORA - 4 * 60_000 }))).toEqual({
      pode: false,
      motivo: 'intersticial_recente',
    })
    expect(podeMostrar(intersticial({ ultimoIntersticialEm: AGORA - 5 * 60_000 + 1 })).pode).toBe(false)
    expect(podeMostrar(intersticial({ ultimoIntersticialEm: AGORA - 5 * 60_000 })).pode).toBe(true)
  })

  it('o intervalo é só do intersticial: nativo e premiado não olham para ele', () => {
    expect(podeMostrar(pedido({ ultimoIntersticialEm: AGORA - 1000 })).pode).toBe(true)
    expect(podeMostrar(premiado({ ultimoIntersticialEm: AGORA - 1000 })).pode).toBe(true)
  })
})

describe('podeMostrar — listas fechadas', () => {
  it('os espaços são os do protótipo', () => {
    expect([...ESPACOS_DE_ANUNCIO].sort()).toEqual(
      [
        'ajuda-premiada',
        'ancora',
        'bib-infeed',
        'estat-faixa',
        'fim-bloco',
        'fim-premiado',
        'inicio-nativo',
        'intersticial',
        'jogar-miniatura',
        'loja-seeds',
        'loja-tema',
        'nuvem-30',
        'tema-24h',
        'trilha-oferecida',
      ].sort(),
    )
  })

  it('os formatos são três, e todo espaço tem o seu', () => {
    expect([...FORMATOS_DE_ANUNCIO]).toEqual(['nativo', 'premiado', 'intersticial'])
    for (const e of ESPACOS_DE_ANUNCIO) expect(FORMATOS_DE_ANUNCIO, e).toContain(FORMATO_DO_ESPACO[e])
    expect(FORMATO_DO_ESPACO['fim-premiado']).toBe('premiado')
    expect(FORMATO_DO_ESPACO['loja-seeds']).toBe('premiado')
    expect(FORMATO_DO_ESPACO['fim-bloco']).toBe('nativo')
    expect(FORMATO_DO_ESPACO.intersticial).toBe('intersticial')
  })

  it('espaço fora da lista nega', () => {
    expect(podeMostrar(pedido({ espaco: 'rodape-da-captura' }))).toEqual({
      pode: false,
      motivo: 'espaco_desconhecido',
    })
  })

  it('formato fora da lista nega', () => {
    expect(podeMostrar(pedido({ formato: 'pop-up' }))).toEqual({ pode: false, motivo: 'formato_desconhecido' })
  })

  it('formato que não é o do espaço nega (um intersticial não entra no lugar do cartão do Início)', () => {
    expect(podeMostrar(pedido({ espaco: 'inicio-nativo', formato: 'intersticial' }))).toEqual({
      pode: false,
      motivo: 'formato_nao_cabe',
    })
  })
})

describe('podeMostrar — a ordem (a flag vem antes de tudo)', () => {
  it('com a flag desligada o motivo é a flag, seja quem for', () => {
    expect(
      podeMostrar(
        pedido({ flagLigada: false, semAnuncios: true, perfilProtegido: true, noHeadset: true, consentimento: false }),
      ).motivo,
    ).toBe('flag_desligada')
  })

  it('o perfil protegido é dito antes do consentimento (não se pede consentimento de anúncio a menor)', () => {
    expect(podeMostrar(pedido({ perfilProtegido: true, consentimento: false })).motivo).toBe('perfil_protegido')
  })
})
