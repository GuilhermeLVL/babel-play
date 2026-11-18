// "Conversa no jantar": dirige o Intérprete de produção (visitante, só leitura) com dois falantes
// alternados (pt e en) por um microfone falso controlado (getUserMedia → AudioContext), e mede cada turno:
// toque → microfone pronto → fim da fala → tradução na tela → voz começa → voz termina.
// CÓPIA ADAPTADA (conversa-de-verdade, 6.1) do roteiro da auditoria de 17/11/2026
// (`reports/auditoria-qualidade/conversa/jantar.mjs`): a mesma conversa e as mesmas medidas, com
//   - `base` (padrão produção; `http://localhost:3100` para o app local de `npm run dev:local`) e `falas` (a pasta dos WAV);
//   - o microfone "pronto" também com "Preparando N%" (o primeiro uso agora diz isso, e a pessoa fala logo);
//   - o microfone aberto/fechado lido do botão (`aria-pressed`), e não do texto "Ouvindo…";
//   - `tMicFechou`, `vozAntesDoMicFechar` e `ouvindoAntesDoPronto` por turno.
// Uso: node jantar.mjs '<json de opções>'
//   { "saida": "rodadas/x", "perfil": "<dir base ou vazio>", "celular": false, "ruido": false,
//     "semVozEn": false, "negarMic": false, "turnos": ["pt1","en1",...], "esperaMicMs": 90000 }
/* global window, document, navigator, localStorage, AudioContext, MediaStream, DOMException, atob, setInterval,
   getComputedStyle, speechSynthesis -- o que roda dentro da página (addInitScript, evaluate) */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
const require = createRequire(new URL('../../../package.json', import.meta.url).pathname)
const { chromium, devices } = require('playwright')

const AQUI = path.dirname(new URL(import.meta.url).pathname)
const O = JSON.parse(process.argv[2] || '{}')
const SAIDA = path.resolve(O.raiz || AQUI, O.saida || 'rodadas/teste')
const FALAS = O.falas || path.join(AQUI, 'falas')
const BASE = (O.base || 'https://frasy.com.br/app').replace(/\/$/, '')
const micAberto = (s, l) => (s?.[l]?.botao || '').split('|')[1] === 'true'
mkdirSync(SAIDA, { recursive: true })
const perfil = path.join(SAIDA, 'perfil')
if (O.perfil) cpSync(O.perfil, perfil, { recursive: true })
else mkdirSync(perfil, { recursive: true })
const turnos = O.turnos || ['pt1', 'en1', 'pt2', 'en2', 'pt3', 'en3']
let trocado = false
const ladoDe = (f) => (f.startsWith('pt') !== trocado ? 'meu' : 'outro')

const ctxOpts = {
  headless: false,
  permissions: O.negarMic ? [] : ['microphone'],
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
}
if (O.celular) Object.assign(ctxOpts, devices['Pixel 7'])
/* Outra tela de celular (ex.: 375×667, o iPhone SE), com o resto do Pixel 7 (toque, escala, user agent). */
if (O.celular && O.viewport) ctxOpts.viewport = O.viewport
else ctxOpts.viewport = { width: 1280, height: 800 }
const ctx = await chromium.launchPersistentContext(perfil, ctxOpts)
const page = ctx.pages()[0] ?? (await ctx.newPage())
const consoleLog = []
page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`.slice(0, 500)))
page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`))

await page.addInitScript(
  ({ semVozEn, negarMic }) => {
    const w = window
    const t0 = () => performance.now()
    // --- microfone falso controlado ---
    let ac = null
    let dest = null
    const garantir = () => {
      if (!ac) {
        ac = new AudioContext({ sampleRate: 48000 })
        dest = ac.createMediaStreamDestination()
        // um fio de ruído quase inaudível mantém a trilha viva
        const osc = ac.createConstantSource()
        const g = ac.createGain()
        g.gain.value = 0
        osc.connect(g).connect(dest)
        osc.start()
      }
      return { ac, dest }
    }
    w.__gum = []
    const md = navigator.mediaDevices
    if (md) {
      md.getUserMedia = async (c) => {
        w.__gum.push({ t: t0(), audio: !!(c && c.audio), video: !!(c && c.video) })
        if (negarMic) throw new DOMException('Permission denied', 'NotAllowedError')
        const { ac: a, dest: d } = garantir()
        if (a.state !== 'running') await a.resume()
        return new MediaStream(d.stream.getAudioTracks().map((tr) => tr.clone()))
      }
    }
    if (negarMic && navigator.permissions) {
      const q = navigator.permissions.query.bind(navigator.permissions)
      navigator.permissions.query = async (d) =>
        d && d.name === 'microphone'
          ? { state: 'denied', onchange: null, addEventListener() {}, removeEventListener() {} }
          : q(d)
    }
    w.__tocarFala = async (b64) => {
      const { ac: a, dest: d } = garantir()
      if (a.state !== 'running') await a.resume()
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const buf = await a.decodeAudioData(bin.buffer)
      const src = a.createBufferSource()
      src.buffer = buf
      src.connect(d)
      const ini = t0()
      src.start()
      await new Promise((r) => (src.onended = r))
      return { ini, fim: t0(), dur: buf.duration }
    }
    // --- voz: registra cada fala sem trocar o motor ---
    w.__tts = []
    if (w.speechSynthesis) {
      const proto = Object.getPrototypeOf(w.speechSynthesis)
      if (semVozEn) {
        const gv = proto.getVoices
        proto.getVoices = function () {
          return gv.call(this).filter((v) => !/^en/i.test(v.lang))
        }
      }
      const speak = proto.speak
      proto.speak = function (u) {
        const r = { t: t0(), texto: u.text, lang: u.lang, voz: u.voice ? `${u.voice.name}|${u.voice.lang}` : null }
        w.__tts.push(r)
        u.addEventListener('start', () => (r.ini = t0()))
        u.addEventListener('end', () => (r.fim = t0()))
        u.addEventListener('error', (e) => (r.erro = e.error))
        return speak.call(this, u)
      }
      const cancel = proto.cancel
      proto.cancel = function () {
        w.__tts.push({ t: t0(), cancel: true })
        return cancel.call(this)
      }
    }
    // --- gravador da tela: cada mudança nas metades ---
    w.__tela = []
    let ultimo = ''
    setInterval(() => {
      const raiz =
        [...document.querySelectorAll('[data-testid="modo-interprete"], [data-testid="conversa-pronta"]')].find(
          (e) => e.offsetParent !== null || e.getClientRects().length,
        ) || document
      const lado = (l) => {
        const s = raiz.querySelector(`[data-testid="interprete-${l}"]`)
        if (!s) return null
        const b = s.querySelector(`[data-testid="falar-${l}"]`)
        return {
          frase: (s.querySelector('.int-frase')?.innerText || '').trim(),
          status: (s.querySelector('.int-status')?.innerText || '').trim(),
          botao: b ? `${b.getAttribute('aria-label')}|${b.getAttribute('aria-pressed')}|${b.disabled}` : null,
        }
      }
      const dialogos = [...document.querySelectorAll('[role=dialog], dialog[open], [role=alertdialog]')]
        .filter((d) => d.getClientRects().length)
        .map((d) => d.innerText.trim().slice(0, 300))
      const toasts = [...document.querySelectorAll('[role=status], [role=alert]')]
        .map((d) => d.innerText.trim())
        .filter((x) => x && x.length < 300)
      const snap = {
        raiz: raiz === document ? 'doc' : raiz.getAttribute('data-testid'),
        meu: lado('meu'),
        outro: lado('outro'),
        aviso: (document.querySelector('[data-testid="aviso-do-interprete"]')?.innerText || '').trim(),
        dialogos,
        toasts,
      }
      const k = JSON.stringify(snap)
      if (k !== ultimo) {
        ultimo = k
        w.__tela.push({ t: t0(), ...snap })
      }
    }, 50)
  },
  { semVozEn: !!O.semVozEn, negarMic: !!O.negarMic },
)

const agora = () => page.evaluate(() => performance.now())
const foto = (n) => page.screenshot({ path: path.join(SAIDA, `${n}.png`) })
const clicar = async (testid) => {
  const loc = page.locator(`[data-testid="${testid}"]:visible`).first()
  const t = await agora()
  if (O.celular) await loc.tap()
  else await loc.click()
  return t
}
const estadoLado = (lado) =>
  page.evaluate((l) => {
    const r = window.__tela[window.__tela.length - 1]
    return r ? r[l] : null
  }, lado)

await page.goto(BASE || '/')
await page.evaluate(() => {
  const k = 'babel.efemero.settings'
  const s = JSON.parse(
    localStorage.getItem(k) || '{"id":"efemero","activeProfileId":null,"targetLanguage":null,"ui":null}',
  )
  const ui = s.ui ? JSON.parse(s.ui) : {}
  s.ui = JSON.stringify({ ...ui, uiLang: 'pt-BR' })
  localStorage.setItem(k, JSON.stringify(s))
  /* A conversa POR TOQUE (a da auditoria): no app local o plano tem o automático, que abriria nele. */
  localStorage.setItem('babel.interprete.modo', 'toque')
})
const tCarga0 = Date.now()
await page.goto(`${BASE}/interprete`)
await page.locator('[data-testid="falar-meu"]:visible').first().waitFor({ timeout: 30000 })
const cargaMs = Date.now() - tCarga0
await page.waitForTimeout(1500)
await foto('00-pronta')

const resultado = { opcoes: O, cargaAteBotaoMs: cargaMs, turnos: [], toquesExtras: [] }
let toques = 0

for (let i = 0; i < turnos.length; i++) {
  const fala = turnos[i]
  if (O.trocarAntes === i) {
    const b = page.getByRole('button', { name: 'Trocar os lados' }).locator('visible=true').first()
    const tT = await agora()
    if (O.celular) await b.tap()
    else await b.click()
    toques++
    trocado = true
    resultado.troca = { antesDoTurno: i, t: tT }
    await page.waitForTimeout(800)
    await foto(`troca-antes-turno${i}`)
  }
  const lado = ladoDe(fala)
  const outro = lado === 'meu' ? 'outro' : 'meu'
  const r = { i, fala, lado, toques: 0 }
  const fraseAntesOutro = (await estadoLado(outro))?.frase ?? ''
  r.tToque = await clicar(`falar-${lado}`)
  toques++
  r.toques++
  await page.waitForTimeout(400)
  if (i === 0) await foto(`01-apos-primeiro-toque`)
  // espera o microfone pronto: "Ouvindo…" (sem "Abrindo"), ou um diálogo
  const limite = Date.now() + (O.esperaMicMs || 90000)
  let pronto = false
  let dialogo = null
  while (Date.now() < limite) {
    const s = await page.evaluate(() => window.__tela[window.__tela.length - 1])
    const st = s?.[lado]?.status || ''
    if (/^(Ouvindo|Preparando)/.test(st) && micAberto(s, lado)) {
      pronto = true
      break
    }
    if (s?.dialogos?.length) {
      dialogo = s.dialogos
      const baixar = page.getByRole('button', { name: /Baixar e iniciar/ })
      /* O adulto do app local responde antes "Rápido ou Privado?": a auditoria (visitante) só viu o Privado. */
      const privado = page.getByRole('button', { name: /Privado/ }).first()
      if (/Como transcrever a sua voz/.test(s.dialogos.join(' ')) && (await privado.isVisible().catch(() => false))) {
        if ((await privado.getAttribute('aria-pressed')) !== 'true') {
          await privado.click()
          resultado.toquesExtras.push({ i, motivo: 'escolher o Privado (adulto no app local)' })
        }
      }
      if (!r.tBaixar && (await baixar.isVisible().catch(() => false))) {
        await foto(`turno${i}-dialogo-baixar`)
        /* O tamanho que o diálogo anuncia (CONV-11): o texto inteiro, sem o corte de 300 caracteres do gravador. */
        r.mbDoDialogo = (
          await page
            .locator('dialog[open]')
            .last()
            .innerText()
            .catch(() => '')
        ).match(/(\d+)\s*MB/g)
        r.tBaixar = await agora()
        if (O.celular) await baixar.tap()
        else await baixar.click()
        toques++
        r.toques++
        resultado.toquesExtras.push({ i, motivo: 'Baixar e iniciar' })
        r.fotosDoDownload = 0
      } else if (!r.fotoDialogo) {
        r.fotoDialogo = true
        await foto(`turno${i}-dialogo-outro`)
      }
    }
    if (r.tBaixar && r.fotosDoDownload < 12 && Date.now() % 15000 < 120) {
      await foto(`turno${i}-baixando-${r.fotosDoDownload++}`)
    }
    if (!/Abrindo|Ouvindo/.test(st) && Date.now() > limite - (O.esperaMicMs || 90000) + 8000 && !dialogo) {
      // nada aconteceu em 8 s
    }
    await page.waitForTimeout(100)
  }
  r.tMicPronto = await agora()
  r.micPronto = pronto
  r.dialogo = dialogo
  if (!pronto) {
    await foto(`turno${i}-sem-microfone`)
    r.falhou = 'microfone não ficou pronto'
    resultado.turnos.push(r)
    break
  }
  r.toqueAteMicMs = Math.round(r.tMicPronto - r.tToque)
  await page.waitForTimeout(300) // a pessoa vê "Ouvindo…" e começa a falar
  const wav = path.join(FALAS, `${fala}${O.ruido ? '.ruido' : ''}.wav`)
  const b64 = readFileSync(wav).toString('base64')
  const toc = await page.evaluate((b) => window.__tocarFala(b), b64)
  r.falaIni = toc.ini
  r.falaFim = toc.fim
  r.falaDurMs = Math.round(toc.dur * 1000)
  // espera: tradução aparecer no outro lado e a voz ler (ou não)
  const ttsAntes = await page.evaluate(() => window.__tts.length)
  let tradu = null
  let extra = false
  const lim2 = Date.now() + 25000
  while (Date.now() < lim2) {
    const s = await page.evaluate(() => window.__tela[window.__tela.length - 1])
    const fo = s?.[outro]?.frase || ''
    if (fo && fo !== fraseAntesOutro && !/^Toque em/.test(fo)) {
      tradu = { t: await agora(), texto: fo }
      // espera estabilizar (a tradução pode chegar em pedaços)
    }
    // microfone ainda aberto 6 s depois do fim da fala: a pessoa toca de novo ("terminei")
    if (!extra && micAberto(s, lado) && (await agora()) - r.falaFim > 6000) {
      extra = true
      r.tToqueExtra = await clicar(`falar-${lado}`)
      toques++
      r.toques++
      resultado.toquesExtras.push({ i, motivo: 'microfone não fechou sozinho 6 s depois da fala' })
    }
    const tts = await page.evaluate((n) => window.__tts.slice(n), ttsAntes)
    const lida = tts.find((x) => !x.cancel && x.fim)
    if (tradu && (lida || Date.now() > lim2 - 15000)) {
      if (lida) break
    }
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(600)
  const s = await page.evaluate(() => window.__tela[window.__tela.length - 1])
  r.fraseFinalOutro = s?.[outro]?.frase
  r.fraseFinalLado = s?.[lado]?.frase
  r.statusDepois = { [lado]: s?.[lado]?.status, [outro]: s?.[outro]?.status }
  // o primeiro instante em que a tradução apareceu no outro lado (do gravador da tela)
  const tela = await page.evaluate((t) => window.__tela.filter((x) => x.t >= t), r.tToque)
  const primeira = tela.find((x) => {
    const f = x[outro]?.frase || ''
    return f && f !== fraseAntesOutro && !/^Toque em/.test(f)
  })
  r.tTraducao = primeira?.t ?? null
  r.traducaoPrimeira = primeira?.[outro]?.frase ?? null
  const fechou = tela.find((x) => x.t > r.falaIni && !micAberto(x, lado))
  r.tMicFechou = fechou?.t ?? null
  r.statusAntesDoPronto = [
    ...new Set(
      tela
        .filter((x) => x.t < r.falaFim)
        .map((x) => x[lado]?.status)
        .filter(Boolean),
    ),
  ]
  const tts = await page.evaluate((n) => window.__tts.slice(n), ttsAntes)
  r.tts = tts
  const lida = tts.find((x) => !x.cancel)
  r.fimDaFalaAteTraducaoMs = r.tTraducao ? Math.round(r.tTraducao - r.falaFim) : null
  r.fimDaFalaAteVozMs = lida?.ini ? Math.round(lida.ini - r.falaFim) : null
  r.toqueAteVozTerminarMs = lida?.fim ? Math.round(lida.fim - r.tToque) : null
  r.vozDurMs = lida?.ini && lida?.fim ? Math.round(lida.fim - lida.ini) : null
  r.fimDaFalaAteMicFecharMs = r.tMicFechou ? Math.round(r.tMicFechou - r.falaFim) : null
  /* A voz começou com o microfone do turno ainda aberto (falou por cima de quem falava)? */
  r.vozAntesDoMicFechar = !!(lida?.ini && r.tMicFechou && lida.ini < r.tMicFechou)
  console.log(
    JSON.stringify({
      i,
      fala,
      toques: r.toques,
      mic: r.toqueAteMicMs,
      trad: r.fimDaFalaAteTraducaoMs,
      voz: r.fimDaFalaAteVozMs,
      txt: r.traducaoPrimeira?.slice(0, 80),
      tts: lida?.texto?.slice(0, 60),
      ttsLang: lida?.lang,
      erro: lida?.erro,
    }),
  )
  await foto(`turno${i}-${fala}`)
  /* O LAYOUT (conversa-de-verdade, 5.1): cada metade cabe ou rola, sem corte no topo, e nenhum microfone fora delas. */
  r.layout = await page.evaluate(() => {
    const raiz = document.querySelector('[data-testid="modo-interprete"]')
    const metades = {}
    for (const l of ['meu', 'outro']) {
      const f = raiz?.querySelector(`[data-testid="interprete-${l}"] .int-frase`)
      const t = f?.firstElementChild
      if (!f) continue
      const rf = f.getBoundingClientRect()
      const rt = t?.getBoundingClientRect()
      metades[l] = {
        scrollHeight: f.scrollHeight,
        clientHeight: f.clientHeight,
        cabe: f.scrollHeight <= f.clientHeight + 1,
        rola: getComputedStyle(f).overflowY === 'auto' && f.scrollHeight > f.clientHeight,
        /* O topo do texto dentro da área visível (com a rolagem no começo): sem corte em cima. */
        cortadoNoTopo: !!rt && f.scrollTop === 0 && rt.top < rf.top - 1,
        fontePx: t ? parseFloat(getComputedStyle(t).fontSize) : null,
      }
    }
    const microfonesFora = [...document.querySelectorAll('button, a')]
      .filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden')
      .filter((b) => !raiz?.contains(b))
      .filter((b) =>
        /microfone|ao vivo|capturar|falar/i.test(`${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`),
      )
      .map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 40))
    const trilho = document.querySelector('.q-trilho')
    return {
      metades,
      microfonesFora,
      barraVisivel: !!trilho && trilho.getClientRects().length > 0 && getComputedStyle(trilho).display !== 'none',
    }
  })
  resultado.turnos.push(r)
  await page.waitForTimeout(800) // a outra pessoa ouve e responde
}

// a lista da conversa: quem disse o quê (cartões duplicados? idioma errado?)
try {
  await clicar('tela-conversa')
  await page.waitForTimeout(800)
  await foto('99-lista')
  resultado.lista = await page.evaluate(() =>
    [...document.querySelectorAll('.int-bolha')].map((b) => ({
      dono: b.getAttribute('data-lado'),
      fala: b.querySelector('.int-bolha-fala')?.innerText,
      lang: b.querySelector('.int-bolha-fala')?.getAttribute('lang'),
      trad: b.querySelector('.int-bolha-trad')?.innerText,
    })),
  )
} catch (e) {
  resultado.erroLista = String(e).slice(0, 300)
}
resultado.toquesTotais = toques
resultado.vozesDoSistema = await page.evaluate(() =>
  speechSynthesis
    .getVoices()
    .filter((v) => /^(pt|en|es)/i.test(v.lang))
    .map((v) => ({ nome: v.name, lang: v.lang, padrao: v.default })),
)
resultado.gum = await page.evaluate(() => window.__gum)
resultado.ttsTodas = await page.evaluate(() => window.__tts)
writeFileSync(path.join(SAIDA, 'tela.json'), JSON.stringify(await page.evaluate(() => window.__tela), null, 1))
writeFileSync(path.join(SAIDA, 'resultado.json'), JSON.stringify(resultado, null, 1))
writeFileSync(path.join(SAIDA, 'console.log'), consoleLog.join('\n'))
await ctx.close()
console.log('ok', SAIDA)
