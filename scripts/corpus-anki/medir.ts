/**
 * MEDIR — runner de corpus para o gate G2 (ingestão de baralhos Anki).
 *
 * POR QUE ISTO EXISTE. Não basta o importador "funcionar" num `.apkg` de teste com 6 notas.
 * O gate pede saber, em baralhos REAIS (que vêm de fora, e que ninguém guarda no repositório
 * por tamanho e licença): quantas notas, quanto tempo, quanta memória, quantas passam na régua
 * de qualidade do app (`avaliarCartao`), e quantas alimentam cada minigame. Sem medir, cada uma
 * dessas perguntas é uma opinião; com este script, é um número reproduzível.
 *
 * Uso:
 *   npx tsx scripts/corpus-anki/medir.ts --dir "C:/caminho/com/apkgs" [--saida docs/pesquisa/motor-anki/corpus.json]
 *
 * NENHUM BARALHO ENTRA NO REPOSITÓRIO — só este script e o JSON de métricas que ele produz.
 */

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, extname, basename, dirname } from 'node:path'
import { lerApkg, lerTextoAnki, type LeituraAnki, type NotaAnki } from '../../server/import/anki'
import { avaliarCartao, type MotivoDescarte } from '../../src/core/learning/quality'
import { MINIGAMES, type MinigameId } from '../../src/core/minigames/types'
import type { VocabCard } from '../../src/types'

/* ─────────────────────────── ARGUMENTOS ─────────────────────────── */

interface Args {
  dir: string
  saida?: string
}

function lerArgs(argv: string[]): Args {
  const args: Partial<Args> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') args.dir = argv[++i]
    else if (argv[i] === '--saida') args.saida = argv[++i]
  }
  if (!args.dir) {
    console.error('uso: npx tsx scripts/corpus-anki/medir.ts --dir "<pasta com .apkg/.colpkg/.txt>" [--saida arquivo.json]')
    process.exit(1)
  }
  return args as Args
}

/* ─────────────────────────── AMOSTRAGEM DE MEMÓRIA ─────────────────────────── */

/**
 * Amostra `process.memoryUsage().rss` enquanto a promessa roda, e devolve o pico em MB.
 *
 * NÃO É PERFEITO: um `setInterval` de 20ms não captura picos mais curtos que isso, mas é
 * proporção suficiente para comparar baralhos entre si (o objetivo real da medição), e é o único
 * jeito sem instrumentar o V8 (perf_hooks não expõe RSS por trecho de código).
 */
async function medirComPicoDeMemoria<T>(fn: () => Promise<T>): Promise<{ resultado: T; ms: number; rssPicoMb: number }> {
  let pico = process.memoryUsage().rss
  const amostrador = setInterval(() => {
    const atual = process.memoryUsage().rss
    if (atual > pico) pico = atual
  }, 20)
  const inicio = performance.now()
  try {
    const resultado = await fn()
    const ms = performance.now() - inicio
    return { resultado, ms, rssPicoMb: Math.round((pico / (1024 * 1024)) * 10) / 10 }
  } finally {
    clearInterval(amostrador)
  }
}

/* ─────────────────────────── IDIOMA ─────────────────────────── */

/**
 * Idioma inferido do NOME DO ARQUIVO, quando dá para reconhecer — senão 'en'.
 *
 * SUPOSIÇÃO EXPLÍCITA: `avaliarCartao` com `exigirIdioma: false` não descarta por falta de
 * idioma, mas ainda usa `srcLang` para escolher a lista de palavras gramaticais (`ehGramatical`)
 * — sem lista para o idioma, o filtro gramatical simplesmente não age (comportamento documentado
 * em `quality.ts`). Então errar o idioma aqui não faz um cartão bom ser reprovado; no pior caso,
 * deixa passar uma palavra gramatical que a lista certa pegaria. É uma aproximação aceitável para
 * medir o CORPUS, não para decidir o idioma real de importação (isso é decisão do usuário na UI).
 */
const PISTAS_DE_IDIOMA: Array<[RegExp, string]> = [
  [/japon|japanese|jlpt|kanji|nihongo/i, 'ja'],
  [/chin[eê]s|chinese|hsk|mandarin/i, 'zh'],
  [/[aá]rabe|arabic/i, 'ar'],
  [/russ[oa]|russian|cyrillic|cir[ií]lico/i, 'ru'],
  [/portugu[eê]s|portuguese/i, 'pt'],
  [/espanhol|spanish|castellano/i, 'es'],
  [/franc[eê]s|french/i, 'fr'],
  [/alem[aã]o|german|deutsch/i, 'de'],
  [/coreano|korean|hangul/i, 'ko'],
  [/ingl[eê]s|english/i, 'en'],
]

function inferirIdioma(nomeArquivo: string): string {
  for (const [regex, lang] of PISTAS_DE_IDIOMA) {
    if (regex.test(nomeArquivo)) return lang
  }
  return 'en'
}

/* ─────────────────────────── ELEGIBILIDADE POR MINIGAME ─────────────────────────── */

/**
 * Checagem do Termo: 4–6 letras Unicode, sem hífen/espaço.
 *
 * APROXIMAÇÃO DELIBERADA: a régua real (`motivoForaDoTermo` em `src/core/minigames/termo.ts`)
 * também considera a FAIXA de dificuldade escolhida (facil/medio/dificil, cada uma com seu
 * min/max dentro de 4–6) e a pista. Aqui medimos só a faixa 'medio' (4–6, a mais permissiva das
 * três) e a régua de qualidade já cuida da pista — o suficiente para dizer "o baralho tem
 * material para o Termo", sem replicar a faixa inteira aqui.
 */
function chaveDoTermo(texto: string): string {
  return (texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^\p{L}]/gu, '')
}
function passaNoTermo(palavra: string): boolean {
  const bruto = (palavra ?? '').trim()
  if (/[\s-]/.test(bruto)) return false
  const n = chaveDoTermo(bruto).length
  return n >= 4 && n <= 6
}

interface ElegibilidadePorJogo {
  elegivel: boolean
  itensDisponiveis: number
  minItems: number
}

function elegibilidadeDosJogos(aprovados: VocabCard[]): Record<MinigameId, ElegibilidadePorJogo> {
  const resultado = {} as Record<MinigameId, ElegibilidadePorJogo>
  for (const def of Object.values(MINIGAMES)) {
    let pool = aprovados
    if (def.requiresTranslation) pool = pool.filter(c => (c.translation ?? '').trim().length > 0)
    if (def.id === 'termo') pool = pool.filter(c => passaNoTermo(c.word))
    resultado[def.id] = {
      elegivel: pool.length >= def.minItems,
      itensDisponiveis: pool.length,
      minItems: def.minItems,
    }
  }
  return resultado
}

/* ─────────────────────────── MEDIÇÃO DE UM ARQUIVO ─────────────────────────── */

interface AmostraDeNota { frente: string; verso: string }

interface MedicaoArquivo {
  arquivo: string
  bytes: number
  formatoInterno: string
  ms: number
  rssPicoMb: number
  notas: number
  descartadas: number
  campos: string[]
  temMidia: boolean
  regua: {
    aprovadas: number
    percentualAprovadas: number
    porMotivo: Record<MotivoDescarte, number>
  }
  jogos: Record<MinigameId, ElegibilidadePorJogo>
  amostra: AmostraDeNota[]
  idiomaInferido: string
}

interface MedicaoErro { arquivo: string; erro: string }

function truncar(s: string, n: number): string {
  const t = (s ?? '').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

function notaParaCard(nota: NotaAnki, srcLang: string): VocabCard {
  return {
    id: '',
    word: nota.frente,
    phonetics: '',
    translation: nota.verso,
    explanation: '',
    sentence: nota.exemplo,
    srcLang,
  } as VocabCard
}

const MOTIVOS_ZERO: Record<MotivoDescarte, number> = {
  'sem-pista': 0, 'pista-ruim': 0, 'palavra-curta': 0, 'palavra-ruido': 0,
  'traducao-igual': 0, 'gramatical': 0, 'duplicada': 0, 'idioma-incerto': 0,
}

async function medirArquivo(caminho: string, bytes: number): Promise<MedicaoArquivo> {
  const nome = basename(caminho)
  const ext = extname(caminho).toLowerCase()
  const idiomaInferido = inferirIdioma(nome)

  const { resultado: leitura, ms, rssPicoMb } = await medirComPicoDeMemoria(async (): Promise<LeituraAnki> => {
    if (ext === '.txt') {
      const texto = await readFile(caminho, 'utf-8')
      return lerTextoAnki(texto)
    }
    // .apkg e .colpkg têm a mesma forma interna (zip com collection.anki2/21/21b).
    const buf = await readFile(caminho)
    return lerApkg(buf)
  })

  const cards = leitura.notas.map(n => notaParaCard(n, idiomaInferido))
  const porMotivo: Record<MotivoDescarte, number> = { ...MOTIVOS_ZERO }
  const aprovados: VocabCard[] = []
  for (const card of cards) {
    const v = avaliarCartao(card, { exigirIdioma: false })
    if (v.serve) aprovados.push(card)
    else if (v.motivo) porMotivo[v.motivo]++
  }

  const amostra: AmostraDeNota[] = leitura.notas.slice(0, 3).map(n => ({
    frente: truncar(n.frente, 60),
    verso: truncar(n.verso, 60),
  }))

  return {
    arquivo: nome,
    bytes,
    formatoInterno: leitura.formato,
    ms: Math.round(ms),
    rssPicoMb,
    notas: leitura.notas.length,
    descartadas: leitura.descartadas,
    campos: leitura.campos,
    temMidia: leitura.temMidia,
    regua: {
      aprovadas: aprovados.length,
      percentualAprovadas: cards.length ? Math.round((aprovados.length / cards.length) * 1000) / 10 : 0,
      porMotivo,
    },
    jogos: elegibilidadeDosJogos(aprovados),
    amostra,
    idiomaInferido,
  }
}

/* ─────────────────────────── TABELA NO STDOUT ─────────────────────────── */

function imprimirTabela(medicoes: MedicaoArquivo[], erros: MedicaoErro[]): void {
  console.log('')
  console.log('arquivo'.padEnd(32), 'notas'.padStart(7), 'aprov.'.padStart(7), '%'.padStart(6), 'jogos'.padStart(6), 'ms'.padStart(7), 'MB'.padStart(6))
  console.log('-'.repeat(32 + 7 + 7 + 6 + 6 + 7 + 6 + 12))
  for (const m of medicoes) {
    const jogosElegiveis = Object.values(m.jogos).filter(j => j.elegivel).length
    console.log(
      truncar(m.arquivo, 32).padEnd(32),
      String(m.notas).padStart(7),
      String(m.regua.aprovadas).padStart(7),
      `${m.regua.percentualAprovadas}%`.padStart(6),
      `${jogosElegiveis}/${Object.keys(m.jogos).length}`.padStart(6),
      String(m.ms).padStart(7),
      String(m.rssPicoMb).padStart(6),
    )
  }
  if (erros.length) {
    console.log('')
    console.log('ERROS:')
    for (const e of erros) console.log(`  ${e.arquivo}: ${e.erro}`)
  }
  console.log('')
}

/* ─────────────────────────── MAIN ─────────────────────────── */

async function main(): Promise<void> {
  const { dir, saida } = lerArgs(process.argv.slice(2))

  let entradas: string[]
  try {
    entradas = await readdir(dir)
  } catch (e) {
    console.error(`não consegui ler o diretório "${dir}": ${(e as Error).message}`)
    console.error('verifique se o caminho existe e aponta para uma pasta com .apkg/.colpkg/.txt.')
    process.exit(1)
  }

  const alvo = entradas.filter(f => ['.apkg', '.colpkg', '.txt'].includes(extname(f).toLowerCase()))
  if (!alvo.length) {
    console.log(`nenhum .apkg/.colpkg/.txt encontrado em "${dir}". Nada para medir.`)
    if (saida) await writeFile(saida, JSON.stringify({ geradoEm: new Date().toISOString(), dir, medicoes: [], erros: [] }, null, 2), 'utf-8')
    return
  }

  const medicoes: MedicaoArquivo[] = []
  const erros: MedicaoErro[] = []

  for (const arquivo of alvo) {
    const caminho = join(dir, arquivo)
    try {
      const { size } = await import('node:fs').then(fs => fs.promises.stat(caminho))
      const m = await medirArquivo(caminho, size)
      medicoes.push(m)
    } catch (e) {
      // NÃO ABORTA O LOTE: um baralho corrompido não pode impedir de medir os outros 20.
      erros.push({ arquivo, erro: (e as Error).message })
    }
  }

  imprimirTabela(medicoes, erros)

  if (saida) {
    await mkdir(dirname(saida), { recursive: true })
    await writeFile(saida, JSON.stringify({ geradoEm: new Date().toISOString(), dir, medicoes, erros }, null, 2), 'utf-8')
    console.log(`métricas escritas em ${saida}`)
  }
}

main().catch(e => {
  console.error('falha inesperada:', e)
  process.exit(1)
})
