/**
 * O NÍVEL DE SERVIÇO NA CAPTURA, A PARTE PURA (`src/lib/captura/nivelDeServico.ts`): o que cada nível
 * grava na preferência que já existia, o que o plano oferece e o que tem cadeado, as horas de nuvem do
 * mês e o ícone da marca. A tela é `tests/niveisDaCaptura.test.tsx`.
 */
import { describe, expect, it } from 'vitest'

import { decidirRota, type PedidoDeRota } from '../src/core/rota/politicaDeRota'
import {
  escolhaDaPreferencia,
  horas,
  marcaDoSelo,
  medidoresDoUso,
  niveisDaTela,
  nivelDoSelo,
  qualidadeDoNivel,
  quemTemONivel,
  TRANSPORTE_AO_VIVO_EXISTE,
} from '../src/lib/captura/nivelDeServico'
import { seloDaFala } from '../src/lib/captura/seloDaFala'
import type { UsoDoMes } from '../src/lib/uso'

const pedido = (nuvem: boolean): PedidoDeRota => ({
  tarefa: 'stt-final',
  fonte: 'sistema',
  idioma: 'pt',
  aparelho: {
    tipo: 'desktop-sem-gpu',
    leve: false,
    travando: false,
    gpuProvada: false,
    economiaDeDados: false,
    smallNaGpu: false,
    whisperNaGpu: false,
    shaderF16: false,
    navegador: { fala: false, falaNoAparelho: null, bipaAoReligar: false, tradutor: false },
    modelos: { opusMt: true, bergamot: false, llmLocal: false },
  },
  plano: {
    nuvemPorTrechos: nuvem,
    precisaoPorPadrao: nuvem,
    nuvemAoVivo: false,
    traducaoNaNuvem: nuvem,
    nuance: false,
    vozNeural: false,
    restante: { trechosNoMesS: null, trechosNoDiaS: null, aoVivoNoMesS: null, aoVivoNoDiaS: null },
  },
  estado: {
    consentimentos: { nuvem: true, navegador: false },
    perfilPrivado: false,
    perfilProtegido: false,
    responsavelAutorizou: false,
    nuvemDisponivel: true,
    nuvemPausada: false,
    semRede: false,
    edicaoEstatica: false,
    nuvemDoSite: false,
    preferencia: { qualidade: 'auto', microfone: 'modelo' },
  },
})

const usoDe = (trechos: [number, number | null], aovivo: [number, number | null] = [0, 0]): UsoDoMes => {
  const contador = ([usado, teto]: [number, number | null]) => ({
    usado,
    teto,
    restante: teto === null ? null : Math.max(0, teto - usado),
  })
  return {
    plano: 'premium',
    janela: '2026-10',
    chamadas: { usado: 0, teto: 0 },
    segundosDeAudio: { usado: trechos[0], teto: trechos[1] },
    porNivel: { trechos: contador(trechos), aovivo: contador(aovivo) },
    tokensDeLlm: { usado: 0, teto: 0 },
  }
}

describe('o nível ↔ a preferência que já existia (SttQuality)', () => {
  it('lê a escolha da pessoa da qualidade gravada', () => {
    expect(escolhaDaPreferencia('auto')).toBe('auto')
    expect(escolhaDaPreferencia('fast')).toBe('aparelho')
    expect(escolhaDaPreferencia('accurate')).toBe('aparelho')
    expect(escolhaDaPreferencia('cloud')).toBe('precisao')
  })

  it('"Precisão" grava a nuvem por trechos; "No aparelho", o melhor modelo local', () => {
    expect(qualidadeDoNivel('precisao', 'auto')).toBe('cloud')
    expect(qualidadeDoNivel('aparelho', 'auto')).toBe('accurate')
    expect(qualidadeDoNivel('aparelho', 'cloud')).toBe('accurate')
  })

  it('quem já escolheu um modelo local fica com o que escolheu', () => {
    expect(qualidadeDoNivel('aparelho', 'fast')).toBe('fast')
    expect(qualidadeDoNivel('aparelho', 'accurate')).toBe('accurate')
  })
})

describe('o seletor por capacidade do plano', () => {
  const base = { protegido: false, semPlanos: false }

  it('sem nuvem no plano: Precisão e Ao vivo com cadeado', () => {
    expect(niveisDaTela({ ...base, capacidades: { managedCloudStt: false, sttAoVivo: false } })).toEqual([
      { nivel: 'aparelho', tranca: false },
      { nivel: 'precisao', tranca: true },
      { nivel: 'aovivo', tranca: true },
    ])
  })

  it('com nuvem por trechos: só o Ao vivo tem cadeado', () => {
    expect(
      niveisDaTela({ ...base, capacidades: { managedCloudStt: true, sttAoVivo: false } }).map((n) => n.tranca),
    ).toEqual([false, false, true])
  })

  it('o Ao vivo tem cadeado até para o plano que o declara: o transporte não existe', () => {
    expect(TRANSPORTE_AO_VIVO_EXISTE).toBe(false)
    const comAoVivo = { ...base, capacidades: { managedCloudStt: true, sttAoVivo: true } }
    expect(niveisDaTela(comAoVivo).find((n) => n.nivel === 'aovivo')?.tranca).toBe(true)
    // Quando o transporte existir, é a capacidade do plano que abre.
    expect(niveisDaTela({ ...comAoVivo, transporteAoVivo: true }).find((n) => n.nivel === 'aovivo')?.tranca).toBe(false)
  })

  it('perfil protegido: os níveis que enviam áudio não são oferecidos', () => {
    const tudo = { managedCloudStt: true, sttAoVivo: true }
    expect(niveisDaTela({ protegido: true, semPlanos: false, capacidades: tudo })).toEqual([
      { nivel: 'aparelho', tranca: false },
    ])
  })

  it('sem plano a assinar (edição estática): o nível com cadeado some, em vez de abrir uma porta vazia', () => {
    expect(
      niveisDaTela({ protegido: false, semPlanos: true, capacidades: { managedCloudStt: false, sttAoVivo: false } }),
    ).toEqual([{ nivel: 'aparelho', tranca: false }])
  })
})

describe('as horas de nuvem do mês', () => {
  it('escreve as horas como o protótipo', () => {
    expect(horas(300)).toBe('5 h')
    expect(horas(390)).toBe('6 h 30')
    expect(horas(40)).toBe('40 min')
    expect(horas(65)).toBe('1 h 05')
  })

  it('sem resposta do servidor não há medidor', () => {
    expect(medidoresDoUso(null)).toEqual([])
  })

  it('sem nuvem no plano (teto zero) não há medidor', () => {
    expect(medidoresDoUso(usoDe([0, 0]))).toEqual([])
  })

  it('sem teto (self-host) não há o que medir', () => {
    expect(medidoresDoUso(usoDe([1200, null]))).toEqual([])
  })

  it('com horas: quanto foi usado, quanto resta e a fração', () => {
    expect(medidoresDoUso(usoDe([23_400, 72_000]))).toEqual([
      { nivel: 'precisao', usado: 390, total: 1200, resta: 810, pct: 33, acabou: false },
    ])
  })

  it('horas esgotadas: acabou, e não resta nada', () => {
    const [m] = medidoresDoUso(usoDe([18_000, 18_000]))
    expect(m).toMatchObject({ nivel: 'precisao', total: 300, resta: 0, pct: 100, acabou: true })
    // Passar do teto (a última fala estourou) continua sendo "acabou", nunca um resto negativo.
    expect(medidoresDoUso(usoDe([18_400, 18_000]))[0]).toMatchObject({ usado: 300, resta: 0, acabou: true })
  })

  it('o plano com os dois níveis tem os dois medidores', () => {
    expect(medidoresDoUso(usoDe([23_400, 72_000], [8100, 36_000])).map((m) => m.nivel)).toEqual(['precisao', 'aovivo'])
  })

  it('servidor anterior (sem porNivel): os trechos saem do contador de sempre', () => {
    const antigo = { ...usoDe([6000, 18_000]), porNivel: undefined }
    expect(medidoresDoUso(antigo)).toEqual([
      { nivel: 'precisao', usado: 100, total: 300, resta: 200, pct: 33, acabou: false },
    ])
  })
})

describe('a marca segue o selo da fala', () => {
  const noAparelho = seloDaFala(decidirRota(pedido(false)))!
  const naNuvem = seloDaFala(decidirRota(pedido(true)))!
  const calmo = { semRede: false, horasAcabaram: false }

  it('o nível em uso é o do selo', () => {
    expect(nivelDoSelo(null)).toBeNull()
    expect(nivelDoSelo(noAparelho)).toBe('aparelho')
    expect(nivelDoSelo(naNuvem)).toBe('precisao')
  })

  it('REGRA DE OURO: a fala que saiu nunca vira "No aparelho"', () => {
    // Previsto o aparelho, e a última fala foi atendida pela nuvem.
    const saiu = seloDaFala(decidirRota(pedido(false)), 'groq-whisper')!
    expect(saiu.saiDoAparelho).toBe(true)
    expect(nivelDoSelo(saiu)).toBe('precisao')
    expect(marcaDoSelo(saiu, calmo).icone).toBe('server')
  })

  it('o ícone e o tom: aparelho, nuvem, sem internet e horas esgotadas', () => {
    expect(marcaDoSelo(noAparelho, calmo)).toEqual({ icone: 'cpu', tom: '' })
    expect(marcaDoSelo(naNuvem, calmo)).toEqual({ icone: 'server', tom: 'nuvem' })
    expect(marcaDoSelo(naNuvem, { semRede: true, horasAcabaram: false })).toEqual({ icone: 'wifi-off', tom: 'alerta' })
    expect(marcaDoSelo(noAparelho, { semRede: false, horasAcabaram: true })).toEqual({ icone: 'cpu', tom: 'alerta' })
  })

  it('a rota que mudou sozinha fica em alerta', () => {
    const mudou = seloDaFala(decidirRota(pedido(true)), 'whisper-local')!
    expect(mudou.mudou).toBe(true)
    expect(marcaDoSelo(mudou, calmo).tom).toBe('alerta')
  })
})

describe('a folha do cadeado: qual plano abre o nível', () => {
  it('Precisão: os planos à venda que têm nuvem, do mais barato, sem repetir as mesmas horas', () => {
    expect(quemTemONivel('precisao', ['essencial', 'premium', 'aovivo'])).toEqual([
      { plano: 'essencial', horasNoMes: 5, aVenda: true },
      { plano: 'premium', horasNoMes: 20, aVenda: true },
    ])
  })

  it('Precisão com só o Premium à venda: é ele que abre', () => {
    expect(quemTemONivel('precisao', ['premium'])).toEqual([{ plano: 'premium', horasNoMes: 20, aVenda: true }])
  })

  it('Ao vivo: o único plano que o tem aparece mesmo fora de venda, dito como tal', () => {
    expect(quemTemONivel('aovivo', ['premium'])).toEqual([{ plano: 'aovivo', horasNoMes: 10, aVenda: false }])
    expect(quemTemONivel('aovivo', ['essencial', 'premium', 'aovivo'])[0]).toMatchObject({ aVenda: true })
  })
})
