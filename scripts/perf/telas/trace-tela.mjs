#!/usr/bin/env node
/**
 * TRACE DE UMA TELA PARADA OU DE UMA INTERAÇÃO — onde vai o tempo da thread principal
 * (auditoria de performance do frontend, 26/09/2026).
 *
 *   node scripts/perf/telas/trace-tela.mjs --rota=/ [--cpu=4] [--segundos=4] [--raiz=<pasta>]
 *        [--clicar=<nome do botão>] [--jogo=<nome do jogo>] [--saida=<trace.json>] [--pasta=<trabalho>]
 *
 * Sobe o servidor de produção (`_servidores.mjs`), abre a rota num celular médio com a CPU
 * estrangulada, espera assentar e grava um trace do Chrome (`chromium.startTracing`, as mesmas
 * categorias do painel Performance do DevTools) por `--segundos` — com a tela PARADA (o custo das
 * animações contínuas: partículas, CSS infinito) ou em volta de um clique (`--clicar`).
 *
 * Resume o trace da thread principal do renderizador: tempo por tipo de evento de NÍVEL DE TOPO
 * das tarefas (`RunTask` → filhos diretos: `FireAnimationFrame`, `Paint`, `UpdateLayoutTree`,
 * `Layout`, `EventDispatch`, `FunctionCall`...), em ms por segundo de relógio, e as tarefas longas.
 * O arquivo bruto abre no DevTools (Performance → Load profile).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { chromium } from 'playwright'

import { executadoDireto, resumirTrace } from './_medidas.mjs'
import { RAIZ, subirProducao } from './_servidores.mjs'

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const rota = arg('rota', '/')
const cpu = Number(arg('cpu', 4))
const segundos = Number(arg('segundos', 4))
const clicar = arg('clicar', null)
const jogo = arg('jogo', null)
const raiz = path.resolve(arg('raiz', RAIZ))
/* `--pasta`: a mesma de `medir-telas.mjs` reaproveita o banco e o visitante que volta
   (`estado-producao.json`, com as celebrações da primeira visita já fechadas). */
const pasta = path.resolve(arg('pasta', path.join(os.tmpdir(), 'trace-tela')))
const estadoSalvo = path.join(pasta, 'estado-producao.json')
const saida = path.resolve(arg('saida', path.join(pasta, `trace-${Date.now()}.json`)))

if (executadoDireto(import.meta.url)) {
  const { base, parar } = await subirProducao({ raiz, porta: Number(arg('porta', 3192)), pasta })
  const navegador = await chromium.launch()
  const ctx = await navegador.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    ...(existsSync(estadoSalvo) ? { storageState: estadoSalvo } : {}),
  })
  const p = await ctx.newPage()
  // Visitante que volta: celebrações da primeira visita fechadas antes de medir.
  await p.goto(base + '/', { waitUntil: 'networkidle' })
  for (let i = 0; i < 20 && (await p.locator('dialog[open]').count()); i++) {
    const r = p.locator('dialog[open]').getByRole('button', { name: /Resgatar|continuar|Fechar|Entendi/i })
    if (await r.count()) await r.first().click().catch(() => {})
    else await p.keyboard.press('Escape')
    await p.waitForTimeout(400)
  }
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  await p.goto(base + rota, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  // A escolha de material do Jogar (camada z-45) abre sozinha para quem ainda não escolheu: fecha.
  for (let i = 0; i < 5 && (await p.locator('div[class~="z-[45]"]').count()); i++) {
    await p.keyboard.press('Escape')
    await p.waitForTimeout(400)
  }
  if (jogo) {
    await p.getByRole('button', { name: `Jogar: ${jogo}`, exact: true }).first().click()
    await p.waitForTimeout(1500)
    const pular = p.getByRole('button', { name: 'Pular a explicação' })
    if (await pular.count()) await pular.first().click().catch(() => {})
    await p.waitForTimeout(800)
  }
  await navegador.startTracing(p, { path: saida, screenshots: false })
  if (clicar) {
    await p.waitForTimeout(300)
    await p.getByRole('button', { name: clicar }).or(p.getByRole('tab', { name: clicar })).first().click()
  }
  await p.waitForTimeout(segundos * 1000)
  await navegador.stopTracing()
  await navegador.close()
  parar()
  const bruto = JSON.parse(readFileSync(saida, 'utf8'))
  const r = resumirTrace(bruto.traceEvents ?? bruto)
  console.log(JSON.stringify({ rota, cpu, clicar, jogo, trace: saida, ...r }, null, 1))
  writeFileSync(saida.replace(/\.json$/, '.resumo.json'), JSON.stringify(r, null, 1))
  process.exit(0)
}
