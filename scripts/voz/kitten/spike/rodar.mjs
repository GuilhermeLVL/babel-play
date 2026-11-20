#!/usr/bin/env node
/**
 * Roda o spike num navegador do Playwright e grava os WAV. Uso:
 *   node scripts/voz/kitten/spike/rodar.mjs <casos.json> <pasta-de-saida> [chromium|chromium-headed|webkit]
 * casos.json: [{ "nome", "variante", "idioma", "voz", "ep": "webgpu"|"wasm", "threads", "fonemas"? , "texto"? }]
 * O servidor (`servidor.mjs`) precisa estar de pé em SPIKE_URL (padrão http://localhost:5199).
 */
/* global window -- o código dentro de page.evaluate roda no navegador */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

import { chromium, webkit } from 'playwright'

const [casosArq, saida, navegador = 'chromium'] = process.argv.slice(2)
const casos = JSON.parse(readFileSync(casosArq, 'utf8'))
mkdirSync(saida, { recursive: true })

function wav(pcm, taxa) {
  const n = pcm.length
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + n * 2, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(taxa, 24)
  b.writeUInt32LE(taxa * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2)
  return b
}

const tipo = navegador === 'webkit' ? webkit : chromium
const b = await tipo.launch({
  headless: navegador !== 'chromium-headed',
  args: navegador.startsWith('chromium') ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan'] : [],
})
/* Memória: soma do RSS dos processos do navegador do Playwright (o heap do WASM não aparece no `performance.memory`). */
const rssMb = () =>
  Math.round(
    execSync('ps -axo rss=,command=', { encoding: 'utf8' })
      .split('\n')
      .filter((l) => /ms-playwright/.test(l))
      .reduce((s, l) => s + Number(l.trim().split(/\s+/)[0] || 0), 0) / 1024,
  )
/* Uma página nova por (variante, ep, threads): o ORT fixa as threads do WASM na 1ª sessão. */
let p = null
let grupo = ''
let webgpu = false
async function abrir() {
  await p?.close()
  p = await b.newPage()
  p.on('console', (m) => m.type() === 'error' && console.error('[navegador]', m.text()))
  await p.goto(process.env.SPIKE_URL ?? 'http://localhost:5199/')
  await p.waitForFunction(() => window.spikePronto === true, null, { timeout: 60_000 })
  webgpu = await p.evaluate(() => window.spike.temWebGpu())
}
const resultados = []
for (const c of casos) {
  const g = `${c.variante}|${c.ep}|${c.threads}`
  if (g !== grupo) {
    grupo = g
    await abrir()
    console.log(JSON.stringify({ navegador, grupo: g, webgpu, rssMbAntes: rssMb() }))
  }
  if (c.ep === 'webgpu' && !webgpu) {
    console.log(JSON.stringify({ nome: c.nome, pulado: 'sem WebGPU' }))
    continue
  }
  try {
    const r = await p.evaluate((c) => window.spike.sintetizar(c), c)
    writeFileSync(join(saida, `${c.nome}.wav`), wav(r.pcm, 24000))
    const { pcm: _pcm, fonemas: _f, ...resto } = r
    const linha = { ...resto, rssMb: rssMb() }
    resultados.push({ ...c, ...linha, navegador })
    console.log(JSON.stringify({ nome: c.nome, ...linha }))
  } catch (e) {
    console.log(JSON.stringify({ nome: c.nome, erro: String(e).slice(0, 300) }))
  }
}
writeFileSync(join(saida, `resultados-${navegador}.json`), JSON.stringify(resultados, null, 2))
await b.close()
