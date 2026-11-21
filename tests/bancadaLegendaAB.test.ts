/**
 * LABORATÓRIO DE LATÊNCIA DA LEGENDA (`lab-medicao-legenda-traduzida`, tarefas 3.1–3.3, 3.6 e 4.1): a métrica
 * `fimDaFalaAteLegendaMs` vinda de um `lat` sintético de resultado conhecido, a recusa de A/B sem critério ou sem
 * rodadas, o bootstrap pareado com efeito conhecido e nulo, e a origem (`medido`/`emulado`) da linha de base.
 * Roda sem navegador.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  avaliarGuardas,
  bootstrapPareado,
  decidir,
  lerLado,
  parearPorFala,
  prng,
  recusas,
  tabelaDoAB,
} from '../scripts/perf/latencia-legenda/ab.mjs'
import {
  analisarRodada,
  medidasDeCampo,
  resumirLegenda,
  resumirLegendaPorGrupo,
} from '../scripts/perf/latencia-legenda/analisar.mjs'
import { linhasPorModelo, temposDeCarga } from '../scripts/perf/latencia-legenda/carga-de-modelos.mjs'
import { comparar, gravarLinhaDeBase, validarSlo } from '../scripts/perf/latencia-legenda/comparar.mjs'
import { agregarRodadas, metricasDaRodada } from '../scripts/perf/latencia-legenda/metricas-captura.mjs'

// O `.mjs` da bancada não tem tipos: no modo estrito, o resultado é tratado como dado solto.
const analisar = analisarRodada as (d: unknown) => any

const AQUI = path.join(__dirname, '..', 'scripts', 'perf', 'latencia-legenda')

/**
 * Rodada sintética com a âncora em 3000 ms (bipe em 1 s do arquivo). Fala 0 termina em 7000 ms da página, fala 1 em 10 000.
 * Fala 0: tradução pintada (rAF) em 7480 → 480 ms. Fala 1: tradução pintada em 10 620 → 620 ms.
 */
function rodada(extra: Record<string, any> = {}) {
  return {
    rotulo: 'desktop.r1',
    quando: '2026-11-21T10:00:00.000Z',
    tIniciarPerf: 1000,
    config: { eu: 'pt-BR', eles: 'en-US', dispositivo: null },
    roteiro: {
      idioma: 'en',
      bipeS: 1,
      duracaoS: 20,
      falas: [
        { k: 0, iniS: 3, fimS: 5, durVozS: 2 },
        { k: 1, iniS: 6, fimS: 8, durVozS: 2 },
      ],
    },
    lat: {
      aud: [
        [2990, 0.0, 0.0],
        [3010, 0.2, 0.9],
      ],
      dom: [
        { t: 7390, tf: 7480, i: 0, o: 'Lions are social.', tr: 'Leões são sociais.', nova: false },
        { t: 10500, tf: 10620, i: 1, o: 'Cats sleep.', tr: 'Gatos dormem.', nova: false },
      ],
      ev: [
        { t: 2500, k: 'w:in', nome: 'whisperWorker-x.js', type: 'ready' },
        { t: 7100, k: 'w:out', nome: 'whisperWorker-x.js', type: 'transcribe', id: 1, n: 32000 },
        { t: 7300, k: 'w:in', nome: 'whisperWorker-x.js', type: 'result', id: 1, text: 'Lions are social.' },
        { t: 10100, k: 'w:out', nome: 'whisperWorker-x.js', type: 'transcribe', id: 2, n: 32000 },
        { t: 10450, k: 'w:in', nome: 'whisperWorker-x.js', type: 'result', id: 2, text: 'Cats sleep.' },
      ],
      marcas: [
        { t: 7030, n: 'fala:fim', d: { id: 'sys-1' } },
        { t: 7480, n: 'legenda:traduzida', d: { id: 'sys-1', origem: 'local' } },
        { t: 9940, n: 'fala:fim', d: { id: 'sys-2' } },
        { t: 10620, n: 'legenda:traduzida', d: { id: 'sys-2', origem: 'nuvem' } },
      ],
      loaf: [],
      rc: [],
    },
    cap: [
      { seq: 1, tSpeechStart: 5050, tSpeechEnd: 7100, tFinalDone: 7300, text: 'Lions are social.', audioMs: 2000 },
      { seq: 2, tSpeechStart: 8050, tSpeechEnd: 10100, tFinalDone: 10450, text: 'Cats sleep.', audioMs: 2000 },
    ],
    amostras: [],
    ...extra,
  }
}

describe('fimDaFalaAteLegendaMs numa rodada de resultado conhecido (3.1, 3.2)', () => {
  it('bancada: quadro pintado com a tradução final − fim da voz no arquivo, por fala', () => {
    const r = analisar(rodada())
    expect(r.todasFalas.map((f: any) => f.fimDaFalaAteLegendaMs)).toEqual([480, 620])
    expect(r.todasFalas.map((f: any) => f.status)).toEqual(['ok', 'ok'])
  })

  it('campo: marca de legenda − marca de fim, pelo id do balão; erro do marcador = t_fim − fim no arquivo', () => {
    const f = analisar(rodada()).todasFalas
    expect(f[0]).toMatchObject({ fimDaFalaAteLegendaCampoMs: 450, erroDoMarcadorMs: 30, origemDaLegenda: 'local' })
    expect(f[1]).toMatchObject({ fimDaFalaAteLegendaCampoMs: 680, erroDoMarcadorMs: -60, origemDaLegenda: 'nuvem' })
  })

  it('sem marcas (build sem instrumentação): a medida da bancada continua, o campo não aparece', () => {
    const d = rodada()
    delete (d.lat as any).marcas
    const f = analisar(d).todasFalas
    expect(f[0].fimDaFalaAteLegendaMs).toBe(480)
    expect(f[0].fimDaFalaAteLegendaCampoMs).toBeUndefined()
    expect(f[0].erroDoMarcadorMs).toBeUndefined()
  })

  it('medidasDeCampo escolhe a marca de fim mais perto do fim da voz e ignora a de outra fala', () => {
    const marcas = [
      { t: 6000, n: 'fala:fim', d: { id: 'a' } },
      { t: 7040, n: 'fala:fim', d: { id: 'b' } },
      { t: 7500, n: 'legenda:traduzida', d: { id: 'b', origem: 'memoria' } },
    ]
    expect(medidasDeCampo(marcas, 7000)).toEqual({
      erroDoMarcadorMs: 40,
      fimDaFalaAteLegendaCampoMs: 460,
      origemDaLegenda: 'memoria',
    })
    expect(medidasDeCampo(marcas, 20000)).toBeNull()
  })

  it('com a decisão do VAD, a marca de fim é a do trecho que fechou, mesmo ~800 ms antes do fim da voz do arquivo', () => {
    const marcas = [
      { t: 6000, n: 'fala:fim', d: { id: 'a' } },
      { t: 6300, n: 'fala:fim', d: { id: 'b' } },
      { t: 6900, n: 'legenda:traduzida', d: { id: 'b', origem: 'nuvem' } },
    ]
    // E = 7100 (o arquivo ainda tem uma cauda de voz), decisão do VAD em 7080: o erro aparece (−800), não some da conta
    expect(medidasDeCampo(marcas, 7100, 7080)).toEqual({
      erroDoMarcadorMs: -800,
      fimDaFalaAteLegendaCampoMs: 600,
      origemDaLegenda: 'nuvem',
    })
  })

  it('texto final já na tela antes do decode pareado: a fala continua medida pelo balão (não vira falha)', () => {
    const d = rodada()
    d.lat.dom[0] = { t: 7200, tf: 7260, i: 0, o: 'Lions are social.', tr: 'Leões são sociais.', nova: false } as any
    expect(analisar(d).todasFalas[0]).toMatchObject({ fimDaFalaAteLegendaMs: 260, status: 'ok' })
  })

  it('fala sem tradução na tela é falha; com idioma de origem = destino é semTraducao; nenhuma entra no percentil', () => {
    const semLegenda = rodada()
    semLegenda.lat.dom[1] = { t: 10500, tf: 10620, i: 1, o: 'Cats sleep.', tr: '…', nova: false } as any
    const falha = analisar(semLegenda).todasFalas
    expect(falha.map((f: any) => f.status)).toEqual(['ok', 'falha'])

    const mesmo = analisar(
      rodada({ config: { eu: 'en-US', eles: 'en-GB', dispositivo: null } }) && {
        ...semLegenda,
        config: { eu: 'en-US', eles: 'en-GB', dispositivo: null },
      },
    ).todasFalas
    expect(mesmo.map((f: any) => f.status)).toEqual(['ok', 'semTraducao'])

    const r = resumirLegenda([analisar(semLegenda)])
    expect(r).toMatchObject({ n: 1, p50: 480, p75: 480, p95: 480, falhas: 1, semTraducao: 0, taxaDeFalha: 0.5 })
  })

  it('resumo: p50/p75/p95 (tipo 7) com taxa de falha e erro do marcador em valor absoluto', () => {
    const r = resumirLegenda([analisar(rodada())])
    expect(r).toMatchObject({ n: 2, p50: 550, p75: 585, p95: 613, falhas: 0, taxaDeFalha: 0 })
    expect(r.erroDoMarcador).toMatchObject({ n: 2, medianaAbsMs: 45, p95AbsMs: 59 })
    expect(r.campo).toMatchObject({ n: 2, p50: 565 })
  })

  it('por perfil e idioma: o fraco e o desktop saem em linhas separadas; rodada inválida fica de fora', () => {
    const fraco = analisar(rodada({ rotulo: 'fraco.r1', config: { eu: 'pt-BR', eles: 'en-US', dispositivo: 'fraco' } }))
    const ruim = rodada({ rotulo: 'x' })
    ruim.lat.aud = []
    const g = resumirLegendaPorGrupo([analisar(rodada()), fraco, analisar(ruim)])
    expect(Object.keys(g)).toEqual(['desktop/en', 'fraco/en'])
  })
})

describe('a métrica entra no resultado do perfil (3.3)', () => {
  it('metricasDaRodada traz os valores e a agregação soma as falas (nunca mediana de percentis)', () => {
    const m = metricasDaRodada(rodada())
    expect(m.fimDaFalaAteLegendaMs).toMatchObject({ valores: [480, 620], p50: 550, falhas: 0, semTraducao: 0 })
    const outra = metricasDaRodada(rodada({ rotulo: 'desktop.r2' }))
    outra.fimDaFalaAteLegendaMs.valores = [1000, 2000]
    const ag = agregarRodadas([m, outra])
    // 480, 620, 1000, 2000: p50 = 810 (e não a mediana de 550 e 1500)
    expect(ag.metricas['fimDaFalaAteLegendaMs.p50']).toBe(810)
    expect(ag.metricas['fimDaFalaAteLegendaMs.p75']).toBe(1250)
    expect(ag.metricas['fimDaFalaAteLegendaMs.taxaDeFalha']).toBe(0)
    expect((ag as any).erroDoMarcador).toMatchObject({ n: 4 })
  })
})

describe('slo-captura.json e a origem de cada perfil (4.1)', () => {
  const slo = JSON.parse(readFileSync(path.join(AQUI, 'slo-captura.json'), 'utf8'))

  it('declara a métrica principal e a taxa de falha como "menor é melhor"', () => {
    for (const k of ['p50', 'p75', 'p95', 'taxaDeFalha'])
      expect(slo.metricas[`fimDaFalaAteLegendaMs.${k}`]).toMatchObject({ sentido: 'menor' })
  })

  it('todo perfil de todo ambiente tem origem, e o fraco é sempre emulado', () => {
    expect(validarSlo(slo)).toEqual([])
    for (const a of Object.values<any>(slo.ambientes)) {
      expect(a.origens.fraco.origem).toBe('emulado')
      expect(a.origens.desktop.origem).toBe('medido')
    }
  })

  it('a base do local-darwin reprova a tradução atrasada de propósito (+1,5 s), e só nas métricas da legenda', () => {
    const base = slo.ambientes['local-darwin'].perfis.desktop
    const atrasada = { ...base }
    for (const p of ['p50', 'p75', 'p95']) atrasada[`fimDaFalaAteLegendaMs.${p}`] += 1500
    const r = comparar(slo, { perfis: { desktop: { metricas: atrasada } } }, 'local-darwin')
    expect(r.piorou).toBe(true)
    expect(r.linhas.filter((l) => l.status === 'piorou').map((l) => l.metrica)).toEqual([
      'fimDaFalaAteLegendaMs.p50',
      'fimDaFalaAteLegendaMs.p75',
      'fimDaFalaAteLegendaMs.p95',
    ])
    expect(comparar(slo, { perfis: { desktop: { metricas: base } } }, 'local-darwin').piorou).toBe(false)
  })

  it('validarSlo recusa perfil sem origem ou com origem inventada', () => {
    const base = { metricas: {}, ambientes: { x: { perfis: { desktop: {} } } } }
    expect(validarSlo(base).join(' ')).toMatch(/falta origem/)
    const ruim = { ...base, ambientes: { x: { perfis: { desktop: {} }, origens: { desktop: { origem: 'chute' } } } } }
    expect(validarSlo(ruim).join(' ')).toMatch(/falta origem/)
    const boa = { ...base, ambientes: { x: { perfis: { desktop: {} }, origens: { desktop: { origem: 'medido' } } } } }
    expect(validarSlo(boa)).toEqual([])
  })

  it('gravar a linha de base guarda origem, aparelho, commit e data de cada perfil', () => {
    const novo = gravarLinhaDeBase(
      { metricas: slo.metricas, ambientes: {} },
      {
        perfis: {
          desktop: { rodadas: 10, metricas: {}, origem: 'medido', aparelhoDescricao: 'Mac' },
          fraco: { rodadas: 10, metricas: {}, origem: 'emulado', aparelhoDescricao: 'Mac (emulando fraco)' },
        },
      },
      'local-darwin',
      { commit: 'abc1234', medidoEm: '2026-11-21T10:00:00.000Z' },
    )
    expect(novo.ambientes['local-darwin'].origens).toEqual({
      desktop: { origem: 'medido', aparelho: 'Mac', commit: 'abc1234', data: '2026-11-21' },
      fraco: { origem: 'emulado', aparelho: 'Mac (emulando fraco)', commit: 'abc1234', data: '2026-11-21' },
    })
  })
})

describe('ab.mjs: bootstrap pareado por fala (3.6)', () => {
  /** 8 falas, 12 rodadas por lado; A = base da fala + ruído; B = A + efeito + ruído (semente fixa). */
  function lados(efeito: number, ruidoDoEfeito = 0) {
    const rnd = prng(7)
    const ruido = (amp: number) => (rnd() - 0.5) * 2 * amp
    const base = [900, 1000, 1100, 1250, 1400, 1550, 1800, 2200]
    const mk = (extra: number) =>
      Array.from({ length: 12 }, () => ({ porFala: base.map((b) => b + extra + ruido(40 + ruidoDoEfeito)) }))
    return { a: mk(0), b: mk(efeito) }
  }

  it('efeito conhecido (+200 ms): o IC de p50, p75 e p95 contém 200 e exclui 0', () => {
    const { a, b } = lados(200)
    const res = bootstrapPareado(parearPorFala(a as any, b as any))
    for (const p of ['p50', 'p75', 'p95'] as const) {
      expect(res[p].ic95[0]).toBeLessThanOrEqual(200)
      expect(res[p].ic95[1]).toBeGreaterThanOrEqual(200)
      expect(res[p].ic95[0]).toBeGreaterThan(0)
    }
    expect(decidir(res)).toMatch(/B pior/)
  })

  it('efeito conhecido negativo (−300 ms, mínimo 20%): B melhor; mínimo maior que o efeito: sem diferença provada', () => {
    const { a, b } = lados(-300)
    const res = bootstrapPareado(parearPorFala(a as any, b as any))
    expect(res.p75.ic95[1]).toBeLessThan(0)
    expect(decidir(res, { efeitoMinimoPct: 10 })).toMatch(/B melhor/)
    expect(decidir(res, { efeitoMinimoPct: 60 })).toMatch(/sem diferença provada/)
  })

  it('efeito nulo: o IC contém 0 e a decisão é "sem diferença provada"', () => {
    const { a, b } = lados(0)
    const res = bootstrapPareado(parearPorFala(a as any, b as any))
    for (const p of ['p50', 'p75', 'p95'] as const) {
      expect(res[p].ic95[0]).toBeLessThanOrEqual(0)
      expect(res[p].ic95[1]).toBeGreaterThanOrEqual(0)
    }
    expect(decidir(res)).toMatch(/sem diferença provada/)
  })

  it('não inferioridade: IC com limite superior ≤ 5 ms prova que não há custo', () => {
    const { a, b } = lados(0, -35)
    const res = bootstrapPareado(parearPorFala(a as any, b as any))
    expect(decidir(res, { naoInferioridadeMs: 5 })).toMatch(/^sem custo provado/)
    const caro = lados(50)
    const r2 = bootstrapPareado(parearPorFala(caro.a as any, caro.b as any))
    expect(decidir(r2, { naoInferioridadeMs: 5 })).toMatch(/^custo não descartado/)
  })

  it('guardas: B piora quando passa do limite do SLO sobre A; dentro da tolerância, ok', () => {
    const slo = {
      metricas: {
        'framesLongos.n50': { sentido: 'menor', toleranciaPct: 50, folgaAbs: 5 },
        'cpuSilencio.processoPct': { sentido: 'menor', toleranciaPct: 40, folgaAbs: 5 },
      },
    }
    const lado = (n50: number, cpu: number) => [
      { metricas: { valida: true, framesLongos: { n50 }, cpuSilencio: { processoPct: cpu } } },
    ]
    const g = avaliarGuardas(lado(2, 10) as any, lado(20, 12) as any, slo, [
      'framesLongos.n50',
      'cpuSilencio.processoPct',
      'rtf.p50',
    ])
    expect(g.map((x) => [x.nome, x.status])).toEqual([
      ['framesLongos.n50', 'piorou'],
      ['cpuSilencio.processoPct', 'ok'],
      ['rtf.p50', 'sem-medida'],
    ])
  })

  it('a semente fixa dá sempre o mesmo IC; a tabela traz a diferença com sinal', () => {
    const { a, b } = lados(100)
    const f = parearPorFala(a as any, b as any)
    const x = bootstrapPareado(f)
    expect(bootstrapPareado(f)).toEqual(x)
    expect(bootstrapPareado(f, { semente: 1 }).p75.ic95).not.toEqual(x.p75.ic95)
    expect(tabelaDoAB(x)).toMatch(/\| p75 \| .* \| \+\d+ \| \[\+\d+, \+\d+\] \|/)
  })

  it('só pareia as falas com valor nos dois lados', () => {
    const f = parearPorFala([{ porFala: [1, null, 3] }] as any, [{ porFala: [2, 5, null] }] as any)
    expect(f.map((x) => x.k)).toEqual([0])
  })

  it('recusa: menos de 10 rodadas válidas, sem criterio.md, criterio fora do git, alterado ou commitado depois', () => {
    const ok = { existe: true, commitado: true, limpo: true, commitadoEm: 1000 }
    expect(recusas({ validasA: 10, validasB: 10, criterio: ok, primeiraRodadaEm: 2000 })).toEqual([])
    expect(recusas({ validasA: 9, validasB: 10, criterio: ok, primeiraRodadaEm: 2000 }).join()).toMatch(/lado A com 9/)
    expect(recusas({ validasA: 10, validasB: 3, criterio: ok, primeiraRodadaEm: 2000 }).join()).toMatch(/lado B com 3/)
    expect(recusas({ validasA: 10, validasB: 10, criterio: { existe: false }, primeiraRodadaEm: 2000 }).join()).toMatch(
      /sem criterio\.md/,
    )
    expect(
      recusas({
        validasA: 10,
        validasB: 10,
        criterio: { existe: true, commitado: false },
        primeiraRodadaEm: 2000,
      }).join(),
    ).toMatch(/não está commitado/)
    expect(
      recusas({ validasA: 10, validasB: 10, criterio: { ...ok, limpo: false }, primeiraRodadaEm: 2000 }).join(),
    ).toMatch(/alterado depois/)
    expect(
      recusas({ validasA: 10, validasB: 10, criterio: { ...ok, commitadoEm: 3000 }, primeiraRodadaEm: 2000 }).join(),
    ).toMatch(/DEPOIS da primeira rodada/)
    // --ensaio aceita o critério não commitado, mas nunca aceita rodadas a menos
    expect(
      recusas({ validasA: 10, validasB: 10, criterio: { existe: true }, primeiraRodadaEm: 2000, ensaio: true }),
    ).toEqual([])
    expect(
      recusas({ validasA: 2, validasB: 10, criterio: { existe: true }, primeiraRodadaEm: 2000, ensaio: true }),
    ).toHaveLength(1)
  })

  it('CLI: com poucas rodadas e sem criterio.md sai com 1 e não imprime número', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ab-recusa-'))
    mkdirSync(dir, { recursive: true })
    for (const lado of ['antes', 'depois'])
      writeFileSync(path.join(dir, `${lado}.desktop.r1.json`), JSON.stringify(rodada({ rotulo: `${lado}.desktop.r1` })))
    const r = spawnSync(
      process.execPath,
      [
        path.join(AQUI, 'ab.mjs'),
        '--rodadas',
        dir,
        '--a',
        'antes.desktop',
        '--b',
        'depois.desktop',
        '--criterio',
        path.join(dir, 'criterio.md'),
      ],
      { encoding: 'utf8' },
    )
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/A\/B recusado/)
    expect(r.stderr).toMatch(/lado A com 1 rodadas válidas/)
    expect(r.stderr).toMatch(/sem criterio\.md/)
    expect(r.stdout).toBe('')
  })

  it('lerLado lê só `<prefixo>.rN.json` (o aquecimento fica de fora) e separa as inválidas', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ab-ler-'))
    const w = (n: string, d: unknown) => writeFileSync(path.join(dir, n), JSON.stringify(d))
    w('antes.desktop.r1.json', rodada({ rotulo: 'antes.desktop.r1' }))
    const ruim = rodada({ rotulo: 'antes.desktop.r2' })
    ruim.lat.aud = []
    w('antes.desktop.r2.json', ruim)
    w('antes.desktop.aquecimento.json', rodada())
    w('depois.desktop.r1.json', rodada())
    const l = lerLado(dir, 'antes.desktop')
    expect(l.validas.map((v) => v.rotulo)).toEqual(['antes.desktop.r1'])
    expect(l.validas[0].porFala).toEqual([480, 620])
    expect(l.invalidas).toHaveLength(1)
    expect(l.invalidas[0].motivo).toMatch(/sem-sonda/)
  })
})

describe('tempo de carga por modelo e fase (4.4)', () => {
  const m = (t: number, n: string, modelo: string) => ({ t, n, d: { modelo } })
  it('pareia início e fim de cada fase, por modelo, e soma o total', () => {
    const marcas = [
      m(100, 'modelo:download:inicio', 'moonshine'),
      m(190, 'modelo:download:fim', 'moonshine'),
      m(190, 'modelo:compilacao:inicio', 'moonshine'),
      m(890, 'modelo:compilacao:fim', 'moonshine'),
      m(890, 'modelo:aquecimento:inicio', 'moonshine'),
      m(940, 'modelo:aquecimento:fim', 'moonshine'),
      m(2000, 'modelo:download:inicio', 'opus'),
      m(2100, 'modelo:download:fim', 'opus'),
      { t: 5, n: 'fala:fim', d: { id: 'x' } } as any,
    ]
    expect(temposDeCarga(marcas)).toHaveLength(4)
    expect(linhasPorModelo(temposDeCarga(marcas))).toEqual([
      { modelo: 'moonshine', download: 90, compilacao: 700, aquecimento: 50, totalMs: 840 },
      { modelo: 'opus', download: 100, compilacao: null, aquecimento: null, totalMs: 100 },
    ])
  })

  it('recarga do mesmo modelo não substitui a 1ª; fase sem fim não vira número', () => {
    const marcas = [
      m(0, 'modelo:download:inicio', 'a'),
      m(10, 'modelo:download:fim', 'a'),
      m(500, 'modelo:download:inicio', 'a'),
      m(900, 'modelo:download:fim', 'a'),
      m(1000, 'modelo:compilacao:inicio', 'a'),
    ]
    expect(temposDeCarga(marcas)).toEqual([{ modelo: 'a', fase: 'download', ms: 10 }])
  })
})
