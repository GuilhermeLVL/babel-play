#!/usr/bin/env node
/* global localStorage, window, document, crossOriginIsolated, navigator, caches -- código que roda DENTRO da página (page.evaluate / addInitScript) */
/**
 * MEDE A LATÊNCIA DA LEGENDA na edição estática, no navegador de verdade (auditoria 2026-09-26).
 *
 *   node scripts/perf/latencia-legenda/medir.mjs --rotulo NOME --audio <roteiro.json>
 *        [--modo mic|sistema] [--eu pt-BR|en-US|auto] [--eles en-US|pt-BR|auto]
 *        [--qualidade auto|fast|accurate] [--device auto|wasm|webgpu] [--sem-webgpu]
 *        [--canal chromium|chrome] [--headless] [--perfil DIR] [--url http://127.0.0.1:4176]
 *        [--saida DIR] [--espera-extra 10] [--dispositivo quest|pixel7|iphone14] [--dtype q8|hybrid]
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
 * `--dispositivo` emula o aparelho (`tests/e2e-estatica/_dispositivos.mjs`: viewport, UA, APIs ausentes,
 * CPU mais lenta pelo CDP). O aviso de download que o perfil do aparelho mostra antes do primeiro byte
 * é lido e aceito ("Baixar e iniciar"), e a MEMÓRIA é amostrada: `performance.memory.usedJSHeapSize`
 * (só a janela) a cada retrato e `performance.measureUserAgentSpecificMemory()` (janela + workers,
 * exige crossOriginIsolated) no fim.
 *
 * `--perfil DIR` reaproveita o perfil do navegador (Cache Storage com os modelos) → regime estável.
 * Sem ele, um perfil novo e vazio → PRIMEIRA CARGA (download + compilação dos modelos).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { aplicarCpu, DISPOSITIVOS, scriptDoAparelho } from '../../../tests/e2e-estatica/_dispositivos.mjs'

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
// O prettier fecha a expressão com `;`: tira, para caber em `(${sondaFn})(cfg)`.
const sondaFn = sondaSrc.slice(sondaSrc.indexOf('(cfg) =>')).trim().replace(/;\s*$/, '')
const cfg = { modo: MODO, semWebGpu: flag('sem-webgpu') }
const NOME_DO_APARELHO = opt('dispositivo', '')
const APARELHO = NOME_DO_APARELHO ? DISPOSITIVOS[NOME_DO_APARELHO] : null
if (NOME_DO_APARELHO && !APARELHO) throw new Error(`--dispositivo desconhecido: ${NOME_DO_APARELHO}`)

const log = (...a) => console.log(`[${ROTULO}]`, ...a)

/**
 * MEMÓRIA DO PROCESSO DA ABA (Windows): bytes privados do(s) processo(s) `--type=renderer` deste perfil
 * — a aba inteira, com os Web Workers do Whisper/opus-mt e os heaps do WASM, que o
 * `performance.memory` da janela não vê. `measureUserAgentSpecificMemory()` seria o ideal, mas
 * respondeu "not available" no Chromium headless desta máquina mesmo com `crossOriginIsolated`.
 */
function memoriaDoRenderer(perfilDir) {
  if (process.platform !== 'win32') return null
  // Só o NOME da pasta do perfil (o Chromium pode reescrever as barras do caminho): use um nome único.
  const alvo = path.basename(perfilDir).replace(/'/g, "''")
  // O processo do NAVEGADOR carrega o --user-data-dir; os renderers são filhos dele (o comando deles
  // não traz o perfil). Fica o MAIOR renderer: é o da aba (os outros são reservas quase vazias).
  const ps = `$ps = Get-CimInstance Win32_Process; $pais = $ps | Where-Object { $_.CommandLine -like '*${alvo}*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { $_.ProcessId }; $ps | Where-Object { $pais -contains $_.ParentProcessId -and $_.CommandLine -like '*--type=renderer*' } | ForEach-Object { $_.PrivatePageCount } | Measure-Object -Maximum | ForEach-Object { $_.Maximum }`
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 20_000 })
  const bytes = Number(String(r.stdout).trim())
  return Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes / 1048576) : null
}

const ctx = await chromium.launchPersistentContext(PERFIL, {
  headless: HEADLESS,
  ...(CANAL === 'chrome' ? { channel: 'chrome' } : {}),
  viewport: { width: 1280, height: 860 },
  ...(APARELHO ? APARELHO.contexto : {}),
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
if (APARELHO) {
  await page.addInitScript({ content: scriptDoAparelho(APARELHO.sinais) })
  await aplicarCpu(page, APARELHO.cpu)
}
await page.addInitScript(
  ({ q, d, dt }) => {
    try {
      localStorage.setItem('babel_tour_blitz', '1')
      localStorage.setItem('babel.sttQuality', q)
      if (d === 'auto') localStorage.removeItem('babel.whisperDevice')
      else localStorage.setItem('babel.whisperDevice', d)
      if (dt) localStorage.setItem('babel.whisperDtype', dt)
      else localStorage.removeItem('babel.whisperDtype')
    } catch {}
  },
  { q: QUALIDADE, d: DEVICE, dt: opt('dtype', '') },
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
const soMicrofone =
  MODO === 'mic' &&
  (await page
    .getByRole('dialog', { name: /Idiomas da sessão/ })
    .locator('button.campo-idioma', { hasText: 'Falo em' })
    .count()) > 0
if (soMicrofone) {
  // cenário só microfone (aparelho sem getDisplayMedia): [Falo em] [Traduzir para]
  await escolher('Falo em', EU)
  await escolher('Traduzir para', ELES)
} else if (MODO === 'mic') {
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
// Aparelho com aviso de download (Quest/celular, perfil novo): lê o tamanho anunciado e aceita.
let avisoDeDownload = null
{
  const aviso = page.getByTestId('aviso-de-download')
  if (await aviso.isVisible({ timeout: 4000 }).catch(() => false)) {
    avisoDeDownload = ((await aviso.textContent()) ?? '').trim()
    log('aviso de download:', avisoDeDownload)
    await page.getByRole('button', { name: 'Baixar e iniciar' }).click()
  }
}
const perfilDoAparelho = await page
  .evaluate(() => ({
    tipo: document.documentElement.dataset.dispositivo,
    modoLeve: document.documentElement.dataset.modoLeve,
  }))
  .catch(() => null)
log('captura iniciada; áudio de', roteiro.duracaoS, 's | aparelho:', JSON.stringify(perfilDoAparelho))

// Espera o áudio inteiro + folga; na primeira carga, espera também a fila guardada esvaziar.
// A cada 3 s tira um RETRATO do que a sonda viu: se a aba cair (o Whisper small no WebGPU chegou a
// derrubar a aba na primeira carga), o último retrato é gravado com o motivo.
const coletar = () =>
  page.evaluate(() => ({
    lat: window.__lat,
    cap: window.__capMetrics?.() ?? [],
    capSummary: window.__capSummary?.() ?? null,
    coi: crossOriginIsolated,
    heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    ua: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    agoraPerf: performance.now(),
  }))
let dados = null
let queda = null
/** Pico do heap JS da JANELA (os workers do Whisper/opus-mt ficam de fora — ver `memoriaFinal`). */
let picoHeapMb = 0
/** Pico dos bytes privados do processo da aba (janela + workers + WASM), amostrado a cada ~9 s. */
let picoRendererMb = 0
let retratos = 0
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
    picoHeapMb = Math.max(picoHeapMb, dados.heapMb ?? 0)
    if (retratos++ % 3 === 0) picoRendererMb = Math.max(picoRendererMb, memoriaDoRenderer(PERFIL) ?? 0)
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
// Memória da aba INTEIRA (janela + workers) com os modelos carregados. Pode levar segundos (a API
// espera um GC); com prazo, e só com isolamento (é exigência da API).
const memoriaFinal = queda
  ? null
  : await page
      .evaluate(async () => {
        if (!crossOriginIsolated || !performance.measureUserAgentSpecificMemory) return { erro: 'API indisponível' }
        const prazo = new Promise((r) => setTimeout(() => r({ erro: 'sem resposta em 60 s' }), 60_000))
        const m = await Promise.race([performance.measureUserAgentSpecificMemory(), prazo])
        if (!m || m.erro) return m
        const porTipo = {}
        for (const b of m.breakdown) {
          const tipo = b.types.join('+') || 'outros'
          porTipo[tipo] = (porTipo[tipo] ?? 0) + b.bytes
        }
        return {
          totalMb: Math.round(m.bytes / 1048576),
          porTipoMb: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [k, Math.round(v / 1048576)])),
        }
      })
      .catch((e) => ({ erro: String(e).slice(0, 200) }))
const rendererNoFimMb = queda ? null : memoriaDoRenderer(PERFIL)
picoRendererMb = Math.max(picoRendererMb, rendererNoFimMb ?? 0)
log(
  'memória: pico do heap da janela',
  picoHeapMb,
  'MB | processo da aba: pico',
  picoRendererMb,
  'MB, no fim',
  rendererNoFimMb,
  'MB | measureUserAgentSpecificMemory',
  JSON.stringify(memoriaFinal),
)
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
        dispositivo: NOME_DO_APARELHO || null,
      },
      perfilDoAparelho,
      avisoDeDownload,
      memoria: {
        picoHeapJanelaMb: picoHeapMb,
        picoProcessoDaAbaMb: picoRendererMb || null,
        processoDaAbaNoFimMb: rendererNoFimMb,
        abaInteiraNoFim: memoriaFinal,
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
