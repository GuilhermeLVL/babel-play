#!/usr/bin/env node
/**
 * MEMÓRIA POR UPLOAD — auditoria de prontidão, Fase 2, item 3.
 *
 *   node scripts/perf/escala/upload-memoria.mjs --bundle=<server.cjs> --db=<CÓPIA semeada> \
 *        [--porta=3150] [--niveis=1,2,4,8] [--saida=x.json]
 *
 * Sobe o servidor de produção (bundle, NODE_ENV=production, self-host: o corpo é lido do mesmo jeito
 * nos dois modos — no público o token é conferido ANTES, GAP-015) com a sonda de processo a 50 ms, e
 * dispara ondas de N uploads SIMULTÂNEOS:
 *
 *   A. POST /api/sessions/:id/audio  corpo de 120 MB (teto de `sessions.ts:206`), WAV válido
 *      (cabeçalho RIFF/WAVE + silêncio) — passa pela detecção de tipo e vai ao armazenamento.
 *   B. POST /api/ai/stt              corpo de 25 MB (teto de `ai.ts:24`), sem chave de IA no
 *      ambiente — mede ONDE a recusa acontece (status + corpo) e se o RSS já subiu o corpo inteiro.
 *
 * Por onda: RSS em repouso antes, PICO de RSS durante, status de cada resposta, tempo total.
 * O servidor é encerrado pelo PID do filho ao final.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { request } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`))
  return a ? a.slice(n.length + 3) : d
}
const bundle = arg('bundle', '')
const banco = arg('db', '')
if (!bundle || !banco) {
  console.error('uso: node scripts/perf/escala/upload-memoria.mjs --bundle=<server.cjs> --db=<cópia.db>')
  process.exit(2)
}
const porta = Number(arg('porta', 3150))
const niveis = arg('niveis', '1,2,4,8').split(',').map(Number)
const saida = arg('saida', '')
const RAIZ = path.resolve(import.meta.dirname, '..', '..', '..')
const tmp = path.dirname(path.resolve(banco))
const sonda = path.join(tmp, `sonda-upload-${porta}.jsonl`)
if (existsSync(sonda)) rmSync(sonda)
const audioDir = path.join(tmp, `audio-upload-${porta}`)
rmSync(audioDir, { recursive: true, force: true })
mkdirSync(audioDir, { recursive: true })
const base = `http://127.0.0.1:${porta}`

const filho = spawn(
  process.execPath,
  ['-r', path.join(RAIZ, 'scripts/perf/escala/sonda-processo.cjs'), path.resolve(bundle)],
  {
    cwd: RAIZ,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      NODE_PATH: path.join(RAIZ, 'node_modules'),
      NODE_ENV: 'production',
      AUTH_REQUIRED: '0',
      SELF_HOST: '1',
      TRUST_PROXY: '1',
      PORT: String(porta),
      HOST: '127.0.0.1',
      DATABASE_URL: `file:${path.resolve(banco).replace(/\\/g, '/')}`,
      AUDIO_DIR: audioDir,
      BACKUP_DIARIO: '0',
      SECRET_KEY: randomBytes(32).toString('hex'), // exigido em produção (server/crypto.ts); descartável
      LOG_LEVEL: 'error',
      SONDA_ARQUIVO: sonda,
      SONDA_MS: '50',
      /* Semáforo de corpos grandes (ADR 0009): no self-host todo upload é do MESMO usuário, então com
         o padrão (1 por usuário) uma onda de 4 mede 1 upload + 3 recusas 429. Para medir 4 corpos
         EM VOO de verdade, rode com UPLOADS_GRANDES_POR_USUARIO=4 UPLOADS_GRANDES_POR_PROCESSO=4. */
      ...(process.env.UPLOADS_GRANDES_POR_USUARIO
        ? { UPLOADS_GRANDES_POR_USUARIO: process.env.UPLOADS_GRANDES_POR_USUARIO }
        : {}),
      ...(process.env.UPLOADS_GRANDES_POR_PROCESSO
        ? { UPLOADS_GRANDES_POR_PROCESSO: process.env.UPLOADS_GRANDES_POR_PROCESSO }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
const logs = []
filho.stdout.on('data', (d) => logs.push(String(d)))
filho.stderr.on('data', (d) => logs.push(String(d)))
let morreu = null
filho.on('exit', (c, s) => (morreu = { c, s }))
process.on('exit', () => {
  writeFileSync(path.join(tmp, `servidor-upload-${porta}.log`), logs.join(''))
  if (!morreu) filho.kill()
})
console.log(`# servidor PID ${filho.pid} em ${base}`)
for (const t0 = Date.now(); ; ) {
  if (morreu) {
    console.error('morreu no boot', logs.join('').slice(-2000))
    process.exit(1)
  }
  try {
    if ((await fetch(`${base}/api/ready`)).ok) break
  } catch {}
  if (Date.now() - t0 > 120_000) process.exit(1)
  await new Promise((r) => setTimeout(r, 300))
}

/** WAV PCM 16 kHz mono 16 bit: cabeçalho de 44 bytes honesto + silêncio. */
function wav(bytes) {
  const b = Buffer.alloc(bytes)
  b.write('RIFF', 0)
  b.writeUInt32LE(bytes - 8, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(16000, 24)
  b.writeUInt32LE(32000, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(bytes - 44, 40)
  return b
}
const CORPO_AUDIO = wav(120 * 1024 * 1024 - 1024) // logo abaixo do teto de 120mb do express.raw
const CORPO_STT = wav(25 * 1024 * 1024 - 1024)

function enviar(caminho, corpo) {
  return new Promise((resolve) => {
    const t = performance.now()
    const req = request(
      `${base}${caminho}`,
      {
        method: 'POST',
        headers: { 'content-type': 'audio/wav', 'content-length': corpo.length },
      },
      (res) => {
        let txt = ''
        res.on('data', (d) => (txt += d))
        res.on('end', () =>
          resolve({ status: res.statusCode, ms: Math.round(performance.now() - t), corpo: txt.slice(0, 160) }),
        )
      },
    )
    req.on('error', (e) =>
      resolve({ status: 'erro', ms: Math.round(performance.now() - t), corpo: String(e.message).slice(0, 120) }),
    )
    req.end(corpo)
  })
}
const sondaEntre = (de, ate) =>
  existsSync(sonda)
    ? readFileSync(sonda, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l))
        .filter((l) => l.t >= de && l.t <= ate)
    : []
const MB = (b) => Math.round(b / 1048576)

async function repouso() {
  // espera o RSS assentar (GC) antes da próxima onda
  await new Promise((r) => setTimeout(r, 4000))
  const ls = sondaEntre(Date.now() - 1000, Date.now())
  return ls.length ? MB(ls.at(-1).rss) : null
}

const resultados = []
let sid = 0
for (const [nome, caminho, corpo] of [
  ['audio 120 MB', () => `/api/sessions/s-local-owner-${sid++}/audio`, CORPO_AUDIO],
  ['stt 25 MB', () => '/api/ai/stt', CORPO_STT],
]) {
  for (const n of niveis) {
    if (morreu) break
    const antes = await repouso()
    const de = Date.now()
    const rs = await Promise.all(Array.from({ length: n }, () => enviar(caminho(), corpo)))
    await new Promise((r) => setTimeout(r, 300))
    const ls = sondaEntre(de, Date.now())
    const pico = ls.length ? Math.max(...ls.map((l) => l.rss)) : null
    const picoAb = ls.length ? Math.max(...ls.map((l) => l.ab)) : null
    const linha = {
      rota: nome,
      simultaneos: n,
      rssRepousoAntesMB: antes,
      rssPicoMB: pico && MB(pico),
      deltaMB: pico && antes != null ? MB(pico) - antes : null,
      deltaPorUploadMB: pico && antes != null ? Math.round((MB(pico) - antes) / n) : null,
      arrayBuffersPicoMB: picoAb && MB(picoAb),
      loopMaxMs: ls.length ? Math.max(...ls.map((l) => l.loopMax)) : null,
      status: rs.map((r) => r.status),
      msMax: Math.max(...rs.map((r) => r.ms)),
      amostraResposta: rs[0]?.corpo,
    }
    resultados.push(linha)
    console.log(JSON.stringify(linha))
  }
}
if (morreu) console.error('SERVIDOR MORREU:', morreu)
if (saida)
  writeFileSync(saida, JSON.stringify({ node: process.version, em: new Date().toISOString(), resultados }, null, 2))
process.exit(0)
