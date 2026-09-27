#!/usr/bin/env node
/* global AbortSignal */
/**
 * SUÍTE DE CARGA — usuários virtuais com ritmo de gente, contra o bundle de produção (Fase 4).
 *
 *   npm run build
 *   node scripts/perf/suite/rodar.mjs [--vus=10,100,1000] [--duracao=60] [--rampa=15] [--pensar=12]
 *        [--pesados=50] [--medios=2000] [--mesmo-ip] [--porta=3160] [--bundle=dist-server/server.cjs]
 *        [--tmp=<pasta>] [--saida=resultado.json] [--sem-veredito]
 *        [--coletor-dir=<pasta>] [--cpu-prof-dir=<pasta>]
 *
 * INSTRUMENTAÇÃO OPCIONAL (auditoria de performance do backend, 26/09/2026), uma subpasta por nível:
 *   --coletor-dir   pré-carrega `consultas/coletor.cjs` no servidor: toda consulta, por rota
 *                   (agregar com `consultas/analisar.mjs`). Custa CPU: não misture com a rodada do veredito.
 *   --cpu-prof-dir  pré-carrega `consultas/perfil-cpu.cjs` e grava o `.cpuprofile` SÓ da janela medida
 *                   (resumir com `consultas/resumir-perfil.mjs`).
 *
 * O QUE SOBE (e derruba no fim, pelo PID de cada filho que ELA iniciou):
 *   - um banco preparado (`preparar.mjs`: migrations reais + semeadura da Fase 2 + assinaturas e
 *     Seeds), COPIADO de novo para cada nível — todo nível parte do mesmo estado;
 *   - um JWKS ES256 local (o `authMiddleware` de produção verifica cada token, AUTH_REQUIRED=1);
 *   - o PROVEDOR FALSO de IA (`provedor-falso.mjs`, ~400 ms STT, ~700 ms MT, 429 acima de 20 RPM) —
 *     `GROQ_BASE_URL` aponta para ele; a Groq real nunca é chamada;
 *   - o servidor (`dist-server/server.cjs`, NODE_ENV=production) com duas sondas pré-carregadas:
 *     `escala/sonda-processo.cjs` (CPU, RSS, event loop) e `dns-falso.cjs` (ver o arquivo).
 *
 * CADA NÍVEL: N VUs (`cenarios.mjs`), cada um com o PRÓPRIO usuário e token e — salvo `--mesmo-ip`
 * (o cenário "escola") — o próprio IP em X-Forwarded-For (TRUST_PROXY=1, como atrás do Fly).
 * Entram escalonados ao longo de `--rampa` s; o que conta é a janela de `--duracao` s DEPOIS da rampa.
 *
 * MEDE por classe e por etapa: p50/p95/p99, req/s, % de erro (5xx, socket, timeout, 4xx
 * inesperado), % de degradação (429/503 da nuvem ou do semáforo de upload — o comportamento
 * desenhado), CPU média do servidor em % de UM núcleo, CPU-ms por requisição, RSS máximo, atraso
 * máximo do event loop do servidor e do GERADOR, e a CPU da MÁQUINA inteira na janela (outro
 * processo competindo aparece aqui; a coluna "outros" é o que não é nem o servidor nem o gerador).
 *
 * VEREDITO por nível contra `slo.json` (via `slo.mjs`): dentro do SLO, e ponto de QUEBRA (p95 de
 * alguma classe acima do SLO ou erro > `quebra.erroPct`). Sai 1 se o PRIMEIRO nível já estiver fora
 * do SLO (o uso do CI), salvo `--sem-veredito`.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import { exportJWK, generateKeyPair, SignJWT } from 'jose'

import { UsuarioVirtual } from './cenarios.mjs'
import { preparar } from './preparar.mjs'
import { subirProvedorFalso } from './provedor-falso.mjs'
import { avaliarNivel, carregarSlo, resumir } from './slo.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const flag = (n) => process.argv.includes(`--${n}`)
const pad = (i) => String(i).padStart(4, '0')
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const niveis = arg('vus', '10,100,1000').split(',').map(Number)
const duracaoS = Number(arg('duracao', 60))
const rampaS = Number(arg('rampa', 15))
const pensarS = Number(arg('pensar', 12))
const PESADOS = Number(arg('pesados', 50))
const MEDIOS = Number(arg('medios', 2000))
const mesmoIp = flag('mesmo-ip')
const porta = Number(arg('porta', 3160))
const bundle = path.resolve(RAIZ, arg('bundle', 'dist-server/server.cjs'))
const tmp = path.resolve(arg('tmp', '') || mkdtempSync(path.join(os.tmpdir(), 'suite-carga-')))
const saida = arg('saida', '')
const slo = carregarSlo(arg('slo', undefined) || undefined)
const coletorDir = arg('coletor-dir', '') && path.resolve(arg('coletor-dir', ''))
const cpuProfDir = arg('cpu-prof-dir', '') && path.resolve(arg('cpu-prof-dir', ''))

if (!existsSync(bundle)) {
  console.error(`bundle não encontrado: ${bundle} (rode npm run build)`)
  process.exit(2)
}
mkdirSync(tmp, { recursive: true })

// ── banco preparado (uma vez) ────────────────────────────────────────────────────────────────
const bancoBase = path.join(tmp, `base-p${PESADOS}-m${MEDIOS}.db`)
if (!existsSync(bancoBase) || flag('repreparar')) {
  const p = await preparar({ db: bancoBase, pesados: PESADOS, medios: MEDIOS })
  console.log(`# banco preparado: ${JSON.stringify(p)}`)
} else console.log(`# banco preparado reaproveitado: ${bancoBase}`)

/** VU i → usuário. 5% pesados (3.000 cartões), o resto médios (150). Mais VUs que usuários = reuso. */
function usuarioDoVu(i) {
  if (PESADOS > 0 && i % 20 === 0) return { id: `u-p-${pad((i / 20) % PESADOS)}`, cartoes: 3000 }
  return { id: `u-m-${pad(i % MEDIOS)}`, cartoes: 150 }
}

// ── JWKS local e tokens ──────────────────────────────────────────────────────────────────────
const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
const jwk = { ...(await exportJWK(publicKey)), kid: 'suite', alg: 'ES256', use: 'sig' }
const portaJwks = porta + 1
const iss = `http://127.0.0.1:${portaJwks}/auth/v1`
const jwks = createServer((req, res) => {
  if (req.url === '/auth/v1/.well-known/jwks.json') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ keys: [jwk] }))
  } else {
    res.statusCode = 404
    res.end()
  }
}).listen(portaJwks, '127.0.0.1')
const tokens = new Map()
async function token(sub) {
  if (!tokens.has(sub))
    tokens.set(
      sub,
      await new SignJWT({ role: 'authenticated', aal: 'aal1' })
        .setProtectedHeader({ alg: 'ES256', kid: 'suite' })
        .setSubject(sub)
        .setAudience('authenticated')
        .setIssuer(iss)
        .setIssuedAt()
        .setExpirationTime('6h')
        .sign(privateKey),
    )
  return tokens.get(sub)
}

// ── provedor falso ───────────────────────────────────────────────────────────────────────────
const portaFalso = porta + 2
const provedor = await subirProvedorFalso({
  porta: portaFalso,
  sttMs: Number(arg('stt-ms', 400)),
  mtMs: Number(arg('mt-ms', 700)),
  rpm: Number(arg('rpm', 20)),
})

// ── servidor ─────────────────────────────────────────────────────────────────────────────────
let filhoAtual = null
async function subirServidor(banco, sonda, rotulo = '') {
  const audioDir = path.join(tmp, `audio-${path.basename(banco, '.db')}`)
  mkdirSync(audioDir, { recursive: true })
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_PATH: path.join(RAIZ, 'node_modules'),
    NODE_ENV: 'production',
    PORT: String(porta),
    HOST: '127.0.0.1',
    DATABASE_URL: `file:${banco.replace(/\\/g, '/')}`,
    AUDIO_DIR: audioDir,
    BACKUP_DIARIO: '0',
    SECRET_KEY: randomBytes(32).toString('hex'),
    TRUST_PROXY: '1',
    LOG_LEVEL: 'error',
    SONDA_ARQUIVO: sonda,
    AUTH_REQUIRED: '1',
    SUPABASE_URL: `http://127.0.0.1:${portaJwks}`,
    GROQ_API_KEY: 'gsk_falso_da_suite_de_carga',
    GROQ_BASE_URL: `http://provedor-falso.test:${portaFalso}/openai/v1`,
    ...(coletorDir ? { COLETOR_DIR: path.join(coletorDir, rotulo) } : {}),
    // Comparar com um bundle ANTERIOR exige as migrations DELE (senão o boot aplica as novas na cópia).
    ...(process.env.MIGRATIONS_DIR ? { MIGRATIONS_DIR: process.env.MIGRATIONS_DIR } : {}),
    ...(cpuProfDir ? { CPU_PROF_DIR: path.join(cpuProfDir, rotulo) } : {}),
  }
  const filho = spawn(
    process.execPath,
    [
      '-r',
      path.join(RAIZ, 'scripts/perf/escala/sonda-processo.cjs'),
      '-r',
      path.join(RAIZ, 'scripts/perf/suite/dns-falso.cjs'),
      ...(coletorDir ? ['-r', path.join(RAIZ, 'scripts/perf/consultas/coletor.cjs')] : []),
      ...(cpuProfDir ? ['-r', path.join(RAIZ, 'scripts/perf/consultas/perfil-cpu.cjs')] : []),
      bundle,
    ],
    { cwd: RAIZ, env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const logs = []
  filho.stdout.on('data', (d) => logs.push(String(d)))
  filho.stderr.on('data', (d) => logs.push(String(d)))
  filho.morreu = null
  filho.on('exit', (c, s) => (filho.morreu = { c, s }))
  filho.logs = logs
  filhoAtual = filho
  const t0 = Date.now()
  for (;;) {
    if (filho.morreu)
      throw new Error(`servidor morreu no boot: ${JSON.stringify(filho.morreu)}\n${logs.join('').slice(-3000)}`)
    try {
      if ((await fetch(`http://127.0.0.1:${porta}/api/ready`, { signal: AbortSignal.timeout(2000) })).ok) break
    } catch {}
    if (Date.now() - t0 > 120_000) throw new Error(`servidor não ficou pronto em 120 s\n${logs.join('').slice(-3000)}`)
    await dormir(300)
  }
  return filho
}
async function derrubar(filho) {
  if (!filho || filho.morreu) return
  filho.kill() // SÓ o processo que esta suíte iniciou, pelo PID do filho
  for (let i = 0; i < 50 && !filho.morreu; i++) await dormir(100)
}
process.on('exit', () => {
  if (filhoAtual && !filhoAtual.morreu) filhoAtual.kill()
})
process.on('SIGINT', () => process.exit(130))

// ── medidas ──────────────────────────────────────────────────────────────────────────────────
function lerSonda(arquivo, de, ate) {
  if (!existsSync(arquivo)) return {}
  const ls = readFileSync(arquivo, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((l) => l.t >= de && l.t <= ate)
  if (!ls.length) return {}
  return {
    rssMaxMB: Math.round(Math.max(...ls.map((l) => l.rss)) / 1048576),
    cpuMediaPct: Math.round((ls.reduce((a, l) => a + l.cpu, 0) / ls.length) * 10) / 10,
    cpuMaxPct: Math.round(Math.max(...ls.map((l) => l.cpu))),
    loopP99MaxMs: Math.max(...ls.map((l) => l.loopP99)),
    loopMaxMs: Math.max(...ls.map((l) => l.loopMax), ...ls.map((l) => l.atraso ?? 0)),
  }
}
const cpuDaMaquina = () =>
  os.cpus().reduce(
    (a, c) => ({
      ocupado: a.ocupado + c.times.user + c.times.sys + c.times.irq,
      total: a.total + c.times.user + c.times.sys + c.times.irq + c.times.idle + c.times.nice,
    }),
    { ocupado: 0, total: 0 },
  )

async function rodarNivel(vus) {
  const banco = path.join(tmp, `nivel-${vus}${mesmoIp ? '-mesmo-ip' : ''}.db`)
  for (const s of ['', '-wal', '-shm']) if (existsSync(banco + s)) rmSync(banco + s)
  copyFileSync(bancoBase, banco)
  const sonda = path.join(tmp, `sonda-${vus}${mesmoIp ? '-mesmo-ip' : ''}.jsonl`)
  if (existsSync(sonda)) rmSync(sonda)
  const rotulo = `nivel-${vus}${mesmoIp ? '-mesmo-ip' : ''}`
  const filho = await subirServidor(banco, sonda, rotulo)
  const profDir = cpuProfDir && path.join(cpuProfDir, rotulo)

  const amostras = []
  let ativo = true
  let inicioJanela = Infinity
  const usuarios = []
  for (let i = 0; i < vus; i++) {
    const u = usuarioDoVu(i)
    usuarios.push(
      new UsuarioVirtual(i, {
        base: `http://127.0.0.1:${porta}`,
        token: await token(u.id),
        usuario: u.id,
        cartoes: u.cartoes,
        ip: mesmoIp ? '203.0.113.50' : `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`,
        pensarS,
        rampaMs: rampaS * 1000,
        amostrar: (a) => a.t >= inicioJanela && ativo && amostras.push(a),
        ativo: () => ativo,
      }),
    )
  }
  const lagGerador = monitorEventLoopDelay({ resolution: 5 })
  const t0 = Date.now()
  const correndo = usuarios.map((u) => u.correr())
  await dormir(rampaS * 1000)
  lagGerador.enable()
  inicioJanela = Date.now()
  if (profDir) writeFileSync(path.join(profDir, 'iniciar'), '')
  const cpuM0 = cpuDaMaquina()
  const cpuG0 = process.cpuUsage()
  await dormir(duracaoS * 1000)
  const fimJanela = Date.now()
  if (profDir) writeFileSync(path.join(profDir, 'parar'), '')
  const cpuM1 = cpuDaMaquina()
  const cpuG = process.cpuUsage(cpuG0)
  ativo = false
  lagGerador.disable()
  await Promise.race([Promise.all(correndo), dormir(45_000)])
  const sondado = lerSonda(sonda, inicioJanela, fimJanela)
  for (let i = 0; profDir && i < 300 && !existsSync(path.join(profDir, 'pronto')); i++) await dormir(100)
  await dormir(coletorDir ? 2500 : 0) // o coletor grava a cada 2 s
  await derrubar(filho)

  const nucleos = os.cpus().length
  const maquinaPct = Math.round(((cpuM1.ocupado - cpuM0.ocupado) / (cpuM1.total - cpuM0.total)) * 1000) / 10
  const geradorPctUmNucleo = Math.round(((cpuG.user + cpuG.system) / 1000 / (fimJanela - inicioJanela)) * 1000) / 10
  const servidorPct = sondado.cpuMediaPct ?? 0
  const outrosNucleos = Math.max(0, (maquinaPct / 100) * nucleos - servidorPct / 100 - geradorPctUmNucleo / 100)

  const agrupar = (chave) => {
    const g = {}
    for (const a of amostras) (g[chave(a)] ??= []).push(a)
    return g
  }
  const req = amostras.length
  const erros = amostras.filter((a) => a.resultado === 'erro')
  const degr = amostras.filter((a) => a.resultado === 'degradacao')
  const porClasse = {}
  for (const [classe, as] of Object.entries(agrupar((a) => a.classe))) {
    const lat =
      classe === 'ia'
        ? as.map((a) => a.sobreProvedorMs).filter((x) => x !== null)
        : as.filter((a) => a.resultado === 'ok').map((a) => a.ms)
    porClasse[classe] = {
      ...resumir(lat),
      requisicoes: as.length,
      erros: as.filter((a) => a.resultado === 'erro').length,
      degradacao: as.filter((a) => a.resultado === 'degradacao').length,
    }
  }
  const porEtapa = {}
  for (const [etapa, as] of Object.entries(agrupar((a) => a.etapa))) {
    const status = {}
    for (const a of as) {
      const k = a.status === 0 ? a.erro : a.codigo ? `${a.status}:${a.codigo}` : String(a.status)
      status[k] = (status[k] ?? 0) + 1
    }
    const ok = as.filter((a) => a.resultado === 'ok')
    porEtapa[etapa] = {
      classe: as[0].classe,
      reqPorSeg: Math.round((as.length / duracaoS) * 100) / 100,
      ...resumir(ok.map((a) => a.ms)),
      ...(as[0].classe === 'ia'
        ? { sobreProvedor: resumir(as.map((a) => a.sobreProvedorMs).filter((x) => x !== null)), admitidas: ok.length }
        : {}),
      status,
    }
  }
  const erroPct = req ? Math.round((erros.length / req) * 10000) / 100 : 0
  const veredito = avaliarNivel({ porClasse, erroPct }, slo)
  const reqPorSeg = Math.round((req / duracaoS) * 10) / 10
  return {
    vus,
    mesmoIp,
    duracaoS,
    rampaS,
    pensarS,
    perfis: {
      captura: usuarios.filter((u) => u.perfil === 'captura').length,
      estudo: usuarios.filter((u) => u.perfil === 'estudo').length,
    },
    requisicoes: req,
    reqPorSeg,
    erroPct,
    degradacaoPct: req ? Math.round((degr.length / req) * 10000) / 100 : 0,
    repeticoesKeepAlive: amostras.filter((a) => a.repetiu).length,
    errosPorTipo: erros.reduce((a, e) => {
      const k = `${e.etapa}:${e.status === 0 ? e.erro : e.status}${e.codigo ? `:${e.codigo}` : ''}`
      a[k] = (a[k] ?? 0) + 1
      return a
    }, {}),
    servidor: {
      ...sondado,
      cpuMsPorReq: reqPorSeg ? Math.round(((servidorPct * 10) / reqPorSeg) * 100) / 100 : null,
    },
    gerador: {
      cpuPctUmNucleo: geradorPctUmNucleo,
      loopMaxMs: Math.round(lagGerador.max / 1e6),
      loopP99Ms: Math.round(lagGerador.percentile(99) / 1e6),
    },
    maquina: { nucleos, ocupadaPct: maquinaPct, outrosNucleos: Math.round(outrosNucleos * 100) / 100 },
    porClasse,
    porEtapa,
    veredito,
    msTotal: Date.now() - t0,
    servidorLogCauda: filho.logs.join('').slice(-1500),
  }
}

// ── execução ─────────────────────────────────────────────────────────────────────────────────
const resultados = []
console.log(
  `# suíte de carga · node ${process.version} · ${os.cpus()[0].model} × ${os.cpus().length} · duracao ${duracaoS}s rampa ${rampaS}s pensar ${pensarS}s mesmoIp=${mesmoIp}`,
)
console.log(
  '| VUs | req/s | erro% | degr.% | leitura p50/p95/p99 | gravação p50/p95/p99 | upload p95 | IA sobre provedor p95 | CPU srv % | CPU-ms/req | RSS MB | loop srv máx | loop ger. máx | máquina % (outros núcleos) | veredito |',
)
console.log('|---:|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|')
const fmt = (r) => (r?.n ? `${r.p50}/${r.p95}/${r.p99}` : '—')
for (const vus of niveis) {
  const r = await rodarNivel(vus)
  resultados.push(r)
  const c = r.porClasse
  console.log(
    `| ${r.vus} | ${r.reqPorSeg} | ${r.erroPct} | ${r.degradacaoPct} | ${fmt(c.leitura)} | ${fmt(c.gravacao)} | ${c.upload?.p95 ?? '—'} | ${c.ia?.p95 ?? '—'} | ${r.servidor.cpuMediaPct} | ${r.servidor.cpuMsPorReq} | ${r.servidor.rssMaxMB} | ${r.servidor.loopMaxMs} | ${r.gerador.loopMaxMs} | ${r.maquina.ocupadaPct} (${r.maquina.outrosNucleos}) | ${r.veredito.dentroDoSlo ? 'dentro' : r.veredito.quebrou ? `QUEBROU: ${r.veredito.falhas.join('; ')}` : `fora: ${r.veredito.falhas.join('; ')}`} |`,
  )
  if (Object.keys(r.errosPorTipo).length) console.log(`#   erros: ${JSON.stringify(r.errosPorTipo)}`)
  if (saida) writeFileSync(saida, JSON.stringify({ slo, niveis: resultados, provedor: resumoProvedor() }, null, 2))
  await dormir(2000)
}
function resumoProvedor() {
  const e = provedor.estatisticas()
  return { stt: e.stt, mt: e.mt, seguradoStt: resumir(e.seguradoMs.stt), seguradoMt: resumir(e.seguradoMs.mt) }
}
console.log(`# provedor falso: ${JSON.stringify(resumoProvedor())}`)
const quebra = resultados.find((r) => r.veredito.quebrou)
console.log(
  `# ponto de quebra: ${quebra ? `${quebra.vus} VUs (${quebra.veredito.falhas.join('; ')})` : `não quebrou até ${Math.max(...niveis)} VUs`}`,
)
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      `### Suíte de carga (${niveis.join(', ')} VUs × ${duracaoS} s)`,
      '',
      '| VUs | req/s | erro % | leitura p95 | gravação p95 | IA sobre provedor p95 | veredito |',
      '|---|---|---|---|---|---|---|',
      ...resultados.map(
        (r) =>
          `| ${r.vus} | ${r.reqPorSeg} | ${r.erroPct} | ${r.porClasse.leitura?.p95 ?? '—'} | ${r.porClasse.gravacao?.p95 ?? '—'} | ${r.porClasse.ia?.p95 ?? '—'} | ${r.veredito.dentroDoSlo ? 'ok' : r.veredito.falhas.join('; ')} |`,
      ),
      '',
    ].join('\n'),
  )
}
jwks.close()
await provedor.fechar()
process.exit(!flag('sem-veredito') && resultados.length && !resultados[0].veredito.dentroDoSlo ? 1 : 0)
