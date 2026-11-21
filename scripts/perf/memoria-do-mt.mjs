#!/usr/bin/env node
/* global window, localStorage, setInterval, clearInterval */
/**
 * MEMÓRIA E LATÊNCIA DO TRADUTOR LOCAL pt→en: Bergamot (0.4.9, o de hoje) × opus-mt, no Chromium, em rodadas ABAB
 * (openspec traducao-local-por-direcao, D6; protocolo em `docs/auditoria/protocolo-do-laboratorio-de-latencia.md`).
 *
 *   npm run build:estatica
 *   node node_modules/tsx/dist/cli.mjs scripts/perf/memoria-do-mt.mjs [--rodadas 11] [--porta 4189] [--saida arquivo.json]
 *
 * Cada rodada abre UM Chromium novo (o perfil guarda o Cache Storage: só a 1ª rodada baixa os modelos, e ela é DESCARTADA
 * da análise), prepara o par pelo gateway de verdade (`window.__babelGateway`) e traduz as mesmas frases. Mede:
 *   - RSS do Chromium (soma de todos os processos do perfil: janela, worker do WASM, GPU), em MB: base (página parada),
 *     PICO (amostrado a cada ~150 ms do preparo ao fim das traduções) e fim; e o heap JS da janela quando o Chromium expõe;
 *   - o preparo (download do cache + montagem) e a latência por tradução (p50/p75/p95), com o motor que respondeu.
 * A diferença opus-mt − Bergamot é PAREADA por rodada, com IC 95% por bootstrap (`src/core/eval/bootstrap.ts`).
 *
 * É laboratório DESKTOP (macOS, Chromium headless): todo número sai marcado `emulado`. Serve para ordenar as opções e achar
 * regressão; NÃO prova nada sobre celular, Quest ou iPhone (portão 4: aparelho real). RSS do macOS conta páginas
 * compartilhadas; compare o DELTA entre as duas opções, não o valor absoluto. Não baixa nada além do Hub (opus-mt, ~113 MB,
 * só na 1ª rodada) e roda contra `dist/` local.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { bootstrapPareado, mediaEm } from '../../src/core/eval/bootstrap.ts'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : d
}
const RODADAS = Number(arg('rodadas', 11))
const PORTA = Number(arg('porta', process.env.PORTA_ESTATICA || 4189))
const BASE = `http://127.0.0.1:${PORTA}`

const modelos = JSON.parse(readFileSync(path.join(RAIZ, 'src/gateway/adapters/modelosDoBergamot.json'), 'utf8'))
// A mesma assinatura de `bergamotModelo.ts`: com ela lembrada, o composto pula o Bergamot e o pt→en vai ao opus-mt.
const ASSINATURA = [modelos.motor.versao, ...Object.values(modelos.pares).map((p) => p.execucao)].join('|')

const FRASES = [
  'Eu gostaria de um café, por favor.',
  'A gente tava de boa ontem à noite, sabe?',
  'Onde fica a estação de trem mais próxima?',
  'Não sei se vou conseguir chegar a tempo para a reunião.',
  'Ele disse que ia ligar, mas até agora nada.',
  'Bom dia! Tudo bem com você?',
  'Você pode repetir mais devagar? Eu ainda estou aprendendo.',
  'Amanhã a gente se vê no mesmo lugar de sempre.',
]
const PASSADAS = 3

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const quantil = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null
}

/**
 * RSS (MB) da ÁRVORE de processos do Chromium do perfil: a raiz é o processo cujo comando cita o diretório do perfil e não
 * é filho especializado (`--type=`); entram todos os descendentes (janela, worker do WASM, GPU, utilitários), que não
 * repetem o diretório na linha de comando.
 */
function rssDoPerfil(dir) {
  try {
    const saida = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    const procs = saida
      .split('\n')
      .map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l))
      .filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), kb: Number(m[3]), cmd: m[4] }))
    const raizes = procs.filter((p) => p.cmd.includes(dir) && !p.cmd.includes('--type='))
    const dentro = new Set(raizes.map((p) => p.pid))
    for (let mudou = true; mudou; ) {
      mudou = false
      for (const p of procs) {
        if (!dentro.has(p.pid) && dentro.has(p.ppid)) {
          dentro.add(p.pid)
          mudou = true
        }
      }
    }
    return Math.round(procs.filter((p) => dentro.has(p.pid)).reduce((s, p) => s + p.kb, 0) / 1024)
  } catch {
    return null
  }
}

async function servidorDePe() {
  try {
    return (await fetch(`${BASE}/`)).ok
  } catch {
    return false
  }
}
async function subirServidor() {
  if (await servidorDePe()) return null
  const p = spawn(
    process.execPath,
    [path.join(RAIZ, 'tests', 'e2e-estatica', '_servidor-estatico.mjs'), String(PORTA)],
    {
      stdio: 'ignore',
    },
  )
  for (let i = 0; i < 50 && !(await servidorDePe()); i++) await dormir(200)
  return p
}

async function rodada(perfil, motor) {
  const contexto = await chromium.launchPersistentContext(perfil, { headless: true })
  try {
    await contexto.addInitScript(
      ({ motor, assinatura }) => {
        try {
          localStorage.setItem('babel_tour_blitz', '1')
          if (motor === 'opus-mt')
            localStorage.setItem('babel.bergamot.falha', JSON.stringify({ assinatura, motivo: 'comparação' }))
          else localStorage.removeItem('babel.bergamot.falha')
        } catch {
          /* storage bloqueado */
        }
      },
      { motor, assinatura: ASSINATURA },
    )
    const pagina = contexto.pages()[0] ?? (await contexto.newPage())
    await pagina.goto(`${BASE}/capturar`)
    await pagina.waitForFunction(() => !!window.__babelGateway, null, { timeout: 60_000 })
    await dormir(2000) // a página assenta antes da base
    const rssBase = rssDoPerfil(perfil)
    let pico = rssBase ?? 0
    const amostrador = setInterval(() => {
      const v = rssDoPerfil(perfil)
      if (v !== null && v > pico) pico = v
    }, 150)
    let r
    try {
      r = await pagina.evaluate(
        async ({ frases, passadas }) => {
          const gw = window.__babelGateway
          const t0 = performance.now()
          const pronto = new Promise((ok) => {
            const soltar = gw.mt.aoFicarPronto(() => {
              soltar()
              ok(true)
            })
          })
          await gw.mt.preload('pt', 'en')
          const prontoNoTempo = await Promise.race([pronto, new Promise((ok) => setTimeout(() => ok(false), 240_000))])
          const preparoMs = Math.round(performance.now() - t0)
          const traducoes = []
          for (let p = 0; p < passadas; p++) {
            for (const f of frases) {
              const a = performance.now()
              try {
                const x = await gw.mt.translate(f, 'pt', 'en')
                traducoes.push({ ms: performance.now() - a, motor: x.engine })
              } catch (e) {
                traducoes.push({ ms: performance.now() - a, erro: String(e?.message ?? e).slice(0, 120) })
              }
            }
          }
          const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null
          return { preparoMs, prontoNoTempo, traducoes, heapJsMb: heap }
        },
        { frases: FRASES, passadas: PASSADAS },
      )
    } finally {
      clearInterval(amostrador)
    }
    await dormir(500)
    const rssFim = rssDoPerfil(perfil)
    if (rssFim !== null && rssFim > pico) pico = rssFim
    const ok = r.traducoes.filter((t) => !t.erro)
    const ms = ok.map((t) => t.ms)
    return {
      motor,
      rssBaseMb: rssBase,
      rssPicoMb: pico,
      rssFimMb: rssFim,
      picoSobreABaseMb: rssBase === null ? null : pico - rssBase,
      heapJsMb: r.heapJsMb,
      preparoMs: r.preparoMs,
      prontoNoTempo: r.prontoNoTempo,
      erros: r.traducoes.length - ok.length,
      motores: [...new Set(ok.map((t) => t.motor))],
      latenciaMs: { p50: quantil(ms, 0.5), p75: quantil(ms, 0.75), p95: quantil(ms, 0.95), n: ms.length },
    }
  } finally {
    await contexto.close()
  }
}

function pareado(rotulo, valoresA, valoresB, unidade) {
  const n = Math.min(valoresA.length, valoresB.length)
  if (n < 2) return { rotulo, n, aviso: 'poucas rodadas' }
  const d = bootstrapPareado(n, mediaEm(valoresA), mediaEm(valoresB))
  return {
    rotulo,
    unidade,
    n,
    mediaOpus: mediaEm(valoresA)(Array.from({ length: n }, (_, i) => i)),
    mediaBergamot: mediaEm(valoresB)(Array.from({ length: n }, (_, i) => i)),
    diferenca_opus_menos_bergamot: d.valor,
    ic95: d.ic95,
    veredito: d.significativo
      ? d.valor > 0
        ? 'Bergamot menor, IC exclui 0'
        : 'opus-mt menor, IC exclui 0'
      : 'sem diferença provada',
  }
}

const servidor = await subirServidor()
const perfil = mkdtempSync(path.join(tmpdir(), 'memoria-mt-'))
const rodadas = []
try {
  for (let i = 0; i < RODADAS; i++) {
    // ABAB: a ordem alterna a cada rodada (a deriva do aquecimento/cache não favorece um lado).
    const ordem = i % 2 === 0 ? ['bergamot', 'opus-mt'] : ['opus-mt', 'bergamot']
    const par = { rodada: i, descartada: i === 0 }
    for (const motor of ordem) {
      par[motor] = await rodada(perfil, motor)
      console.log(
        `rodada ${i}${i === 0 ? ' (descartada: baixa os modelos)' : ''} ${motor}: RSS base ${par[motor].rssBaseMb} → pico ${par[motor].rssPicoMb} MB (Δ ${par[motor].picoSobreABaseMb}), preparo ${par[motor].preparoMs} ms, p50 ${par[motor].latenciaMs.p50?.toFixed(0)} ms, p75 ${par[motor].latenciaMs.p75?.toFixed(0)} ms, erros ${par[motor].erros}, motores ${par[motor].motores}`,
      )
    }
    rodadas.push(par)
  }
} finally {
  rmSync(perfil, { recursive: true, force: true })
  servidor?.kill()
}

const validas = rodadas.filter((r) => !r.descartada)
const col = (motor, f) => validas.map((r) => f(r[motor]))
const analise = [
  pareado(
    'RSS pico (MB)',
    col('opus-mt', (x) => x.rssPicoMb),
    col('bergamot', (x) => x.rssPicoMb),
    'MB',
  ),
  pareado(
    'RSS pico sobre a base (MB)',
    col('opus-mt', (x) => x.picoSobreABaseMb),
    col('bergamot', (x) => x.picoSobreABaseMb),
    'MB',
  ),
  pareado(
    'RSS no fim (MB)',
    col('opus-mt', (x) => x.rssFimMb),
    col('bergamot', (x) => x.rssFimMb),
    'MB',
  ),
  pareado(
    'latência p50 por rodada (ms)',
    col('opus-mt', (x) => x.latenciaMs.p50),
    col('bergamot', (x) => x.latenciaMs.p50),
    'ms',
  ),
  pareado(
    'latência p75 por rodada (ms)',
    col('opus-mt', (x) => x.latenciaMs.p75),
    col('bergamot', (x) => x.latenciaMs.p75),
    'ms',
  ),
  pareado(
    'preparo com modelo em cache (ms)',
    col('opus-mt', (x) => x.preparoMs),
    col('bergamot', (x) => x.preparoMs),
    'ms',
  ),
]
const erros = {
  bergamot: validas.reduce((s, r) => s + r.bergamot.erros, 0),
  'opus-mt': validas.reduce((s, r) => s + r['opus-mt'].erros, 0),
}
const motoresVistos = {
  bergamot: [...new Set(validas.flatMap((r) => r.bergamot.motores))],
  'opus-mt': [...new Set(validas.flatMap((r) => r['opus-mt'].motores))],
}
const saida = {
  quando: new Date().toISOString(),
  origem: 'emulado',
  nota: 'Chromium headless no macOS, desktop. Ordena opções; não prova nada sobre celular, Quest ou iPhone.',
  rodadasTotais: RODADAS,
  rodadasValidas: validas.length,
  frases: FRASES.length,
  passadas: PASSADAS,
  errosNasTraducoes: erros,
  motoresQueResponderam: motoresVistos,
  analise,
  rodadas,
}
for (const a of analise)
  console.log(
    `${a.rotulo}: opus ${a.mediaOpus?.toFixed(0)} × Bergamot ${a.mediaBergamot?.toFixed(0)}, Δ(opus−Bergamot) ${a.diferenca_opus_menos_bergamot?.toFixed(0)} [${a.ic95?.map((v) => v.toFixed(0)).join(', ')}] — ${a.veredito ?? a.aviso}`,
  )
console.log(`erros: ${JSON.stringify(erros)}; motores: ${JSON.stringify(motoresVistos)}`)
const arquivo = arg('saida', null)
if (arquivo) writeFileSync(arquivo, JSON.stringify(saida, null, 2))
