/**
 * CALIBRAÇÃO DO FSRS e AGREGADOS DIÁRIOS: as duas contas puras da change `modelo-do-aluno-e-dados`
 * (fatias 1 e 2), com histórico sintético. Sem banco.
 */
import { describe, expect, it } from 'vitest'

import { agregarPorDia, idiomaDaRodada } from '../src/core/learning/agregados'
import {
  calibracaoDoFsrs,
  calibracaoPorOrigem,
  previsaoDaRevisao,
  type RevisaoParaCalibrar,
  tempoDeRespostaGravavel,
  TETO_DA_RESPOSTA_MS,
} from '../src/core/learning/calibracao'
import { makeFsrs5, retrievability } from '../src/core/learning/scheduler'

const DIA = 86_400_000

/**
 * `n` revisões de cartões diferentes, todas com a mesma retenção prevista, das quais `lembradas`
 * foram lembradas (nota 3) e o resto esquecido (nota 1). Um dia por revisão.
 */
function grupo(
  prefixo: string,
  n: number,
  prevista: number,
  lembradas: number,
  origem?: string,
): RevisaoParaCalibrar[] {
  return Array.from({ length: n }, (_, i) => ({
    cardId: `${prefixo}-${i}`,
    em: (i + 1) * DIA,
    grade: i < lembradas ? 3 : 1,
    prevStability: 10,
    elapsedDays: 5,
    retencaoPrevista: prevista,
    origem,
  }))
}

describe('calibracaoDoFsrs', () => {
  it('histórico calibrado: em cada faixa o real é igual ao previsto e o erro é zero', () => {
    const historico = [...grupo('a', 100, 0.95, 95), ...grupo('b', 100, 0.85, 85), ...grupo('c', 100, 0.55, 55)]
    const c = calibracaoDoFsrs(historico)
    expect(c.revisoes).toBe(300)
    expect(c.erro).toBeCloseTo(0, 12)
    expect(c.previsto).toBeCloseTo((0.95 + 0.85 + 0.55) / 3, 12)
    expect(c.real).toBeCloseTo((95 + 85 + 55) / 300, 12)
    const porFaixa = Object.fromEntries(c.faixas.map((f) => [`${f.de}-${f.ate}`, f]))
    expect(porFaixa['0.9-1']).toMatchObject({ revisoes: 100, real: 0.95 })
    expect(porFaixa['0.8-0.9']).toMatchObject({ revisoes: 100, real: 0.85 })
    expect(porFaixa['0.5-0.6']).toMatchObject({ revisoes: 100, real: 0.55 })
    expect(porFaixa['0.6-0.7']).toEqual({ de: 0.6, ate: 0.7, revisoes: 0, previsto: null, real: null })
  })

  it('agendador otimista: previu 90% e a pessoa lembrou 70%; o erro é a diferença', () => {
    const c = calibracaoDoFsrs(grupo('a', 200, 0.9, 140))
    expect(c.previsto).toBeCloseTo(0.9, 12)
    expect(c.real).toBeCloseTo(0.7, 12)
    expect(c.erro).toBeCloseTo(0.2, 12)
  })

  it('o erro pesa cada faixa pelo número de revisões dela', () => {
    // 300 revisões calibradas e 100 com 0,2 de diferença: raiz de (100 × 0,04 / 400) = 0,1.
    const c = calibracaoDoFsrs([...grupo('a', 300, 0.95, 285), ...grupo('b', 100, 0.75, 55)])
    expect(c.erro).toBeCloseTo(0.1, 12)
  })

  it('nota 2 (Difícil) conta como lembrada; nota 1 é o esquecimento', () => {
    const base = { prevStability: 10, elapsedDays: 5, retencaoPrevista: 0.9 }
    const c = calibracaoDoFsrs([
      { ...base, cardId: 'a', em: DIA, grade: 2 },
      { ...base, cardId: 'b', em: DIA, grade: 1 },
    ])
    expect(c.real).toBe(0.5)
  })

  it('sem previsão gravada, recalcula de prevStability e elapsedDays (a conta do agendador)', () => {
    const r = { cardId: 'a', em: DIA, grade: 3, prevStability: 12, elapsedDays: 7 }
    expect(previsaoDaRevisao(r)).toBe(retrievability(7, 12))
    expect(calibracaoDoFsrs([r]).previsto).toBe(retrievability(7, 12))
  })

  it('fica de fora: primeira revisão do cartão, revisão sem nota e repetição no mesmo dia', () => {
    const c = calibracaoDoFsrs([
      { cardId: 'nova', em: DIA, grade: 3, prevStability: null, elapsedDays: 0 },
      { cardId: 'sem-nota', em: DIA, grade: null, prevStability: 5, elapsedDays: 2 },
      { cardId: 'a', em: 2 * DIA + 10, grade: 1, prevStability: 5, elapsedDays: 2 },
      { cardId: 'a', em: 2 * DIA + 60_000, grade: 3, prevStability: 5, elapsedDays: 0 },
      { cardId: 'a', em: 3 * DIA + 10, grade: 3, prevStability: 5, elapsedDays: 1 },
    ])
    expect(c.ignoradas).toEqual({ semPrevisao: 1, semNota: 1, repetidasNoDia: 1 })
    // Do cartão `a` valem a primeira do dia 2 (esquecida) e a do dia 3 (lembrada).
    expect(c.revisoes).toBe(2)
    expect(c.real).toBe(0.5)
  })

  it('com as repetições do dia, a segunda nota entra; e o dia é o de quem chama', () => {
    const historico: RevisaoParaCalibrar[] = [
      { cardId: 'a', em: DIA - 1000, grade: 1, prevStability: 5, elapsedDays: 2 },
      { cardId: 'a', em: DIA + 1000, grade: 3, prevStability: 5, elapsedDays: 0 },
    ]
    // Em UTC são dois dias; num fuso 1 h atrás é o mesmo dia, e a segunda é repetição.
    expect(calibracaoDoFsrs(historico).revisoes).toBe(2)
    expect(calibracaoDoFsrs(historico, { diaDe: (em) => Math.floor((em - 3_600_000) / DIA) }).revisoes).toBe(1)
    expect(
      calibracaoDoFsrs(historico, { soPrimeiraDoDia: false, diaDe: (em) => Math.floor((em - 3_600_000) / DIA) })
        .revisoes,
    ).toBe(2)
  })

  it('histórico vazio: tudo nulo, sem divisão por zero', () => {
    const c = calibracaoDoFsrs([])
    expect(c).toMatchObject({ revisoes: 0, previsto: null, real: null, erro: null })
    expect(c.faixas).toHaveLength(6)
  })

  it('por origem: a Revisão e cada jogo têm a sua conta; o passado sem origem fica à parte', () => {
    const por = calibracaoPorOrigem([
      ...grupo('r', 50, 0.9, 45, 'revisao'),
      ...grupo('j', 50, 0.9, 50, 'jogo:blitz'),
      ...grupo('v', 10, 0.9, 9),
    ])
    expect(Object.keys(por)).toEqual(['jogo:blitz', 'revisao', 'sem-origem'])
    expect(por.revisao.erro).toBeCloseTo(0, 12)
    // O jogo de reconhecer acerta mais do que o agendador previa: é o que esta medida existe para mostrar.
    expect(por['jogo:blitz'].real).toBe(1)
    expect(por['jogo:blitz'].erro).toBeCloseTo(0.1, 12)
  })

  it('histórico gerado pelo próprio agendador: a previsão gravada é a que ele usa para agendar', () => {
    const fsrs = makeFsrs5()
    let estado = fsrs.init(0)
    const historico: RevisaoParaCalibrar[] = []
    let agora = 0
    for (const nota of [3, 3, 1, 3, 4, 2] as const) {
      const prevista = fsrs.predictedRetention(estado, agora) ?? null
      const antes = estado
      estado = fsrs.review(estado, nota, agora)
      historico.push({
        cardId: 'a',
        em: agora,
        grade: nota,
        prevStability: antes.stability ?? null,
        elapsedDays: antes.lastReview === undefined ? 0 : (agora - antes.lastReview) / DIA,
        retencaoPrevista: prevista,
      })
      agora = Math.max(estado.dueAt, agora + DIA)
    }
    const c = calibracaoDoFsrs(historico)
    // A primeira não tinha estabilidade; as outras cinco entram, todas com previsão entre 0 e 1.
    expect(c.ignoradas.semPrevisao).toBe(1)
    expect(c.revisoes).toBe(5)
    // Recalcular do estado anterior dá a mesma previsão que foi gravada.
    for (const r of historico.slice(1)) {
      expect(previsaoDaRevisao({ ...r, retencaoPrevista: null })).toBeCloseTo(r.retencaoPrevista as number, 12)
    }
  })
})

describe('tempoDeRespostaGravavel', () => {
  it('arredonda, aplica o teto de 60 s e recusa o que não é tempo', () => {
    expect(tempoDeRespostaGravavel(1234.6)).toBe(1235)
    expect(tempoDeRespostaGravavel(0)).toBe(0)
    expect(tempoDeRespostaGravavel(10 * 60_000)).toBe(TETO_DA_RESPOSTA_MS)
    expect(TETO_DA_RESPOSTA_MS).toBe(60_000)
    for (const ruim of [undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY, '900']) {
      expect(tempoDeRespostaGravavel(ruim)).toBeNull()
    }
  })
})

describe('agregarPorDia', () => {
  const diaDe = (em: number) => Math.floor(em / DIA)

  it('soma revisões por idioma e dia: todas, vivas, por nota, novas, tempo e previsão', () => {
    const celulas = agregarPorDia(
      {
        revisoes: [
          { em: DIA + 5, idioma: 'en', grade: 3, viva: true, nova: true, n: 2, respostaMs: 3000, comPrevisao: 0 },
          { em: DIA + 9, idioma: 'en', grade: 1, viva: true, nova: false, n: 1, comPrevisao: 1, somaPrevista: 0.8 },
          { em: DIA + 9, idioma: 'en', grade: 4, viva: false, nova: false, n: 1 },
          { em: DIA + 9, idioma: 'es', grade: null, viva: true, nova: false, n: 1 },
          { em: 2 * DIA, idioma: 'en', grade: 2, viva: true, nova: false, n: 3, comPrevisao: 3, somaPrevista: 2.4 },
        ],
      },
      diaDe,
    )
    expect(celulas.map((c) => [c.idioma, c.dia])).toEqual([
      ['en', 1],
      ['en', 2],
      ['es', 1],
    ])
    const [en1, en2, es1] = celulas
    // A desfeita (não viva) continua em `revisoes` e `acertos`, e fora do resto.
    expect(en1).toMatchObject({ revisoes: 4, acertos: 3, revisoesVivas: 3, nota1: 1, nota3: 2, nota4: 0, novas: 2 })
    expect(en1).toMatchObject({ tempoRevisaoMs: 3000, comPrevisao: 1, somaPrevista: 0.8, lembradasComPrevisao: 0 })
    expect(en2).toMatchObject({ revisoes: 3, acertos: 0, nota2: 3, comPrevisao: 3, lembradasComPrevisao: 3 })
    // Sem nota: aconteceu e está viva, mas não entra em nenhuma nota.
    expect(es1).toMatchObject({ revisoes: 1, acertos: 0, revisoesVivas: 1, nota1: 0, nota2: 0, nota3: 0, nota4: 0 })
  })

  it('desfazer uma revisão é somar a parte viva dela com sinal trocado', () => {
    const revisao = { em: DIA, idioma: 'en', grade: 3, viva: true, nova: true, respostaMs: 1500 }
    const [feita] = agregarPorDia({ revisoes: [{ ...revisao, n: 1 }] }, diaDe)
    const [desfeita] = agregarPorDia({ revisoes: [{ ...revisao, n: -1, respostaMs: -1500, soParteViva: true }] }, diaDe)
    expect(feita).toMatchObject({ revisoes: 1, acertos: 1, revisoesVivas: 1, nota3: 1, novas: 1, tempoRevisaoMs: 1500 })
    expect(desfeita).toMatchObject({
      revisoes: 0,
      acertos: 0,
      revisoesVivas: -1,
      nota3: -1,
      novas: -1,
      tempoRevisaoMs: -1500,
    })
  })

  it('itens de jogo e rodadas: o drill é contado à parte e a rodada conta uma vez', () => {
    const [c] = agregarPorDia(
      {
        itens: [
          { em: DIA, idioma: 'en', drill: true, n: 5, certos: 4, ms: 9000 },
          { em: DIA, idioma: 'en', drill: false, n: 3, certos: 1, ms: 2000 },
        ],
        rodadas: [{ em: DIA, idioma: 'en' }],
      },
      diaDe,
    )
    expect(c).toMatchObject({
      itensDeJogo: 8,
      itensCertos: 5,
      itensDrill: 5,
      itensDrillCertos: 4,
      tempoJogoMs: 11000,
      rodadas: 1,
    })
  })

  it('agrupar antes ou somar um a um dá as mesmas células', () => {
    const um = { em: DIA, idioma: 'en', grade: 3, viva: true, nova: false }
    const agrupado = agregarPorDia({ revisoes: [{ ...um, n: 4, respostaMs: 4000 }] }, diaDe)
    const solto = agregarPorDia(
      { revisoes: Array.from({ length: 4 }, () => ({ ...um, n: 1, respostaMs: 1000 })) },
      diaDe,
    )
    expect(solto).toEqual(agrupado)
  })

  it('o idioma da rodada é o menor dos idiomas dos itens, com vazio para item sem cartão', () => {
    expect(idiomaDaRodada(['es', 'en', 'es'])).toBe('en')
    expect(idiomaDaRodada(['es', null])).toBe('')
    expect(idiomaDaRodada([])).toBe('')
  })
})
