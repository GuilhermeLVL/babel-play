#!/usr/bin/env node
/**
 * TEMPO DE ARRANQUE DO SERVIDOR — do `spawn` até `/api/health` responder 200.
 *
 * Mede o que o usuário sente num restart e o que o orquestrador espera num deploy: o boot
 * roda migração, confere configuração e só então escuta. Cinco execuções, mediana e máximo,
 * porque a primeira paga cache frio do sistema de arquivos.
 *
 *   node scripts/perf/arranque.mjs [--porta=3102] [--execucoes=5] [--cmd="node dist-server/server.cjs"]
 *
 * Herda o ambiente do processo: passe `DATABASE_URL`, `AUDIO_DIR`, `ERROS_DIR`, `AUTH_REQUIRED=0`
 * apontando para uma CÓPIA do banco. A porta é sobrescrita pelo `--porta`.
 */
import { spawn } from 'node:child_process'

const arg = (nome, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const porta = arg('porta', '3102')
const execucoes = Number(arg('execucoes', 5))
const cmd = arg('cmd', 'node dist-server/server.cjs').split(' ')

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function umaVez() {
  const t0 = performance.now()
  const filho = spawn(cmd[0], cmd.slice(1), { env: { ...process.env, PORT: porta, HOST: '127.0.0.1' }, stdio: 'ignore' })
  let ms = -1
  const teto = 60_000
  while (performance.now() - t0 < teto) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/api/health`)
      if (r.status === 200) { ms = Math.round(performance.now() - t0); break }
    } catch { /* ainda não escuta */ }
    await dormir(25)
  }
  filho.kill('SIGTERM')
  await new Promise((r) => { filho.on('exit', r); setTimeout(() => { filho.kill('SIGKILL'); r() }, 5000) })
  await dormir(300)
  return ms
}

const tempos = []
for (let i = 0; i < execucoes; i++) {
  const ms = await umaVez()
  tempos.push(ms)
  console.log(`execução ${i + 1}: ${ms} ms`)
}
const ordenados = [...tempos].sort((a, b) => a - b)
console.log(`\n# arranque — ${cmd.join(' ')} — ${execucoes} execuções — ${process.version}`)
console.log(`mediana: ${ordenados[Math.floor(ordenados.length / 2)]} ms | mínimo: ${ordenados[0]} ms | máximo: ${ordenados[ordenados.length - 1]} ms`)
