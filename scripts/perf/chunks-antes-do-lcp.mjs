#!/usr/bin/env node
/**
 * CHUNKS ANTES DO LCP — lê um JSON do Lighthouse e lista o que foi pedido até o LCP (carga-rapida-no-celular, 1.2).
 *
 *   node scripts/perf/chunks-antes-do-lcp.mjs <lighthouse.json> [mais.json…] [--json] [--todos]
 *
 * Para cada relatório: LCP, FCP, o modo de estrangulamento, o JS transferido até o LCP (soma do `transferSize` dos
 * scripts cujo download TERMINOU antes do LCP; é a meta de 300 KB do `slo.json`) e a lista dos pedidos, em ordem de
 * término. `--todos` lista também o que terminou depois do LCP. Os nomes vigiados (`vendor-supabase`, `servidor`,
 * `TrilhoDoQuest`, `IChat`, `LiveCapture`, `Play`…) aparecem marcados com `!` quando chegaram antes do LCP.
 * Com vários relatórios, a última linha dá a mediana do LCP e do JS até o LCP.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const arquivos = args.filter((a) => !a.startsWith('--'))
const comoJson = args.includes('--json')
const todos = args.includes('--todos')
const ehCli = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

/** Os pedaços que NÃO podem estar no caminho crítico do visitante (spec carga-inicial-do-app). */
export const VIGIADOS = [
  'vendor-supabase',
  'servidor',
  'TrilhoDoQuest',
  'InicioDoQuest',
  'IChat',
  'LiveCapture',
  'Play',
]

/** Analisa um relatório do Lighthouse (o objeto já lido). Exportada para os testes. */
export function analisar(lh) {
  const a = lh.audits
  const lcp = a['largest-contentful-paint']?.numericValue ?? null
  const itens = a['network-requests']?.details?.items ?? []
  const pedidos = itens
    .map((it) => ({
      inicio: Math.round(it.networkRequestTime ?? it.startTime ?? 0),
      fim: Math.round(it.networkEndTime ?? it.endTime ?? 0),
      kb: Math.round(((it.transferSize ?? 0) / 1024) * 10) / 10,
      tipo: it.resourceType ?? '',
      url: String(it.url ?? '').replace(/^https?:\/\/[^/]+/, ''),
    }))
    .sort((x, y) => x.fim - y.fim)
  const antes = lcp === null ? [] : pedidos.filter((p) => p.fim <= lcp)
  const js = (xs) => Math.round(xs.filter((p) => p.tipo === 'Script').reduce((s, p) => s + p.kb, 0) * 10) / 10
  const vigiadosAntes = VIGIADOS.filter((v) => antes.some((p) => p.tipo === 'Script' && nomeDoPedaco(p.url) === v))
  return {
    url: lh.finalDisplayedUrl ?? lh.finalUrl,
    estrangulamento: lh.configSettings?.throttlingMethod,
    lcp: lcp === null ? null : Math.round(lcp),
    fcp: Math.round(a['first-contentful-paint']?.numericValue ?? 0),
    scriptsAteLcp: antes.filter((p) => p.tipo === 'Script').length,
    jsAteLcpKB: js(antes),
    jsTotalKB: js(pedidos),
    vigiadosAntes,
    pedidos: todos ? pedidos : antes,
  }
}

/**
 * O veredito do `/app` no celular contra `slo.json` → `frontend.appMobile` (medianas). Pura, para o teste. Devolve as
 * falhas (vazio = dentro).
 */
export function avaliarAppMobile({ lcp, jsAteLcpKB }, metas) {
  const falhas = []
  if (!(lcp <= metas.lcpMaxMs)) falhas.push(`LCP mediano ${lcp} ms > ${metas.lcpMaxMs} ms`)
  if (!(jsAteLcpKB <= metas.jsAteLcpMaxKB)) falhas.push(`JS até o LCP ${jsAteLcpKB} KB > ${metas.jsAteLcpMaxKB} KB`)
  return falhas
}

/** `/assets/vendor-supabase-AbC123.js` → `vendor-supabase`; o hash do Vite é o último segmento depois do hífen. */
export function nomeDoPedaco(url) {
  const base = url.split('?')[0].split('/').pop() ?? ''
  return base.replace(/\.(m?js|css)$/, '').replace(/-[A-Za-z0-9_]{6,}$/, '')
}

const mediana = (xs) => {
  const o = xs.filter((x) => typeof x === 'number').sort((p, q) => p - q)
  return o.length ? o[Math.floor(o.length / 2)] : null
}

if (ehCli && !arquivos.length) {
  console.error('uso: node scripts/perf/chunks-antes-do-lcp.mjs <lighthouse.json> [mais.json…] [--json] [--todos]')
  process.exit(2)
}
if (ehCli) {
  const res = arquivos.map((f) => ({ arquivo: f, ...analisar(JSON.parse(readFileSync(f, 'utf8'))) }))
  if (comoJson) {
    console.log(JSON.stringify(res, null, 2))
  } else {
    for (const r of res) {
      console.log(`\n# ${r.arquivo} (${r.url}, ${r.estrangulamento})`)
      console.log(
        `LCP ${r.lcp} ms · FCP ${r.fcp} ms · ${r.scriptsAteLcp} scripts e ${r.jsAteLcpKB} KB de JS até o LCP · JS total ${r.jsTotalKB} KB`,
      )
      console.log(`vigiados antes do LCP: ${r.vigiadosAntes.length ? r.vigiadosAntes.join(', ') : 'nenhum'}`)
      for (const p of r.pedidos) {
        const marca = p.tipo === 'Script' && VIGIADOS.includes(nomeDoPedaco(p.url)) && p.fim <= r.lcp ? '!' : ' '
        console.log(
          `${marca} ${String(p.inicio).padStart(6)} → ${String(p.fim).padStart(6)} ms ${String(p.kb).padStart(7)} KB  ${p.tipo.padEnd(10)} ${p.url}`,
        )
      }
    }
    if (res.length > 1)
      console.log(
        `\nmediana de ${res.length}: LCP ${mediana(res.map((r) => r.lcp))} ms · JS até o LCP ${mediana(res.map((r) => r.jsAteLcpKB))} KB`,
      )
  }
}
