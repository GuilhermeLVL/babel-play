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
const { escolherParaCalibrar, kappaDaPlanilha, kappaDeCohen, lerCsv, leituraDoKappa, montarPlanilha, paraCsv } =
  concordancia as any

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
    expect(kappaDeCohen([true, true], [true, true]).kappa).toBe(1) // degenerado: nada a descontar
    expect(Number.isNaN(kappaDeCohen([], []).kappa)).toBe(true)
    expect(() => kappaDeCohen([true], [])).toThrow(/tamanhos/)
  })
})

describe('planilha de calibração', () => {
  const item = (funcao: string, i: number) => ({
    chave: `${funcao}-${i}`,
    funcao,
    caso: `c${i}`,
    entrada: 'Frase: "a, b"\nlinha 2',
    resposta: 'ok',
    criterios: CRIT,
    veredito: { a: { veredito: true }, b: { veredito: i % 2 === 0 } },
  })
  const itens = [
    ...Array.from({ length: 20 }, (_, i) => item('explicacao', i)),
    ...Array.from({ length: 10 }, (_, i) => item('resumo', i)),
    ...Array.from({ length: 10 }, (_, i) => item('legenda', i)),
  ]

  it('escolhe n itens com as cotas por função, sem repetir, de forma reprodutível', () => {
    const e = escolherParaCalibrar(itens, 30, { explicacao: 12, resumo: 6 })
    expect(e).toHaveLength(30)
    expect(new Set(e.map((x: any) => x.chave)).size).toBe(30)
    expect(e.filter((x: any) => x.funcao === 'explicacao').length).toBeGreaterThanOrEqual(12)
    expect(e.filter((x: any) => x.funcao === 'resumo').length).toBeGreaterThanOrEqual(6)
    expect(escolherParaCalibrar(itens, 30, { explicacao: 12, resumo: 6 })).toEqual(e)
  })

  it('a planilha é CEGA (sem modelo nem veredito) e o CSV ida e volta preserva vírgula, aspas e quebra', () => {
    const { linhas, doJuiz } = montarPlanilha([itens[0], itens[1]])
    expect(linhas).toHaveLength(4)
    const csv = paraCsv(linhas, Object.keys(linhas[0]))
    expect(csv).not.toMatch(/veredito|mistral|deepseek|gpt-oss/)
    const volta = lerCsv(csv)
    expect(volta[0].entrada).toBe('Frase: "a, b"\nlinha 2')
    expect(volta).toHaveLength(4)
    expect(doJuiz['explicacao-0#a']).toBe(true)
  })

  it('κ juiz × humano da planilha preenchida; não preenchida = NaN com 0 anotadas', () => {
    const { linhas, doJuiz } = montarPlanilha([itens[0], itens[1]])
    // O humano concorda em tudo com o juiz.
    const preenchida = linhas.map((l: any) => ({ ...l, humano: doJuiz[l.chave] ? '1' : '0' }))
    const k = kappaDaPlanilha(lerCsv(paraCsv(preenchida, Object.keys(preenchida[0]))), doJuiz)
    expect(k.anotadas).toBe(4)
    expect(k.geral.kappa).toBe(1)
    const vazia = kappaDaPlanilha(linhas, doJuiz)
    expect(vazia.anotadas).toBe(0)
    expect(Number.isNaN(vazia.geral.kappa)).toBe(true)
  })
})
