#!/usr/bin/env node
/**
 * Baixa os pesos dos modelos locais (Whisper tiny + Moonshine + opus-mt + WeSpeaker) para `public/models/`, no layout
 * que o transformers.js espera (`public/models/<org>/<repo>/<arquivo>`). Serve para SELF-HOST:
 * ligue com `VITE_SELF_HOST_MODELS=1` no build e o app carrega os pesos do MESMO domínio, sem
 * depender do Hub em runtime nem da partição do Cache Storage.
 *
 * Uso:  node scripts/fetch-models.mjs
 *       node scripts/fetch-models.mjs --onnx-dtype q4,fp32,int8   (troca o dtype de cada modelo por estes)
 *       node scripts/fetch-models.mjs --modelo onnx-community/moonshine-base-ONNX   (só este)
 *
 * Idempotente: pula arquivos que já existem. `public/models/` é gitignored (Docker assa na imagem).
 */
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkModelHash } from './modelHash.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'models')
const HASHES_FILE = join(ROOT, 'scripts', 'models-hashes.json')

// S-09: manifesto de integridade (TOFU). Carregado em `main`, atualizado com hashes novos ao fim.
let manifest = {}
let manifestDirty = false

/**
 * Os modelos e o dtype que o WORKER de cada um pede — a fonte da seleção dos `.onnx`. Mudou o dtype
 * num worker, mude aqui: o teste `tests/fetch-models-selecao.test.ts` fixa o par.
 *
 * `modulos` são os grafos que o transformers.js abre para a tarefa (seq2seq: encoder + decoder
 * merged; o WeSpeaker é um grafo só, `model`).
 */
export const MODELOS = [
  // src/gateway/adapters/whisperWorker.ts — preset `hybrid`: o encoder do Whisper sente a
  // quantização, o decoder aguenta 4 bits.
  {
    id: 'onnx-community/whisper-tiny',
    modulos: ['encoder_model', 'decoder_model_merged'],
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
  },
  // STT local de INGLÊS (src/gateway/adapters/moonshine.ts, `DTYPE_MOONSHINE`): base na rota
  // padrão, tiny no "rápido". Sempre q8 — a régua antiga traria fp32/q4/int8/fp16 de três grafos
  // de decoder, ~1 GB para usar 63 MB.
  { id: 'onnx-community/moonshine-base-ONNX', modulos: ['encoder_model', 'decoder_model_merged'], dtype: 'q8' },
  { id: 'onnx-community/moonshine-tiny-ONNX', modulos: ['encoder_model', 'decoder_model_merged'], dtype: 'q8' },
  // src/gateway/adapters/mtWorker.ts — `MT_DTYPES` começa no q8: é o único que o ORT da versão
  // hospedada aceita (int8/q4 falham na sessão, medido em 2026-08-26). Os outros ficam de reserva
  // para quem pedir com `--onnx-dtype`.
  { id: 'Xenova/opus-mt-en-ROMANCE', modulos: ['encoder_model', 'decoder_model_merged'], dtype: 'q8' },
  { id: 'Xenova/opus-mt-ROMANCE-en', modulos: ['encoder_model', 'decoder_model_merged'], dtype: 'q8' },
  // Identificação de voz (src/lib/speakerIdWorker.ts, q8). Estava FORA desta lista: em self-host
  // (VITE_SELF_HOST_MODELS=1, Docker) os pesos caíam no fallback remoto do HF Hub e, sem internet
  // no primeiro uso, `speakerIdStatus` virava `unavailable` — a identificação automática de
  // falantes simplesmente não existia no deploy offline.
  { id: 'onnx-community/wespeaker-voxceleb-resnet34-LM', modulos: ['model'], dtype: 'q8' },
]

/* O NOME EM DISCO DE CADA DTYPE no transformers.js. A armadilha que motivou esta tabela: o fp32 é o
   arquivo SEM sufixo (`encoder_model.onnx`) — não existe `_fp32` no Hub — e o q8 é `_quantized`,
   não `_q8`. O filtro antigo procurava `_fp32.` e `_q8`; o self-host baixava o decoder q4 do Whisper
   e pulava o encoder fp32 que o `hybrid` abre, e tudo PARECIA baixado. */
const SUFIXO_DO_DTYPE = {
  fp32: '',
  fp16: '_fp16',
  q8: '_quantized',
  int8: '_int8',
  uint8: '_uint8',
  q4: '_q4',
  q4f16: '_q4f16',
  bnb4: '_bnb4',
}

/** Os `.onnx` que `dtype` (um só, ou um por módulo) abre para estes módulos. */
export function arquivosOnnxDoDtype(modulos, dtype) {
  return modulos.map((m) => {
    const d = typeof dtype === 'string' ? dtype : dtype[m]
    if (!(d in SUFIXO_DO_DTYPE)) throw new Error(`dtype desconhecido para ${m}: ${d}`)
    return `onnx/${m}${SUFIXO_DO_DTYPE[d]}.onnx`
  })
}

const ehPeso = (path) => path.endsWith('.onnx') || /\.onnx_data(_\d+)?$/.test(path)
/** `x.onnx_data` (ou `x.onnx_data_1`…) é o peso externo de `x.onnx`. */
const donoDoPeso = (path) => path.replace(/_data(_\d+)?$/, '')

/**
 * Quais arquivos do repo `id` baixar. Configs/tokenizers vêm sempre; dos pesos, só os do dtype do
 * modelo (`MODELOS`) e os `.onnx_data` que os acompanham. `dtypesManuais` (a flag `--onnx-dtype`)
 * troca a régua por "estes dtypes em qualquer módulo".
 */
export function selecionarArquivos(id, arquivosDoRepo, dtypesManuais = null) {
  let querido
  if (dtypesManuais) {
    const sufixos = dtypesManuais.map((d) => {
      if (!(d in SUFIXO_DO_DTYPE)) throw new Error(`dtype desconhecido: ${d}`)
      return SUFIXO_DO_DTYPE[d]
    })
    // Sufixo vazio (fp32) casa com `x.onnx` desde que `x` não termine num sufixo de outro dtype.
    const outros = Object.values(SUFIXO_DO_DTYPE).filter(Boolean)
    querido = (onnx) => {
      const base = onnx.replace(/\.onnx$/, '')
      const sufixoDoArquivo = outros.find((s) => base.endsWith(s)) ?? ''
      return sufixos.includes(sufixoDoArquivo)
    }
  } else {
    const modelo = MODELOS.find((m) => m.id === id)
    if (!modelo) throw new Error(`modelo sem dtype declarado em MODELOS: ${id}`)
    const lista = new Set(arquivosOnnxDoDtype(modelo.modulos, modelo.dtype))
    querido = (onnx) => lista.has(onnx)
  }
  return arquivosDoRepo.filter((p) => !ehPeso(p) || querido(donoDoPeso(p)))
}
async function exists(p) {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
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
    throw new Error(
      `HASH NÃO BATE (${key}) — possível adulteração; esperado ${manifest[key].slice(0, 12)}…, veio ${hex.slice(0, 12)}…`,
    )
  }
  if (status === 'new') {
    manifest[key] = hex
    manifestDirty = true
  }
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  return { bytes: buf.length, pinned: status === 'ok' }
}

async function main() {
  try {
    manifest = JSON.parse(await readFile(HASHES_FILE, 'utf8'))
  } catch {
    manifest = {}
  }
  const dtypeArg = process.argv.indexOf('--onnx-dtype')
  const dtypesManuais = dtypeArg > -1 && process.argv[dtypeArg + 1] ? process.argv[dtypeArg + 1].split(',') : null
  const modeloArg = process.argv.indexOf('--modelo')
  const soModelo = modeloArg > -1 ? process.argv[modeloArg + 1] : null
  let total = 0
  for (const { id } of MODELOS) {
    if (soModelo && id !== soModelo) continue
    process.stdout.write(`\n📦 ${id}\n`)
    const files = selecionarArquivos(id, await listRepoFiles(id), dtypesManuais)
    for (const path of files) {
      try {
        const r = await download(id, path)
        if (r.skipped) {
          process.stdout.write(`   · ${path} (já existe)\n`)
          continue
        }
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

// Só roda quando chamado como script; importado (o teste da seleção), só expõe as funções.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
