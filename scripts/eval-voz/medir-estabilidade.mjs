/**
 * Estabilidade no texto longo (~10 min): WAV longo -> Whisper -> inserções (repetição) e deleções (omissão).
 *
 * Uso (precisa de `tsx`, porque importa TypeScript de `src/core`):
 *   node --import tsx scripts/eval-voz/medir-estabilidade.mjs --motor <id> --voz <id> --entrada <dir> [--texto <arquivo>] [--idioma pt]
 *
 * Espera na pasta de entrada o `longo.wav` e o `longo.txt` (referência) que `sintetizar.mjs --longo` grava;
 * `--texto` aponta para outro arquivo de referência. O áudio é cortado em pedaços de até 25 s no ponto mais
 * quieto perto do fim de cada janela (o Whisper decodifica ~30 s por vez), cada pedaço é transcrito pelo
 * MESMO decodificador de `medir-roundtrip.mjs` e as transcrições são juntadas. Grava
 * `docs/auditoria/eval/voz-estabilidade-<motor>-<voz>.json` com inserções, deleções, taxa e o veredito contra
 * o limite da spec §7.2 (≤ 1,0 % das palavras). O corte entre pedaços pode, raramente, partir uma palavra:
 * é erro de medida pequeno, e por isso o ponto de corte é o mais silencioso da janela.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { palavras } from '../../src/core/eval/wer.ts'
import { IDIOMAS, LIMIARES_DA_SPEC, nomeSeguro, pegarOpcao } from './comum.mjs'
import { criarDecodificadorWhisper, prepararPcm } from './medir-roundtrip.mjs'
import { estabilidadeDoTrecho, normalizarParaComparar } from './metricas.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..', '..')
const TAXA_HZ = 16000
const PEDACO_MAX_S = 25
/** Quanto antes do fim da janela se procura o ponto mais quieto para cortar. */
const BUSCA_DE_CORTE_S = 3
const QUADRO_S = 0.05

/**
 * Divide o PCM em pedaços de no máximo `maxS` segundos, cortando no quadro de menor energia dentro dos
 * últimos `BUSCA_DE_CORTE_S` da janela. Não perde nem repete amostras.
 * @param {Float32Array} pcm
 * @param {number} taxaHz
 * @param {number} maxS
 * @returns {Float32Array[]}
 */
export function dividirPcm(pcm, taxaHz, maxS) {
  const max = Math.round(maxS * taxaHz)
  const busca = Math.round(Math.min(BUSCA_DE_CORTE_S, maxS / 2) * taxaHz)
  const quadro = Math.max(1, Math.round(QUADRO_S * taxaHz))
  const pedacos = []
  let ini = 0
  while (ini < pcm.length) {
    if (pcm.length - ini <= max) {
      pedacos.push(pcm.subarray(ini))
      break
    }
    let corte = ini + max
    let melhor = Infinity
    for (let q = ini + max - busca; q + quadro <= ini + max; q += quadro) {
      let energia = 0
      for (let i = q; i < q + quadro; i++) energia += pcm[i] * pcm[i]
      if (energia < melhor) {
        melhor = energia
        corte = q + (quadro >> 1)
      }
    }
    pedacos.push(pcm.subarray(ini, corte))
    ini = corte
  }
  return pedacos
}

/**
 * Orquestração pura: corta o áudio, transcreve cada pedaço (`transcrever(pcm, idioma)`), junta e mede.
 * @param {{ texto: string, idioma: 'pt'|'en'|'es', pcm: Float32Array,
 *           transcrever: (pcm: Float32Array, idioma: string) => Promise<string>,
 *           taxaHz?: number, pedacoMaxS?: number }} p
 */
export async function medirEstabilidadeDoLongo({
  texto,
  idioma,
  pcm,
  transcrever,
  taxaHz = TAXA_HZ,
  pedacoMaxS = PEDACO_MAX_S,
}) {
  const partes = dividirPcm(pcm, taxaHz, pedacoMaxS)
  const transcricoes = []
  for (const parte of partes) transcricoes.push(await transcrever(parte, idioma))
  const hipotese = transcricoes.join(' ')
  const { insercoes, delecoes, taxa } = estabilidadeDoTrecho(texto, hipotese, idioma)
  const limite = LIMIARES_DA_SPEC[idioma].estabilidadeMax
  return {
    insercoes,
    delecoes,
    taxa,
    palavrasNaReferencia: palavras(normalizarParaComparar(texto, idioma)).length,
    limite,
    passou: taxa <= limite + 1e-9,
    pedacos: partes.length,
    hipotese,
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const motor = nomeSeguro(pegarOpcao(argv, 'motor'), '--motor')
  const voz = nomeSeguro(pegarOpcao(argv, 'voz'), '--voz')
  const entrada = pegarOpcao(argv, 'entrada')
  if (!entrada) throw new Error('--entrada <dir com longo.wav e longo.txt> é obrigatório')
  const idioma = pegarOpcao(argv, 'idioma') ?? 'pt'
  if (!IDIOMAS.includes(idioma)) throw new Error(`--idioma "${idioma}" inválido (use ${IDIOMAS.join('|')})`)
  const wav = path.join(path.resolve(entrada), 'longo.wav')
  const arquivoTexto = pegarOpcao(argv, 'texto') ?? path.join(path.resolve(entrada), 'longo.txt')
  for (const f of [wav, arquivoTexto]) if (!existsSync(f)) throw new Error(`arquivo ausente: ${f}`)

  const decodificar = await criarDecodificadorWhisper()
  const r = await medirEstabilidadeDoLongo({
    texto: readFileSync(arquivoTexto, 'utf8'),
    idioma,
    pcm: prepararPcm(readFileSync(wav)),
    transcrever: decodificar,
  })

  const saida = path.join(RAIZ, 'docs', 'auditoria', 'eval', `voz-estabilidade-${motor}-${voz}.json`)
  mkdirSync(path.dirname(saida), { recursive: true })
  writeFileSync(
    saida,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        motor,
        voz,
        idioma,
        medidas: { porIdioma: { [idioma]: { estabilidade: r.taxa } } },
        ...r,
      },
      null,
      2,
    ),
  )
  console.log(
    `${idioma}: inserções ${r.insercoes}, deleções ${r.delecoes}, taxa ${(r.taxa * 100).toFixed(2)}% de ${r.palavrasNaReferencia} palavras (limite ${(r.limite * 100).toFixed(1)}%): ${r.passou ? 'passou' : 'reprovou'}`,
  )
  console.log(`resultado: ${saida}`)
  if (!r.passou) process.exitCode = 1
}

// Só roda como script; importado pelos testes não faz nada.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`erro: ${e.message}`)
    process.exit(1)
  })
}
