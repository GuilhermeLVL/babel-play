/**
 * Baixa o FLORES-200 (en→pt) e monta o subconjunto usado pela bancada de tradução.
 *
 * POR QUE ESTE CORPUS ENTROU. O gold set próprio tem 16 casos, e a medição provou que isso não
 * separa modelos: o `openai/gpt-oss-120b` deu 85,4 / 76,8 / 83,1 / 91,5 / 80,2 / 82,1 em execuções
 * idênticas — **11,3 pontos de amplitude**, contra 1,7 ponto de diferença para o concorrente. Com
 * 16 casos, qualquer pódio é ruído com aparência de ordem.
 *
 * O QUE ELE MEDE, E O QUE NÃO MEDE. FLORES é texto jornalístico traduzido por profissionais: mede
 * adequação geral, com N grande e comparabilidade com o resto do mundo. **Não mede fala** — nem
 * gíria, nem registro informal, nem pronome resolvido pela frase anterior. Por isso ele entra AO
 * LADO do gold set de fala, nunca no lugar dele. Um modelo que ganhe aqui e perca lá não serve para
 * este produto.
 *
 * Dados ficam fora do git (`.gitignore`); só o manifesto com hash é versionado, como já se faz para
 * o áudio do CORAA.
 *
 * Uso:
 *   node scripts/eval-fala/baixar-flores.mjs            (padrão: 200 frases)
 *   node scripts/eval-fala/baixar-flores.mjs --n 400
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'

const URL_FONTE = 'https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz'
const DESTINO = 'tests/fixtures/flores/flores-en-pt.jsonl'
const MANIFESTO = 'tests/fixtures/flores/manifesto.json'

const args = process.argv.slice(2)
const iN = args.indexOf('--n')
const N = iN > -1 && args[iN + 1] ? Number(args[iN + 1]) : 200

const tmp = path.join(os.tmpdir(), 'flores200')
const tgz = path.join(os.tmpdir(), 'flores200_dataset.tar.gz')

function baixarEExtrair() {
  if (!existsSync(tgz)) {
    console.log(`baixando ${URL_FONTE} …`)
    execFileSync('curl', ['-sL', '--max-time', '600', '-o', tgz, URL_FONTE], { stdio: 'inherit' })
  }
  mkdirSync(tmp, { recursive: true })
  /* DOIS TROPEÇOS DO TAR NO WINDOWS, os dois com mensagem que não descreve a causa:
       1. sem `--force-local`, o `C:` do caminho é lido como NOME DE MÁQUINA remota
          ("Cannot connect to C: resolve failed");
       2. com ele, as contrabarras passam a ser literais e o diretório "sumiu".
     Barras normais resolvem os dois — o Windows aceita `C:/...` em qualquer API de arquivo. */
  const posix = (p) => p.split(path.sep).join('/')
  execFileSync('tar', ['xzf', posix(tgz), '-C', posix(tmp), '--force-local'], { stdio: 'inherit' })
}

/**
 * Localiza o diretório `devtest` depois de extrair.
 *
 * Contar componentes (`--strip-components`) seria mais curto e mais frágil: as entradas deste
 * arquivo vêm com prefixo `./`, então stripar 1 remove o ponto e não a pasta — e o erro que aparece
 * é "arquivo não encontrado", que não aponta para a causa. Procurar pelo nome sobrevive a qualquer
 * prefixo que o empacotador use.
 */
function acharDevtest(raiz) {
  const pilha = [raiz]
  while (pilha.length) {
    const dir = pilha.pop()
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      if (e.name === 'devtest') return path.join(dir, e.name)
      pilha.push(path.join(dir, e.name))
    }
  }
  throw new Error(`diretório 'devtest' não encontrado em ${raiz}`)
}

function main() {
  baixarEExtrair()
  const devtest = acharDevtest(tmp)
  const ler = (arq) => readFileSync(path.join(devtest, arq), 'utf8').split('\n').filter((l) => l.length > 0)
  const en = ler('eng_Latn.devtest')
  const pt = ler('por_Latn.devtest')
  if (en.length !== pt.length) throw new Error(`desalinhado: ${en.length} en contra ${pt.length} pt`)

  /* Amostra ESPAÇADA, não as N primeiras. O devtest vem ordenado por artigo de origem: pegar o
     começo mediria um punhado de assuntos, e a variedade temática é metade do valor deste corpus. */
  const passo = Math.max(1, Math.floor(en.length / N))
  const linhas = []
  for (let i = 0; i < en.length && linhas.length < N; i += passo) {
    linhas.push(JSON.stringify({
      id: `flores-${String(i).padStart(4, '0')}`,
      categoria: 'flores',   // o esquema do gold set, para a bancada ler os dois igual
      origem: en[i],
      referencia: pt[i],
      contexto: [],          // FLORES é frase isolada: não há falas anteriores
    }))
  }

  mkdirSync(path.dirname(DESTINO), { recursive: true })
  writeFileSync(DESTINO, linhas.join('\n') + '\n')

  const hash = createHash('sha256').update(readFileSync(DESTINO)).digest('hex')
  writeFileSync(MANIFESTO, JSON.stringify({
    fonte: URL_FONTE,
    licenca: 'CC BY-SA 4.0',
    split: 'devtest',
    par: 'eng_Latn → por_Latn',
    totalNoSplit: en.length,
    amostrados: linhas.length,
    amostragem: `espaçada, passo ${passo}`,
    sha256: hash,
    geradoEm: new Date().toISOString(),
  }, null, 2))

  console.log(`${linhas.length} frases en→pt em ${DESTINO}`)
  console.log(`manifesto (versionado): ${MANIFESTO}`)
}

main()
