#!/usr/bin/env node
/**
 * Roda a MESMA `medir.mjs` (mesmas linhas da MATRIZ de `rodar-matriz.mjs`) alternando a build ANTES
 * e a DEPOIS no mesmo endereço (127.0.0.1:4176, mesmo perfil/cache), para que deriva da máquina
 * (GPU, carga) caia igual nos dois lados.
 *
 *   node intercalar.mjs --repo <worktree> --audio-dir DIR --perfil DIR --saida DIR --so id1,id2 [--repeticoes 2] [--lados antes,depois]
 *
 * Os builds ficam em $TEMP/latp/{antes,depois}/dist (cópia do servidor estático ao lado).
 */
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] ? args[i + 1] : d
}
const REPO = opt('repo')
const AUDIO = opt('audio-dir')
const PERFIL = opt('perfil')
const SAIDA = opt('saida')
const SO = opt('so', '').split(',').filter(Boolean)
const REP = Number(opt('repeticoes', 1))
const LADOS = opt('lados', 'antes,depois').split(',')
const BASE = path.join(process.env.TEMP, 'latp')

const pt = path.join(AUDIO, 'conversa_pt_12.json')
const en = path.join(AUDIO, 'conversa_en_12.json')
// Cópia literal das linhas de scripts/perf/latencia-legenda/rodar-matriz.mjs (MATRIZ).
const MATRIZ = [
  ['sis-en-pt-moonshine', en, '--modo sistema --eles en-US --eu pt-BR'],
  ['sis-detectar-en-padrao', en, '--modo sistema --eles auto --eu pt-BR'],
  ['mic-pt-en-padrao', pt, '--modo mic --eu pt-BR --eles en-US'],
  ['mic-pt-en-small-wasm', pt, '--modo mic --eu pt-BR --eles en-US --device wasm'],
  ['mic-pt-en-base-wasm', pt, '--modo mic --eu pt-BR --eles en-US --sem-webgpu --device wasm'],
  ['mic-pt-en-base-webgpu', pt, '--modo mic --eu pt-BR --eles en-US --sem-webgpu'],
  ['mic-pt-en-tiny', pt, '--modo mic --eu pt-BR --eles en-US --qualidade fast'],
  ['mic-en-pt-padrao', en, '--modo mic --eu en-US --eles pt-BR'],
  ['mic-detectar-pt', pt, '--modo mic --eu auto --eles en-US'],
  ['sis-en-pt-moonshine-headless', en, '--modo sistema --eles en-US --eu pt-BR --headless'],
  ['mic-pt-en-padrao-headless', pt, '--modo mic --eu pt-BR --eles en-US --headless'],
  ['mic-pt-en-padrao-semparciais', pt, '--modo mic --eu pt-BR --eles en-US --desempenho on'],
  ['sis-en-pt-moonshine-semparciais', en, '--modo sistema --eles en-US --eu pt-BR --desempenho on'],
]

const esperarPorta = async (url) => {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('servidor não subiu')
}

for (let r = 1; r <= REP; r++)
  for (const [id, audio, extra] of MATRIZ) {
    if (SO.length && !SO.includes(id)) continue
    for (const lado of LADOS) {
      const srv = spawn(
        process.execPath,
        [path.join(BASE, lado, 'tests', 'e2e-estatica', '_servidor-estatico.mjs'), '4176'],
        {
          stdio: 'ignore',
        },
      )
      await esperarPorta('http://127.0.0.1:4176/')
      const rotulo = `${id}.r${r}`
      console.log('>>', lado, rotulo)
      const res = spawnSync(
        process.execPath,
        [
          path.join(REPO, 'scripts/perf/latencia-legenda/medir.mjs'),
          '--rotulo',
          rotulo,
          '--audio',
          audio,
          '--perfil',
          PERFIL,
          '--saida',
          path.join(SAIDA, lado),
          '--canal',
          'chromium',
          '--teto',
          '240',
          ...extra.split(' '),
        ],
        { stdio: 'inherit', timeout: 10 * 60_000, cwd: REPO },
      )
      if (res.status !== 0) console.log('!! falhou', lado, rotulo, res.status, res.error?.message)
      srv.kill()
      await new Promise((r) => srv.once('exit', r))
    }
  }
console.log('FIM')
