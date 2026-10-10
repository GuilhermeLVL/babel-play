/* global window -- dentro de page.evaluate, que roda no navegador */
/**
 * BANCADA DE FALA NO NAVEGADOR — dirige um Chrome de verdade (WebGPU real) pela página `pagina.html`
 * e grava, por (sistema, conjunto), o texto CRU e o tempo de cada fala. O WER sai do `pontuar.mjs`.
 *
 * Um sistema por vez: abre o Chrome, carrega UM modelo, passa os conjuntos, fecha o Chrome.
 *
 * Sistemas (`--sistemas`, separados por vírgula): as chaves de SISTEMAS abaixo.
 * Conjuntos (`--conjuntos`): fleurs_pt, fleurs_en, fleurs_es (de `preparar-audio.py`).
 *
 * Onde ficam as coisas (tudo FORA do git, em BANCADA_DIR = %LOCALAPPDATA%/babel-bancada):
 *   navegador/stt/…              as falas e os manifestos
 *   navegador/perfil-chrome/     o perfil do Chrome: é nele que o transformers.js guarda os pesos
 *   navegador/resultados/*.json  o bruto de cada (sistema, conjunto); retomável
 *   cache/modelos/parakeet/…     os ONNX do Parakeet (baixados aqui em Node e servidos em /modelos)
 *
 * Uso:
 *   node scripts/eval-fala/bancada/navegador/rodar.mjs --sistemas whisper-base:hybrid:webgpu --conjuntos fleurs_pt
 *   … --limite 10 (iterar rápido)  … --refazer (ignora o bruto guardado)  … --sem-janela (headless)
 *   … --sonda (só abre o Chrome e imprime o adaptador WebGPU)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

import { baixarModelo } from '../comum.mjs'
import { BANCADA_DIR, subirServidor } from './servidor.mjs'

const args = process.argv.slice(2)
const opt = (n, p) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] ? args[i + 1] : p
}
const flag = (n) => args.includes(`--${n}`)

const PORTA = Number(opt('porta', '4517'))
const RAIZ = path.join(BANCADA_DIR, 'navegador')
const PERFIL = path.join(RAIZ, 'perfil-chrome')
const RESULTADOS = path.join(RAIZ, 'resultados')
const LIMITE = Number(opt('limite', '0')) || 0
const THREADS = Number(opt('threads', '4'))

// Revisões fixadas: as de `src/gateway/revisoesDosModelos.ts` para o que o app já usa.
const REV = {
  'onnx-community/whisper-tiny': 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7',
  'onnx-community/whisper-base': '1846881b6b3a3024392c1eea3ad983695bc23925',
  'onnx-community/whisper-small': '36050c46d777d46dc4b5f43f6d90574fc38f8732',
  'onnx-community/moonshine-base-ONNX': 'b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad',
  'onnx-community/moonshine-tiny-ONNX': 'a6da1241cd305dcd64eab1edbd615f2bb9aabb95',
  'Workmind/moonshine-streaming-small-ONNX': 'bfd8beba2893ce694f67ce7c7424843ba3ae91eb',
}
const whisper = (tam, dtype, device) => ({
  tipo: 'transformers',
  modelo: `onnx-community/whisper-${tam}`,
  revisao: REV[`onnx-community/whisper-${tam}`],
  dtype,
  device,
  sessaoBasica: dtype === 'q8',
})
const PARAKEET_INT8 = {
  repo: 'istupakov/parakeet-tdt-0.6b-v3-onnx',
  rev: '8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce',
  pasta: 'v3-int8',
}
const PARAKEET_FP16 = {
  repo: 'striimit/parakeet-tdt-0.6b-v3-webgpu',
  rev: 'd233168ffeab292a6b3d2379a5b2d5934e1df8a7',
  pasta: 'v3-fp16-webgpu',
}

const SISTEMAS = {
  // Pergunta 1: fp16 × fp32 no encoder do Whisper, no WebGPU (rotas `hybrid-fp16` e `hybrid` de sttRouter.ts).
  'whisper-base:hybrid:webgpu': whisper('base', 'hybrid', 'webgpu'),
  'whisper-base:hybrid-fp16:webgpu': whisper('base', 'hybrid-fp16', 'webgpu'),
  'whisper-base:q8:wasm': whisper('base', 'q8', 'wasm'),
  'whisper-base:hybrid:wasm': whisper('base', 'hybrid', 'wasm'),
  // Controle: o MESMO encoder fp16 fora da GPU — separa "o arquivo fp16 é ruim" de "o WebGPU erra em fp16".
  'whisper-base:hybrid-fp16:wasm': whisper('base', 'hybrid-fp16', 'wasm'),
  'whisper-tiny:hybrid:webgpu': whisper('tiny', 'hybrid', 'webgpu'),
  'whisper-tiny:hybrid-fp16:webgpu': whisper('tiny', 'hybrid-fp16', 'webgpu'),
  'whisper-small:hybrid:webgpu': whisper('small', 'hybrid', 'webgpu'),
  // Pergunta 3: Moonshine de hoje × Moonshine v2 (export de terceiro que a biblioteca abre como v1).
  'moonshine-base:q8:wasm': {
    tipo: 'transformers',
    moonshine: true,
    modelo: 'onnx-community/moonshine-base-ONNX',
    revisao: REV['onnx-community/moonshine-base-ONNX'],
    dtype: 'q8',
    device: 'wasm',
    sessaoBasica: true,
  },
  'moonshine-v2-small:q8:wasm': {
    tipo: 'transformers',
    moonshine: true,
    multiploDe80: true,
    modelo: 'Workmind/moonshine-streaming-small-ONNX',
    revisao: REV['Workmind/moonshine-streaming-small-ONNX'],
    dtype: 'q8',
    device: 'wasm',
    sessaoBasica: true,
  },
  // Pergunta 2: Parakeet TDT 0.6b v3 no onnxruntime-web direto.
  // O mel é o `nemo128_conv.onnx` (grafo com Conv, do onnx-asr, redistribuído pelo striimit): o
  // `nemo128.onnx` do export original usa STFT e NÃO abre no onnxruntime-web (ver `parakeet-v3-stft`).
  'parakeet-v3:int8:wasm': {
    tipo: 'parakeet',
    device: 'wasm',
    arquivos: {
      pre: [PARAKEET_FP16, 'nemo128_conv.onnx'],
      encoder: [PARAKEET_INT8, 'encoder-model.int8.onnx'],
      decoder: [PARAKEET_INT8, 'decoder_joint-model.int8.onnx'],
      vocab: [PARAKEET_INT8, 'vocab.txt'],
    },
  },
  // O mel do export original (com o operador STFT). Fica aqui para registrar ONDE quebra no navegador.
  'parakeet-v3-stft:int8:wasm': {
    tipo: 'parakeet',
    device: 'wasm',
    arquivos: {
      pre: [PARAKEET_INT8, 'nemo128.onnx'],
      encoder: [PARAKEET_INT8, 'encoder-model.int8.onnx'],
      decoder: [PARAKEET_INT8, 'decoder_joint-model.int8.onnx'],
      vocab: [PARAKEET_INT8, 'vocab.txt'],
    },
  },
  'parakeet-v3:int8:webgpu': {
    tipo: 'parakeet',
    device: 'webgpu',
    arquivos: {
      pre: [PARAKEET_FP16, 'nemo128_conv.onnx'],
      encoder: [PARAKEET_INT8, 'encoder-model.int8.onnx'],
      decoder: [PARAKEET_INT8, 'decoder_joint-model.int8.onnx'],
      vocab: [PARAKEET_INT8, 'vocab.txt'],
    },
  },
  'parakeet-v3:fp16:webgpu': {
    tipo: 'parakeet',
    device: 'webgpu',
    arquivos: {
      pre: [PARAKEET_FP16, 'nemo128_conv.onnx'],
      encoder: [PARAKEET_FP16, 'encoder-model.fp16.onnx'],
      decoder: [PARAKEET_FP16, 'decoder_joint-model.onnx'],
      vocab: [PARAKEET_FP16, 'vocab.txt'],
    },
  },
  'parakeet-v3:fp16:wasm': {
    tipo: 'parakeet',
    device: 'wasm',
    arquivos: {
      pre: [PARAKEET_FP16, 'nemo128_conv.onnx'],
      encoder: [PARAKEET_FP16, 'encoder-model.fp16.onnx'],
      decoder: [PARAKEET_FP16, 'decoder_joint-model.onnx'],
      vocab: [PARAKEET_FP16, 'vocab.txt'],
    },
  },
}

const lerJsonl = (p) =>
  readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
const nomeDeArquivo = (s) => s.replace(/[^a-zA-Z0-9._-]+/g, '_')

function tamanhoDaPasta(p) {
  if (!existsSync(p)) return 0
  let total = 0
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const q = path.join(p, e.name)
    try {
      total += e.isDirectory() ? tamanhoDaPasta(q) : statSync(q).size
    } catch {
      /* arquivo travado pelo Chrome: não conta */
    }
  }
  return total
}

/** Baixa (uma vez) os ONNX do Parakeet para o cache da bancada e devolve as URLs locais. */
async function prepararParakeet(sis) {
  const urls = {}
  const bytes = {}
  for (const [papel, [m, arq]] of Object.entries(sis.arquivos)) {
    const rel = path.join('parakeet', m.pasta, m.rev.slice(0, 12), arq)
    process.stdout.write(`  baixando/verificando ${m.repo}/${arq}…\n`)
    const local = await baixarModelo(`https://huggingface.co/${m.repo}/resolve/${m.rev}/${arq}`, rel)
    urls[papel] = `/modelos/${rel.split(path.sep).join('/')}`
    bytes[`${m.repo}@${m.rev.slice(0, 12)}/${arq}`] = statSync(local).size
  }
  return { urls, bytes }
}

/**
 * Memória residente (working set) somada de TODOS os processos do Chrome desta bancada — navegador,
 * aba e processo de GPU —, achados pelo perfil na linha de comando. É uma foto, não o pico.
 */
function memoriaDoChromeMb() {
  try {
    const saida = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "(Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*perfil-chrome*' } | Measure-Object WorkingSetSize -Sum).Sum",
      ],
      { encoding: 'utf8', timeout: 20000 },
    )
    const n = Number(saida.trim())
    return Number.isFinite(n) && n > 0 ? Math.round(n / 2 ** 20) : null
  } catch {
    return null
  }
}

const comPrazo = (p, ms, rotulo) =>
  Promise.race([
    p,
    new Promise((_, r) => setTimeout(() => r(new Error(`prazo de ${ms / 1000}s estourado: ${rotulo}`)), ms)),
  ])

async function abrirChrome() {
  mkdirSync(PERFIL, { recursive: true })
  const contexto = await chromium.launchPersistentContext(PERFIL, {
    channel: 'chrome',
    headless: flag('sem-janela'),
    viewport: { width: 640, height: 360 },
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=WebGPU',
      '--ignore-gpu-blocklist',
      // A janela fica atrás das outras: sem isto o Chrome estrangula temporizadores e a medida de tempo.
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--window-size=660,420',
      '--window-position=20,20',
    ],
  })
  const pagina = contexto.pages()[0] ?? (await contexto.newPage())
  const console_ = []
  pagina.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console_.push(`[${m.type()}] ${m.text().slice(0, 600)}`)
  })
  pagina.on('pageerror', (e) => console_.push(`[pageerror] ${String(e?.message || e).slice(0, 600)}`))
  let caiu = false
  pagina.on('crash', () => {
    caiu = true
    console_.push('[crash] a aba caiu')
  })
  await pagina.goto(`http://127.0.0.1:${PORTA}/`)
  await pagina.waitForFunction(() => !!window.bancada, null, { timeout: 30000 })
  return { contexto, pagina, console_, caiu: () => caiu }
}

async function rodarSistema(idPedido, conjuntos) {
  // Fora das 4 threads padrão, o bruto vai para outro arquivo (`…@1t`): não sobrescreve a medida principal.
  const id = THREADS === 4 ? idPedido : `${idPedido}@${THREADS}t`
  // `+basica` / `+desligada` no fim do id: nível de otimização de grafo do ONNX Runtime (controle).
  const [idBase, extra] = idPedido.split('+')
  const otimizacao = { basica: 'basic', desligada: 'disabled', estendida: 'extended' }[extra]
  if (extra && !otimizacao) throw new Error(`extra desconhecido: +${extra}`)
  const sis = SISTEMAS[idBase] && { ...SISTEMAS[idBase], ...(otimizacao ? { otimizacao } : {}) }
  if (!sis) throw new Error(`sistema desconhecido: ${id}\n  conhecidos: ${Object.keys(SISTEMAS).join(', ')}`)
  let cfg = { ...sis, threads: THREADS }
  let bytesDoModelo = null
  if (sis.tipo === 'parakeet') {
    const p = await prepararParakeet(sis)
    cfg = { tipo: 'parakeet', device: sis.device, threads: THREADS, ...(otimizacao ? { otimizacao } : {}), ...p.urls }
    bytesDoModelo = p.bytes
  }
  const perfilAntes = tamanhoDaPasta(PERFIL)
  const { contexto, pagina, console_, caiu } = await abrirChrome()
  const versaoDoChrome = contexto.browser()?.version() ?? null
  try {
    const ambiente = await pagina.evaluate(() => window.bancada.info())
    console.log(`\n== ${id}\n   adaptador: ${JSON.stringify(ambiente.adaptador)}  isolado=${ambiente.isolado}`)
    const carga = await comPrazo(
      pagina.evaluate((c) => window.bancada.carregar(c), cfg),
      30 * 60_000,
      'carga do modelo',
    )
    const cabecalho = {
      sistema: id,
      config: cfg,
      bytesDoModelo,
      ambiente,
      versaoDoChrome,
      carga,
      threadsPedidas: THREADS,
    }
    if (!carga.ok) {
      console.log(`   CARGA FALHOU [${carga.etapa ?? '-'}]: ${carga.erro}`)
      for (const conj of conjuntos)
        gravar(id, conj, { ...cabecalho, conjunto: conj, falhaDeCarga: carga, console: console_.slice(-30), casos: {} })
      return
    }
    console.log(
      `   carga ${(carga.cargaMs / 1000).toFixed(1)} s, aquecimento ${(carga.aquecimentoMs / 1000).toFixed(1)} s, threads ${carga.threads}${carga.erroDoAquecimento ? `, AQUECIMENTO FALHOU: ${carga.erroDoAquecimento}` : ''}`,
    )
    for (const conj of conjuntos) {
      let itens = lerJsonl(path.join(RAIZ, 'stt', `${conj}.jsonl`))
      if (LIMITE) itens = itens.slice(0, LIMITE)
      const anterior = flag('refazer') ? null : ler(id, conj)
      const casos = anterior?.casos ?? {}
      let erros = 0
      for (let i = 0; i < itens.length; i++) {
        const it = itens[i]
        if (casos[it.id]?.ok) continue
        if (caiu()) break
        let r
        try {
          r = await comPrazo(
            pagina.evaluate(([u, l]) => window.bancada.transcrever(u, l), [`/dados/${it.arquivo}`, it.idioma]),
            5 * 60_000,
            it.id,
          )
        } catch (e) {
          r = { ok: false, erro: String(e?.message || e).slice(0, 600) }
        }
        casos[it.id] = r
        if (!r.ok) {
          erros++
          console.log(`\n   ! ${it.id}: ${r.erro}`)
          if (erros >= 5) {
            console.log('   5 falhas: parando este conjunto')
            break
          }
        }
        process.stdout.write(`\r   ${conj}: ${i + 1}/${itens.length}   `)
        if ((i + 1) % 10 === 0) gravar(id, conj, { ...cabecalho, conjunto: conj, casos })
      }
      const memoriaBytes = caiu() ? null : memoriaDoChromeMb() * 2 ** 20 || null
      const feitos = itens.filter((x) => casos[x.id]?.ok)
      const audioS = feitos.reduce((s, x) => s + casos[x.id].duracaoS, 0)
      const ms = feitos.reduce((s, x) => s + casos[x.id].ms, 0)
      console.log(
        `\r   ${conj}: ${feitos.length}/${itens.length} falas, fator de tempo real ${(ms / 1000 / (audioS || 1)).toFixed(3)}, memória do Chrome ${memoriaBytes ? (memoriaBytes / 2 ** 20).toFixed(0) + ' MB' : 'n/d'}`,
      )
      gravar(id, conj, {
        ...cabecalho,
        conjunto: conj,
        memoriaBytes,
        abaCaiu: caiu(),
        console: console_.slice(-30),
        casos,
      })
    }
  } finally {
    await contexto.close().catch(() => {})
    const cresceu = tamanhoDaPasta(PERFIL) - perfilAntes
    console.log(`   perfil do Chrome cresceu ${(cresceu / 2 ** 20).toFixed(0)} MB (${PERFIL})`)
  }
}

const arquivoDe = (id, conj) => path.join(RESULTADOS, `${nomeDeArquivo(id)}__${conj}.json`)
function ler(id, conj) {
  try {
    return JSON.parse(readFileSync(arquivoDe(id, conj), 'utf8'))
  } catch {
    return null
  }
}
function gravar(id, conj, dados) {
  mkdirSync(RESULTADOS, { recursive: true })
  writeFileSync(arquivoDe(id, conj), JSON.stringify({ geradoEm: new Date().toISOString(), ...dados }, null, 1))
}

const servidor = await subirServidor(PORTA)
try {
  if (flag('sonda')) {
    const { contexto, pagina } = await abrirChrome()
    console.log(
      JSON.stringify(
        { chrome: contexto.browser()?.version() ?? null, ...(await pagina.evaluate(() => window.bancada.info())) },
        null,
        2,
      ),
    )
    await contexto.close()
  } else {
    const sistemas = opt('sistemas', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const conjuntos = opt('conjuntos', 'fleurs_pt')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!sistemas.length) throw new Error(`--sistemas vazio. Conhecidos: ${Object.keys(SISTEMAS).join(', ')}`)
    for (const id of sistemas) {
      try {
        await rodarSistema(id, conjuntos)
      } catch (e) {
        console.error(`\n== ${id} FALHOU: ${e?.message || e}`)
      }
    }
  }
} finally {
  servidor.closeAllConnections?.()
  await new Promise((s) => servidor.close(s))
}
process.exit(0)
