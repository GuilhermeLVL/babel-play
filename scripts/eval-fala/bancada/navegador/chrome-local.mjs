/* global window, document -- dentro de page.evaluate */
/**
 * BANCADA DO RECONHECIMENTO LOCAL DO CHROME — `SpeechRecognition` com `processLocally: true`, a fala entrando por
 * `MediaStreamTrack` (`chrome-local.html`). Grava no MESMO formato do `rodar.mjs`, então o `pontuar.mjs` pontua.
 *
 * O áudio entra em TEMPO REAL (a faixa é um fluxo), então o fator de tempo real daqui mede o tempo até o último
 * resultado final dividido pela duração da fala (>= 1 por construção) e `latenciaAposFimMs` mede o atraso depois
 * que a fala acabou. Não é comparável 1 para 1 com a decodificação em lote do `rodar.mjs`.
 *
 * Uso:
 *   node scripts/eval-fala/bancada/navegador/chrome-local.mjs --sonda            # disponível? instala os pacotes
 *   node scripts/eval-fala/bancada/navegador/chrome-local.mjs --conjuntos fleurs_pt,fleurs_es,fleurs_en --limite 50
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

import { BANCADA_DIR, subirServidor } from './servidor.mjs'

const args = process.argv.slice(2)
const opt = (n, p) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] ? args[i + 1] : p
}
const flag = (n) => args.includes(`--${n}`)

const PORTA = Number(opt('porta', '4518'))
const RAIZ = path.join(BANCADA_DIR, 'navegador')
const PERFIL = path.join(RAIZ, 'perfil-chrome')
const RESULTADOS = path.join(RAIZ, 'resultados')
const LIMITE = Number(opt('limite', '50')) || 0
const LANG = { fleurs_pt: 'pt-BR', fleurs_es: 'es-ES', fleurs_en: 'en-US' }

const lerJsonl = (p) =>
  readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))

const servidor = await subirServidor(PORTA)
mkdirSync(PERFIL, { recursive: true })
const contexto = await chromium.launchPersistentContext(PERFIL, {
  channel: 'chrome',
  headless: false,
  viewport: { width: 640, height: 360 },
  permissions: ['microphone'],
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=660,420',
    '--window-position=20,20',
  ],
})
const versaoDoChrome = contexto.browser()?.version() ?? null
const pagina = contexto.pages()[0] ?? (await contexto.newPage())
const console_ = []
pagina.on('console', (m) => console_.push(`[${m.type()}] ${m.text().slice(0, 400)}`))
pagina.on('pageerror', (e) => console_.push(`[pageerror] ${String(e?.message || e).slice(0, 400)}`))
try {
  await pagina.goto(`http://127.0.0.1:${PORTA}/chrome-local.html`)
  await pagina.waitForFunction(() => !!window.cl)
  console.log('chrome', versaoDoChrome, JSON.stringify(await pagina.evaluate(() => window.cl.info())))
  const langs = [
    ...new Set(
      opt('conjuntos', 'fleurs_pt,fleurs_es,fleurs_en')
        .split(',')
        .map((c) => LANG[c.trim()]),
    ),
  ]
  const instalacao = {}
  for (const l of langs) {
    const antes = await pagina.evaluate((x) => window.cl.disponivel(x), l).catch((e) => `erro: ${e.message}`)
    let inst = null
    if (antes !== 'available') {
      // install() pode exigir gesto do usuário: tenta sem e, se falhar, com um clique real no corpo da página.
      inst = await pagina
        .evaluate((x) => window.cl.instalar(x, 600000), l)
        .catch((e) => ({ ok: false, erro: e.message }))
      if (!inst.ok) {
        await pagina.mouse.click(100, 100)
        inst = await Promise.race([
          pagina.evaluate((x) => {
            document.body.addEventListener('click', () => {}, { once: true })
            return window.cl.instalar(x, 600000)
          }, l),
        ]).catch((e) => ({ ok: false, erro: e.message }))
      }
    }
    const depois = await pagina.evaluate((x) => window.cl.disponivel(x), l).catch((e) => `erro: ${e.message}`)
    instalacao[l] = { antes, instalacao: inst, depois }
    console.log(l, JSON.stringify(instalacao[l]))
  }
  if (!flag('sonda')) {
    for (const conj of opt('conjuntos', 'fleurs_pt,fleurs_es,fleurs_en')
      .split(',')
      .map((c) => c.trim())) {
      let itens = lerJsonl(path.join(RAIZ, 'stt', `${conj}.jsonl`))
      // as 50 falas: as primeiras 50 do manifesto (as mesmas do `--limite` do rodar.mjs)
      if (LIMITE) itens = itens.slice(0, LIMITE)
      if (instalacao[LANG[conj]]?.depois !== 'available') {
        console.log(`${conj}: pacote ${LANG[conj]} não ficou disponível (${instalacao[LANG[conj]]?.depois}); pulando`)
        continue
      }
      const casos = {}
      for (let i = 0; i < itens.length; i++) {
        const it = itens[i]
        const r = await pagina
          .evaluate(
            ([u, l, p, m]) => window.cl.reconhecer(u, l, p, m),
            [`/dados/${it.arquivo}`, LANG[conj], it.duracaoS * 1000 + 40000, opt('modo', 'buffer')],
          )
          .catch((e) => ({ ok: false, erro: String(e.message).slice(0, 300) }))
        casos[it.id] = r
        process.stdout.write(`\r   ${conj}: ${i + 1}/${itens.length} ${r.ok ? '' : '!' + r.erro}   `)
      }
      const feitos = itens.filter((x) => casos[x.id]?.ok)
      console.log(`\r   ${conj}: ${feitos.length}/${itens.length} ok`)
      mkdirSync(RESULTADOS, { recursive: true })
      writeFileSync(
        path.join(RESULTADOS, `chrome-local_${LANG[conj]}__${conj}.json`),
        JSON.stringify(
          {
            geradoEm: new Date().toISOString(),
            sistema: `chrome-local_${LANG[conj]}`,
            conjunto: conj,
            versaoDoChrome,
            instalacao,
            console: console_.slice(-30),
            casos,
          },
          null,
          1,
        ),
      )
    }
  }
} finally {
  await contexto.close().catch(() => {})
  servidor.closeAllConnections?.()
  await new Promise((s) => servidor.close(s))
}
process.exit(0)
