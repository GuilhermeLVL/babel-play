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
  tratamentoDaFaixa,
  tratamentoDeIdade,
  TRATAMENTOS_DE_IDADE,
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
  semRede: false,
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
    ['headset', { noHeadset: true }, 'headset'],
    ['sem rede', { semRede: true }, 'sem_rede'],
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

/* Decisão do dono (25/10/2026, spec `2026-10-25-site-publico-seo-e-anuncios.md`, Tarefa 3): a regra antiga
   "perfil protegido → nada" virou "perfil protegido → anúncio comum sim, premiado nunca". */
describe('podeMostrar — o perfil protegido (menor, idade não declarada, sem conta)', () => {
  it('vê o anúncio COMUM (nativo, âncora, faixa) e o intersticial, com as regras de todo mundo', () => {
    expect(podeMostrar(pedido({ perfilProtegido: true }))).toEqual({ pode: true, motivo: 'pode' })
    expect(podeMostrar(pedido({ perfilProtegido: true, espaco: 'ancora' }))).toEqual({ pode: true, motivo: 'pode' })
    expect(podeMostrar(intersticial({ perfilProtegido: true }))).toEqual({ pode: true, motivo: 'pode' })
  })

  it('NUNCA vê o premiado ("assista e ganhe" é só para adultos), em nenhum dos espaços premiados', () => {
    for (const espaco of ESPACOS_DE_ANUNCIO.filter((e) => FORMATO_DO_ESPACO[e] === 'premiado'))
      expect(podeMostrar(premiado({ espaco, perfilProtegido: true })), espaco).toEqual({
        pode: false,
        motivo: 'premiado_so_para_adultos',
      })
  })

  it('o premiado do protegido é negado antes do consentimento (não se pede consentimento por ele)', () => {
    expect(podeMostrar(premiado({ perfilProtegido: true, consentimento: false })).motivo).toBe(
      'premiado_so_para_adultos',
    )
  })

  it('as outras regras continuam valendo para o protegido: consentimento, conta nova, plano, tela ocupada', () => {
    expect(podeMostrar(pedido({ perfilProtegido: true, consentimento: false })).motivo).toBe('sem_consentimento')
    expect(podeMostrar(pedido({ perfilProtegido: true, contaCriadaEm: null })).motivo).toBe('conta_nova')
    expect(podeMostrar(pedido({ perfilProtegido: true, semAnuncios: true })).motivo).toBe('sem_anuncios_no_plano')
    expect(podeMostrar(pedido({ perfilProtegido: true, emTeste: true })).motivo).toBe('em_teste')
    expect(
      podeMostrar(
        pedido({
          perfilProtegido: true,
          tela: { capturaAtiva: true, interpreteAberto: false, rodadaEmAndamento: false },
        }),
      ).motivo,
    ).toBe('captura_ativa')
  })
})

describe('tratamentoDeIdade — o tratamento de idade que vai ao Google', () => {
  it('abaixo de 13 → criança; 13–17 → adolescente; 18+ → nenhum', () => {
    expect(tratamentoDeIdade(0)).toBe('crianca')
    expect(tratamentoDeIdade(11)).toBe('crianca')
    expect(tratamentoDeIdade(12)).toBe('crianca')
    expect(tratamentoDeIdade(13)).toBe('adolescente')
    expect(tratamentoDeIdade(15)).toBe('adolescente')
    expect(tratamentoDeIdade(17)).toBe('adolescente')
    expect(tratamentoDeIdade(18)).toBe('nenhum')
    expect(tratamentoDeIdade(40)).toBe('nenhum')
  })

  it('idade desconhecida ou absurda → criança (o lado protetivo)', () => {
    expect(tratamentoDeIdade(null)).toBe('crianca')
    expect(tratamentoDeIdade(undefined)).toBe('crianca')
    expect(tratamentoDeIdade(Number.NaN)).toBe('crianca')
    expect(tratamentoDeIdade(-1)).toBe('crianca')
  })

  it('pela faixa: `12-15` inclui quem tem 12, então é criança; faixa desconhecida também', () => {
    expect(tratamentoDaFaixa('menor-12')).toBe('crianca')
    expect(tratamentoDaFaixa('12-15')).toBe('crianca')
    expect(tratamentoDaFaixa('16-17')).toBe('adolescente')
    expect(tratamentoDaFaixa('adulto')).toBe('nenhum')
    expect(tratamentoDaFaixa(null)).toBe('crianca')
    expect(tratamentoDaFaixa('outra')).toBe('crianca')
  })

  it('a lista é fechada (é o que a página de anúncios aceita)', () => {
    expect([...TRATAMENTOS_DE_IDADE]).toEqual(['crianca', 'adolescente', 'nenhum'])
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
        'jogar-faixa',
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

  it('o premiado do perfil protegido é dito antes do consentimento; o comum, não (o menor responde à folha)', () => {
    expect(podeMostrar(premiado({ perfilProtegido: true, consentimento: false })).motivo).toBe(
      'premiado_so_para_adultos',
    )
    expect(podeMostrar(pedido({ perfilProtegido: true, consentimento: false })).motivo).toBe('sem_consentimento')
  })
})
