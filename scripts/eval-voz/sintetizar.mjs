/**
 * Sintetizador da bancada de voz: gera um WAV por frase do corpus (ou o trecho longo) e mede o RTF.
 *
 * Uso (node puro, sem tsx):
 *   node scripts/eval-voz/sintetizar.mjs --motor <id> --voz <id> [--url <base>] [--saida <dir>]
 *   node scripts/eval-voz/sintetizar.mjs --motor <id> --voz <id> --longo [--idioma pt] [--texto <arquivo>]
 *
 * Motor:
 *   --motor falso                      silêncio de duração determinística (ensaio da bancada)
 *   --url <base> (qualquer --motor)    servidor do contrato HTTP (`POST /sintetizar`, `GET /vozes`); lê
 *                                      `X-Tempo-Sintese` e `X-Memoria-MB` (pico de memória; sem o cabeçalho = null)
 *   --motor deepinfra --modelo <id>    adaptador da DeepInfra (chave só em DEEPINFRA_API_KEY). URL e corpo
 *                                      estão marcados NÃO VERIFICADO em `scripts/audiolivros/sintetizador.mjs`
 *
 * Saída: `--saida`, senão `$CLAUDE_JOB_DIR/tmp/eval-voz/<motor>/` quando a variável existe, senão
 * `os.tmpdir()/eval-voz/<motor>/`. Nunca dentro do repositório. Grava `<id>.wav` por frase + `resumo.json`
 * (RTF por frase, RTF mediano e máximo, outliers de duração/caractere por idioma, pico de memória).
 *
 * `--longo`: sintetiza UM trecho longo e grava `longo.wav`, `longo.txt` (a referência da estabilidade, que
 * `medir-estabilidade.mjs` lê) e `resumo-longo.json`. Sem `--texto`, o trecho é
 * `fontes-longo/dom-casmurro-longo.txt` (Dom Casmurro, caps. I a V, domínio público, Project Gutenberg
 * #55752; pasta à parte para o corpus de 14 frases não o absorver), só em pt. Para outro idioma, ou outro
 * texto, passe `--texto <arquivo.txt>` de domínio público (linhas iniciadas por "#" são cabeçalho e saem).
 * O resumo avisa quando o áudio ficou abaixo de 9 min (a spec pede ~10 min).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  criarSintetizadorDeepInfra,
  criarSintetizadorFalso,
  criarSintetizadorHttp,
  sintetizarComLimite,
} from '../audiolivros/sintetizador.mjs'
import {
  foraDaMediana,
  IDIOMAS,
  lerCorpus,
  mediana,
  MIN_CLIPES_PARA_MEDIANA,
  nomeSeguro,
  pastaDeSaida,
  pegarOpcao,
  rtf,
} from './comum.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const CORPUS = path.join(AQUI, 'corpus-voz.jsonl')

/** Duração abaixo da qual o trecho "longo" não representa os ~10 min da spec. */
const MINIMO_DO_LONGO_S = 540

/** Texto longo padrão (pt, domínio público). */
const TEXTO_LONGO_PADRAO = path.join(AQUI, 'fontes-longo', 'dom-casmurro-longo.txt')

/**
 * Lê um texto longo: tira as linhas de cabeçalho (`#`), apara cada linha e descarta as vazias.
 * @param {string} arquivo
 * @returns {string}
 */
export function lerTextoLongo(arquivo) {
  return readFileSync(arquivo, 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * Orquestração pura: sintetiza cada item, entrega o WAV a `escrever(nome, bytes)` e mede. Uma frase que
 * falha (motor caiu, texto vazio) vai para `erros` e não derruba a rodada.
 * `foraDaMediana` por idioma só existe com ao menos `MIN_CLIPES_PARA_MEDIANA` clipes; a razão usa os
 * caracteres do texto original (este script roda em node puro, sem a normalização de `metricas.mjs`).
 * @param {{ corpus: import('./comum.mjs').CorpusItem[],
 *           sintetizador: import('../audiolivros/sintetizador.mjs').Sintetizador,
 *           voz: string,
 *           escrever: (nome: string, dados: Uint8Array) => void,
 *           pausaS?: number }} p
 */
export async function sintetizarCorpus({ corpus, sintetizador, voz, escrever, pausaS }) {
  const frases = []
  const erros = []
  let memoriaPicoMB = null
  for (const item of corpus) {
    try {
      const clipe = await sintetizarComLimite(sintetizador, item.texto, { voz, idioma: item.idioma, pausaS })
      escrever(`${item.id}.wav`, clipe.wav)
      frases.push({
        id: item.id,
        idioma: item.idioma,
        caracteres: item.texto.length,
        duracaoS: clipe.duracaoS,
        tempoDeSinteseS: clipe.tempoDeSinteseS,
        rtf: rtf(clipe.tempoDeSinteseS, clipe.duracaoS),
      })
      if (clipe.memoriaMB !== undefined) memoriaPicoMB = Math.max(memoriaPicoMB ?? 0, clipe.memoriaMB)
    } catch (e) {
      erros.push({ id: item.id, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  const porIdioma = {}
  for (const idioma of IDIOMAS) {
    const doIdioma = frases.filter((f) => f.idioma === idioma)
    if (doIdioma.length >= MIN_CLIPES_PARA_MEDIANA) porIdioma[idioma] = foraDaMediana(doIdioma)
  }
  const rtfs = frases.map((f) => f.rtf)
  return {
    frases,
    erros,
    rtfMediano: rtfs.length ? mediana(rtfs) : null,
    rtfMax: rtfs.length ? Math.max(...rtfs) : null,
    foraDaMediana: porIdioma,
    memoriaPicoMB,
  }
}

function criarSintetizador(argv, motor, voz) {
  const url = pegarOpcao(argv, 'url')
  if (url) {
    return criarSintetizadorHttp({
      id: motor,
      versao: pegarOpcao(argv, 'versao') ?? 'desconhecida',
      url,
      tokenEnv: pegarOpcao(argv, 'token-env'),
    })
  }
  if (motor === 'falso') return criarSintetizadorFalso()
  if (motor === 'deepinfra') {
    const modelo = pegarOpcao(argv, 'modelo')
    if (!modelo) throw new Error('--motor deepinfra exige --modelo <id>')
    console.warn('aviso: URL e corpo do adaptador DeepInfra estão NÃO VERIFICADOS (ver sintetizador.mjs)')
    return criarSintetizadorDeepInfra({ modelo, voz })
  }
  throw new Error(
    `motor "${motor}": passe --url <base> (contrato HTTP), --motor falso ou --motor deepinfra --modelo <id>`,
  )
}

async function main() {
  const argv = process.argv.slice(2)
  const motor = nomeSeguro(pegarOpcao(argv, 'motor'), '--motor')
  const voz = nomeSeguro(pegarOpcao(argv, 'voz'), '--voz')
  const longo = argv.includes('--longo')
  const dir = pastaDeSaida({ motor, saida: pegarOpcao(argv, 'saida') })
  mkdirSync(dir, { recursive: true })
  const escrever = (nome, dados) => writeFileSync(path.join(dir, nome), dados)
  const sintetizador = criarSintetizador(argv, motor, voz)
  const corpus = lerCorpus(CORPUS)

  let alvo = corpus
  let resumoDe = 'resumo.json'
  let aviso
  if (longo) {
    const idioma = pegarOpcao(argv, 'idioma') ?? 'pt'
    if (!IDIOMAS.includes(idioma)) throw new Error(`--idioma "${idioma}" inválido (use ${IDIOMAS.join('|')})`)
    const arquivo = pegarOpcao(argv, 'texto')
    if (arquivo && !existsSync(arquivo)) throw new Error(`--texto: "${arquivo}" não existe`)
    if (!arquivo && idioma !== 'pt')
      throw new Error(`não há texto longo padrão em "${idioma}": passe --texto <arquivo>`)
    const texto = lerTextoLongo(arquivo ?? TEXTO_LONGO_PADRAO)
    if (!texto) throw new Error('o texto longo está vazio')
    writeFileSync(path.join(dir, 'longo.txt'), `${texto}\n`)
    alvo = [{ id: 'longo', idioma, texto, categoria: 'longo', itens: [] }]
    resumoDe = 'resumo-longo.json'
  }

  const r = await sintetizarCorpus({ corpus: alvo, sintetizador, voz, escrever })
  if (longo && r.frases[0] && r.frases[0].duracaoS < MINIMO_DO_LONGO_S) {
    aviso = `trecho de ${(r.frases[0].duracaoS / 60).toFixed(1)} min, abaixo dos ~10 min da spec: use --texto <arquivo>`
  }
  writeFileSync(
    path.join(dir, resumoDe),
    JSON.stringify({ geradoEm: new Date().toISOString(), motor, voz, ...r, ...(aviso ? { aviso } : {}) }, null, 2),
  )
  console.log(
    `${r.frases.length} WAV(s) em ${dir}; RTF mediano ${r.rtfMediano?.toFixed(3) ?? '-'}, máximo ${r.rtfMax?.toFixed(3) ?? '-'}`,
  )
  console.log(`pico de memória: ${r.memoriaPicoMB ?? 'não informado'} MB`)
  for (const e of r.erros) console.log(`  ! ${e.id}: ${e.erro}`)
  if (aviso) console.log(`aviso: ${aviso}`)
  await sintetizador.fechar?.()
  if (r.erros.length > 0) process.exitCode = 1
}

// Só roda como script; importado pelos testes não faz nada.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`erro: ${e.message}`)
    process.exit(1)
  })
}
