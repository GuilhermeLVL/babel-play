/**
 * Mede DER e pureza de cluster nos cenários sintetizados — com o embedder e o agrupador REAIS.
 *
 * O `SpeakerClusterer` importado aqui é o mesmo de produção (`src/lib/speakerCluster.ts`), com os
 * mesmos limiares. O embedding vem do MESMO modelo WeSpeaker que o navegador carrega, só que via
 * transformers.js em Node. Medir com um agrupador de mentira ou um modelo diferente produziria um
 * número sobre outra coisa.
 *
 * O QUE ISTO RESPONDE. O produto erra a atribuição de falante, e não se sabia por quê. A
 * decomposição do DER separa três causas com correções opostas: fala não detectada (VAD), fala
 * inventada (VAD), e falante trocado (embedding/cluster). A pureza e a cobertura, por enunciado,
 * separam FUNDIR duas pessoas de FRAGMENTAR uma.
 *
 * LIMITE DO MÉTODO, declarado: os cenários são concatenação, sem fala sobreposta, sem reverberação
 * e sem ruído ambiente contínuo. Serve para comparar variantes entre si, nunca como DER absoluto.
 *
 * Uso:
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-der.mjs
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-der.mjs --normalizar   # variante
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { AutoProcessor, AutoModel, env } from '@huggingface/transformers'
import { SpeakerClusterer } from '../../src/lib/speakerCluster.ts'
import { calcularDer, purezaDeClusters } from '../../src/core/eval/der.ts'

env.allowLocalModels = false

const DIR = 'tests/fixtures/cenarios-diarizacao'
const SAIDA = 'docs/auditoria/eval/resultados-der.json'
const MODEL_ID = 'onnx-community/wespeaker-voxceleb-resnet34-LM'
/**
 * O PISO DE EMBEDDING É LIDO DA FONTE, não copiado.
 *
 * A primeira versão trazia `1.2` e depois `0.5` fixos no runner. Ao portar o harness para a outra
 * cópia do produto — que tem `1.2` — ele reportou o número da configuração DAQUI, dando a
 * impressão de que lá estava corrigido. Um harness que não lê o valor real mede outro produto.
 *
 * `--min-embed` continua existindo para varrer o parâmetro deliberadamente.
 */
function pisoDeEmbeddingDaFonte() {
  const fonte = readFileSync(new URL('../../src/lib/speakerId.ts', import.meta.url), 'utf8')
  const m = fonte.match(/const MIN_EMBED_SECONDS\s*=\s*([\d.]+)/)
  if (!m) throw new Error('MIN_EMBED_SECONDS não encontrado em src/lib/speakerId.ts')
  return Number(m[1])
}
const iMin = process.argv.indexOf('--min-embed')
const MIN_EMBED_S = iMin >= 0 && process.argv[iMin + 1] ? Number(process.argv[iMin + 1]) : pisoDeEmbeddingDaFonte()

const args = process.argv.slice(2)
const NORMALIZAR = args.includes('--normalizar')
/**
 * Varredura do limiar de junção. A medição mostrou que TODO o erro é confusão de falante (nada
 * perdido, nada inventado) e sempre no MESMO enunciado — o que aponta para o limiar, e não para o
 * pré-processamento do áudio. Varrer é mais honesto que chutar um valor novo.
 */
const iSweep = args.indexOf('--limiares')
const LIMIARES = iSweep >= 0 && args[iSweep + 1]
  ? args[iSweep + 1].split(',').map(Number)
  : [null]

function lerWav(buf) {
  let pos = 12, fmt = null, dados = null
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const tam = buf.readUInt32LE(pos + 4)
    const corpo = pos + 8
    if (id === 'fmt ') fmt = { canais: buf.readUInt16LE(corpo + 2), taxa: buf.readUInt32LE(corpo + 4), bits: buf.readUInt16LE(corpo + 14) }
    else if (id === 'data') dados = buf.subarray(corpo, Math.min(corpo + tam, buf.length))
    pos = corpo + tam + (tam % 2)
  }
  const amostras = dados.length / 2 / fmt.canais
  const out = new Float32Array(amostras)
  for (let i = 0; i < amostras; i++) {
    let soma = 0
    for (let c = 0; c < fmt.canais; c++) soma += dados.readInt16LE((i * fmt.canais + c) * 2)
    out[i] = soma / fmt.canais / 32768
  }
  return { pcm: out, taxa: fmt.taxa }
}

/**
 * Normalização de energia (variante em teste, NÃO é o comportamento atual).
 *
 * Hoje o PCM vai cru para o embedder: não há AGC, nem normalização de pico ou RMS, nem gate por
 * SNR (`src/lib/speakerId.ts`). A hipótese é que isso faça a mesma pessoa, falando alto e depois
 * baixo, produzir vetores distantes — que é exatamente o cenário `volume-variavel`.
 */
function normalizarRms(pcm, alvo = 0.05) {
  let soma = 0
  for (let i = 0; i < pcm.length; i++) soma += pcm[i] * pcm[i]
  const rms = Math.sqrt(soma / pcm.length)
  if (rms < 1e-6) return pcm
  const g = alvo / rms
  const out = new Float32Array(pcm.length)
  // Limita o ganho: amplificar silêncio 100× só amplifica ruído.
  const gLim = Math.min(g, 20)
  for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-1, Math.min(1, pcm[i] * gLim))
  return out
}

async function main() {
  const ref = path.join(DIR, 'cenarios.json')
  if (!existsSync(ref)) {
    console.error(`cenários ausentes: ${ref}\nRode antes: python scripts/eval-fala/montar-cenarios.py`)
    process.exit(1)
  }
  const { cenarios } = JSON.parse(readFileSync(ref, 'utf8'))

  console.log(`carregando ${MODEL_ID}…`)
  const processor = await AutoProcessor.from_pretrained(MODEL_ID)
  const model = await AutoModel.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'cpu' })
  console.log(`variante: ${NORMALIZAR ? 'COM normalização de energia' : 'produção (PCM cru)'}\n`)

  const linhas = []
  for (const limiar of LIMIARES) {
  if (limiar !== null) console.log(`
── joinThreshold = ${limiar} ──`)
  for (const c of cenarios) {
    const { pcm, taxa } = lerWav(readFileSync(path.join(DIR, c.arquivo)))
    if (taxa !== 16000) throw new Error(`${c.arquivo}: esperado 16 kHz`)

    // Um cluster por CENÁRIO, como numa sessão real.
    const clusterer = new SpeakerClusterer(limiar === null ? {} : { joinThreshold: limiar })
    const verdade = []
    const atribuido = []
    const turnosHip = []
    let ultimo = null
    let semEmbedding = 0

    for (const t of c.turnos) {
      const trecho = pcm.subarray(Math.round(t.inicioMs / 1000 * 16000), Math.round(t.fimMs / 1000 * 16000))
      const dur = trecho.length / 16000

      let id
      if (dur < MIN_EMBED_S) {
        // Regra de produção ATUAL: fala curta demais HERDA o último falante (speakerId.ts:79).
        // Reproduzida aqui para o número refletir o produto, não o modelo.
        semEmbedding++
        id = ultimo ?? 'voice_1'
      } else {
        const entrada = NORMALIZAR ? normalizarRms(trecho) : trecho
        const inputs = await processor(entrada)
        const out = await model(inputs)
        const tensor = out[Object.keys(out)[0]]
        const emb = Float32Array.from(tensor.data)
        id = clusterer.assign(emb).clusterId
      }
      ultimo = id
      verdade.push(t.falante)
      atribuido.push(id)
      turnosHip.push({ inicioMs: t.inicioMs, fimMs: t.fimMs, falante: id })
    }

    const der = calcularDer(c.turnos, turnosHip, 250)
    const pureza = purezaDeClusters(verdade, atribuido)
    linhas.push({ limiar, cenario: c.nome, descricao: c.descricao, der, pureza, semEmbedding })

    console.log(`${c.nome.padEnd(18)} DER ${(der.der * 100).toFixed(0).padStart(4)}%  ` +
      `pureza ${(pureza.pureza * 100).toFixed(0).padStart(3)}%  cobertura ${(pureza.cobertura * 100).toFixed(0).padStart(3)}%  ` +
      `clusters ${pureza.clustersCriados}/${pureza.falantesReais}` +
      (semEmbedding ? `  (${semEmbedding} fala(s) curtas herdaram o falante)` : ''))
  }

  }

  mkdirSync(path.dirname(SAIDA), { recursive: true })
  writeFileSync(SAIDA, JSON.stringify({
    geradoEm: new Date().toISOString(),
    variante: NORMALIZAR ? 'normalizada' : 'producao',
    limite: 'cenarios concatenados: sem fala sobreposta, sem reverberacao, sem ruido ambiente continuo',
    linhas,
  }, null, 2))

  console.log('')
  for (const limiar of LIMIARES) {
    const g = linhas.filter((l) => l.limiar === limiar)
    const medio = g.reduce((s, l) => s + l.der.der, 0) / g.length
    // Fragmentação: clusters criados além do número de pessoas reais. Baixar o limiar reduz
    // confusão e AUMENTA fragmentação — o ponto ótimo é onde os dois se equilibram, e reportar só
    // o DER esconderia metade da troca.
    const frag = g.reduce((s, l) => s + Math.max(0, l.pureza.clustersCriados - l.pureza.falantesReais), 0)
    console.log(`limiar ${String(limiar ?? 'padrao (0.5)').padEnd(14)} DER medio ${(medio * 100).toFixed(1).padStart(5)}%  · clusters a mais: ${frag}`)
  }
  console.log(`
resultado bruto: ${SAIDA}`)
}

main().catch((e) => { console.error('\nfalhou:', e); process.exit(1) })
