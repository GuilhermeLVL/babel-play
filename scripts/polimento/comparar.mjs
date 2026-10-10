/**
 * COMPARA UMA TELA DO APP COM A MESMA TELA DO PROTÓTIPO (`docs/prototipos/polimento-movimento.html`).
 *
 *     node scripts/polimento/comparar.mjs scripts/polimento/roteiros/<tela>.json [--so app|proto]
 *
 * As duas páginas abrem na MÁQUINA DO DONO SIMULADA: "reduzir movimento" pedido ao sistema e
 * armazenamento vazio. Foi assim que a camada inteira sumia sem ninguém ver (08/10/2026): no navegador
 * de teste tudo estava ligado, no dele não.
 *
 * O roteiro (JSON):
 *   { "nome": "inicio", "largura": 1280, "altura": 960,
 *     "app":   { "caminho": "/", "guardar": { "chave": "valor" }, "passos": [ ...passos ] },
 *     "proto": { "busca": "?jogo=tenis", "passos": [ ...passos ] },
 *     "seletores": [".q-cab h1", { "app": ".a", "proto": ".b", "nome": "titulo" }],
 *     "props": ["fontSize"],            // além das de sempre (ver PROPS)
 *     "escuro": true,                 // tema escuro (o padrão é o claro)
 *     "prototipo": "anuncios-no-gratis", // outro protótipo de docs/prototipos (o padrão é polimento-movimento)
 *     "midiaFalsa": true,             // microfone e tela falsos do Chromium: a captura do app começa de verdade
 *     "gravar": { "app": [ ...passos ], "proto": [ ...passos ], "espera": 900 } }
 *   passo: { "clicar": "seletor" } | { "texto": "rótulo visível" } | { "esperar": ms }
 *        | { "js": "expressão" } | { "tecla": "Escape" } | { "rolar": "seletor" }
 *
 * Saída: duas capturas e um JSON em `test-results/comparar/<nome>/`, e na tela só o que DIFERE: caixa
 * (largura × altura, tolerância de 1 px), estilos computados e as animações disparadas em `gravar`
 * (duração, atraso, curva, quadros). Sai com código 1 se houver diferença.
 *
 * Variáveis de ambiente: `APP_URL` (o app; padrão http://localhost:3177) e `PROTOTIPOS_DIR` (a pasta
 * dos protótipos montados, quando eles não estão em `docs/prototipos` desta árvore).
 */
/* As funções passadas a `page.evaluate`/`addInitScript` rodam no navegador. */
/* global window, document, Element, getComputedStyle, sessionStorage, localStorage */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from 'playwright'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APP = process.env.APP_URL || 'http://localhost:3177'

const PROPS = [
  'display',
  'position',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'color',
  'backgroundColor',
  'backgroundImage',
  'borderTopWidth',
  'borderTopColor',
  'borderTopLeftRadius',
  'boxShadow',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'gap',
  'opacity',
  'transform',
  'backdropFilter',
  'transitionDuration',
  'transitionTimingFunction',
  'animationName',
  'animationDuration',
]

const [, , arquivo, ...resto] = process.argv
if (!arquivo) {
  console.error('uso: node scripts/polimento/comparar.mjs <roteiro.json> [--so app|proto]')
  process.exit(2)
}
const so = resto.includes('--so') ? resto[resto.indexOf('--so') + 1] : null
const roteiro = JSON.parse(readFileSync(arquivo, 'utf8'))
const PROTO = pathToFileURL(
  join(
    process.env.PROTOTIPOS_DIR || join(RAIZ, 'docs/prototipos'),
    `${roteiro.prototipo || 'polimento-movimento'}.html`,
  ),
).href
const pasta = join(RAIZ, 'test-results/comparar', roteiro.nome)
mkdirSync(pasta, { recursive: true })

/** Grava cada `Element.animate` (quem, quadros, tempo, curva) para os dois lados serem comparados. */
const GRAVADOR = () => {
  window.__anim = []
  const original = Element.prototype.animate
  Element.prototype.animate = function (quadros, o) {
    const op = typeof o === 'number' ? { duration: o } : o || {}
    const quem =
      this.tagName.toLowerCase() +
      (typeof this.className === 'string' && this.className ? '.' + this.className.trim().split(/\s+/).join('.') : '')
    window.__anim.push({
      quem,
      d: op.duration ?? null,
      atraso: op.delay ?? 0,
      e: op.easing ?? 'linear',
      fill: op.fill ?? 'none',
      quadros: JSON.stringify(quadros),
    })
    return original.call(this, quadros, o)
  }
}

/** A interface em português, qualquer que seja o idioma gravado na conta (`?ui=`, `langConfig.ts`). */
const comPortugues = (url) => (/[?&]ui=/.test(url) ? url : url + (url.includes('?') ? '&' : '?') + 'ui=pt')

async function passo(page, p) {
  if (p.clicar) await page.locator(p.clicar).first().click({ timeout: 8000 })
  else if (p.texto) await page.getByText(p.texto, { exact: true }).first().click({ timeout: 8000 })
  else if (p.esperar) await page.waitForTimeout(p.esperar)
  else if (p.js) await page.evaluate(p.js)
  else if (p.tecla) await page.keyboard.press(p.tecla)
  else if (p.rolar) await page.locator(p.rolar).first().scrollIntoViewIfNeeded()
}

async function lado(browser, qual) {
  const r = roteiro[qual] || {}
  const contexto = await browser.newContext({
    viewport: { width: roteiro.largura ?? 1280, height: roteiro.altura ?? 960 },
    reducedMotion: 'reduce',
    hasTouch: !!roteiro.toque,
    isMobile: !!roteiro.toque,
  })
  await contexto.addInitScript(GRAVADOR)
  if (qual === 'app') {
    const guardar = { 'babel.desenhoNovo': 'sim', 'babel.liberado': '1', ...(r.guardar || {}) }
    await contexto.addInitScript((g) => {
      if (sessionStorage.getItem('__semeado')) return
      sessionStorage.setItem('__semeado', '1')
      for (const [k, v] of Object.entries(g)) localStorage.setItem(k, v)
    }, guardar)
  }
  if (qual === 'app') {
    /* A CONTA LOCAL é uma só, dividida com o dono e com os outros agentes: a prova não pode depender do
       que ficou gravado nela nem gravar nela. As configurações chegam sempre iguais (quem fala português
       e estuda inglês, tema do roteiro) e nenhuma escrita de configuração sai daqui. */
    await contexto.route('**/api/settings', async (rota) => {
      if (rota.request().method() !== 'GET')
        return rota.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      const resposta = await rota.fetch()
      const corpo = await resposta.json().catch(() => null)
      if (!corpo || typeof corpo.ui !== 'string') return rota.fulfill({ response: resposta })
      const ui = { ...JSON.parse(corpo.ui), darkMode: !!roteiro.escuro, captureSourceLang: 'pt-BR' }
      await rota.fulfill({ response: resposta, json: { ...corpo, targetLanguage: 'en', ui: JSON.stringify(ui) } })
    })
  }
  const page = await contexto.newPage()
  if (roteiro.midiaFalsa && qual === 'app') {
    await contexto.grantPermissions(['microphone'])
    /* Nenhum modelo de fala é baixado: as falas vêm da bancada da tela (`window.__simFalas`). */
    await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  }
  await page.goto(qual === 'app' ? comPortugues(APP + (r.caminho || '/')) : PROTO + (r.busca || ''), {
    waitUntil: 'load',
  })
  await page.bringToFront()
  await page.waitForTimeout(r.assentar ?? 2500)
  /* A conta local pode ter um aviso na fila ("Conquista feita"): ele engoliria o primeiro clique. */
  if (qual === 'app')
    for (let i = 0; i < 4 && (await page.locator('dialog[open]').count()); i++) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(350)
    }
  for (const p of r.passos || []) await passo(page, p)
  await page.waitForTimeout(r.depois ?? 1200)

  const pedidos = (roteiro.seletores || []).map((s) =>
    typeof s === 'string' ? { nome: s, sel: s } : { nome: s.nome || s[qual], sel: s[qual] },
  )
  const medidas = await page.evaluate(
    ({ pedidos, props }) => {
      const saida = {}
      for (const { nome, sel } of pedidos) {
        const lista = [...document.querySelectorAll(sel)]
        const el = lista[0]
        if (!el) {
          saida[nome] = null
          continue
        }
        const c = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        saida[nome] = {
          quantos: lista.length,
          caixa: [Math.round(c.width), Math.round(c.height)],
          texto: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          /* O Vite acrescenta uma fonte de reserva ("X Fallback") que o protótipo não tem: não é diferença. */
          estilo: Object.fromEntries(props.map((p) => [p, String(cs[p]).replace(/, "[^"]+ Fallback"/g, '')])),
        }
      }
      return saida
    },
    { pedidos, props: [...PROPS, ...(roteiro.props || [])] },
  )
  await page.screenshot({ path: join(pasta, `${qual}.png`) })

  let animacoes = []
  if (roteiro.gravar?.[qual]) {
    await page.evaluate(() => (window.__anim.length = 0))
    for (const p of roteiro.gravar[qual]) await passo(page, p)
    await page.waitForTimeout(roteiro.gravar.espera ?? 900)
    animacoes = await page.evaluate(() => window.__anim)
    await page.screenshot({ path: join(pasta, `${qual}-depois.png`) })
  }
  const marca = await page.evaluate(() => ({
    px: document.documentElement.dataset.px,
    corpo: document.body.className,
  }))
  await contexto.close()
  return { medidas, animacoes, marca }
}

/* `midiaFalsa`: a captura começa de verdade (o "Encerrar" e o "Pausar" só existem gravando), com o
   microfone e a tela falsos do Chromium, como nas suítes de navegador (`tests/e2e/fim-da-captura.e2e.ts`). */
const browser = await chromium.launch(
  roteiro.midiaFalsa
    ? {
        args: [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--auto-select-desktop-capture-source=Entire screen',
        ],
      }
    : {},
)
const resultado = {}
for (const qual of ['app', 'proto']) if (!so || so === qual) resultado[qual] = await lado(browser, qual)
await browser.close()
writeFileSync(join(pasta, 'resultado.json'), JSON.stringify(resultado, null, 2))

if (so) {
  console.log(JSON.stringify(resultado[so], null, 1))
  process.exit(0)
}

const difs = []
const { app, proto } = resultado
if (app.marca.px !== 'on')
  difs.push(`a camada está desligada no app (data-px=${app.marca.px}; body: ${app.marca.corpo})`)
for (const nome of Object.keys(proto.medidas)) {
  const a = app.medidas[nome]
  const p = proto.medidas[nome]
  if (!p) {
    difs.push(`${nome}: não existe no PROTÓTIPO (seletor errado?)`)
    continue
  }
  if (!a) {
    difs.push(`${nome}: falta no app`)
    continue
  }
  if (a.quantos !== p.quantos) difs.push(`${nome}: quantidade app ${a.quantos} × protótipo ${p.quantos}`)
  if (Math.abs(a.caixa[0] - p.caixa[0]) > 1 || Math.abs(a.caixa[1] - p.caixa[1]) > 1)
    difs.push(`${nome}: caixa app ${a.caixa.join('×')} × protótipo ${p.caixa.join('×')}`)
  for (const [prop, v] of Object.entries(p.estilo))
    if (a.estilo[prop] !== v) difs.push(`${nome}: ${prop} app "${a.estilo[prop]}" × protótipo "${v}"`)
}
const chave = (x) => `${x.d}|${x.atraso}|${x.e}|${x.fill}|${x.quadros}`
const doApp = app.animacoes.map(chave)
const doProto = proto.animacoes.map(chave)
for (const x of proto.animacoes)
  if (!doApp.includes(chave(x)))
    difs.push(`animação só no protótipo: ${x.quem} ${x.d} ms +${x.atraso} ${x.e} ${x.quadros.slice(0, 110)}`)
for (const x of app.animacoes)
  if (!doProto.includes(chave(x)))
    difs.push(`animação só no app: ${x.quem} ${x.d} ms +${x.atraso} ${x.e} ${x.quadros.slice(0, 110)}`)

console.log(
  `${roteiro.nome}: ${Object.keys(proto.medidas).length} peças, ${proto.animacoes.length} animações no protótipo`,
)
console.log(`capturas em ${pasta}`)
if (!difs.length) console.log('IGUAL')
else console.log(`${difs.length} diferenças:\n` + difs.map((d) => '  - ' + d).join('\n'))
process.exit(difs.length ? 1 : 0)
