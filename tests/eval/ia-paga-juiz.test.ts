/**
 * O JUIZ DA IA PAGA — rubrica binária, ordem pareada, quem julga quem, kappa e a planilha de calibração. Puro.
 *
 *   - rubrica ilegível ou com critério faltando é AUSÊNCIA de julgamento, nunca nota zero;
 *   - o pareado só vale quando sobrevive à troca de posição (viés de posição vira empate instável);
 *   - um juiz nunca julga a própria família;
 *   - kappa desconta o acaso (dois "sim a tudo" concordam 100% sem ler nada);
 *   - a planilha é cega e o kappa juiz × humano lê a planilha preenchida.
 */
import { describe, expect, it } from 'vitest'

import * as concordancia from '../../scripts/eval-ia/concordancia.mjs'
import * as juiz from '../../scripts/eval-ia/juiz.mjs'

const {
  combinarOrdens,
  familia,
  juizPara,
  lerPareado,
  lerRubrica,
  notaDaRubrica,
  pareadoSemJuiz,
  userDaRubrica,
  vereditoDaInvalida,
} = juiz as any
const {
  escolherParaCalibrar,
  kappaDaPlanilha,
  kappaDeCohen,
  lerCsv,
  leituraDoKappa,
  montarPlanilha,
  NAO_SE_APLICA,
  paraCsv,
  vereditoMedio,
} = concordancia as any

const CRIT = [
  { id: 'a', pergunta: 'A?' },
  { id: 'b', pergunta: 'B?' },
]

describe('rubrica binária', () => {
  it('lê o JSON (com cerca de código) e devolve veredito + raciocínio por critério', () => {
    const v = lerRubrica(
      '```json\n{"criterios":[{"id":"a","raciocinio":"ok","veredito":true},{"id":"b","raciocinio":"errou","veredito":false}]}\n```',
      CRIT,
    )
    expect(v).toEqual({ a: { veredito: true, raciocinio: 'ok' }, b: { veredito: false, raciocinio: 'errou' } })
    expect(notaDaRubrica(v)).toBe(0.5)
  })

  it('aceita o NÚMERO do critério no lugar do nome (o juiz às vezes devolve "1", "2"), pela ordem pedida', () => {
    const v = lerRubrica('{"criterios":[{"id":"1","veredito":true},{"id":"2","veredito":false}]}', CRIT)
    expect(v.a.veredito).toBe(true)
    expect(v.b.veredito).toBe(false)
    // Nome de critério trocado não vira posição: o "b" no lugar do "a" não conta como "a".
    expect(lerRubrica('{"criterios":[{"id":"b","veredito":true},{"id":"x","veredito":false}]}', CRIT)).toBeNull()
  })

  it('critério faltando, veredito não booleano ou texto sem JSON = null (fora da conta, não zero)', () => {
    expect(lerRubrica('{"criterios":[{"id":"a","veredito":true}]}', CRIT)).toBeNull()
    expect(lerRubrica('{"criterios":[{"id":"a","veredito":true},{"id":"b","veredito":"talvez"}]}', CRIT)).toBeNull()
    expect(lerRubrica('não sei', CRIT)).toBeNull()
  })

  it('a resposta inválida (502 da tela) reprova todos os critérios sem chamar juiz', () => {
    expect(notaDaRubrica(vereditoDaInvalida(CRIT))).toBe(0)
  })

  it('o pedido traz o raciocínio antes do veredito e a resposta delimitada como dado', () => {
    const u = userDaRubrica('ENTRADA', 'SAÍDA', CRIT)
    expect(u).toContain('<<<\nSAÍDA\n>>>')
    expect(u).toContain('1. a: A?')
  })
})

describe('pareado nas duas ordens', () => {
  it('só vale o veredito que sobrevive à troca de posição', () => {
    // primeira = candidato em A; segunda = candidato em B
    expect(combinarOrdens('A', 'B')).toEqual({ resultado: 1, estavel: true })
    expect(combinarOrdens('B', 'A')).toEqual({ resultado: -1, estavel: true })
    expect(combinarOrdens('empate', 'empate')).toEqual({ resultado: 0, estavel: true })
    // O juiz preferiu "a primeira" nas duas: viés de posição, não preferência.
    expect(combinarOrdens('A', 'A')).toEqual({ resultado: 0, estavel: false })
    expect(combinarOrdens('B', 'B')).toEqual({ resultado: 0, estavel: false })
    expect(combinarOrdens('A', 'empate')).toEqual({ resultado: 0, estavel: false })
    expect(combinarOrdens(null, 'B')).toBeNull()
  })

  it('lê o vencedor e recusa o resto', () => {
    expect(lerPareado('{"raciocinio":"x","vencedor":"B"}')).toBe('B')
    expect(lerPareado('{"vencedor":"empate"}')).toBe('empate')
    expect(lerPareado('{"vencedor":"os dois"}')).toBeNull()
  })

  it('resposta inválida perde sem juiz; duas válidas vão ao juiz', () => {
    expect(pareadoSemJuiz(true, false)).toMatchObject({ resultado: 1, estavel: true })
    expect(pareadoSemJuiz(false, true)).toMatchObject({ resultado: -1 })
    expect(pareadoSemJuiz(false, false)).toMatchObject({ resultado: 0 })
    expect(pareadoSemJuiz(true, true)).toBeNull()
  })
})

describe('quem julga quem', () => {
  const JUIZES = ['mistralai/mistral-medium-3.1', 'deepseek/deepseek-v4.1-flash']
  it('nunca a própria família', () => {
    expect(familia('mistralai/mistral-small-2603')).toBe('mistralai')
    expect(juizPara(['mistralai/mistral-small-2603'], JUIZES)).toBe('deepseek/deepseek-v4.1-flash')
    expect(juizPara(['deepseek/deepseek-v4.1-flash'], JUIZES)).toBe('mistralai/mistral-medium-3.1')
    expect(juizPara(['openai/gpt-oss-120b', 'z-ai/glm-5.3-flash'], JUIZES)).toBe('mistralai/mistral-medium-3.1')
    expect(juizPara(['mistralai/a', 'deepseek/b'], JUIZES)).toBeNull()
  })
})

describe('kappa de Cohen', () => {
  it('bate com o exemplo clássico (acordo 70%, acaso 50% → κ 0,4)', () => {
    // 20 itens: 7 sim/sim, 3 sim/não, 3 não/sim, 7 não/não → pₒ = 0,7; pₑ = 0,5·0,5 + 0,5·0,5 = 0,5
    const a = [...Array(7).fill(true), ...Array(3).fill(true), ...Array(3).fill(false), ...Array(7).fill(false)]
    const b = [...Array(7).fill(true), ...Array(3).fill(false), ...Array(3).fill(true), ...Array(7).fill(false)]
    const k = kappaDeCohen(a, b)
    expect(k.concordancia).toBeCloseTo(0.7)
    expect(k.acaso).toBeCloseTo(0.5)
    expect(k.kappa).toBeCloseTo(0.4)
    expect(leituraDoKappa(k.kappa)).toBe('razoável') // Landis & Koch: 0,21–0,40 é "razoável"
    expect(leituraDoKappa(0.5)).toBe('moderado')
    expect(leituraDoKappa(0.65)).toBe('substancial')
  })

  it('desconta o acaso: 90% de acordo com base desbalanceada pode ser κ ≈ 0', () => {
    const a = [...Array(18).fill(true), true, false]
    const b = [...Array(18).fill(true), false, true]
    const k = kappaDeCohen(a, b)
    expect(k.concordancia).toBeCloseTo(0.9)
    expect(k.kappa).toBeLessThan(0.1)
  })

  it('concordância perfeita = 1; discordância total = −1; pares com null saem; listas desiguais são erro', () => {
    expect(kappaDeCohen([true, false, true], [true, false, true]).kappa).toBe(1)
    expect(kappaDeCohen([true, false], [false, true]).kappa).toBe(-1)
    expect(kappaDeCohen([true, null, false], [true, true, false]).n).toBe(2)
    expect(kappaDeCohen([true, true], [true, true])).toMatchObject({ indefinido: true, concordancia: 1 }) // degenerado: pₑ = 1
    expect(Number.isNaN(kappaDeCohen([true, true], [true, true]).kappa)).toBe(true)
    expect(leituraDoKappa(Number.NaN)).toBe('indefinido')
    expect(Number.isNaN(kappaDeCohen([], []).kappa)).toBe(true)
    expect(() => kappaDeCohen([true], [])).toThrow(/tamanhos/)
  })
})

describe('planilha de calibração (humano leigo)', () => {
  const v = (a: boolean, b: boolean) => ({ a: { veredito: a }, b: { veredito: b } })
  /** Item com os vereditos dos DOIS juízes. */
  const item = (funcao: string, i: number, j1: any, j2: any, criterios = CRIT) => ({
    chave: `${funcao}-${i}`,
    funcao,
    caso: `c${i}`,
    entrada: 'Frase: "a; b"\nlinha 2',
    resposta: 'ok',
    criterios,
    vereditos: [j1, j2],
  })
  const atende = Array.from({ length: 40 }, (_, i) => item('explicacao', i, v(true, true), v(true, true)))
  const discorda = Array.from({ length: 12 }, (_, i) => item('resumo', i, v(true, true), v(false, true)))
  const reprova = Array.from({ length: 12 }, (_, i) => item('legenda', i, v(false, true), v(false, true)))

  it('sobreamostra discordância e "não atende" (uma amostra uniforme seria quase só "atende")', () => {
    const e = escolherParaCalibrar([...atende, ...discorda, ...reprova], 30)
    expect(e).toHaveLength(30)
    expect(new Set(e.map((x: any) => x.chave)).size).toBe(30)
    expect(e.filter((x: any) => x.funcao === 'resumo').length).toBeGreaterThanOrEqual(10)
    expect(e.filter((x: any) => x.funcao === 'legenda').length).toBeGreaterThanOrEqual(10)
    expect(escolherParaCalibrar([...atende, ...discorda, ...reprova], 30)).toEqual(e)
  })

  it('o gabarito comparado é a MÉDIA dos dois juízes (1, 0,5 ou 0)', () => {
    expect(vereditoMedio([v(true, true), v(false, true)], 'a')).toBe(0.5)
    expect(vereditoMedio([v(false, true), v(false, true)], 'a')).toBe(0)
    expect(vereditoMedio([null, v(true, true)], 'a')).toBe(1)
  })

  it('uma linha por caso, coluna por critério, "não se aplica" no critério de outra função; CSV com ; e BOM', () => {
    const outra = item('legenda', 99, { x: { veredito: true } }, { x: { veredito: false } }, [
      { id: 'x', pergunta: 'X?' },
    ])
    const { linhas, colunas, doJuiz } = montarPlanilha([atende[0], outra])
    expect(linhas).toHaveLength(2)
    expect(colunas).toEqual(['chave', 'funcao', 'entrada_e_referencia', 'resposta_a_avaliar', 'a', 'b', 'x'])
    expect(linhas[0].x).toBe(NAO_SE_APLICA)
    expect(linhas[1].a).toBe(NAO_SE_APLICA)
    expect(doJuiz['legenda-99#x']).toBe(0.5)
    const csv = paraCsv(linhas, colunas)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1).split('\r\n')[0]).toBe('chave;funcao;entrada_e_referencia;resposta_a_avaliar;a;b;x')
    expect(csv).not.toMatch(/veredito|mistral|deepseek|gpt-oss/)
    const volta = lerCsv(csv)
    expect(volta[0].entrada_e_referencia).toBe('Frase: "a; b"\nlinha 2')
    expect(volta).toHaveLength(2)
  })

  it('κ juiz × humano contra a média; o meio a meio fica à parte; não preenchida = NaN com 0 anotadas', () => {
    const itens = [
      item('explicacao', 1, v(true, false), v(true, false)),
      item('explicacao', 2, v(false, true), v(false, true)),
      item('explicacao', 3, v(true, true), v(false, true)),
    ]
    const { linhas, colunas, doJuiz } = montarPlanilha(itens)
    // O humano concorda com os juízes onde eles concordam; no item 3 (critério a dividido) diz "atende".
    const preenchida = linhas.map((l: any) => ({
      ...l,
      a: doJuiz[`${l.chave}#a`] >= 0.5 ? '1' : '0',
      b: doJuiz[`${l.chave}#b`] ? '1' : '0',
    }))
    const k = kappaDaPlanilha(lerCsv(paraCsv(preenchida, colunas)), doJuiz)
    expect(k.divididos).toEqual({ n: 1, humanoDisseAtende: 1 })
    expect(k.geral.kappa).toBe(1)
    const vazia = kappaDaPlanilha(linhas, doJuiz)
    expect(vazia.anotadas).toBe(0)
    expect(Number.isNaN(vazia.geral.kappa)).toBe(true)
  })
})
