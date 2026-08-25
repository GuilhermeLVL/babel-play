#!/usr/bin/env node
/**
 * Baixa os pesos dos modelos locais (Whisper tiny + opus-mt) para `public/models/`, no layout
 * que o transformers.js espera (`public/models/<org>/<repo>/<arquivo>`). Serve para SELF-HOST:
 * ligue com `VITE_SELF_HOST_MODELS=1` no build e o app carrega os pesos do MESMO domínio, sem
 * depender do Hub em runtime nem da partição do Cache Storage.
 *
 * Uso:  node scripts/fetch-models.mjs
 *       node scripts/fetch-models.mjs --onnx-dtype q4,fp32,int8   (filtra os .onnx por dtype)
 *
 * Idempotente: pula arquivos que já existem. `public/models/` é gitignored (Docker assa na imagem).
 */
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkModelHash } from './modelHash.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'models')
const HASHES_FILE = join(ROOT, 'scripts', 'models-hashes.json')

// S-09: manifesto de integridade (TOFU). Carregado na entrada, atualizado com hashes novos ao fim.
let manifest = {}
let manifestDirty = false
try { manifest = JSON.parse(await readFile(HASHES_FILE, 'utf8')) } catch { manifest = {} }

const MODELS = [
  'onnx-community/whisper-tiny',
  'Xenova/opus-mt-en-ROMANCE',
  'Xenova/opus-mt-ROMANCE-en',
]

// Só precisamos dos dtypes que os workers realmente usam (encoder fp32, decoder q4 no Whisper;
// int8/fp16 no opus-mt). Baixar todos os .onnx desperdiça centenas de MB. Ajuste via flag.
const dtypeArg = process.argv.indexOf('--onnx-dtype')
const KEEP_DTYPES = dtypeArg > -1 && process.argv[dtypeArg + 1]
  ? process.argv[dtypeArg + 1].split(',')
  : ['fp32', 'q4', 'int8', 'fp16']

function keepOnnx(path) {
  if (!path.endsWith('.onnx') && !path.endsWith('.onnx_data')) return true // configs/tokenizers sempre
  return KEEP_DTYPES.some((d) => path.includes(`_${d}.`) || path.includes(`_${d}_`) || path.endsWith(`_${d}.onnx`))
}

async function exists(p) {
  try { await stat(p); return true } catch { return false }
}

async function listRepoFiles(id) {
  const url = `https://huggingface.co/api/models/${id}/tree/main?recursive=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`tree ${id}: HTTP ${res.status}`)
  const tree = await res.json()
  return tree.filter((e) => e.type === 'file').map((e) => e.path)
}

async function download(id, path) {
  const dest = join(OUT, id, path)
  if (await exists(dest)) return { skipped: true }
  const url = `https://huggingface.co/${id}/resolve/main/${path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${id}/${path}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  // S-09: verifica integridade contra o manifesto. Mismatch = adulteração/mudança upstream → falha.
  const key = `${id}/${path}`
  const { status, hex } = checkModelHash(key, buf, manifest)
  if (status === 'mismatch') {
    throw new Error(`HASH NÃO BATE (${key}) — possível adulteração; esperado ${manifest[key].slice(0, 12)}…, veio ${hex.slice(0, 12)}…`)
  }
  if (status === 'new') { manifest[key] = hex; manifestDirty = true }
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  return { bytes: buf.length, pinned: status === 'ok' }
}

async function main() {
  let total = 0
  for (const id of MODELS) {
    process.stdout.write(`\n📦 ${id}\n`)
    const files = (await listRepoFiles(id)).filter(keepOnnx)
    for (const path of files) {
      try {
        const r = await download(id, path)
        if (r.skipped) { process.stdout.write(`   · ${path} (já existe)\n`); continue }
        total += r.bytes
        process.stdout.write(`   ✓ ${path} (${(r.bytes / 1e6).toFixed(1)} MB)\n`)
      } catch (e) {
        process.stdout.write(`   ✗ ${path} — ${e.message}\n`)
      }
    }
  }
  // S-09: persiste os hashes novos e avisa o operador a commitar (aí vira pinning real).
  if (manifestDirty) {
    await writeFile(HASHES_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    process.stdout.write('\n🔒 Hashes de integridade fixados em scripts/models-hashes.json — REVISE e COMMITE\n')
    process.stdout.write('   (a partir daí, um peso que mudar upstream faz o build falhar).\n')
  }
  process.stdout.write(`\n✅ Concluído. ~${(total / 1e6).toFixed(1)} MB novos em public/models/\n`)
  process.stdout.write('   Ligue o self-host com VITE_SELF_HOST_MODELS=1 no build.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
