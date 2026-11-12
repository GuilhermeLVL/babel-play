/**
 * A lógica PURA da narração v2: ajustes, estilos de leitura, passo de velocidade, "voltar 10 s", sono,
 * a melhor voz por idioma e a porta de motor de voz. Spec `docs/specs/2026-10-28-narracao-v2.md`.
 */
import { describe, expect, it } from 'vitest'

import {
  ajustarValor,
  aplicarEstilo,
  dormirEm,
  estiloAtual,
  ESTILOS_DE_LEITURA,
  frasesParaVoltar,
  IDS_DE_ESTILO,
  LIMITES_DA_NARRACAO,
  minutosDoSono,
  normalizarOpcoes,
  OPCOES_PADRAO_DA_NARRACAO,
  passoDeVelocidade,
  pausaAposAFrase,
  sonoVenceu,
} from '../src/core/leitura/estilosDeLeitura'
import { vozDaNarracao } from '../src/core/leitura/narracao'
import { baseDaVoz, ordenarPorQualidade, recomendarVoz } from '../src/core/voz/melhorVoz'
import { CAPACIDADES_DO_APARELHO, escolherMotorDeVoz, type PedidoDeVoz } from '../src/core/voz/portaDeVoz'
import { LANGUAGES } from '../src/lib/languages'

describe('ajustes da narração', () => {
  it('prende cada valor no intervalo e no passo, sem lixo de ponto flutuante', () => {
    expect(ajustarValor('velocidade', 3)).toBe(2.5)
    expect(ajustarValor('velocidade', 0.1)).toBe(0.5)
    expect(ajustarValor('velocidade', 1.04)).toBe(1)
    expect(ajustarValor('velocidade', 1.26)).toBe(1.3)
    expect(ajustarValor('tom', 9)).toBe(1.5)
    expect(ajustarValor('volume', -1)).toBe(0)
    expect(ajustarValor('pausaFrase', 0.7000000001)).toBe(0.7)
    expect(ajustarValor('repeticoes', 7)).toBe(3)
    expect(ajustarValor('repeticoes', 0)).toBe(1)
    expect(ajustarValor('velocidade', Number.NaN)).toBe(1)
  })

  it('normalizar ignora o que não é número e mantém o resto da base', () => {
    const o = normalizarOpcoes({ velocidade: 1.8, tom: 'x', volume: undefined, junk: 4 } as never)
    expect(o).toEqual({ ...OPCOES_PADRAO_DA_NARRACAO, velocidade: 1.8 })
    expect(normalizarOpcoes(null)).toEqual(OPCOES_PADRAO_DA_NARRACAO)
  })

  it('passo fino da velocidade: 0,1 por vez, travando nas pontas', () => {
    expect(passoDeVelocidade(1, 1)).toBe(1.1)
    expect(passoDeVelocidade(1, -1)).toBe(0.9)
    expect(passoDeVelocidade(2.5, 1)).toBe(2.5)
    expect(passoDeVelocidade(0.5, -1)).toBe(0.5)
    expect(passoDeVelocidade(0.7, 1)).toBe(0.8)
  })

  it('a pausa depois da frase soma a de parágrafo só no fim do parágrafo', () => {
    const o = { ...OPCOES_PADRAO_DA_NARRACAO, pausaFrase: 0.5, pausaParagrafo: 0.9 }
    expect(pausaAposAFrase(o, false)).toBe(500)
    expect(pausaAposAFrase(o, true)).toBe(1400)
  })
})

describe('estilos de leitura', () => {
  it('há cinco estilos e todos cabem nos limites', () => {
    expect(IDS_DE_ESTILO).toEqual(['natural', 'audiolivro', 'dinamico', 'estudo', 'foco'])
    for (const id of IDS_DE_ESTILO) {
      const a = ESTILOS_DE_LEITURA[id].ajustes
      for (const campo of Object.keys(a) as Array<keyof typeof a>) {
        expect(a[campo], `${id}.${campo}`).toBeGreaterThanOrEqual(LIMITES_DA_NARRACAO[campo].min)
        expect(a[campo], `${id}.${campo}`).toBeLessThanOrEqual(LIMITES_DA_NARRACAO[campo].max)
      }
    }
  })

  it('o caráter de cada estilo', () => {
    const e = (id: (typeof IDS_DE_ESTILO)[number]) => ESTILOS_DE_LEITURA[id].ajustes
    expect(e('natural').velocidade).toBe(1)
    expect(e('audiolivro').velocidade).toBeLessThan(1)
    expect(e('audiolivro').tom).toBeLessThan(1)
    expect(e('audiolivro').pausaParagrafo).toBeGreaterThan(e('natural').pausaParagrafo)
    expect(e('dinamico').velocidade).toBeGreaterThan(1)
    expect(e('estudo').velocidade).toBeLessThan(1)
    expect(e('estudo').pausaFrase).toBeGreaterThan(0.5)
    expect(e('estudo').repeticoes).toBeGreaterThan(1)
    expect(e('foco').velocidade).toBeGreaterThan(e('dinamico').velocidade)
    expect(e('foco').pausaParagrafo).toBeLessThanOrEqual(e('dinamico').pausaParagrafo)
  })

  it('aplicar um estilo mantém o volume da pessoa', () => {
    const base = { ...OPCOES_PADRAO_DA_NARRACAO, volume: 0.4 }
    const o = aplicarEstilo(base, ESTILOS_DE_LEITURA.audiolivro.ajustes)
    expect(o.volume).toBe(0.4)
    expect(o.velocidade).toBe(0.9)
    expect(estiloAtual(o)).toBe('audiolivro')
  })

  it('reconhece o preset, o "Meu estilo" e o personalizado', () => {
    expect(estiloAtual(OPCOES_PADRAO_DA_NARRACAO)).toBe('natural')
    const meu = { velocidade: 1.15, tom: 1.1, pausaFrase: 0.3, pausaParagrafo: 0.5, repeticoes: 1 }
    const o = aplicarEstilo(OPCOES_PADRAO_DA_NARRACAO, meu)
    expect(estiloAtual(o, meu)).toBe('meu')
    expect(estiloAtual(o)).toBe('personalizado')
    expect(estiloAtual({ ...o, tom: 1.4 }, meu)).toBe('personalizado')
  })
})

describe('voltar 10 s', () => {
  const frases = Array.from({ length: 10 }, () => 60) // 60 caracteres ≈ 4 s a 1×
  it('recua o suficiente para cobrir os segundos, ao menos uma frase', () => {
    expect(frasesParaVoltar(frases, 5, 10, 1)).toBe(3) // 10 s × 15 = 150 caracteres → 3 frases de 60
    expect(frasesParaVoltar(frases, 5, 10, 2)).toBe(5) // o dobro de caracteres na mesma janela
    expect(frasesParaVoltar([500, 500], 1, 10, 1)).toBe(1)
  })
  it('nunca passa do começo', () => {
    expect(frasesParaVoltar(frases, 2, 10, 1)).toBe(2)
    expect(frasesParaVoltar(frases, 0, 10, 1)).toBe(1)
  })
})

describe('temporizador de sono', () => {
  it('vence no instante, conta os minutos para cima e o de capítulo não vence por relógio', () => {
    const s = dormirEm(15, 1_000)
    expect(sonoVenceu(s, 1_000 + 14 * 60_000)).toBe(false)
    expect(sonoVenceu(s, 1_000 + 15 * 60_000)).toBe(true)
    expect(minutosDoSono(s, 1_000)).toBe(15)
    expect(minutosDoSono(s, 1_000 + 14 * 60_000 + 1)).toBe(1)
    expect(sonoVenceu({ tipo: 'capitulo' }, 9e12)).toBe(false)
    expect(sonoVenceu(null, 9e12)).toBe(false)
  })
})

/* ───────────────────────────── a melhor voz ───────────────────────────── */

const v = (name: string, lang: string, local = true) => ({ name, lang, local })

describe('melhor voz recomendada', () => {
  it('pt-BR antes de pt-PT, mesmo com a de Portugal natural', () => {
    const vozes = [v('Joana', 'pt-PT'), v('Microsoft Raquel Online (Natural)', 'pt-PT', false), v('Luciana', 'pt-BR')]
    expect(recomendarVoz(vozes, 'pt-BR')?.name).toBe('Luciana')
    expect(recomendarVoz(vozes, 'pt-PT')?.name).toBe('Microsoft Raquel Online (Natural)')
  })

  it('natural vence a comum, e a que roda no aparelho vence a de rede (no mesmo nível)', () => {
    const vozes = [v('Alex', 'en-US'), v('Samantha (Enhanced)', 'en-US'), v('Google US English', 'en-US', false)]
    expect(ordenarPorQualidade(vozes, 'en-US').map((x) => x.name)).toEqual([
      'Samantha (Enhanced)',
      'Google US English',
      'Alex',
    ])
  })

  it('a região exata pesa mais que natural; sem região, quem tem natural ganha', () => {
    const vozes = [v('Voz boa Natural', 'en-GB'), v('Alex', 'en-US')]
    expect(recomendarVoz(vozes, 'en-US')?.name).toBe('Alex')
    expect(recomendarVoz(vozes, 'en')?.name).toBe('Voz boa Natural')
  })

  it('sem voz do idioma, nenhuma: não recomenda voz de outro idioma', () => {
    expect(recomendarVoz([v('Alex', 'en-US')], 'ja-JP')).toBeNull()
  })

  it('o cantonês não serve ao mandarim, e os códigos antigos valem', () => {
    expect(recomendarVoz([v('Sinji', 'zh-HK')], 'zh-CN')).toBeNull()
    expect(baseDaVoz('cmn-Hans-CN')).toBe('zh')
    expect(baseDaVoz('iw-IL')).toBe('he')
    expect(baseDaVoz('in-ID')).toBe('id')
    expect(baseDaVoz('no-NO')).toBe('nb')
    expect(baseDaVoz('nn-NO')).toBe('nb')
  })

  describe('tabela dos idiomas do catálogo', () => {
    const SINONIMOS: Record<string, string> = { zh: 'cmn-Hans-CN', he: 'iw-IL', id: 'in-ID', nb: 'no-NO' }
    it.each(LANGUAGES.map((l) => [l.code, l.short] as const))('%s escolhe a voz do idioma certo', (code, short) => {
      const doIdioma = v(`Voz ${code}`, code.replace('-', '_'))
      const ruido = [v('Alex', 'en-US'), v('Luciana', 'pt-BR'), v('Sinji', 'zh-HK'), v('Filipina', 'fil-PH')]
      const r = recomendarVoz([...ruido, doIdioma], code)
      /* en/pt/zh-HK do ruído só valem para o seu próprio idioma. */
      if (short === 'en') expect(['Alex', doIdioma.name]).toContain(r?.name)
      else if (short === 'pt') expect(['Luciana', doIdioma.name]).toContain(r?.name)
      else expect(r?.name).toBe(doIdioma.name)
      if (SINONIMOS[short]) expect(recomendarVoz([v('Sistema', SINONIMOS[short])], code)?.name).toBe('Sistema')
    })
  })
})

/* ───────────────────────────── a porta de motor ───────────────────────────── */

const pedido = (o: Partial<PedidoDeVoz> = {}): PedidoDeVoz => ({
  preferencia: 'automatica',
  idioma: 'pt',
  nuvem: { temDireito: true, flagLigada: true, escolheu: true, consentiu: true },
  perfilProtegido: false,
  responsavelAutorizou: false,
  neuralLocal: { registrado: false, pronto: false, aparelhoAguenta: true },
  ...o,
})
const neural = (o: Partial<PedidoDeVoz['neuralLocal']> = {}): PedidoDeVoz['neuralLocal'] => ({
  registrado: true,
  capacidades: { ...CAPACIDADES_DO_APARELHO, idiomas: ['pt', 'en'], tamanhoMb: 90, licenca: 'Apache-2.0' },
  pronto: true,
  aparelhoAguenta: true,
  ...o,
})
const semNuvem = { temDireito: false, flagLigada: false, escolheu: false, consentiu: false }

describe('escolherMotorDeVoz', () => {
  it('sem adaptador neural registrado, o neural-local NUNCA é escolhido (qualquer pedido)', () => {
    for (const preferencia of ['automatica', 'aparelho', 'nuvem', 'neural-local'] as const) {
      for (const nuvem of [semNuvem, pedido().nuvem]) {
        for (const pronto of [true, false]) {
          const r = escolherMotorDeVoz(
            pedido({ preferencia, nuvem, neuralLocal: { registrado: false, pronto, aparelhoAguenta: true } }),
          )
          expect(r.motor).not.toBe('neural-local')
          expect(r.reservas).not.toContain('neural-local')
        }
      }
    }
  })

  it.each<[string, Partial<PedidoDeVoz>, string, string]>([
    ['automática sem nada especial: aparelho', { nuvem: semNuvem }, 'aparelho', 'padrao-do-aparelho'],
    ['escolheu a nuvem com direito, flag e consentimento', {}, 'nuvem', 'escolha-da-pessoa'],
    ['pediu aparelho mesmo podendo nuvem', { preferencia: 'aparelho' }, 'aparelho', 'escolha-da-pessoa'],
    [
      'escolheu a nuvem sem o plano: aparelho',
      { nuvem: { ...pedido().nuvem, temDireito: false } },
      'aparelho',
      'padrao-do-aparelho',
    ],
    ['flag desligada: aparelho', { nuvem: { ...pedido().nuvem, flagLigada: false } }, 'aparelho', 'padrao-do-aparelho'],
    [
      'sem consentimento: aparelho',
      { nuvem: { ...pedido().nuvem, consentiu: false } },
      'aparelho',
      'padrao-do-aparelho',
    ],
    [
      'só tem direito, não escolheu a nuvem: aparelho',
      { nuvem: { ...pedido().nuvem, escolheu: false } },
      'aparelho',
      'padrao-do-aparelho',
    ],
    [
      'preferência explícita pela nuvem vale como escolha',
      { preferencia: 'nuvem', nuvem: { ...pedido().nuvem, escolheu: false } },
      'nuvem',
      'escolha-da-pessoa',
    ],
  ])('%s', (_nome, o, motor, motivo) => {
    const r = escolherMotorDeVoz(pedido(o))
    expect(r.motor).toBe(motor)
    expect(r.motivo).toBe(motivo)
    expect(r.reservas.at(-1) ?? r.motor).toBe('aparelho')
  })

  it('PERFIL PROTEGIDO: texto nunca vai à nuvem sem consentimento E responsável', () => {
    for (const consentiu of [true, false]) {
      for (const responsavelAutorizou of [true, false]) {
        const r = escolherMotorDeVoz(
          pedido({
            preferencia: 'nuvem',
            perfilProtegido: true,
            responsavelAutorizou,
            nuvem: { ...pedido().nuvem, consentiu },
          }),
        )
        if (consentiu && responsavelAutorizou) expect(r.motor).toBe('nuvem')
        else {
          expect(r.motor).toBe('aparelho')
          expect(r.descartados).toContainEqual({ motor: 'nuvem', motivo: 'perfil-protegido' })
        }
      }
    }
  })

  it('com o neural local pronto e automática: ele vence, com a nuvem e o aparelho de reserva', () => {
    const r = escolherMotorDeVoz(pedido({ neuralLocal: neural() }))
    expect(r.motor).toBe('neural-local')
    expect(r.motivo).toBe('neural-local-pronto')
    expect(r.reservas).toEqual(['nuvem', 'aparelho'])
  })

  it.each<[string, Partial<PedidoDeVoz['neuralLocal']>, string]>([
    ['idioma fora do motor', { capacidades: { ...CAPACIDADES_DO_APARELHO, idiomas: ['en'] } }, 'idioma-fora-do-neural'],
    ['modelo ainda não baixado', { pronto: false }, 'neural-nao-pronto'],
    ['aparelho não aguenta', { aparelhoAguenta: false }, 'aparelho-nao-aguenta'],
  ])('neural registrado mas %s: cai para a nuvem/aparelho', (_n, parcial, motivo) => {
    const r = escolherMotorDeVoz(pedido({ nuvem: semNuvem, neuralLocal: neural(parcial) }))
    expect(r.motor).toBe('aparelho')
    expect(r.descartados).toContainEqual({ motor: 'neural-local', motivo })
  })

  it('quem pediu aparelho não recebe o neural', () => {
    expect(escolherMotorDeVoz(pedido({ preferencia: 'aparelho', neuralLocal: neural() })).motor).toBe('aparelho')
  })
})

describe('vozDaNarracao com a porta', () => {
  const base = { escolheuNuvem: false, temDireito: false, flagLigada: false }
  it('sem o campo novo, o comportamento é o de sempre', () => {
    expect(vozDaNarracao(base)).toBe('aparelho')
    expect(vozDaNarracao({ escolheuNuvem: true, temDireito: true, flagLigada: true })).toBe('nuvem')
    expect(vozDaNarracao({ escolheuNuvem: true, temDireito: true, flagLigada: false })).toBe('aparelho')
    expect(vozDaNarracao({ ...base, neuralLocalPronto: false })).toBe('aparelho')
  })
  it('o terceiro valor só aparece quando o neural local está pronto', () => {
    expect(vozDaNarracao({ ...base, neuralLocalPronto: true })).toBe('neural-local')
  })
})
