#!/usr/bin/env node
/**
 * RODA A MATRIZ da auditoria de latência (uma rodada de `medir.mjs` por linha, em sequência).
 *
 *   node scripts/perf/latencia-legenda/rodar-matriz.mjs --audio-dir DIR --perfil DIR --saida DIR [--so r1,r3] [--repeticoes 2]
 *
 * `--audio-dir` tem os `conversa_pt_12.json/.wav` e `conversa_en_12.json/.wav` de `montar-audio.mjs`.
 * `--perfil` é o perfil do navegador COM os modelos já em cache (regime estável). Use um caminho
 * CURTO no Windows: o Cache Storage do Chromium falha ("Unexpected internal error") quando o
 * caminho do perfil estoura o MAX_PATH, e aí todo modelo é baixado de novo a cada sessão.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] ? args[i + 1] : d
}
const AUDIO = opt('audio-dir')
const PERFIL = opt('perfil')
const SAIDA = opt('saida')
const SO = opt('so', '')
const REP = Number(opt('repeticoes', 1))
const CANAL = opt('canal', 'chromium')

const pt = path.join(AUDIO, 'conversa_pt_12.json')
const en = path.join(AUDIO, 'conversa_en_12.json')
export const MATRIZ = [
  // [id, áudio, argumentos]
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
  // Modo desempenho (sem parciais): o custo da disputa parcial × final, medido
  ['mic-pt-en-padrao-semparciais', pt, '--modo mic --eu pt-BR --eles en-US --desempenho on'],
  ['sis-en-pt-moonshine-semparciais', en, '--modo sistema --eles en-US --eu pt-BR --desempenho on'],
]

for (let r = 1; r <= REP; r++)
  for (const [id, audio, extra] of MATRIZ) {
    if (SO && !SO.split(',').includes(id)) continue
    const rotulo = REP > 1 ? `${id}.r${r}` : id
    const a = [
      path.join(AQUI, 'medir.mjs'),
      '--rotulo',
      rotulo,
      '--audio',
      audio,
      '--perfil',
      PERFIL,
      '--saida',
      SAIDA,
      '--canal',
      CANAL,
      '--teto',
      '240',
      ...extra.split(' '),
    ]
    console.log('>>', rotulo)
    const res = spawnSync(process.execPath, a, { stdio: 'inherit', timeout: 15 * 60_000 })
    if (res.status !== 0) console.log('!! falhou', rotulo, res.status, res.error?.message)
  }
