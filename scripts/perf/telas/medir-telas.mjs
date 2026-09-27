#!/usr/bin/env node
/* global window, document, PerformanceObserver, requestAnimationFrame, localStorage */
/**
 * MEDIÇÃO DAS TELAS E DOS JOGOS — auditoria de performance do frontend (26/09/2026).
 *
 *   npm run build                                    # e/ou npm run build:estatica
 *   node scripts/perf/telas/medir-telas.mjs [--alvo=producao|estatica] [--raiz=<pasta com dist/>]
 *        [--cpu=4] [--execucoes=3] [--telas=inicio,jogar,...] [--jogos=todos|nenhum|Nome,Nome]
 *        [--perfil=celular|desktop] [--porta=3190] [--saida=<arquivo.json>] [--pasta=<trabalho>]
 *        [--sem-animacoes] [--raiz-b=<outra pasta com dist/>]  (intercalado: A e B na mesma rodada)
 *
 * Para cada tela principal (Início, Capturar, Jogar, Biblioteca, Vocabulário, Estatísticas, Loja,
 * Ajustes, Personalizar) e cada minigame que abre com a trilha, num Chromium do Playwright com
 * CELULAR MÉDIO emulado (viewport 412×915, DPR 2,625, toque) e a CPU ESTRANGULADA pelo DevTools
 * (`Emulation.setCPUThrottlingRate`, 4× ou 6×), mede:
 *
 *  - CARGA: LCP, CLS, FCP (PerformanceObserver), tarefas longas (`longtask`: quantas, soma e o
 *    "TBT" = Σ(duração − 50 ms)) do início até a tela assentar;
 *  - INP das interações típicas da tela: cada passo é um clique/tecla real; a duração de cada
 *    interação é a maior entrada `event` com o mesmo `interactionId` (Event Timing, limiar 16 ms).
 *    O INP da tela é a PIOR interação (com menos de 50 interações, o p98 do INP é o máximo);
 *  - QUADROS: `requestAnimationFrame` amostrado por 3 s (tela parada, só o ambiente de partículas)
 *    ou 4 s (jogo em andamento): FPS, quadros > 33 ms ("jank") e p95 do intervalo;
 *  - REACT: commits e fibras re-renderizadas (bandeira PerformedWork) por interação, por um gancho
 *    `__REACT_DEVTOOLS_GLOBAL_HOOK__` injetado antes do app — funciona no build de produção;
 *  - MEMÓRIA JS e contadores do motor (`Performance.getMetrics` do CDP: JSHeapUsedSize, LayoutCount,
 *    RecalcStyleCount, ScriptDuration, TaskDuration) no fim de cada tela.
 *
 * O visitante é um usuário que VOLTA: um aquecimento fecha as celebrações da primeira visita e o
 * `storageState` dele é reaproveitado — sem isso cada carga mediria um diálogo de conquista.
 * Cada execução usa um contexto novo (cache HTTP frio, como uma visita nova).
 *
 * Grava tudo em `--saida` (JSON) e imprime a tabela de medianas em Markdown.
 * `comparar.mjs` junta dois JSON (antes × depois).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { chromium } from 'playwright'

import { mediana, r1, resumirQuadros } from './_medidas.mjs'
import { RAIZ, subirEstatica, subirProducao } from './_servidores.mjs'

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const alvo = arg('alvo', 'producao')
const raiz = path.resolve(arg('raiz', RAIZ))
const cpu = Number(arg('cpu', 4))
const execucoes = Number(arg('execucoes', 3))
const perfil = arg('perfil', 'celular')
const pasta = path.resolve(arg('pasta', path.join(os.tmpdir(), `telas-${alvo}`)))
const saida = path.resolve(arg('saida', path.join(pasta, `telas-${alvo}-cpu${cpu}-${Date.now()}.json`)))
const filtroTelas = arg('telas', null)?.split(',')
const filtroJogos = arg('jogos', 'todos')
/** Diagnóstico: `--sem-animacoes` desliga o interruptor "Animações e efeitos" do app (partículas e
    efeitos) para isolar o custo deles na mesma tela. */
const semAnimacoes = process.argv.includes('--sem-animacoes')
mkdirSync(pasta, { recursive: true })

/** Celular médio: tela de um Android de 6,4" (412×915 CSS px), DPR 2,625, toque. */
const CONTEXTO = {
  celular: {
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-A346B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  },
  desktop: { viewport: { width: 1366, height: 800 } },
}[perfil]

// ── Passos típicos por tela ────────────────────────────────────────────────────────────────
const botao = (nome) => ({ tipo: 'botao', nome })
const tecla = (tecla) => ({ tipo: 'tecla', tecla })
const aba = (nome) => ({ tipo: 'aba', nome })
const TELAS = [
  { id: 'inicio', rota: '/', passos: [botao(/^Áudio/), botao(/^Tudo/), botao('Notificações'), tecla('Escape'), botao('Biblioteca')] },
  { id: 'capturar', rota: '/capturar', passos: [botao('Ajustes da captura'), tecla('Escape'), botao('Ajuda'), tecla('Escape')] },
  { id: 'jogar', rota: '/jogar?fonte=trilha&idioma=en', passos: [botao('Vocabulário'), botao('Escuta & fala'), botao('Todas'), botao(/^Clássicos/), botao(/^Todos/)] },
  { id: 'biblioteca', rota: '/biblioteca', passos: [botao(/^Áudio/), botao(/^Tudo/), botao('Filtros'), tecla('Escape')] },
  { id: 'vocabulario', rota: '/vocabulario', passos: [botao(/^A1/), botao(/^A1/), botao(/^Mostrar mais/), botao('Visão geral'), botao('Minhas palavras')] },
  { id: 'estatisticas', rota: '/estatisticas', passos: [botao('7 dias'), botao('90 dias'), botao('30 dias')] },
  { id: 'loja', rota: '/loja/desafios', passos: [botao(/^Meu visual/), botao(/^Desafios/)] },
  { id: 'ajustes', rota: '/ajustes', passos: [aba('Aparência'), aba('Notificações'), aba('Processamento'), aba('Idiomas')] },
  { id: 'personalizar', rota: '/loja/meu-visual', passos: [botao(/^Ver tudo que existe/), botao('Equipar')] },
]
const CONTROLES_DO_JOGO =
  /^(Jogar|Pausar|Recomeçar|Ouvir|Próxima palavra|Pular a explicação|Próximo|Conferir|devagar|Tocando|não consigo|pular|Notificações|Buscar|Mudar para|Sua conta|Início|Capturar|Biblioteca|Vocabulário|Mais|Estatísticas|Personalizar|Sobre|Planos|Ajustes|Seu perfil|Ajuda)/i

// ── Instrumentação injetada antes do app ─────────────────────────────────────────────────────
function instrumentar() {
  const m = (window.__perf = { lcp: 0, cls: 0, longas: [], eventos: new Map(), commits: 0, fibras: 0 })
  const obs = (tipo, fn, extra = {}) => {
    try {
      new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type: tipo, buffered: true, ...extra })
    } catch {}
  }
  obs('largest-contentful-paint', (e) => (m.lcp = Math.max(m.lcp, e.startTime)))
  obs('layout-shift', (e) => {
    if (!e.hadRecentInput) m.cls += e.value
  })
  obs('longtask', (e) => m.longas.push({ t: e.startTime, d: e.duration }))
  obs(
    'event',
    (e) => {
      if (!e.interactionId) return
      const atual = m.eventos.get(e.interactionId)
      if (!atual || e.duration > atual.d) m.eventos.set(e.interactionId, { d: e.duration, tipo: e.name, t: e.startTime })
    },
    { durationThreshold: 16 },
  )
  /* Gancho mínimo do React DevTools: conta commits e fibras que RENDERIZARAM neste commit
     (bandeira PerformedWork = 1), com a mesma regra do DevTools: uma subárvore cujo `child` é o
     mesmo objeto do commit anterior foi reaproveitada inteira (bailout) e não é visitada — as
     bandeiras dela são do render antigo. No build de PERFIL (`build-perfil.mjs`: react-dom/profiling
     e nomes preservados) soma também o tempo PRÓPRIO por componente (`actualDuration` − filhos). */
  m.porComponente = {}
  const nomeDe = (f) => {
    const t = f.type
    if (!t || typeof t === 'string') return null
    return t.displayName || t.name || t.render?.displayName || t.render?.name || t.type?.name || null
  }
  const contar = (fibra) => {
    let n = 0
    const pilha = [fibra]
    while (pilha.length) {
      const f = pilha.pop()
      if (!f) continue
      const renderizou = (f.flags & 1) === 1
      if (renderizou) {
        n++
        if (typeof f.actualDuration === 'number') {
          let filhos = 0
          for (let c = f.child; c; c = c.sibling) filhos += c.actualDuration || 0
          const nome = nomeDe(f)
          if (nome) {
            const o = (m.porComponente[nome] ??= { renders: 0, ms: 0 })
            o.renders++
            o.ms += Math.max(0, f.actualDuration - filhos)
          }
        } else {
          const nome = nomeDe(f)
          if (nome) (m.porComponente[nome] ??= { renders: 0, ms: 0 }).renders++
        }
      }
      if (f.sibling) pilha.push(f.sibling)
      const reaproveitada = f.alternate && f.child === f.alternate.child
      if (f.child && !reaproveitada) pilha.push(f.child)
    }
    return n
  }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(r) {
      const id = this.renderers.size + 1
      this.renderers.set(id, r)
      return id
    },
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id, raiz) {
      m.commits++
      try {
        m.fibras += contar(raiz.current.child)
      } catch {}
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  }
  window.__quadros = (ms) =>
    new Promise((ok) => {
      const ts = []
      const t0 = performance.now()
      const passo = (t) => {
        ts.push(t)
        if (t - t0 < ms) requestAnimationFrame(passo)
        else ok(ts)
      }
      requestAnimationFrame(passo)
    })
}

async function cdpMetricas(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics')
  const v = Object.fromEntries(metrics.map((x) => [x.name, x.value]))
  return {
    heapMB: r1(v.JSHeapUsedSize / 1048576),
    layouts: v.LayoutCount,
    recalcs: v.RecalcStyleCount,
    scriptMs: Math.round(v.ScriptDuration * 1000),
    tarefaMs: Math.round(v.TaskDuration * 1000),
  }
}

async function fecharDialogos(p) {
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(400)
    if (!(await p.locator('dialog[open]').count())) return
    const r = p.locator('dialog[open]').getByRole('button', { name: /Resgatar|continuar|Fechar|Entendi|Agora não/i })
    if (await r.count()) await r.first().click({ timeout: 2000 }).catch(() => {})
    else await p.keyboard.press('Escape')
  }
}

async function executarPasso(p, passo) {
  if (passo.tipo === 'tecla') return p.keyboard.press(passo.tecla)
  // Botão, aba ou rádio (as abas e os seletores de período do app são `<button role=...>`).
  const opcoes = typeof passo.nome === 'string' ? { name: passo.nome, exact: true } : { name: passo.nome }
  if (passo.tipo === 'aba') return p.getByRole('tab', opcoes).locator('visible=true').first().click({ timeout: 4000 })
  const el = p.getByRole('button', opcoes).or(p.getByRole('tab', opcoes)).or(p.getByRole('radio', opcoes)).locator('visible=true').first()
  await el.click({ timeout: 4000 })
}

/** Uma carga + os passos. Devolve a linha medida. */
async function medirUma(navegador, estado, base, { id, rota, passos, jogo }) {
  const ctx = await navegador.newContext({ ...CONTEXTO, storageState: estado })
  await ctx.addInitScript(instrumentar)
  if (semAnimacoes) await ctx.addInitScript(() => localStorage.setItem('babel.animations_enabled', 'false'))
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  const t0 = Date.now()
  await p.goto(base + rota, { waitUntil: 'networkidle', timeout: 120_000 })
  const cargaMs = Date.now() - t0
  await p.waitForTimeout(1000)
  await fecharDialogos(p)
  const carga = await p.evaluate(() => {
    const m = window.__perf
    return {
      lcp: m.lcp,
      cls: m.cls,
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      longas: m.longas.length,
      longasMs: m.longas.reduce((a, x) => a + x.d, 0),
      tbt: m.longas.reduce((a, x) => a + Math.max(0, x.d - 50), 0),
      commits: m.commits,
      fibras: m.fibras,
      jsKB: performance
        .getEntriesByType('resource')
        .filter((x) => /\.m?js(\?|$)/.test(x.name))
        .reduce((a, x) => a + (x.transferSize || 0), 0) / 1024,
    }
  })
  const falhas = []
  // Jogo: entra pela vitrine com a trilha e começa a partida.
  if (jogo) {
    try {
      await p.getByRole('button', { name: `Jogar: ${jogo}`, exact: true }).first().click({ timeout: 5000 })
      await p.waitForTimeout(1500)
      const pular = p.getByRole('button', { name: 'Pular a explicação' })
      if (await pular.count()) await pular.first().click({ timeout: 2000 }).catch(() => {})
      await p.waitForTimeout(800)
    } catch (e) {
      falhas.push(`abrir: ${e.message.split('\n')[0]}`)
    }
  }
  const quadrosParado = resumirQuadros(await p.evaluate((ms) => window.__quadros(ms), jogo ? 4000 : 3000))
  // Passos: os típicos da tela, ou, no jogo, até 4 toques nas peças da partida + uma tecla.
  const antesPassos = await p.evaluate(() => ({ c: window.__perf.commits, f: window.__perf.fibras, l: window.__perf.longas.length }))
  await p.evaluate(() => { window.__perf.eventos.clear(); window.__perf.porComponente = {} })
  let feitos = 0
  const lista = jogo ? [] : passos
  for (const passo of lista) {
    try {
      await executarPasso(p, passo)
      feitos++
    } catch (e) {
      falhas.push(`${passo.nome ?? passo.tecla}: ${e.message.split('\n')[0].slice(0, 80)}`)
    }
    await p.waitForTimeout(600)
  }
  if (jogo) {
    const pecas = await p.evaluate((re) => {
      const r = new RegExp(re, 'i')
      return [...document.querySelectorAll('main button')]
        .filter((b) => b.offsetParent && !b.disabled)
        .map((b, i) => ({ i, nome: (b.getAttribute('aria-label') || b.textContent || '').trim() }))
        .filter((x) => x.nome && !r.test(x.nome))
        .slice(0, 4)
        .map((x) => x.i)
    }, CONTROLES_DO_JOGO.source)
    for (const i of pecas) {
      try {
        await p.locator('main button').nth(i).click({ timeout: 2000 })
        feitos++
      } catch (e) {
        falhas.push(`peça ${i}: ${e.message.split('\n')[0].slice(0, 60)}`)
      }
      await p.waitForTimeout(500)
    }
    await p.keyboard.press('a').catch(() => {})
    await p.waitForTimeout(500)
  }
  const inter = await p.evaluate(() => ({
    eventos: [...window.__perf.eventos.values()],
    c: window.__perf.commits,
    f: window.__perf.fibras,
    longas: window.__perf.longas,
    porComponente: Object.entries(window.__perf.porComponente).sort((a, b) => b[1].ms - a[1].ms || b[1].renders - a[1].renders).slice(0, 12),
  }))
  const quadrosJogando = jogo ? resumirQuadros(await p.evaluate(() => window.__quadros(3000))) : null
  const motor = await cdpMetricas(cdp)
  await ctx.close()
  const duracoes = inter.eventos.map((e) => e.d)
  const longasPassos = inter.longas.slice(antesPassos.l)
  return {
    id,
    rota,
    jogo: jogo ?? null,
    cargaMs,
    lcp: Math.round(carga.lcp),
    cls: Math.round(carga.cls * 1000) / 1000,
    fcp: carga.fcp && Math.round(carga.fcp),
    longasCarga: carga.longas,
    tbtCarga: Math.round(carga.tbt),
    jsKB: r1(carga.jsKB),
    commitsCarga: carga.commits,
    fibrasCarga: carga.fibras,
    passos: feitos,
    interacoes: inter.eventos.length,
    inp: duracoes.length ? Math.round(Math.max(...duracoes)) : null,
    inpMediana: duracoes.length ? Math.round(mediana(duracoes)) : null,
    tbtInteracoes: Math.round(longasPassos.reduce((a, x) => a + Math.max(0, x.d - 50), 0)),
    commitsPorPasso: feitos ? r1((inter.c - antesPassos.c) / feitos) : null,
    fibrasPorPasso: feitos ? Math.round((inter.f - antesPassos.f) / feitos) : null,
    fps: quadrosParado.fps,
    jank: quadrosParado.jank,
    quadroP95: quadrosParado.p95Ms,
    fpsJogando: quadrosJogando?.fps ?? null,
    jankJogando: quadrosJogando?.jank ?? null,
    ...motor,
    componentes: inter.porComponente.map(([nome, o]) => `${nome}×${o.renders}${o.ms ? ` ${r1(o.ms)}ms` : ''}`),
    falhas,
  }
}

// ── Principal ────────────────────────────────────────────────────────────────────────────────
/* INTERCALADO (`--raiz-b`): numa máquina compartilhada a carga muda de um minuto para o outro, e
   "antes" medido às 20h contra "depois" às 21h compara a máquina, não o código. Com `--raiz-b` os
   DOIS builds sobem juntos (cada um com o seu banco, gerado pelo mesmo semeador determinístico) e
   cada execução mede A e B em seguida, alternando quem vai primeiro. */
const raizB = arg('raiz-b', null) && path.resolve(arg('raiz-b'))
const lados = [{ nome: 'a', raiz, pasta, saida }]
if (raizB) lados.push({ nome: 'b', raiz: raizB, pasta: `${pasta}-b`, saida: saida.replace(/.json$/, '') + '-b.json' })
const porta0 = Number(arg('porta', alvo === 'estatica' ? 4195 : 3190))
for (const [k, l] of lados.entries()) {
  mkdirSync(l.pasta, { recursive: true })
  l.servidor =
    alvo === 'estatica'
      ? await subirEstatica({ raiz: l.raiz, porta: porta0 + k })
      : await subirProducao({ raiz: l.raiz, porta: porta0 + k, pasta: l.pasta })
  console.log(`# [${l.nome}] ${alvo} em ${l.servidor.base} (PID ${l.servidor.pid}), raiz ${l.raiz}, CPU ${cpu}×, ${perfil}, ${execucoes} execução(ões)`)
}
const navegador = await chromium.launch()

// Aquecimento: a primeira visita (celebrações, conquistas) e a lista de jogos da trilha.
let jogos
for (const l of lados) {
  l.estado = path.join(l.pasta, `estado-${alvo}.json`)
  const ctx = await navegador.newContext(CONTEXTO)
  const p = await ctx.newPage()
  for (const r of ['/', '/jogar?fonte=trilha&idioma=en', '/loja']) {
    await p.goto(l.servidor.base + r, { waitUntil: 'networkidle' })
    await fecharDialogos(p)
  }
  await p.goto(l.servidor.base + '/jogar?fonte=trilha&idioma=en', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1000)
  const achados = await p.evaluate(() =>
    [...document.querySelectorAll('button[aria-label^="Jogar: "]')].map((b) => b.getAttribute('aria-label').slice(7)),
  )
  jogos ??= [...new Set(achados)]
  await ctx.storageState({ path: l.estado })
  await ctx.close()
}
if (filtroJogos === 'nenhum') jogos = []
else if (filtroJogos !== 'todos') jogos = jogos.filter((j) => filtroJogos.split(',').some((f) => j.startsWith(f)))
console.log(`# jogos: ${jogos.join(' | ')}`)

const alvos = [
  ...TELAS.filter((t) => !filtroTelas || filtroTelas.includes(t.id)),
  ...jogos.map((j) => ({ id: `jogo:${j}`, rota: '/jogar?fonte=trilha&idioma=en', passos: [], jogo: j })),
]
for (const l of lados) l.linhas = []
const CAMPOS = ['lcp', 'cls', 'fcp', 'tbtCarga', 'longasCarga', 'jsKB', 'inp', 'inpMediana', 'tbtInteracoes', 'commitsPorPasso', 'fibrasPorPasso', 'fps', 'jank', 'quadroP95', 'fpsJogando', 'jankJogando', 'heapMB', 'layouts', 'recalcs', 'scriptMs']
const medianasDe = (linhas) =>
  alvos.map((a) => {
    const xs = linhas.filter((l) => l.id === a.id)
    return { id: a.id, n: xs.length, ...Object.fromEntries(CAMPOS.map((c) => [c, r1(mediana(xs.map((x) => x[c])))])) }
  })
/* Grava a cada execução: numa máquina carregada uma rodada longa pode ser interrompida, e o que já
   foi medido não se perde. */
const gravar = (l) =>
  writeFileSync(
    l.saida,
    JSON.stringify(
      { alvo, raiz: l.raiz, cpu, perfil, execucoes, intercalado: lados.length > 1, quando: new Date().toISOString(), medianas: medianasDe(l.linhas), linhas: l.linhas },
      null,
      1,
    ),
  )
/** Teto por execução: uma página que trava (renderizador sem memória) não segura a rodada inteira. */
const TETO_MS = 150_000
const comTeto = (promessa) => {
  let relogio
  const teto = new Promise((_, falha) => {
    relogio = setTimeout(() => {
      for (const c of navegador.contexts()) void c.close().catch(() => {})
      falha(new Error(`passou de ${TETO_MS / 1000} s`))
    }, TETO_MS)
  })
  // O relógio morre com a execução: senão ele fecharia o contexto de uma execução SEGUINTE.
  return Promise.race([promessa, teto]).finally(() => clearTimeout(relogio))
}
for (const a of alvos)
  for (let n = 1; n <= execucoes; n++) {
    // Alterna quem vai primeiro: aquecimento de disco/JIT do navegador não favorece sempre o mesmo lado.
    const ordem = n % 2 ? lados : [...lados].reverse()
    for (const l of ordem) {
      try {
        const r = await comTeto(medirUma(navegador, l.estado, l.servidor.base, a))
        l.linhas.push({ ...r, n })
        gravar(l)
        process.stdout.write(`[${l.nome}] ${a.id} #${n}: LCP ${r.lcp} INP ${r.inp} TBT ${r.tbtCarga} fps ${r.fps}${r.falhas.length ? ` (falhas: ${r.falhas.join('; ')})` : ''}\n`)
      } catch (e) {
        console.log(`[${l.nome}] ${a.id} #${n}: ERRO ${e.message.split('\n')[0]}`)
      }
    }
  }
await navegador.close()
for (const l of lados) {
  l.servidor.parar()
  gravar(l)
  console.log(`
[${l.nome}] ${l.raiz}`)
  console.log(`| tela | LCP ms | CLS | TBT carga ms | JS KB | INP ms | TBT interações ms | commits/passo | fibras/passo | FPS parado | jank | FPS jogando | heap MB |`)
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const m of medianasDe(l.linhas))
    console.log(`| ${m.id} | ${m.lcp} | ${m.cls} | ${m.tbtCarga} | ${m.jsKB} | ${m.inp} | ${m.tbtInteracoes} | ${m.commitsPorPasso} | ${m.fibrasPorPasso} | ${m.fps} | ${m.jank} | ${m.fpsJogando ?? '—'} | ${m.heapMB} |`)
  console.log(`# gravado em ${l.saida}`)
}
process.exit(0)
