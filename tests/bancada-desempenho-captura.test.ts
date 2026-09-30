/**
 * BANCADA DE DESEMPENHO DA CAPTURA (A0 do plano "grátis sem travar") — a parte que decide sem abrir
 * navegador: como uma rodada bruta de `medir.mjs` vira as métricas da bancada, como N rodadas viram
 * um número por perfil, e como esse número se compara à linha de base de `slo-captura.json`.
 *
 * A rodada de verdade (Chromium, microfone falso, modelos) roda no workflow `desempenho.yml`.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  comparar,
  gravarLinhaDeBase,
  ruidoEntre,
  tabelaMarkdown,
  validarSlo,
} from '../scripts/perf/latencia-legenda/comparar.mjs'
import {
  agregarRodadas,
  cpuNaJanela,
  framesLongos,
  janelasDaRodada,
  mediana,
  metricasDaRodada,
  picoDeMemoria,
  relogioDoArquivo,
  taxaNaJanela,
} from '../scripts/perf/latencia-legenda/metricas-captura.mjs'
import { deMulaw, lerWav, mulawDe, wavMulaw, wavPcm16 } from '../scripts/perf/latencia-legenda/wav.mjs'

/**
 * Uma rodada sintética no formato que `medir.mjs` grava. Linha do tempo (ms da página):
 *   bipe do arquivo em 1,0 s → a sonda o vê na janela que começa em 3010 (âncora = 3000);
 *   fala 0: 3,0–5,0 s do arquivo (5000–7000 na página); fala 1: 6,0–8,0 s (8000–10000);
 *   o áudio acaba em 20 s do arquivo (22000 na página).
 */
function rodadaSintetica(extra: Record<string, unknown> = {}) {
  return {
    rotulo: 'desktop.r1',
    tIniciarPerf: 1000,
    perfilDoAparelho: { tipo: 'desktop-sem-gpu', modoLeve: 'false' },
    roteiro: {
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
        [3030, 0.0, 0.0],
      ],
      dom: [
        { t: 5600, i: 0, o: ' ', tr: '…', nova: true },
        { t: 6200, i: 0, o: 'Lions are', tr: '…', nova: true },
        { t: 7400, i: 0, o: 'Lions are social.', tr: 'Leões são sociais.', nova: false },
        { t: 10500, i: 1, o: 'Cats sleep.', tr: 'Gatos dormem.', nova: false },
      ],
      ev: [
        { t: 1500, k: 'w:out', nome: 'whisperWorker-x.js', type: 'load', model: 'onnx-community/moonshine-base-ONNX' },
        { t: 2500, k: 'w:in', nome: 'whisperWorker-x.js', type: 'ready' },
        // fala 0: final postado em 7100, resultado em 7300 (2 s de áudio → RTF 0,1)
        { t: 7100, k: 'w:out', nome: 'whisperWorker-x.js', type: 'transcribe', id: 1, n: 32000 },
        { t: 7300, k: 'w:in', nome: 'whisperWorker-x.js', type: 'result', id: 1, text: 'Lions are social.' },
        // fala 1: final postado em 10100, resultado em 10500 (RTF 0,2)
        { t: 10100, k: 'w:out', nome: 'whisperWorker-x.js', type: 'transcribe', id: 2, n: 32000 },
        { t: 10500, k: 'w:in', nome: 'whisperWorker-x.js', type: 'result', id: 2, text: 'Cats sleep.' },
      ],
      loaf: [
        { t: 500, ms: 400 }, // antes do clique: fora da sessão
        { t: 2000, ms: 60 },
        { t: 6000, ms: 120 },
        { t: 9000, ms: 50 }, // exatamente 50: não é "> 50"
        { t: 25000, ms: 300 }, // depois do fim do áudio: fora
      ],
      // commits do React: [t, componentes renderizados]
      rc: [
        [5500, 10],
        [6000, 10],
        [9000, 20],
        [16000, 4],
      ],
    },
    cap: [
      { seq: 1, tSpeechStart: 5050, tSpeechEnd: 7100, tFinalDone: 7300, text: 'Lions are social.', audioMs: 2000 },
      { seq: 2, tSpeechStart: 8050, tSpeechEnd: 10100, tFinalDone: 10500, text: 'Cats sleep.', audioMs: 2000 },
    ],
    // amostras de CPU (segundos acumulados) e memória do processo da aba
    amostras: [
      { t: 2000, cpuProcessoS: 10, cpuPrincipalS: 4, cpuWorkersS: null, memMb: 300, heapMb: 20 },
      { t: 13000, cpuProcessoS: 15, cpuPrincipalS: 6, cpuWorkersS: null, memMb: 520, heapMb: 35 },
      { t: 22000, cpuProcessoS: 15.9, cpuPrincipalS: 6.18, cpuWorkersS: null, memMb: 510, heapMb: 30 },
    ],
    ...extra,
  }
}

describe('peças da métrica', () => {
  it('relógio do arquivo: o bipe vira a âncora (meio da janela de 20 ms)', () => {
    const r = relogioDoArquivo(rodadaSintetica())
    expect(r).not.toBeNull()
    expect(r!(1)).toBe(3000)
    expect(r!(3)).toBe(5000)
  })

  it('relógio do arquivo: sem bipe na sonda não há relógio', () => {
    const d = rodadaSintetica()
    d.lat.aud = [[3010, 0.001, 0.1]]
    expect(relogioDoArquivo(d)).toBeNull()
  })

  it('frames longos: > 50 e > 100 ms, soma e maior, só dentro da janela', () => {
    const loafs = rodadaSintetica().lat.loaf
    expect(framesLongos(loafs, 1000, 22000)).toEqual({ n50: 2, n100: 1, somaMs: 180, maiorMs: 120 })
    expect(framesLongos([], 0, 1)).toEqual({ n50: 0, n100: 0, somaMs: 0, maiorMs: 0 })
  })

  it('taxa na janela: soma dos pesos por segundo', () => {
    const rc = rodadaSintetica().lat.rc as [number, number][]
    expect(taxaNaJanela(rc, 5000, 10000)).toEqual({ porS: 8, eventosPorS: 0.6 })
    expect(taxaNaJanela(rc, 12000, 12000)).toBeNull()
  })

  it('CPU na janela: Δ tempo de CPU ÷ Δ relógio, em % de um núcleo', () => {
    const a = rodadaSintetica().amostras
    // de 13000 a 22000: 0,9 s de CPU em 9 s = 10%
    expect(cpuNaJanela(a, 13000, 22000, 'cpuProcessoS')).toBeCloseTo(10, 5)
    expect(cpuNaJanela(a, 13000, 22000, 'cpuPrincipalS')).toBeCloseTo(2, 5)
    // campo ausente (sem /proc por thread): null, não zero
    expect(cpuNaJanela(a, 13000, 22000, 'cpuWorkersS')).toBeNull()
    // janela curta demais para medir
    expect(cpuNaJanela(a, 21000, 22000, 'cpuProcessoS')).toBeNull()
  })

  it('pico de memória ignora amostra sem leitura', () => {
    expect(picoDeMemoria([{ memMb: null }, { memMb: 40 }, { memMb: 12 }], 'memMb')).toBe(40)
    expect(picoDeMemoria([{ memMb: null }], 'memMb')).toBeNull()
  })

  it('mediana: par e ímpar, ignora não finitos', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 2, 3])).toBe(2.5)
    expect(mediana([null, Number.NaN, 5])).toBe(5)
    expect(mediana([])).toBeNull()
  })
})

describe('janelas e métricas de uma rodada', () => {
  it('janelas: sessão até o fim do áudio, fala da 1ª à última voz, silêncio depois da última legenda', () => {
    const j = janelasDaRodada(rodadaSintetica())
    expect(j.sessao).toEqual([1000, 22000])
    expect(j.fala).toEqual([5000, 11000])
    // max(fim da última voz + 3 s = 13000, última mudança de balão + 1,5 s = 12000)
    expect(j.silencio).toEqual([13000, 22000])
  })

  it('métricas: frames longos, 1ª legenda, RTF, memória, CPU no silêncio, renders/s', () => {
    const m = metricasDaRodada(rodadaSintetica())
    expect(m.framesLongos).toEqual({ n50: 2, n100: 1, somaMs: 180, maiorMs: 120 })
    // início da fala 0 (5000) → 1º texto de verdade na tela (6200; o balão em branco não conta)
    expect(m.primeiraLegendaMs).toBe(1200)
    expect(m.sttProntoMs).toBe(1500)
    expect(m.rtf.valores).toEqual([0.1, 0.2])
    expect(m.memoriaPicoMb).toBe(520)
    expect(m.heapPicoMb).toBe(35)
    expect(m.cpuSilencio.processoPct).toBeCloseTo(10, 5)
    expect(m.cpuSilencio.principalPct).toBeCloseTo(2, 5)
    expect(m.cpuSilencio.foraDaPrincipalPct).toBeCloseTo(8, 5)
    expect(m.cpuSilencio.workersPct).toBeNull()
    // renders na fala: 10 + 10 + 20 em 6 s; no silêncio: 4 em 9 s
    expect(m.rendersPorS.fala).toBeCloseTo(40 / 6, 5)
    expect(m.rendersPorS.silencio).toBeCloseTo(4 / 9, 5)
    expect(m.commitsPorS.fala).toBeCloseTo(3 / 6, 5)
    expect(m.valida).toBe(true)
  })

  it('RTF só das falas postadas depois do modelo pronto (a espera da carga não é decode)', () => {
    const d = rodadaSintetica()
    d.lat.ev = d.lat.ev.map((e) => (e.type === 'ready' ? { ...e, t: 9000 } : e))
    expect(metricasDaRodada(d).rtf.valores).toEqual([0.2])
  })

  it('rodada sem bipe: inválida, sem inventar número', () => {
    const d = rodadaSintetica()
    d.lat.aud = []
    const m = metricasDaRodada(d)
    expect(m.valida).toBe(false)
    expect(m.motivo).toMatch(/bipe/)
  })

  it('rodada em que a aba caiu: inválida', () => {
    const m = metricasDaRodada(rodadaSintetica({ queda: 'a aba travou' }))
    expect(m.valida).toBe(false)
    expect(m.motivo).toMatch(/aba travou/)
  })
})

describe('agregação de N rodadas', () => {
  it('mediana por métrica; RTF p50/p95 sobre as falas somadas; dispersão por métrica', () => {
    const base = metricasDaRodada(rodadaSintetica())
    const outra = {
      ...base,
      framesLongos: { ...base.framesLongos, n50: 4, somaMs: 400 },
      memoriaPicoMb: 600,
      rtf: { valores: [0.3, 0.4] },
    }
    const terceira = { ...base, framesLongos: { ...base.framesLongos, n50: 3 }, memoriaPicoMb: 560 }
    const ag = agregarRodadas([base, outra, terceira])
    expect(ag.rodadas).toBe(3)
    expect(ag.metricas['framesLongos.n50']).toBe(3)
    expect(ag.metricas['framesLongos.somaMs']).toBe(180)
    expect(ag.metricas.memoriaPicoMb).toBe(560)
    // falas somadas: 0,1 0,2 0,3 0,4 0,1 0,2 → p50 = 0,2; p95 por interpolação linear
    expect(ag.metricas['rtf.p50']).toBeCloseTo(0.2, 5)
    expect(ag.metricas['rtf.p95']).toBeCloseTo(0.375, 5)
    // dispersão = (máx − mín) ÷ mediana
    expect(ag.dispersao['framesLongos.n50']).toBeCloseTo((4 - 2) / 3, 5)
  })

  it('rodadas inválidas ficam fora da conta e são contadas à parte', () => {
    const boa = metricasDaRodada(rodadaSintetica())
    const ruim = metricasDaRodada(rodadaSintetica({ queda: 'caiu' }))
    const ag = agregarRodadas([boa, ruim])
    expect(ag.rodadas).toBe(1)
    expect(ag.invalidas).toEqual([{ rotulo: 'desktop.r1', motivo: 'a aba caiu: caiu' }])
  })
})

const METRICAS_DO_SLO = {
  'framesLongos.n50': { rotulo: 'frames > 50 ms', sentido: 'menor', toleranciaPct: 25, folgaAbs: 2 },
  memoriaPicoMb: { rotulo: 'memória de pico (MB)', sentido: 'menor', toleranciaPct: 15, folgaAbs: 0 },
  'rendersPorS.silencio': { rotulo: 'renders/s no silêncio', sentido: 'menor', toleranciaPct: 50, folgaAbs: 1 },
}

function slo(perfis: Record<string, Record<string, number>> | null) {
  return {
    versao: 1,
    metricas: METRICAS_DO_SLO,
    ambientes: perfis ? { ci: { descricao: 'runner', perfis } } : {},
  }
}

function resultado(metricas: Record<string, number | null>) {
  return { ambiente: 'ci', perfis: { desktop: { rodadas: 3, metricas } } }
}

describe('comparação com a linha de base', () => {
  it('dentro da tolerância: ok; além dela: piorou; bem abaixo: melhorou', () => {
    const s = slo({ desktop: { 'framesLongos.n50': 10, memoriaPicoMb: 1000, 'rendersPorS.silencio': 0 } })
    const c = comparar(s, resultado({ 'framesLongos.n50': 14, memoriaPicoMb: 1200, 'rendersPorS.silencio': 0.5 }), 'ci')
    const status = Object.fromEntries(c.linhas.map((l) => [l.metrica, l.status]))
    // 10 × 1,25 + 2 = 14,5 → 14 passa
    expect(status['framesLongos.n50']).toBe('ok')
    // 1000 × 1,15 = 1150 → 1200 piorou
    expect(status.memoriaPicoMb).toBe('piorou')
    // base 0: a folga absoluta decide (0,5 ≤ 0 + 1)
    expect(status['rendersPorS.silencio']).toBe('ok')
    expect(c.piorou).toBe(true)

    const melhor = comparar(
      s,
      resultado({ 'framesLongos.n50': 2, memoriaPicoMb: 700, 'rendersPorS.silencio': 0 }),
      'ci',
    )
    expect(melhor.piorou).toBe(false)
    expect(melhor.linhas.find((l) => l.metrica === 'memoriaPicoMb')!.status).toBe('melhorou')
  })

  it('sentido "maior": piora quando cai além da tolerância', () => {
    const s = {
      versao: 1,
      metricas: { vazao: { rotulo: 'vazão', sentido: 'maior', toleranciaPct: 10, folgaAbs: 0 } },
      ambientes: { ci: { perfis: { desktop: { vazao: 100 } } } },
    }
    expect(comparar(s, resultado({ vazao: 85 }), 'ci').linhas[0].status).toBe('piorou')
    expect(comparar(s, resultado({ vazao: 95 }), 'ci').linhas[0].status).toBe('ok')
  })

  it('sem linha de base para o ambiente: não reprova, avisa', () => {
    const c = comparar(slo(null), resultado({ 'framesLongos.n50': 3 }), 'ci')
    expect(c.piorou).toBe(false)
    expect(c.semBase).toBe(true)
    expect(c.linhas.every((l) => l.status === 'sem-base')).toBe(true)
  })

  it('métrica medida como null: "sem medida", sem reprovar', () => {
    const s = slo({ desktop: { 'framesLongos.n50': 10, memoriaPicoMb: 1000, 'rendersPorS.silencio': 0 } })
    const c = comparar(s, resultado({ 'framesLongos.n50': 10, memoriaPicoMb: null, 'rendersPorS.silencio': 0 }), 'ci')
    expect(c.linhas.find((l) => l.metrica === 'memoriaPicoMb')!.status).toBe('sem-medida')
    expect(c.piorou).toBe(false)
  })

  it('tabela markdown: cabeçalho, uma linha por perfil × métrica, delta com sinal, sem emoji', () => {
    const s = slo({ desktop: { 'framesLongos.n50': 10, memoriaPicoMb: 1000, 'rendersPorS.silencio': 0 } })
    const md = tabelaMarkdown(
      comparar(s, resultado({ 'framesLongos.n50': 12, memoriaPicoMb: 1200, 'rendersPorS.silencio': 0 }), 'ci'),
    )
    expect(md).toContain('| perfil | métrica | linha de base | medido | Δ | limite | situação |')
    expect(md).toContain('| desktop | frames > 50 ms | 10 | 12 | +20% | 14,5 | ok |')
    expect(md).toContain('| desktop | memória de pico (MB) | 1000 | 1200 | +20% | 1150 | **piorou** |')
    expect(md).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('gravar a linha de base: valores do resultado, arredondados, configuração das métricas preservada', () => {
    const novo = gravarLinhaDeBase(
      slo(null),
      resultado({ 'framesLongos.n50': 3, memoriaPicoMb: 512.456, 'rendersPorS.silencio': 0.123456 }),
      'ci',
      { descricao: 'ubuntu-latest', commit: 'abc1234', medidoEm: '2026-09-29' },
    )
    expect(novo.metricas).toEqual(METRICAS_DO_SLO)
    expect(novo.ambientes.ci.commit).toBe('abc1234')
    expect(novo.ambientes.ci.rodadas).toEqual({ desktop: 3 })
    expect(novo.ambientes.ci.perfis.desktop).toEqual({
      'framesLongos.n50': 3,
      memoriaPicoMb: 512.5,
      'rendersPorS.silencio': 0.123,
    })
  })
})

describe('slo-captura.json versionado', () => {
  const arquivo = path.join(__dirname, '..', 'scripts', 'perf', 'latencia-legenda', 'slo-captura.json')
  const doc = JSON.parse(readFileSync(arquivo, 'utf8'))

  it('é válido: cada métrica tem sentido e tolerância, cada base só usa métricas declaradas', () => {
    expect(validarSlo(doc)).toEqual([])
  })

  it('cobre as métricas do A0: frames longos, 1ª legenda, RTF, memória, CPU no silêncio e renders/s', () => {
    expect(Object.keys(doc.metricas)).toEqual(
      expect.arrayContaining([
        'framesLongos.n50',
        'framesLongos.n100',
        'framesLongos.somaMs',
        'primeiraLegendaMs',
        'rtf.p50',
        'rtf.p95',
        'memoriaPicoMb',
        'cpuSilencio.processoPct',
        'rendersPorS.silencio',
        'rendersPorS.fala',
      ]),
    )
  })

  it('validarSlo acusa sentido desconhecido e métrica fora da lista', () => {
    const erros = validarSlo({
      versao: 1,
      metricas: { x: { sentido: 'lado', toleranciaPct: 10 } },
      ambientes: { ci: { perfis: { desktop: { y: 1 } } } },
    })
    expect(erros.join(' ')).toMatch(/sentido/)
    expect(erros.join(' ')).toMatch(/"y"/)
  })
})

describe('ruído entre duas execuções da bancada', () => {
  it('|a − b| ÷ média, por perfil × métrica; o maior fica em destaque', () => {
    const a = { perfis: { desktop: { metricas: { 'framesLongos.n50': 10, memoriaPicoMb: 1000 } } } }
    const b = { perfis: { desktop: { metricas: { 'framesLongos.n50': 12, memoriaPicoMb: 1000 } } } }
    const r = ruidoEntre(a, b, ['framesLongos.n50', 'memoriaPicoMb', 'rtf.p50'])
    expect(r.linhas).toEqual([
      { perfil: 'desktop', metrica: 'framesLongos.n50', a: 10, b: 12, ruidoPct: (2 / 11) * 100 },
      { perfil: 'desktop', metrica: 'memoriaPicoMb', a: 1000, b: 1000, ruidoPct: 0 },
      { perfil: 'desktop', metrica: 'rtf.p50', a: null, b: null, ruidoPct: null },
    ])
    expect(r.maiorPct).toBeCloseTo((2 / 11) * 100, 5)
  })

  it('as duas em zero: ruído zero, não NaN', () => {
    const z = { perfis: { desktop: { metricas: { x: 0 } } } }
    expect(ruidoEntre(z, z, ['x']).linhas[0].ruidoPct).toBe(0)
  })
})

describe('áudio da bancada (WAV PCM16 e µ-law)', () => {
  it('µ-law G.711: valores de referência', () => {
    expect(mulawDe(0)).toBe(0xff)
    expect(deMulaw(0xff)).toBe(0)
    expect(deMulaw(0x7f)).toBe(0)
    expect(mulawDe(32767)).toBe(0x80)
    expect(deMulaw(0x80)).toBe(32124)
    expect(deMulaw(0x00)).toBe(-32124)
  })

  it('µ-law ida e volta: erro relativo pequeno em toda a faixa', () => {
    let pior = 0
    for (let s = -32768; s <= 32767; s += 7) {
      const erro = Math.abs(deMulaw(mulawDe(s)) - s) / Math.max(Math.abs(s), 256)
      pior = Math.max(pior, erro)
    }
    expect(pior).toBeLessThan(0.05)
  })

  it('WAV µ-law de 16 kHz: lido de volta com a taxa e as amostras (≈) certas', () => {
    const x = new Float32Array(1600)
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / 16000)
    const buf = wavMulaw(x, 16000)
    expect(buf.length).toBeLessThan(44 + 1600 + 32)
    const w = lerWav(buf)
    expect(w.sr).toBe(16000)
    expect(w.amostras.length).toBe(1600)
    let pior = 0
    for (let i = 0; i < x.length; i++) pior = Math.max(pior, Math.abs(w.amostras[i] - x[i]))
    expect(pior).toBeLessThan(0.02)
  })

  it('WAV PCM16: ida e volta com erro de quantização só', () => {
    const x = Float32Array.from([0, 0.25, -0.25, 0.999, -1])
    const w = lerWav(wavPcm16(x, 16000))
    expect(w.sr).toBe(16000)
    for (let i = 0; i < x.length; i++) expect(Math.abs(w.amostras[i] - x[i])).toBeLessThan(1 / 16384)
  })

  it('WAV em outro formato (estéreo, 44,1 kHz): recusa com mensagem', () => {
    const buf = wavPcm16(new Float32Array(10), 44100)
    expect(() => lerWav(buf, { sr: 16000 })).toThrow(/16000/)
  })
})
