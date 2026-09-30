/**
 * MÉTRICAS DA BANCADA DE DESEMPENHO DA CAPTURA (A0 do plano "grátis sem travar").
 *
 * Transforma uma rodada bruta de `medir.mjs` (o que a `sonda.js` viu + as amostras de CPU e memória)
 * nas métricas que a bancada vigia, e N rodadas num número por perfil. Tudo puro: o teste
 * (`tests/bancada-desempenho-captura.test.ts`) roda sem navegador.
 *
 * As JANELAS saem do relógio do arquivo de áudio (o bipe-âncora, como em `analisar.mjs`), não do
 * relógio de parede: o mesmo trecho do áudio cai no mesmo trecho da medição em toda rodada, e é
 * isso que deixa duas rodadas comparáveis.
 *   sessão   = do clique em "Iniciar captura" ao fim do áudio (frames longos);
 *   fala     = do início da 1ª voz a 1 s depois do fim da última (renders/s com fala);
 *   silêncio = do que vier depois — fim da última voz + 3 s, última mudança de balão + 1,5 s — ao fim
 *              do áudio (CPU e renders/s com a captura ligada e nada para transcrever). No aparelho
 *              emulado, só depois de `cpuSoltaEm` + 1 s: o freio de CPU do CDP
 *              (`Emulation.setCPUThrottlingRate`) GIRA um núcleo inteiro no processo da aba, até
 *              ocioso (medido: 99,9% com 4×, 0,2% sem), e `medir.mjs` o solta ao fim da última voz.
 */
import { analisarRodada } from './analisar.mjs'

/** Janela mínima para uma taxa de CPU valer alguma coisa (abaixo disso, 1 tique do SO já distorce). */
const JANELA_MINIMA_CPU_MS = 3000

/** Métricas escalares que a agregação leva (o RTF é somado à parte, fala a fala). */
export const METRICAS_ESCALARES = [
  'framesLongos.n50',
  'framesLongos.n100',
  'framesLongos.somaMs',
  'framesLongos.maiorMs',
  'primeiraLegendaMs',
  'sttProntoMs',
  'memoriaPicoMb',
  'heapPicoMb',
  'cpuSilencio.processoPct',
  'cpuSilencio.principalPct',
  'cpuSilencio.foraDaPrincipalPct',
  'cpuSilencio.workersPct',
  'rendersPorS.silencio',
  'rendersPorS.fala',
  'commitsPorS.silencio',
  'commitsPorS.fala',
  'fimATraducao.p50',
  'regulador.trocasDeModelo',
]

const finito = (x) => typeof x === 'number' && Number.isFinite(x)

export function mediana(xs) {
  const s = xs.filter(finito).sort((a, b) => a - b)
  if (!s.length) return null
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Percentil por interpolação linear (tipo 7), o mesmo de `analisar.mjs`, sem arredondar. */
export function percentil(xs, p) {
  const s = xs.filter(finito).sort((a, b) => a - b)
  if (!s.length) return null
  const h = (s.length - 1) * (p / 100)
  const lo = Math.floor(h)
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo)
}

/**
 * Relógio do arquivo → `performance.now()` da página. A âncora é a 1ª janela de 20 ms da sonda de
 * áudio dominada por 2 kHz; o bipe começou dentro dela, então vale o meio (−10 ms). `null` sem bipe.
 */
export function relogioDoArquivo(d) {
  const jan = (d.lat?.aud ?? []).find((a) => a[2] > 0.5 && a[1] > 0.01)
  if (!jan) return null
  const ancora = jan[0] - 10
  return (s) => ancora + (s - d.roteiro.bipeS) * 1000
}

/** Long Animation Frames (> 50 e > 100 ms) com início dentro de [ini, fim]. */
export function framesLongos(loafs, ini, fim) {
  const dentro = (loafs ?? []).filter((l) => l.t >= ini && l.t <= fim && l.ms > 50)
  return {
    n50: dentro.length,
    n100: dentro.filter((l) => l.ms > 100).length,
    somaMs: dentro.reduce((s, l) => s + l.ms, 0),
    maiorMs: dentro.reduce((m, l) => Math.max(m, l.ms), 0),
  }
}

/** Eventos `[t, peso]` em [ini, fim): peso por segundo e eventos por segundo. `null` sem janela. */
export function taxaNaJanela(eventos, ini, fim) {
  const dur = (fim - ini) / 1000
  if (!(dur > 0)) return null
  const dentro = (eventos ?? []).filter(([t]) => t >= ini && t < fim)
  return {
    porS: dentro.reduce((s, [, peso]) => s + peso, 0) / dur,
    eventosPorS: dentro.length / dur,
  }
}

/**
 * CPU em % de UM núcleo (como o `top`): Δ do tempo de CPU acumulado (s) ÷ Δ do relógio, entre a
 * primeira amostra dentro da janela e a última. `null` se o campo não foi medido ou a janela é curta.
 */
export function cpuNaJanela(amostras, ini, fim, campo) {
  const dentro = (amostras ?? []).filter((a) => a.t >= ini && a.t <= fim && finito(a[campo]))
  if (dentro.length < 2) return null
  const a = dentro[0]
  const b = dentro[dentro.length - 1]
  const dt = b.t - a.t
  if (dt < JANELA_MINIMA_CPU_MS) return null
  return (((b[campo] - a[campo]) * 1000) / dt) * 100
}

export function picoDeMemoria(amostras, campo) {
  const xs = (amostras ?? []).map((a) => a[campo]).filter(finito)
  return xs.length ? Math.max(...xs) : null
}

const temTexto = (r) => !!r && typeof r.o === 'string' && r.o.trim().length > 0

/** As três janelas da rodada (ver o cabeçalho). Supõe relógio válido. */
export function janelasDaRodada(d, relogio = relogioDoArquivo(d)) {
  const falas = d.roteiro.falas
  const ultimaAmostra = (d.amostras ?? []).reduce((m, a) => Math.max(m, a.t), -Infinity)
  const fimDoAudio = Math.min(relogio(d.roteiro.duracaoS), Number.isFinite(ultimaAmostra) ? ultimaAmostra : Infinity)
  const inicioDaVoz = relogio(falas[0].iniS)
  const fimDaVoz = relogio(falas[falas.length - 1].fimS)
  const ultimoBalao = (d.lat?.dom ?? []).reduce((m, r) => Math.max(m, r.t), -Infinity)
  return {
    sessao: [d.tIniciarPerf, fimDoAudio],
    fala: [inicioDaVoz, fimDaVoz + 1000],
    silencio: [Math.max(fimDaVoz + 3000, ultimoBalao + 1500, (d.cpuSoltaEm ?? -Infinity) + 1000), fimDoAudio],
  }
}

/**
 * As métricas de UMA rodada. `valida: false` (com `motivo`) quando não dá para medir sem inventar:
 * a aba caiu, ou a sonda não achou o bipe.
 *
 * @param {any} d a rodada bruta, como `medir.mjs` a grava
 * @returns {Record<string, any>} a forma válida e a inválida numa só (para quem importa de TS)
 */
export function metricasDaRodada(d) {
  const base = { rotulo: d.rotulo, perfil: d.perfilDoAparelho ?? null }
  if (d.queda) return { ...base, valida: false, motivo: `a aba caiu: ${d.queda}` }
  const relogio = relogioDoArquivo(d)
  if (!relogio) return { ...base, valida: false, motivo: 'bipe não encontrado na sonda de áudio' }

  const j = janelasDaRodada(d, relogio)
  const analise = analisarRodada(d)
  const ev = d.lat.ev ?? []
  const pronto = ev.find((e) => e.k === 'w:in' && e.nome?.startsWith('whisperWorker') && e.type === 'ready')

  // 1ª legenda: do início da 1ª voz ao primeiro balão com texto (parcial ou final) — o que a pessoa
  // espera para ver ALGUMA coisa depois de começar a falar. Inclui a carga do modelo se ela atrasar.
  const inicioDaVoz = j.fala[0]
  const primeiroTexto = (d.lat.dom ?? []).find((r) => r.t >= inicioDaVoz - 500 && temTexto(r))

  // RTF: só as falas cujo final foi postado com o modelo já pronto.
  const rtf = analise.falas.filter((f) => finito(f.rtf) && (!pronto || f.tPostFinal >= pronto.t)).map((f) => f.rtf)

  const rc = d.lat.rc ?? []
  const renders = (jan) => taxaNaJanela(rc, jan[0], jan[1])
  const rSil = renders(j.silencio)
  const rFala = renders(j.fala)

  const cpu = (campo) => cpuNaJanela(d.amostras, j.silencio[0], j.silencio[1], campo)
  const processoPct = cpu('cpuProcessoS')
  const principalPct = cpu('cpuPrincipalS')

  const tr = analise.falas.map((f) => f.fimATraducao).filter(finito)

  // O regulador (A6) desce o modelo no meio da sessão quando o aparelho não acompanha: numa rodada
  // com descida, memória e RTF mudam de patamar. Contado para que a mediana seja lida sabendo disso.
  const trocas = ev.filter((e) => e.k === 'log' && /regulador: modelo local →/.test(e.s ?? ''))
  const modelos = [
    ...new Set(
      ev.filter((e) => e.k === 'w:out' && e.type === 'load' && e.nome?.startsWith('whisperWorker')).map((e) => e.model),
    ),
  ].filter(Boolean)

  return {
    ...base,
    valida: true,
    modeloStt: analise.modeloStt ?? null,
    janelas: j,
    framesLongos: framesLongos(d.lat.loaf, j.sessao[0], j.sessao[1]),
    primeiraLegendaMs: primeiroTexto ? Math.round(primeiroTexto.t - inicioDaVoz) : null,
    sttProntoMs: pronto ? Math.round(pronto.t - d.tIniciarPerf) : null,
    rtf: { valores: rtf, p50: percentil(rtf, 50), p95: percentil(rtf, 95) },
    memoriaPicoMb: picoDeMemoria(d.amostras, 'memMb'),
    heapPicoMb: picoDeMemoria(d.amostras, 'heapMb'),
    cpuSilencio: {
      processoPct,
      principalPct,
      foraDaPrincipalPct: finito(processoPct) && finito(principalPct) ? processoPct - principalPct : null,
      workersPct: cpu('cpuWorkersS'),
    },
    rendersPorS: { silencio: rSil?.porS ?? null, fala: rFala?.porS ?? null },
    commitsPorS: { silencio: rSil?.eventosPorS ?? null, fala: rFala?.eventosPorS ?? null },
    fimATraducao: { p50: percentil(tr, 50), p95: percentil(tr, 95) },
    regulador: {
      trocasDeModelo: trocas.length,
      primeiraTrocaMs: trocas.length ? Math.round(trocas[0].t - d.tIniciarPerf) : null,
      modelos,
    },
    falasPerdidas: analise.falas.filter((f) => f.perdida).length,
    pedidosAoHub: d.pedidosAoHub ?? null,
  }
}

const ler = (o, caminho) => caminho.split('.').reduce((v, k) => (v == null ? v : v[k]), o)

/**
 * N rodadas → um número por métrica: a MEDIANA das rodadas válidas (uma rodada ruim não arrasta o
 * resultado) e, para o RTF, p50/p95 sobre TODAS as falas somadas (com 8 falas por rodada, o p95 de
 * uma rodada só é o segundo maior valor). `dispersao` = (máx − mín) ÷ mediana, para ler o ruído.
 *
 * @param {Record<string, any>[]} rodadas as métricas de cada rodada (`metricasDaRodada`)
 * @returns {{ rodadas: number, invalidas: { rotulo: string, motivo: string }[], falasNoRtf: number,
 *   metricas: Record<string, number | null>, dispersao: Record<string, number | null> }}
 */
export function agregarRodadas(rodadas) {
  const validas = rodadas.filter((r) => r.valida)
  const metricas = {}
  const dispersao = {}
  for (const m of METRICAS_ESCALARES) {
    const xs = validas.map((r) => ler(r, m)).filter(finito)
    const med = mediana(xs)
    metricas[m] = med
    dispersao[m] = xs.length > 1 && med ? (Math.max(...xs) - Math.min(...xs)) / Math.abs(med) : null
  }
  const rtf = validas.flatMap((r) => r.rtf?.valores ?? [])
  metricas['rtf.p50'] = percentil(rtf, 50)
  metricas['rtf.p95'] = percentil(rtf, 95)
  return {
    rodadas: validas.length,
    invalidas: rodadas.filter((r) => !r.valida).map((r) => ({ rotulo: r.rotulo, motivo: r.motivo })),
    falasNoRtf: rtf.length,
    metricas,
    dispersao,
  }
}
