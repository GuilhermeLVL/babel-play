/**
 * BERGAMOT (o motor do Firefox Translations) em Node — o WASM do `@browsermt/bergamot-translator`
 * (MPL-2.0, sem dependências) carregado direto, sem o Worker nem o registro antigo do pacote: o
 * mesmo binário que a página rodaria, com o gemm int8 embutido (`*Fallback`; o nativo só existe no
 * Firefox Nightly). `BlockingService.translate` é síncrono: a latência medida é a do motor, sem fila.
 *
 * Modelos: o registro NOVO da Mozilla (`mozilla/translations`, bucket GCS público; o repositório
 * `firefox-translations-models` foi arquivado em 15/12/2025). Os caminhos trazem o id da execução de
 * treino — são a versão; fixá-los aqui é fixar o modelo medido, e o hash do `.bin` confere o conteúdo.
 * Arquitetura `base-memory` (~31 MB int8 por direção), Release no registro em 29/09/2026.
 *
 * Sem modelo direto es↔pt: o registro só tem es↔en e en↔pt (pivô por inglês, que a bancada não mede
 * porque nenhum corpus dela tem origem em espanhol).
 *
 * ATENÇÃO: o alvo "pt" da Mozilla sai em português EUROPEU ("como estás", "disse-te") — as
 * referências da bancada são pt-BR. O COMET mede o sentido e pune pouco a variante; o usuário
 * brasileiro nota. Ler as hipóteses antes de decidir.
 */
/* global WebAssembly, TextDecoder, TextEncoder */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'
import { gunzipSync } from 'node:zlib'

import { baixarModelo } from './comum.mjs'

const GCS = 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/'
export const MODELOS_BERGAMOT = {
  'en-pt': {
    dir: 'models/en-pt/retrain_hr_fix_names_Vnb0RUXTTd67hR-oLHM3eg/exported/',
    model: 'model.enpt.intgemm.alphas.bin.gz',
    lex: 'lex.50.50.enpt.s2t.bin.gz',
    vocab: 'vocab.enpt.spm.gz',
    sha256Modelo: '07892fd2544ee79dcb643615d8f2debb9793fae16842e87c328e27a3dd26a770',
  },
  'pt-en': {
    dir: 'models/pt-en/retrain_hr_drxrs5bGSsOWvfK9lyZISw/exported/',
    model: 'model.pten.intgemm.alphas.bin.gz',
    lex: 'lex.50.50.pten.s2t.bin.gz',
    vocab: 'vocab.pten.spm.gz',
    sha256Modelo: '7b854f1ec5a485dd33efd7c1bc01dd7d5a57f566957c5e47722af333f0ce9157',
  },
}

// Os padrões do `translator-worker.js` do pacote (feixe 1, sem custo) + os que ele força por cima.
const CONFIG = `beam-size: 1
normalize: 1.0
word-penalty: 0
cpu-threads: 0
gemm-precision: int8shiftAlphaAll
skip-cost: true
alignment: soft
quiet: true
quiet-translation: true
max-length-break: 128
mini-batch-words: 1024
workspace: 128
max-length-factor: 2.0
`
const GEMM = {
  int8_prepare_a: 'int8PrepareAFallback',
  int8_prepare_b: 'int8PrepareBFallback',
  int8_prepare_b_from_transposed: 'int8PrepareBFromTransposedFallback',
  int8_prepare_b_from_quantized_transposed: 'int8PrepareBFromQuantizedTransposedFallback',
  int8_prepare_bias: 'int8PrepareBiasFallback',
  int8_multiply_and_add_bias: 'int8MultiplyAndAddBiasFallback',
  int8_select_columns_of_b: 'int8SelectColumnsOfBFallback',
}

let modulo = null
async function carregarModulo() {
  if (modulo) return modulo
  // `require.resolve` literal: é o que o knip (portão `morto:arquivos`) reconhece como uso do pacote.
  const require = createRequire(import.meta.url)
  const wasm = readFileSync(require.resolve('@browsermt/bergamot-translator/worker/bergamot-translator-worker.wasm'))
  const cola = readFileSync(
    require.resolve('@browsermt/bergamot-translator/worker/bergamot-translator-worker.js'),
    'utf8',
  )
  modulo = await new Promise((resolve, reject) => {
    let instancia
    const Module = {
      print: () => {},
      printErr: (s) => /error|fail/i.test(s) && console.error('[bergamot]', s),
      instantiateWasm(info, aceitar) {
        const gemm = Object.fromEntries(Object.entries(GEMM).map(([k, n]) => [k, (...a) => instancia.exports[n](...a)]))
        WebAssembly.instantiate(wasm, { ...info, wasm_gemm: gemm })
          .then((r) => {
            instancia = r.instance
            aceitar(instancia)
          })
          .catch(reject)
        return {}
      },
      onRuntimeInitialized: () => resolve(Module),
    }
    // Contexto isolado: a cola do Emscripten escreve globais (`Module`, `FS`…) e não deve sujar o da bancada.
    const ctx = vm.createContext({
      Module,
      console,
      WebAssembly,
      performance,
      TextDecoder,
      TextEncoder,
      setTimeout,
      clearTimeout,
      process,
    })
    vm.runInContext(cola, ctx)
  })
  return modulo
}

const tradutores = new Map()
async function tradutor(par) {
  if (tradutores.has(par)) return tradutores.get(par)
  const m = MODELOS_BERGAMOT[par]
  if (!m) throw new Error(`bergamot sem modelo direto para ${par} (há: ${Object.keys(MODELOS_BERGAMOT).join(', ')})`)
  const M = await carregarModulo()
  const buf = {}
  for (const k of ['model', 'lex', 'vocab'])
    buf[k] = gunzipSync(
      readFileSync(await baixarModelo(GCS + m.dir + m[k], path.join('bergamot', par, m.dir.split('/')[2], m[k]))),
    )
  const hash = createHash('sha256').update(buf.model).digest('hex')
  if (hash !== m.sha256Modelo) throw new Error(`bergamot ${par}: sha256 do modelo não confere (${hash})`)
  const mem = (b, alinhamento) => {
    const a = new M.AlignedMemory(b.byteLength, alinhamento)
    a.getByteArrayView().set(new Int8Array(b.buffer, b.byteOffset, b.byteLength))
    return a
  }
  const vocabs = new M.AlignedMemoryList()
  vocabs.push_back(mem(buf.vocab, 64))
  const t = {
    M,
    modelo: new M.TranslationModel(CONFIG, mem(buf.model, 256), mem(buf.lex, 64), vocabs, null),
    servico: new M.BlockingService({ cacheSize: 0 }),
  }
  tradutores.set(par, t)
  // Aquecimento: a 1ª tradução paga a preparação das matrizes int8 (~10× a seguinte) e iria para o p95.
  await traduzirBergamot(...par.split('-'), 'Hello.')
  return t
}

/** Carrega (baixa na primeira vez) o par — para a carga não entrar no cronômetro. */
export const prepararBergamot = (src, tgt) => tradutor(`${src}-${tgt}`)

/** Traduz um texto (o motor separa as frases sozinho). */
export async function traduzirBergamot(src, tgt, texto) {
  const { M, modelo, servico } = await tradutor(`${src}-${tgt}`)
  const entrada = new M.VectorString()
  entrada.push_back(texto)
  const opcoes = new M.VectorResponseOptions()
  opcoes.push_back({ alignment: false, html: false, qualityScores: false })
  const r = servico.translate(modelo, entrada, opcoes)
  const saida = r.get(0).getTranslatedText()
  entrada.delete()
  opcoes.delete()
  r.delete()
  return saida
}
