#!/usr/bin/env node
/* global localStorage, window, crossOriginIsolated, navigator, caches -- código que roda DENTRO da página (page.evaluate / addInitScript) */
/**
 * MEDE A LATÊNCIA DA LEGENDA na edição estática, no navegador de verdade (auditoria 2026-09-26).
 *
 *   node scripts/perf/latencia-legenda/medir.mjs --rotulo NOME --audio <roteiro.json>
 *        [--modo mic|sistema] [--eu pt-BR|en-US|auto] [--eles en-US|pt-BR|auto]
 *        [--qualidade auto|fast|accurate] [--device auto|wasm|webgpu] [--sem-webgpu]
 *        [--canal chromium|chrome] [--headless] [--perfil DIR] [--url http://127.0.0.1:4176]
 *        [--saida DIR] [--espera-extra 10]
 *
 * Pré-requisitos: `npm run build:estatica` e o servidor estático de pé
 * (`node tests/e2e-estatica/_servidor-estatico.mjs 4176` — COOP/COEP como o Pages), e o áudio
 * montado por `montar-audio.mjs` (o WAV fica ao lado do roteiro JSON).
 *
 * O que faz: abre o Chromium com microfone FALSO tocando o WAV (`--use-file-for-fake-audio-capture`),
 * injeta `sonda.js`, configura a tela Capturar PELA INTERFACE (idiomas, motor do microfone, mudo) e
 * clica em "Iniciar captura". Espera o áudio inteiro passar (+ folga) e grava tudo que a sonda viu,
 * mais `window.__capMetrics()` (as métricas que o próprio app já mede), num JSON em `--saida`.
 * A análise é de `analisar.mjs`.
 *
 * `--perfil DIR` reaproveita o perfil do navegador (Cache Storage com os modelos) → regime estável.
 * Sem ele, um perfil novo e vazio → PRIMEIRA CARGA (download + compilação dos modelos).
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] !== undefined ? args[i + 1] : d
}
const flag = (n) => args.includes(`--${n}`)

const ROTULO = opt('rotulo', 'rodada')
const ROTEIRO = opt('audio')
if (!ROTEIRO) throw new Error('--audio <roteiro.json> é obrigatório')
const roteiro = JSON.parse(readFileSync(ROTEIRO, 'utf8'))
const WAV = ROTEIRO.replace(/\.json$/, '.wav')
const MODO = opt('modo', 'mic')
const EU = opt('eu', 'pt-BR')
const ELES = opt('eles', 'en-US')
const QUALIDADE = opt('qualidade', 'auto')
const DEVICE = opt('device', 'auto')
const CANAL = opt('canal', 'chromium')
const HEADLESS = flag('headless')
const URL_BASE = opt('url', 'http://127.0.0.1:4176')
const SAIDA = opt('saida', path.join(os.tmpdir(), 'latencia-legenda', 'rodadas'))
const PERFIL = opt('perfil', '') || mkdtempSync(path.join(os.tmpdir(), 'lat-perfil-frio-'))
const ESPERA_EXTRA = Number(opt('espera-extra', 12))
const TETO_PRIMEIRA_CARGA_S = Number(opt('teto', 600))

const sondaSrc = readFileSync(path.join(AQUI, 'sonda.js'), 'utf8')
const sondaFn = sondaSrc.slice(sondaSrc.indexOf('(cfg) =>'))
const cfg = { modo: MODO, semWebGpu: flag('sem-webgpu') }

const log = (...a) => console.log(`[${ROTULO}]`, ...a)

const ctx = await chromium.launchPersistentContext(PERFIL, {
  headless: HEADLESS,
  ...(CANAL === 'chrome' ? { channel: 'chrome' } : {}),
  viewport: { width: 1280, height: 860 },
  permissions: ['microphone'],
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${WAV}%noloop`,
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-webgpu',
  ],
})
const page = ctx.pages()[0] ?? (await ctx.newPage())
const rede = []
page.on('request', (r) => {
  const u = r.url()
  if (/huggingface|hf\.co|cdn-lfs|xethub/.test(u)) rede.push({ t: Date.now(), u: u.slice(0, 200) })
})
const erros = []
page.on('pageerror', (e) => erros.push(String(e).slice(0, 300)))
page.on('console', (m) => {
  if (m.type() === 'error' || /cache|Unable/i.test(m.text())) erros.push(m.type() + ': ' + m.text().slice(0, 300))
})

await page.addInitScript({ content: `(${sondaFn})(${JSON.stringify(cfg)})` })
await page.addInitScript(
  ({ q, d }) => {
    try {
      localStorage.setItem('babel_tour_blitz', '1')
      localStorage.setItem('babel.sttQuality', q)
      if (d === 'auto') localStorage.removeItem('babel.whisperDevice')
      else localStorage.setItem('babel.whisperDevice', d)
    } catch {}
  },
  { q: QUALIDADE, d: DEVICE },
)

const tAbrir = Date.now()
await page.goto(`${URL_BASE}/capturar`)
await page.getByRole('heading', { name: 'Capturar', level: 1 }).waitFor({ timeout: 30_000 })
const pular = page.getByRole('button', { name: 'Pular apresentação' })
if (await pular.isVisible().catch(() => false)) await pular.click()
await page.waitForTimeout(800)

// ---- motor do microfone (só no modo mic): "Local (offline)" = VAD + Whisper/Moonshine no navegador
if (MODO === 'mic') {
  await page.getByRole('button', { name: 'Ajustes da captura' }).click()
  await page.getByRole('radio', { name: 'Local (offline)' }).click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const mudo = page.getByRole('switch', { name: 'Microfone mudo' })
  if (await mudo.isVisible().catch(() => false)) await mudo.click()
  await page.waitForTimeout(300)
} else {
  // O estado do microfone fica salvo no perfil: no modo sistema ele precisa estar MUDO (cenário mídia).
  const ativo = page.getByRole('switch', { name: 'Microfone ativo' })
  if (await ativo.isVisible().catch(() => false)) await ativo.click()
  await page.waitForTimeout(300)
}

// ---- "Modo desempenho" (Ajustes da captura): sem decodes PARCIAIS. Fica salvo no perfil, então é
// sempre posto no estado pedido (`--desempenho on`; padrão off).
{
  const querido = opt('desempenho', 'off') === 'on'
  await page.getByRole('button', { name: 'Ajustes da captura' }).click()
  const sw = page.getByRole('switch', { name: 'Modo desempenho' })
  await sw.waitFor({ timeout: 5000 }).catch(() => {})
  if (await sw.isVisible().catch(() => false)) {
    const atual = (await sw.getAttribute('aria-checked')) === 'true'
    if (atual !== querido) await sw.click()
  } else log('AVISO: interruptor "Modo desempenho" não encontrado')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// ---- idiomas pela caixa "Idiomas da sessão"
async function escolher(rotuloDoCampo, valor) {
  const dlg = page.getByRole('dialog', { name: /Idiomas da sessão/ })
  await dlg.locator('button.campo-idioma', { hasText: rotuloDoCampo }).click()
  const nome =
    valor === 'auto'
      ? 'Detectar automaticamente'
      : valor === 'pt-BR'
        ? 'Português (BR)'
        : valor === 'en-US'
          ? 'English (US)'
          : valor
  await dlg.getByRole('option', { name: nome, exact: false }).first().click()
  await page.waitForTimeout(200)
}
const chip = page
  .getByRole('region', { name: 'Espaço de gravação' })
  .getByRole('button', { name: /Detectar|Português|English/ })
await chip.first().click()
await page.getByRole('dialog', { name: /Idiomas da sessão/ }).waitFor()
if (MODO === 'mic') {
  // cenário conversa: [Eu falo] [Eles falam]
  await escolher('Eu falo', EU)
  await escolher('Eles falam', ELES)
} else {
  // cenário mídia: [Idioma do conteúdo] [Traduzir para]
  await escolher('Idioma do conteúdo', ELES)
  await escolher('Traduzir para', EU)
}
const resumo = await page
  .locator('.resumo-idioma')
  .textContent()
  .catch(() => '')
await page.getByRole('button', { name: 'Usar estes idiomas' }).click()
await page.waitForTimeout(500)
const chipTexto = await chip
  .first()
  .textContent()
  .catch(() => '')
const seloModelo = await page
  .getByRole('button', { name: /Modelo no dispositivo/ })
  .getAttribute('aria-label')
  .catch(() => '')
log('idiomas:', chipTexto, '|', resumo, '|', seloModelo)

// ---- grava
await page.evaluate(() => {
  window.__LAT_ARMADO = true
  window.__capReset?.()
})
const tIniciarPerf = await page.evaluate(() => performance.now())
await page.getByRole('button', { name: 'Iniciar captura' }).click()
log('captura iniciada; áudio de', roteiro.duracaoS, 's')

// Espera o áudio inteiro + folga; na primeira carga, espera também a fila guardada esvaziar.
// A cada 3 s tira um RETRATO do que a sonda viu: se a aba cair (o Whisper small no WebGPU chegou a
// derrubar a aba na primeira carga), o último retrato é gravado com o motivo.
const coletar = () =>
  page.evaluate(() => ({
    lat: window.__lat,
    cap: window.__capMetrics?.() ?? [],
    capSummary: window.__capSummary?.() ?? null,
    coi: crossOriginIsolated,
    ua: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    agoraPerf: performance.now(),
  }))
let dados = null
let queda = null
page.on('crash', () => {
  queda = queda ?? 'a aba travou (page crash) em ' + new Date().toISOString()
})
let fechando = false
page.on('close', () => {
  if (fechando) return
  queda = queda ?? 'a página fechou em ' + new Date().toISOString()
})
const fimAudioMs = roteiro.duracaoS * 1000 + ESPERA_EXTRA * 1000
const nFalas = roteiro.falas.length
const tClique = Date.now()
for (;;) {
  try {
    dados = await coletar()
  } catch (e) {
    queda = queda ?? String(e).slice(0, 200)
    break
  }
  const decorrido = Date.now() - tClique
  if (decorrido > fimAudioMs) {
    const ultimas = new Map()
    for (const r of dados.lat.dom) ultimas.set(r.i, r)
    const falas = [...ultimas.values()]
    const traduzidas = falas.filter((r) => !r.nova && r.tr && r.tr !== '…').length
    const baixando = dados.lat.ev.some((e) => e.k === 'w:prog' && e.t > dados.agoraPerf - 60_000)
    if (traduzidas >= nFalas * 0.8 || decorrido - fimAudioMs > TETO_PRIMEIRA_CARGA_S * 1000) break
    if (!baixando && decorrido - fimAudioMs > 20_000) break
  }
  await new Promise((r) => setTimeout(r, 3000))
}
if (queda) log('ATENÇÃO:', queda)

const gpuInfo = queda
  ? 'n/d'
  : await page
      .evaluate(async () => {
        try {
          const a = await navigator.gpu?.requestAdapter()
          return a
            ? `${a.info?.vendor ?? ''} ${a.info?.architecture ?? ''}`.trim() || 'adaptador sem info'
            : 'sem adaptador'
        } catch (e) {
          return 'erro: ' + String(e)
        }
      })
      .catch(() => 'n/d')
const bytes = rede.length
// O que ficou no Cache Storage (o transformers.js guarda os pesos em `transformers-cache`).
const cacheStorage = queda
  ? { erro: 'aba caiu' }
  : await page
      .evaluate(async () => {
        const out = {}
        for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length
        return { caches: out, uso: (await navigator.storage.estimate()).usage }
      })
      .catch((e) => ({ erro: String(e) }))
fechando = true
await ctx.close().catch(() => {})

mkdirSync(SAIDA, { recursive: true })
const arq = path.join(SAIDA, `${ROTULO}.json`)
writeFileSync(
  arq,
  JSON.stringify(
    {
      rotulo: ROTULO,
      quando: new Date().toISOString(),
      config: {
        desempenho: opt('desempenho', 'off'),
        modo: MODO,
        eu: EU,
        eles: ELES,
        qualidade: QUALIDADE,
        device: DEVICE,
        canal: CANAL,
        headless: HEADLESS,
        semWebGpu: cfg.semWebGpu,
        perfil: opt('perfil', '') ? 'reaproveitado' : 'novo',
      },
      ui: { chipTexto, resumo, seloModelo },
      roteiro,
      tIniciarPerf,
      tAbrirEpoch: tAbrir,
      gpuInfo,
      pedidosAoHub: bytes,
      queda,
      cacheStorage,
      erros: erros.slice(0, 40),
      ...dados,
    },
    null,
    0,
  ),
)
log(
  'gravado',
  arq,
  '| eventos',
  dados.lat.ev.length,
  '| dom',
  dados.lat.dom.length,
  '| cap',
  dados.cap.length,
  '| erros',
  erros.length,
)
