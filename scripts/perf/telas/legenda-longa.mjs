#!/usr/bin/env node
/* global window, document, requestAnimationFrame */
/**
 * A LEGENDA LONGA DA CAPTURA (26/10/2026): quanto custa a tela de legendar com 100, 600 e 2.000 falas.
 *
 *   npm run build
 *   node scripts/perf/telas/legenda-longa.mjs [--raiz=<pasta com dist/>] [--raiz-b=<outra pasta com dist/>]
 *        [--falas=100,600,2000] [--cpu=4] [--execucoes=3] [--perfil=desktop|celular] [--saida=<arquivo.json>]
 *
 * Sobe o servidor de PRODUÇÃO (`_servidores.mjs`, o mesmo da auditoria de telas) para cada raiz e, num Chromium
 * do Playwright com a CPU estrangulada pelo DevTools (`Emulation.setCPUThrottlingRate`, 4× = CPU_LENTA=4), abre
 * a captura e põe as falas pela bancada da tela (`window.__simFalas`, sem STT nem MT). Mede, por quantidade:
 *
 *  - injetarMs: as N falas de uma vez até a última aparecer na legenda e mais dois quadros;
 *  - umaFalaMs: a mediana de 10 falas a mais, uma a uma, medidas do mesmo jeito (o custo de cada fala ao vivo);
 *  - arvoreMs: a árvore de acessibilidade da página (`ariaSnapshot` do Playwright: o que travava o e2e);
 *  - topoMs: rolar do fim ao começo até a primeira fala estar na tela, e dois quadros; voltaMs: de volta ao fim;
 *  - nos / linhas: elementos no DOM e linhas da legenda montadas; heapMb: memória JS depois de um GC.
 *
 * Com `--raiz-b`, A e B se alternam na mesma rodada (o ruído da máquina cai nos dois). Imprime a tabela de
 * medianas em Markdown e grava tudo em `--saida`.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { chromium } from 'playwright'

import { celula, mediana, r1 } from './_medidas.mjs'
import { RAIZ, subirProducao } from './_servidores.mjs'

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const raizes = [arg('raiz', RAIZ), arg('raiz-b', null)].filter(Boolean).map((r) => path.resolve(r))
const quantidades = arg('falas', '100,600,2000').split(',').map(Number)
const cpu = Number(arg('cpu', 4))
const execucoes = Number(arg('execucoes', 3))
const perfil = arg('perfil', 'desktop')
const saida = arg('saida', null)
const pasta = path.join(os.tmpdir(), 'frasy-legenda-longa')

const CONTEXTO = {
  celular: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1366, height: 800 } },
}[perfil]

async function medirUma(navegador, base, n) {
  const ctx = await navegador.newContext(CONTEXTO)
  const page = await ctx.newPage()
  try {
    await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
    await page.goto(`${base}/capturar`, { waitUntil: 'load', timeout: 90_000 })
    await page.waitForFunction(() => typeof window.__simFalas === 'function', null, { timeout: 60_000 })
    await page.waitForTimeout(1500)
    for (let i = 0; i < 3; i++) await page.keyboard.press('Escape')
    /* Espera a última linha da legenda trazer o texto e mais um quadro (o React desenha fora do `__simFalas`). */
    await page.evaluate(() => {
      window.__ateAparecer = async (texto) => {
        for (;;) {
          await new Promise((r) => requestAnimationFrame(r))
          const linhas = document.querySelectorAll('.q-linha-da-fala')
          if (linhas[linhas.length - 1]?.textContent.includes(texto)) break
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      }
    })
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })

    const injetarMs = await page.evaluate(async (n) => {
      const t = performance.now()
      window.__simFalas(Array.from({ length: n }, (_, i) => `sentence number ${i} about the weather today and more`))
      await window.__ateAparecer(`sentence number ${n - 1} about`)
      return performance.now() - t
    }, n)
    await page.waitForTimeout(1500)

    const umaFala = []
    for (let k = 0; k < 10; k++) {
      umaFala.push(
        await page.evaluate(async (k) => {
          const t = performance.now()
          window.__simFalas([`one more sentence ${k} with a few extra words to wrap the line`])
          await window.__ateAparecer(`one more sentence ${k} with`)
          return performance.now() - t
        }, k),
      )
      await page.waitForTimeout(80)
    }
    await page.waitForTimeout(800)

    const t0 = Date.now()
    /* Com 2.000 falas sem a janela, a árvore passa de 10 min: o prazo estourado vira `null` (">10 min"). */
    const arvoreMs = await page
      .locator('body')
      .ariaSnapshot({ timeout: 600_000 })
      .then(() => Date.now() - t0)
      .catch(() => null)

    const rolar = (para) =>
      page.evaluate(async (para) => {
        const h = document.querySelector('.q-historico')
        const t = performance.now()
        const topo = para === 'topo'
        h.scrollTop = topo ? 0 : h.scrollHeight
        /* Até a linha da ponta estar no DOM (a janela monta os blocos no quadro seguinte à rolagem). */
        const texto = topo ? 'sentence number 0 about' : 'one more sentence 9 with'
        for (let i = 0; i < 300; i++) {
          await new Promise((r) => requestAnimationFrame(r))
          const linhas = h.querySelectorAll('.q-linha-da-fala')
          if (linhas[topo ? 0 : linhas.length - 1]?.textContent.includes(texto)) break
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        return performance.now() - t
      }, para)
    const topoMs = await rolar('topo')
    await page.waitForTimeout(500)
    const voltaMs = await rolar('fim')
    await page.waitForTimeout(500)

    const contagem = await page.evaluate(() => ({
      nos: document.querySelectorAll('*').length,
      linhas: document.querySelectorAll('.q-linha-da-fala').length,
    }))
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await cdp.send('HeapProfiler.collectGarbage')
    const { metrics } = await cdp.send('Performance.getMetrics')
    const heap = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? null
    return {
      injetarMs: r1(injetarMs),
      umaFalaMs: r1(mediana(umaFala)),
      arvoreMs,
      topoMs: r1(topoMs),
      voltaMs: r1(voltaMs),
      ...contagem,
      heapMb: heap === null ? null : r1(heap / 1048576),
    }
  } finally {
    await ctx.close()
  }
}

const servidores = []
for (const [i, raiz] of raizes.entries())
  servidores.push({ raiz, ...(await subirProducao({ raiz, porta: 3290 + i, pasta: path.join(pasta, `s${i}`) })) })

const navegador = await chromium.launch()
const brutos = {}
try {
  for (const n of quantidades)
    for (let e = 0; e < execucoes; e++)
      for (const s of servidores) {
        const m = await medirUma(navegador, s.base, n)
        console.log(`${path.basename(s.raiz)} n=${n} r${e} ${JSON.stringify(m)}`)
        ;((brutos[s.raiz] ??= {})[n] ??= []).push(m)
      }
} finally {
  await navegador.close()
  for (const s of servidores) s.parar()
}

const CAMPOS = ['injetarMs', 'umaFalaMs', 'arvoreMs', 'topoMs', 'voltaMs', 'nos', 'linhas', 'heapMb']
const medianas = {}
for (const [raiz, porN] of Object.entries(brutos))
  for (const [n, ms] of Object.entries(porN))
    (medianas[raiz] ??= {})[n] = Object.fromEntries(CAMPOS.map((c) => [c, r1(mediana(ms.map((m) => m[c])))]))

console.log(`\nCPU ${cpu}×, ${perfil}, ${execucoes} execuções (medianas)\n`)
console.log(`| falas | ${CAMPOS.join(' | ')} |`)
console.log(`|---|${CAMPOS.map(() => '---').join('|')}|`)
const [a, b] = raizes
for (const n of quantidades) {
  const ma = medianas[a]?.[n]
  const mb = b ? medianas[b]?.[n] : null
  console.log(`| ${n} | ${CAMPOS.map((c) => (mb ? celula(ma?.[c], mb?.[c]) : ma?.[c])).join(' | ')} |`)
}
if (saida) {
  mkdirSync(path.dirname(path.resolve(saida)), { recursive: true })
  writeFileSync(saida, JSON.stringify({ cpu, perfil, execucoes, raizes, medianas, brutos }, null, 2))
}
process.exit(0)
