/**
 * Estabilidade no texto longo (~10 min): WAV longo -> Whisper -> inserções (repetição) e deleções (omissão).
 *
 * Uso (precisa de `tsx`, porque importa TypeScript de `src/core`):
 *   node --import tsx scripts/eval-voz/medir-estabilidade.mjs --motor <id> --voz <id> --entrada <dir> [--texto <arquivo>] [--idioma pt]
 *
 * Espera na pasta de entrada o `longo.wav` e o `longo.txt` (referência) que `sintetizar.mjs --longo` grava;
 * `--texto` aponta para outro arquivo de referência.
 *
 * Decode: o Whisper aqui roda SEM `no_repeat_ngram_size` e com `repetition_penalty` 1.0
 * (`OPCOES_DE_DECODE_LONGO`), porque essas travas, certas para frases curtas, esconderiam a gagueira que
 * se quer medir (e proibiriam trigramas legítimos repetidos num chunk de 25 s). As opções efetivas vão no
 * resultado (`decodificador`).
 *
 * Chunks: o áudio é cortado em pedaços de até 25 s (o Whisper decodifica ~30 s por vez). Cada corte cai no
 * MEIO da MAIOR pausa (>= 150 ms, quadros com RMS < 0,01) dentro dos 6 s finais da janela, para não partir
 * palavra. Sem pausa assim, o corte cai no quadro mais quieto e conta em `cortesSemPausa`; nesse caso a
 * `taxa` é um limite SUPERIOR do erro de estabilidade (o corte pode ter criado erros). Sem sobreposição
 * nem desduplicação: a palavra partida no meio de um corte é o viés que SOBRA, e só afeta `cortesSemPausa`.
 *
 * `--entrada` costuma ser a pasta `<motor>/<voz>/` de `sintetizar.mjs --longo`: o `origem.json` dela é conferido
 * contra `--motor/--voz` (diferente = erro; ausente = segue, com aviso em `notas`). O resultado traz
 * `tipo: 'estabilidade'` (o `relatorio` classifica por ele, não pelo nome do arquivo).
 *
 * Limite conhecido (en/es): números por extenso só são expandidos em pt; um Whisper que escreva "one thousand"
 * contra "1000" na referência soma erro. O plano cobre números em en/es apenas se o orçamento permitir.
 *
 * Saída: `docs/auditoria/eval/voz-estabilidade-<motor>-<voz>.json` (repositório) só com campos compactos
 * (contagens, taxas, veredito contra o limite da spec §7.2 de 1,0 %, decodificador, chunks, hash do texto).
 * A transcrição completa vai para `<entrada>/hipotese.txt`, fora do repositório.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { palavras } from '../../src/core/eval/wer.ts'
import { conferirOrigem, IDIOMAS, LIMIARES_DA_SPEC, nomeSeguro, pegarOpcao } from './comum.mjs'
import { criarDecodificadorWhisper, MODELO_WHISPER, prepararPcm } from './medir-roundtrip.mjs'
import { estabilidadeDoTrecho, normalizarParaComparar } from './metricas.mjs'
import { lerTextoLongo } from './sintetizar.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..', '..')
const TAXA_HZ = 16000
const PEDACO_MAX_S = 25
/** Quanto antes do alvo de cada janela se procura a pausa para cortar. */
const BUSCA_DE_CORTE_S = 6
const QUADRO_S = 0.05
/** Pausa mínima (entre palavras são ~50 ms; fim de frase passa de 150 ms) para contar como "pausa real". */
const PAUSA_MIN_S = 0.15
/** RMS de um quadro abaixo disto é silêncio (a mesma escala de `LIMIAR_DE_SILENCIO` do round-trip). */
const LIMIAR_RMS = 0.01

/**
 * Decode do texto longo: sem supressão de repetição. `max_new_tokens` folgado: 25 s de fala passam de
 * 128 tokens em pt, e o teto das frases curtas truncaria o chunk (falsas deleções).
 */
export const OPCOES_DE_DECODE_LONGO = { no_repeat_ngram_size: 0, repetition_penalty: 1.0, max_new_tokens: 224 }

/**
 * Divide o PCM em pedaços de no máximo `maxS` segundos. Cada corte: dentro dos últimos `BUSCA_DE_CORTE_S`
 * antes do alvo, o MEIO da maior corrida de quadros silenciosos, se ela tiver >= 150 ms; senão o centro do
 * quadro mais quieto, contado em `cortesSemPausa`. Não perde nem repete amostras.
 * @param {Float32Array} pcm
 * @param {number} taxaHz
 * @param {number} maxS
 * @returns {{ pedacos: Float32Array[], cortesSemPausa: number }}
 */
export function dividirPcm(pcm, taxaHz, maxS) {
  const max = Math.round(maxS * taxaHz)
  const busca = Math.round(Math.min(BUSCA_DE_CORTE_S, maxS / 2) * taxaHz)
  const quadro = Math.max(1, Math.round(QUADRO_S * taxaHz))
  const minQuadros = Math.ceil(PAUSA_MIN_S / QUADRO_S - 1e-9)
  const pedacos = []
  let cortesSemPausa = 0
  let ini = 0
  while (ini < pcm.length) {
    if (pcm.length - ini <= max) {
      pedacos.push(pcm.subarray(ini))
      break
    }
    const de = ini + max - busca
    let melhorCorrida = { n: 0, ini: 0 }
    let corrida = { n: 0, ini: 0 }
    let quieto = { energia: Infinity, centro: ini + max }
    for (let q = de; q + quadro <= ini + max; q += quadro) {
      let energia = 0
      for (let i = q; i < q + quadro; i++) energia += pcm[i] * pcm[i]
      if (energia <= quieto.energia) quieto = { energia, centro: q + (quadro >> 1) }
      if (Math.sqrt(energia / quadro) < LIMIAR_RMS) {
        if (corrida.n === 0) corrida.ini = q
        corrida.n++
        if (corrida.n > melhorCorrida.n) melhorCorrida = { ...corrida }
      } else {
        corrida = { n: 0, ini: 0 }
      }
    }
    let corte
    if (melhorCorrida.n >= minQuadros) {
      corte = melhorCorrida.ini + Math.floor((melhorCorrida.n * quadro) / 2)
    } else {
      corte = quieto.centro
      cortesSemPausa++
    }
    pedacos.push(pcm.subarray(ini, corte))
    ini = corte
  }
  return { pedacos, cortesSemPausa }
}

/**
 * Orquestração pura: corta o áudio, transcreve cada pedaço (`transcrever(pcm, idioma, opcoes)`, com
 * `OPCOES_DE_DECODE_LONGO`), junta e mede.
 * @param {{ texto: string, idioma: 'pt'|'en'|'es', pcm: Float32Array,
 *           transcrever: (pcm: Float32Array, idioma: string, opcoes: typeof OPCOES_DE_DECODE_LONGO) => Promise<string>,
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
  const { pedacos, cortesSemPausa } = dividirPcm(pcm, taxaHz, pedacoMaxS)
  const transcricoes = []
  for (const parte of pedacos) transcricoes.push(await transcrever(parte, idioma, OPCOES_DE_DECODE_LONGO))
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
    chunks: pedacos.length,
    cortesSemPausa,
    decodificador: { modelo: MODELO_WHISPER, ...OPCOES_DE_DECODE_LONGO },
    hipotese,
  }
}

/**
 * O JSON que vai para o repositório: só campos compactos, NUNCA a transcrição (`hipotese`).
 * @param {{ motor: string, voz: string, idioma: string, textoId: string, texto: string, audioDuracaoS: number,
 *           r: Awaited<ReturnType<typeof medirEstabilidadeDoLongo>> | Record<string, any>, geradoEm?: string,
 *           avisos?: string[] }} p
 */
export function montarRegistro({ motor, voz, idioma, textoId, texto, audioDuracaoS, r, geradoEm, avisos = [] }) {
  const notas = [...avisos]
  if (r.cortesSemPausa > 0) {
    notas.push(
      `${r.cortesSemPausa} corte(s) de chunk sem pausa real (>= 150 ms): a taxa é um limite superior do erro de estabilidade`,
    )
  }
  return {
    tipo: 'estabilidade',
    geradoEm: geradoEm ?? new Date().toISOString(),
    motor,
    voz,
    idioma,
    textoId,
    textoSha256: createHash('sha256').update(texto).digest('hex'),
    audioDuracaoS,
    palavrasNaReferencia: r.palavrasNaReferencia,
    insercoes: r.insercoes,
    delecoes: r.delecoes,
    taxa: r.taxa,
    limite: r.limite,
    passou: r.passou,
    chunks: r.chunks,
    cortesSemPausa: r.cortesSemPausa,
    decodificador: r.decodificador,
    notas,
    medidas: { porIdioma: { [idioma]: { estabilidade: r.taxa } } },
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
  const pasta = path.resolve(entrada)
  const { avisos } = conferirOrigem(pasta, { motor, voz })
  for (const a of avisos) console.warn(`aviso: ${a}`)
  const wav = path.join(pasta, 'longo.wav')
  const arquivoTexto = pegarOpcao(argv, 'texto') ?? path.join(pasta, 'longo.txt')
  for (const f of [wav, arquivoTexto]) if (!existsSync(f)) throw new Error(`arquivo ausente: ${f}`)

  const texto = lerTextoLongo(arquivoTexto)
  const pcm = prepararPcm(readFileSync(wav))
  const r = await medirEstabilidadeDoLongo({ texto, idioma, pcm, transcrever: await criarDecodificadorWhisper() })

  // Transcrição completa fica ao lado do WAV (fora do repositório); no repositório só o resumo compacto.
  writeFileSync(path.join(pasta, 'hipotese.txt'), `${r.hipotese}\n`)
  const registro = montarRegistro({
    motor,
    voz,
    idioma,
    textoId: path.basename(arquivoTexto),
    texto,
    audioDuracaoS: pcm.length / TAXA_HZ,
    r,
    avisos,
  })
  const saida = path.join(RAIZ, 'docs', 'auditoria', 'eval', `voz-estabilidade-${motor}-${voz}.json`)
  mkdirSync(path.dirname(saida), { recursive: true })
  writeFileSync(saida, JSON.stringify(registro, null, 2))
  console.log(
    `${idioma}: inserções ${r.insercoes}, deleções ${r.delecoes}, taxa ${(r.taxa * 100).toFixed(2)}% de ${r.palavrasNaReferencia} palavras (limite ${(r.limite * 100).toFixed(1)}%): ${r.passou ? 'passou' : 'reprovou'}`,
  )
  console.log(
    `chunks ${r.chunks}, cortes sem pausa ${r.cortesSemPausa}${r.cortesSemPausa > 0 ? ' (taxa = limite superior)' : ''}`,
  )
  console.log(`resultado: ${saida}\ntranscrição: ${path.join(pasta, 'hipotese.txt')}`)
  if (!r.passou) process.exitCode = 1
}

// Só roda como script; importado pelos testes não faz nada.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`erro: ${e.message}`)
    process.exit(1)
  })
}
