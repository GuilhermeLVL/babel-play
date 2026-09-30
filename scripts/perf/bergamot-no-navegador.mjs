#!/usr/bin/env node
/* global window, localStorage, PerformanceObserver -- código que roda DENTRO da página (page.evaluate / addInitScript) */
/**
 * PROVA REAL DO BERGAMOT NO NAVEGADOR (A9b) — a tradução pt→en pelo gateway de verdade, na edição
 * estática, com o motor e o modelo de verdade.
 *
 *   npm run build:estatica
 *   node scripts/perf/bergamot-no-navegador.mjs [--porta 4189] [--comparar-opus] [--saida arquivo.json]
 *
 * Sobe (ou reaproveita) `tests/e2e-estatica/_servidor-estatico.mjs` na porta (COOP/COEP como o
 * Pages, sem compressão de transporte: o pior caso de bytes), abre a tela Capturar num Chromium com
 * perfil NOVO e usa o `window.__babelGateway` que ela expõe: `mt.preload('pt','en')` e depois
 * `mt.translate` de frases de conversa, uma a uma. Mede:
 *   - o preparo (download + WASM + modelo + aquecimento) e os BYTES que a rede entregou;
 *   - a latência de cada tradução (o caminho inteiro do gateway, com a conferência de idioma);
 *   - o motor que respondeu (`bergamot-local`) e que nada foi ao Hub buscar o opus-mt;
 *   - as TAREFAS LONGAS da thread principal (`longtask` > 50 ms) no preparo e nas traduções — o
 *     worker não pode travar a tela;
 *   - a segunda carga (recarregar a página): o modelo sai do Cache Storage, sem rede.
 * `--comparar-opus` repete as mesmas frases com o opus-mt (lembra uma "falha do motor" para o
 * composto pular o Bergamot): baixa ~113 MB do Hugging Face, por isso é opcional.
 *
 * NÃO é e2e do CI de propósito: baixaria 26 MB (ou 140) a cada execução.
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : d
}
const PORTA = Number(arg('porta', process.env.PORTA_ESTATICA || 4189))
const BASE = `http://127.0.0.1:${PORTA}`
const COMPARAR_OPUS = process.argv.includes('--comparar-opus')

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
  for (let i = 0; i < 50 && !(await servidorDePe()); i++) await new Promise((r) => setTimeout(r, 200))
  return p
}

const p = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null
}

/** Uma rodada: abre a Capturar, prepara o pt→en e traduz as frases. `contexto` guarda o Cache Storage. */
async function rodada(contexto, rotulo) {
  const pagina = await contexto.newPage()
  const rede = []
  const consola = []
  pagina.on('console', (m) => {
    if (/bergamot|mt:worker|tradutor|opus/i.test(m.text())) consola.push(m.text().slice(0, 300))
  })
  pagina.on('pageerror', (e) => consola.push(`pageerror: ${String(e?.message ?? e).slice(0, 300)}`))
  /* Os bytes do CORPO que chegou pela rede (`sizes()`, depois de a resposta terminar): o servidor
     estático não manda content-length. Guardamos a promessa e esperamos todas antes de somar. */
  const pendentes = []
  pagina.on('response', (r) => {
    const url = r.url()
    if (!/\/modelos\/bergamot\/|bergamotWorker|huggingface|hf\.co|opus-mt/i.test(url)) return
    pendentes.push(
      r
        .finished()
        .then(() => r.request().sizes())
        .then((t) => rede.push({ url: url.replace(BASE, ''), status: r.status(), bytes: t.responseBodySize }))
        .catch(() => rede.push({ url: url.replace(BASE, ''), status: r.status(), bytes: 0 })),
    )
  })
  await pagina.goto(`${BASE}/capturar`)
  await pagina.waitForFunction(() => !!window.__babelGateway, null, { timeout: 60_000 })

  const r = await pagina.evaluate(async (frases) => {
    const gw = window.__babelGateway
    const tarefas = () => window.__tarefasLongas.slice()
    const isolado = globalThis.crossOriginIsolated === true
    // Janela + workers; só com isolamento e nem todo Chromium expõe (headless recusa): `null` é "não medido".
    const memoria = async () => {
      try {
        return isolado ? Math.round((await performance.measureUserAgentSpecificMemory()).bytes / 1e6) : null
      } catch {
        return null
      }
    }
    const memoriaAntes = await memoria()
    const t0 = performance.now()
    let ultimoRotulo = ''
    /* PRONTO DE VERDADE = o `aoFicarPronto` do tradutor local, não a promessa do `preload`: essa
       resolve no primeiro progresso 100% — no opus-mt, o fim do DOWNLOAD, antes de a sessão do ORT
       abrir (a mesma armadilha que o Bergamot evita parando a barra em 0,99 até o `ready`). */
    const pronto = new Promise((ok) => {
      const soltar = gw.mt.aoFicarPronto(() => {
        soltar()
        ok(true)
      })
    })
    await gw.mt.preload('pt', 'en', (_p, rotulo) => {
      if (rotulo) ultimoRotulo = rotulo
    })
    const downloadMs = Math.round(performance.now() - t0)
    await Promise.race([pronto, new Promise((ok) => setTimeout(() => ok(false), 180_000))])
    const preparoMs = Math.round(performance.now() - t0)
    const longasNoPreparo = tarefas().filter((t) => t.inicio >= t0)
    const t1 = performance.now()
    const traducoes = []
    for (const f of frases) {
      const a = performance.now()
      try {
        const x = await gw.mt.translate(f, 'pt', 'en')
        traducoes.push({ pt: f, en: x.text, motor: x.engine, ms: Math.round(performance.now() - a) })
      } catch (e) {
        traducoes.push({ pt: f, erro: String(e?.message ?? e), ms: Math.round(performance.now() - a) })
      }
    }
    const longasNasTraducoes = tarefas().filter((t) => t.inicio >= t1)
    return {
      isolado,
      downloadMs,
      preparoMs,
      ultimoRotulo,
      traducoes,
      longasNoPreparo,
      longasNasTraducoes,
      memoriaAntesMb: memoriaAntes,
      memoriaDepoisMb: await memoria(),
      falhaLembrada: localStorage.getItem('babel.bergamot.falha'),
    }
  }, FRASES)
  await pagina.waitForTimeout(300)
  await Promise.all(pendentes)
  await pagina.close()
  const ms = r.traducoes.filter((t) => !t.erro).map((t) => t.ms)
  return {
    rotulo,
    ...r,
    latenciaMs: { p50: p(ms, 0.5), p95: p(ms, 0.95), max: Math.max(...ms) },
    rede,
    consola,
    bytesDaRede: rede.reduce((s, x) => s + x.bytes, 0),
  }
}

const servidor = await subirServidor()
const navegador = await chromium.launch({ headless: true })
const contexto = await navegador.newContext()
await contexto.addInitScript(() => {
  try {
    localStorage.setItem('babel_tour_blitz', '1')
  } catch {
    /* storage bloqueado */
  }
  window.__tarefasLongas = []
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__tarefasLongas.push({ inicio: e.startTime, ms: Math.round(e.duration) })
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    /* sem longtask neste navegador */
  }
})

const saida = { quando: new Date().toISOString(), base: BASE, rodadas: [] }
try {
  saida.rodadas.push(await rodada(contexto, 'bergamot, perfil novo (download)'))
  saida.rodadas.push(await rodada(contexto, 'bergamot, recarga (Cache Storage)'))
  if (COMPARAR_OPUS) {
    const pagina = await contexto.newPage()
    await pagina.goto(`${BASE}/capturar`)
    // A "falha do motor" lembrada: o composto pula o Bergamot e o pt→en vai ao opus-mt.
    await pagina.evaluate(() =>
      localStorage.setItem(
        'babel.bergamot.falha',
        JSON.stringify({ assinatura: '0.4.9|retrain_hr_drxrs5bGSsOWvfK9lyZISw', motivo: 'comparação' }),
      ),
    )
    await pagina.close()
    saida.rodadas.push(await rodada(contexto, 'opus-mt, perfil novo (download do Hub)'))
  }
} finally {
  await navegador.close()
  servidor?.kill()
}

for (const r of saida.rodadas) {
  console.log(`\n== ${r.rotulo}`)
  console.log(
    `preload resolveu em ${r.downloadMs} ms, pronto em ${r.preparoMs} ms · rede ${(r.bytesDaRede / 1e6).toFixed(1)} MB · latência p50 ${r.latenciaMs.p50} ms, ` +
      `p95 ${r.latenciaMs.p95} ms · tarefas longas: ${r.longasNoPreparo.length} no preparo ` +
      `(máx ${Math.max(0, ...r.longasNoPreparo.map((t) => t.ms))} ms), ${r.longasNasTraducoes.length} nas traduções` +
      ` · memória ${r.memoriaAntesMb ?? '?'} → ${r.memoriaDepoisMb ?? '?'} MB`,
  )
  for (const c of r.consola) console.log(`  [consola] ${c}`)
  for (const x of r.rede) console.log(`  [rede] ${x.status} ${(x.bytes / 1e6).toFixed(2)} MB ${x.url}`)
  for (const t of r.traducoes) console.log(`  ${t.ms} ms [${t.motor ?? 'erro'}] ${t.pt} → ${t.en ?? t.erro}`)
}
const arquivo = arg('saida', null)
if (arquivo) writeFileSync(arquivo, JSON.stringify(saida, null, 2))
