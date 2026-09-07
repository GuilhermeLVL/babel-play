#!/usr/bin/env node
/**
 * O QUE O NAVEGADOR BAIXA, MEDIDO — e não estimado (auditoria de 2026-09-07, seção 5).
 *
 * Duas perguntas que só um número responde, e que este projeto respondia por impressão:
 *
 *  1. **Quanto pesa abrir o app?** Os chunks do build, em gzip, que é como eles viajam.
 *  2. **Quanto pesa cada tela?** Bytes e latência por rota, contra um servidor de verdade.
 *
 * POR QUE UM SCRIPT E NÃO UMA MEDIÇÃO DE UMA VEZ. Otimização sem número de partida vira opinião,
 * e número que não se repete vira folclore ("aquilo era lento"). O mesmo comando roda antes e
 * depois, e a diferença é o que se coloca no PR.
 *
 *   node scripts/perf/medir-rotas.mjs                 # só o build (não precisa de servidor)
 *   node scripts/perf/medir-rotas.mjs --api=http://127.0.0.1:3100   # build + rotas
 *
 * `127.0.0.1` e não `localhost`: no Windows o `localhost` resolve primeiro para IPv6 e o Node
 * espera o timeout do connect antes de cair para IPv4 — medido, ~200 ms fantasma em toda rota,
 * que é mais que a latência real da maioria delas.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = 'dist/assets'
const kb = (n) => Number((n / 1024).toFixed(1))

/** Tamanho de cada arquivo do build, cru e gzip. */
function medirBuild() {
  if (!existsSync(DIST)) {
    console.error(`sem ${DIST} — rode \`npm run build\` antes`)
    return null
  }
  const arquivos = readdirSync(DIST).filter((f) => /\.(js|css)$/.test(f))
  const medidos = arquivos
    .map((f) => {
      const bytes = readFileSync(join(DIST, f))
      return { arquivo: f, kb: kb(bytes.length), gzip: kb(gzipSync(bytes).length) }
    })
    .sort((a, b) => b.gzip - a.gzip)

  /**
   * O ARRANQUE É O QUE O `index.html` PEDE — lido dele, não adivinhado pelo nome do arquivo.
   *
   * A primeira versão deste script somava tudo que começasse com `index` ou `vendor-`, e contava
   * o `vendor-supabase` (56 KB gz) como arranque. Ele NÃO é: `src/lib/supabase.ts` o puxa por
   * `import()` e só quando há URL e chave. O número saía 392 KB para um arranque de 212 — e um
   * número inflado teria mandado otimizar o lugar errado.
   *
   * Os workers e as telas com `lazy` também ficam de fora, pelo mesmo motivo: chegam quando a
   * pessoa pede a captura ou navega.
   */
  const html = existsSync('dist/index.html') ? readFileSync('dist/index.html', 'utf8') : ''
  const pedidos = new Set([...html.matchAll(/assets\/([A-Za-z0-9._-]+)/g)].map((m) => m[1]))
  const doArranque = medidos.filter((m) => pedidos.has(m.arquivo))
  const arranqueGzip = Number(doArranque.reduce((n, m) => n + m.gzip, 0).toFixed(1))

  return { medidos, doArranque, arranqueGzip, totalGzip: Number(medidos.reduce((n, m) => n + m.gzip, 0).toFixed(1)) }
}

/** Uma rota, N vezes. Devolve p50, p90 e o tamanho do corpo. */
async function medirRota(base, caminho, repeticoes = 15) {
  const tempos = []
  let bytes = 0
  for (let i = 0; i < repeticoes; i++) {
    const t0 = performance.now()
    const r = await fetch(`${base}${caminho}`, { headers: { accept: 'application/json' } })
    const corpo = await r.arrayBuffer()
    tempos.push(performance.now() - t0)
    bytes = corpo.byteLength
    if (!r.ok) return { caminho, status: r.status, erro: true }
  }
  tempos.sort((a, b) => a - b)
  return {
    caminho,
    p50: Math.round(tempos[Math.floor(tempos.length * 0.5)]),
    p90: Math.round(tempos[Math.floor(tempos.length * 0.9)]),
    kb: kb(bytes),
  }
}

const ROTAS = [
  '/api/health',
  '/api/vocab',
  '/api/vocab/resumo',
  '/api/vocab/para-jogo?fonte=baralho&limite=40&estrategia=equilibrado',
  '/api/metrics/profile',
  '/api/sessions',
  '/api/exercises/results?limite=20',
]

const build = medirBuild()
if (build) {
  console.log('\n## Build (gzip, como viaja)\n')
  for (const m of build.medidos.slice(0, 12)) {
    console.log(`${String(m.gzip).padStart(7)} KB gz | ${String(m.kb).padStart(7)} KB | ${m.arquivo}`)
  }
  console.log(`\narranque (index + vendors): ${build.arranqueGzip} KB gz`)
  console.log(`todos os assets:            ${build.totalGzip} KB gz`)
}

const alvo = process.argv.find((a) => a.startsWith('--api='))
if (alvo) {
  const base = alvo.slice('--api='.length).replace(/\/+$/, '')
  console.log(`\n## Rotas (${base}, 15 repetições)\n`)
  for (const rota of ROTAS) {
    try {
      const r = await medirRota(base, rota)
      if (r.erro) console.log(`  ${String(r.status).padStart(4)} | ${r.caminho}`)
      else console.log(`  ${String(r.p50).padStart(4)} ms p50 | ${String(r.p90).padStart(4)} ms p90 | ${String(r.kb).padStart(8)} KB | ${r.caminho}`)
    } catch (e) {
      console.log(`   err | ${rota} — ${String(e?.message ?? e).slice(0, 60)}`)
    }
  }
} else {
  console.log('\n(sem --api=<url>: só o build foi medido)')
}
