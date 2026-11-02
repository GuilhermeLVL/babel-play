/**
 * O GERADOR DE AUDIOLIVRO (F2): frase a frase, a duração do clipe vira o tempo (sem alinhador); cada capítulo
 * vira um `<nn>.opus` (Opus em WebM, mono) + `<nn>.json` (tempos `{i, t0, t1}`), e o livro um `manifesto.json`
 * (`src/core/leitura/audiolivro.ts`), gravado POR ÚLTIMO (o ponteiro troca de uma vez por livro).
 *
 * As frases são as do leitor (`frasesDoCapituloEpub`, mesma extração e mesmo teto 600 do app): o índice `i` de
 * cada tempo é o da frase destacada na tela. Cada frase vai a `prepararTextoParaVoz` antes do motor; o
 * adaptador sub-divide (`sintetizarComLimite`) quando o limite do motor é menor que a frase.
 *
 * Uso (precisa do `tsx`):
 *   npx tsx scripts/audiolivros/gerar-livro.mjs --livro <id> --voz <voz> --motor supertonic|pocket-tts|falso
 *     --xhtml <cap1.xhtml>[,<cap2.xhtml>…] --dry-run [--saida <dir>] [--max-frases <n>] [--kbps 32]
 *     [--url <base do servidor>] [--demo]
 *
 * `--dry-run` grava em `--saida`, senão `$CLAUDE_JOB_DIR/tmp/audiolivros/` (NUNCA no repositório). O upload ao
 * R2 (`--bucket`) ainda não existe: sem `--dry-run` o script recusa. `--max-frases` corta cada capítulo nas
 * primeiras `n` frases (ensaio); o manifesto e o hash descrevem EXATAMENTE o que foi gerado. `--demo` grava ao
 * lado do manifesto um `demo.json` dizendo que a voz é PROVISÓRIA (o motor ainda não passou pelo portão da F0).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chaveDoCapitulo, hashDasFrases, hashDoLivro, temposDasFrases } from '../../src/core/leitura/audiolivro.ts'
import { OPCOES_PADRAO_DA_NARRACAO } from '../../src/core/leitura/estilosDeLeitura.ts'
import { prepararTextoParaVoz, VERSAO_DO_PREPROCESSADOR } from '../../src/core/leitura/prepararTextoParaVoz.ts'
import { nomeSeguro, pegarOpcao } from '../eval-voz/comum.mjs'
import { frasesDoCapituloEpub } from './capitulos.mjs'
import { codificarOpus } from './opus.mjs'
import { criarSintetizadorFalso, criarSintetizadorHttp, sintetizarComLimite } from './sintetizador.mjs'
import { criarSintetizadorPocketTts, criarSintetizadorSupertonic } from './sintetizador-local.mjs'
import { emendarWavs, wavDeSilencio } from './wav.mjs'

const RAIZ_DO_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * @typedef {import('./sintetizador.mjs').Sintetizador} Sintetizador
 * @typedef {{ texto: string, fimDeParagrafo: boolean }} FraseDoCapitulo
 * @typedef {{ frase: number, paragrafo: number }} Pausas
 */

/**
 * Sintetiza um capítulo. Cada frase tem `tentativas` (padrão 2) além da primeira; a que falha todas entra em
 * `falhas` (e quem chama não publica o capítulo). Clipe sem áudio conta como falha.
 * @param {{ frases: FraseDoCapitulo[], idioma: string, voz: string, sintetizador: Sintetizador,
 *   opcoes: import('../../src/core/leitura/prepararTextoParaVoz.ts').OpcoesDoPreparo, pausas: Pausas,
 *   tentativas?: number }} entrada
 * @returns {Promise<{ wavs: Uint8Array, tempos: import('../../src/core/leitura/audiolivro.ts').FraseComTempo[], falhas: number[] }>}
 */
export async function gerarCapitulo(entrada) {
  const { frases, idioma, voz, sintetizador, opcoes, pausas, tentativas = 2 } = entrada
  const clipes = []
  const falhas = []
  for (const [i, f] of frases.entries()) {
    const texto = prepararTextoParaVoz(f.texto, /** @type {any} */ (idioma), opcoes)
    let clipe = null
    for (let k = 0; k <= tentativas && !clipe; k++) {
      try {
        const c = await sintetizarComLimite(sintetizador, texto, { voz, idioma })
        if (c.duracaoS > 0) clipe = c
      } catch {
        /* tenta de novo; esgotadas as tentativas, a frase vai para `falhas` */
      }
    }
    if (clipe) clipes.push(clipe)
    else falhas.push(i)
  }
  if (falhas.length || clipes.length === 0) return { wavs: new Uint8Array(0), tempos: [], falhas }
  const tempos = temposDasFrases(
    clipes.map((c, i) => ({ duracaoS: c.duracaoS, fimDeParagrafo: frases[i].fimDeParagrafo })),
    pausas,
  )
  /* O silêncio de cada pausa é emendado como um clipe (pausa 0 entre eles): a pausa varia por frase. */
  const taxa = clipes[0].taxaHz
  const pedacos = []
  clipes.forEach((c, i) => {
    pedacos.push(c.wav)
    if (i < clipes.length - 1) {
      const p = frases[i].fimDeParagrafo ? pausas.paragrafo : pausas.frase
      if (p > 0) pedacos.push(wavDeSilencio(p, taxa))
    }
  })
  return { wavs: emendarWavs(pedacos, 0), tempos, falhas }
}

/** A próxima versão do livro/voz na pasta de saída (1 se nenhuma). */
function proximaVersao(pastaDaVoz) {
  if (!existsSync(pastaDaVoz)) return 1
  const versoes = readdirSync(pastaDaVoz)
    .filter((n) => /^\d+$/.test(n))
    .map(Number)
  return versoes.length ? Math.max(...versoes) + 1 : 1
}

/**
 * Gera o livro (os capítulos dados) e grava em `saida` nas chaves do R2 (`chaveDoCapitulo`), o manifesto por
 * último. Alguma frase falhou ⇒ NADA é gravado (`publicado: false`).
 * @param {{ livroId: string, idioma: string, voz: string, sintetizador: Sintetizador,
 *   capitulos: { nn: number, frases: FraseDoCapitulo[] }[], opcoes: object, pausas: Pausas, kbps: number,
 *   saida: string, licencaDoTexto: string, classificacao: string, tentativas?: number,
 *   codificar?: (wav: Uint8Array, kbps: number) => Promise<{ bytes: Uint8Array, sha256: string }>,
 *   agora?: () => Date }} e
 */
export async function gerarLivro(e) {
  const codificar = e.codificar ?? codificarOpus
  const gerados = []
  const falhas = []
  for (const cap of e.capitulos) {
    const r = await gerarCapitulo({ ...e, frases: cap.frases })
    for (const i of r.falhas) falhas.push({ nn: cap.nn, i })
    gerados.push({ cap, r })
  }
  if (falhas.length) return { publicado: false, falhas }

  const pastaDaVoz = path.join(e.saida, 'audiolivros', e.livroId, e.voz)
  const versao = proximaVersao(pastaDaVoz)
  const capitulos = []
  const arquivos = []
  for (const { cap, r } of gerados) {
    const hash = await hashDasFrases(cap.frases.map((f) => f.texto))
    if (cap.frases.length === 0) {
      capitulos.push({ nn: cap.nn, duracaoS: 0, bytes: 0, sha256: '', frases: 0, hashDasFrases: hash })
      continue
    }
    const opus = await codificar(r.wavs, e.kbps)
    const chave = (ext) => chaveDoCapitulo({ livroId: e.livroId, voz: e.voz }, versao, cap.nn, ext)
    arquivos.push([chave('opus'), opus.bytes], [chave('json'), JSON.stringify(r.tempos)])
    capitulos.push({
      nn: cap.nn,
      duracaoS: r.tempos.at(-1).t1,
      bytes: opus.bytes.length,
      sha256: opus.sha256,
      frases: cap.frases.length,
      hashDasFrases: hash,
    })
  }
  const manifesto = {
    versao: 1,
    livroId: e.livroId,
    idioma: e.idioma,
    voz: e.voz,
    motor: e.sintetizador.id,
    versaoDoMotor: e.sintetizador.versao,
    versaoDoPreprocessador: VERSAO_DO_PREPROCESSADOR,
    hashDoTexto: await hashDoLivro(capitulos.map((c) => c.hashDasFrases)),
    capitulos,
    criadoEm: (e.agora?.() ?? new Date()).toISOString(),
    rotulo: 'voz sintetizada',
    licencaDoTexto: e.licencaDoTexto,
    classificacao: e.classificacao,
    formato: { codec: 'opus', kbps: e.kbps, canais: 1 },
  }
  for (const [chave, dados] of arquivos) {
    const destino = path.join(e.saida, chave)
    mkdirSync(path.dirname(destino), { recursive: true })
    writeFileSync(destino, dados)
  }
  /* O manifesto por último, por troca atômica: quem lê vê o anterior ou o novo, nunca a metade. */
  const destino = path.join(pastaDaVoz, 'manifesto.json')
  mkdirSync(pastaDaVoz, { recursive: true })
  writeFileSync(`${destino}.tmp`, `${JSON.stringify(manifesto, null, 2)}\n`)
  renameSync(`${destino}.tmp`, destino)
  return { publicado: true, versao, manifesto, pastaDaVoz, falhas: [] }
}

/* ─────────────────────────── CLI ─────────────────────────── */

function criarSintetizador(argv, motor) {
  const url = pegarOpcao(argv, 'url')
  if (motor === 'falso') return criarSintetizadorFalso()
  if (motor === 'supertonic') return criarSintetizadorSupertonic(url ? { url } : {})
  if (motor === 'pocket-tts') return criarSintetizadorPocketTts(url ? { url } : {})
  if (url) return criarSintetizadorHttp({ id: motor, versao: pegarOpcao(argv, 'versao') ?? 'desconhecida', url })
  throw new Error(`--motor "${motor}": use supertonic, pocket-tts, falso ou --url <base>`)
}

function pastaDeSaida(saida) {
  const destino = path.resolve(
    saida ??
      (process.env.CLAUDE_JOB_DIR
        ? path.join(process.env.CLAUDE_JOB_DIR, 'tmp', 'audiolivros')
        : path.join(tmpdir(), 'audiolivros')),
  )
  const rel = path.relative(RAIZ_DO_REPO, destino)
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)))
    throw new Error(`a pasta de saída não pode ficar dentro do repositório: ${destino}`)
  return destino
}

function livroDoCatalogo(id) {
  const catalogo = JSON.parse(readFileSync(path.join(RAIZ_DO_REPO, 'public/catalogo/livros.json'), 'utf8'))
  const lista = Array.isArray(catalogo) ? catalogo : (catalogo.livros ?? [])
  const livro = lista.find((l) => l.id === id)
  if (!livro) throw new Error(`--livro "${id}" não está em public/catalogo/livros.json`)
  return livro
}

async function main() {
  const argv = process.argv.slice(2)
  const livroId = nomeSeguro(pegarOpcao(argv, 'livro'), '--livro')
  const voz = nomeSeguro(pegarOpcao(argv, 'voz'), '--voz')
  const motor = nomeSeguro(pegarOpcao(argv, 'motor'), '--motor')
  if (!argv.includes('--dry-run'))
    throw new Error('upload ao R2 ainda não implementado nesta entrega: rode com --dry-run (saída local)')
  const xhtml = pegarOpcao(argv, 'xhtml')
  if (!xhtml) throw new Error('--xhtml <cap1.xhtml>[,<cap2.xhtml>…] é obrigatório (os capítulos na ordem do leitor)')
  const kbps = Number(pegarOpcao(argv, 'kbps') ?? 32)
  const maxFrases = pegarOpcao(argv, 'max-frases')
  const teto = maxFrases === undefined ? Infinity : Number(maxFrases)
  if (!(teto > 0)) throw new Error('--max-frases precisa ser um inteiro positivo')
  const saida = pastaDeSaida(pegarOpcao(argv, 'saida'))

  const livro = livroDoCatalogo(livroId)
  const idioma = livro.idioma
  const capitulos = xhtml.split(',').map((arquivo, k) => {
    const todas = frasesDoCapituloEpub(readFileSync(arquivo, 'utf8'), idioma)
    return { nn: k + 1, frases: todas.slice(0, teto), totalNoCapitulo: todas.length }
  })

  const base = criarSintetizador(argv, motor)
  let tempoDeSinteseS = 0
  const sintetizador = {
    ...base,
    async sintetizar(texto, o) {
      const c = await base.sintetizar(texto, o)
      tempoDeSinteseS += c.tempoDeSinteseS
      return c
    },
  }
  const inicio = performance.now()
  const r = await gerarLivro({
    livroId,
    idioma,
    voz,
    sintetizador,
    capitulos,
    opcoes: {},
    pausas: { frase: OPCOES_PADRAO_DA_NARRACAO.pausaFrase, paragrafo: OPCOES_PADRAO_DA_NARRACAO.pausaParagrafo },
    kbps,
    saida,
    licencaDoTexto: livro.licenca ?? 'dominio-publico',
    classificacao: String(livro.classificacao ?? 'desconhecida'),
  })
  const relogioS = (performance.now() - inicio) / 1000
  await base.fechar?.()
  if (!r.publicado) {
    for (const f of r.falhas) console.error(`  ! capítulo ${f.nn}, frase ${f.i}: falhou 3 vezes`)
    throw new Error('frase(s) sem áudio: nada foi gravado')
  }
  const audioS = r.manifesto.capitulos.reduce((t, c) => t + c.duracaoS, 0)
  if (argv.includes('--demo')) {
    const demo = {
      aviso: 'DEMONSTRAÇÃO: voz PROVISÓRIA. O motor não passou pelo portão da F0 (escuta cega + aprovação do dono).',
      motor: r.manifesto.motor,
      versaoDoMotor: r.manifesto.versaoDoMotor,
      voz,
      versao: r.versao,
      capitulos: capitulos.map((c) => ({
        nn: c.nn,
        frasesGeradas: c.frases.length,
        frasesNoCapitulo: c.totalNoCapitulo,
      })),
      rtf: { porServidor: tempoDeSinteseS / audioS, porRelogio: relogioS / audioS },
    }
    writeFileSync(path.join(r.pastaDaVoz, 'demo.json'), `${JSON.stringify(demo, null, 2)}\n`)
  }
  console.log(`manifesto: ${path.join(r.pastaDaVoz, 'manifesto.json')} (versão ${r.versao})`)
  for (const c of r.manifesto.capitulos)
    console.log(`  cap ${c.nn}: ${c.frases} frases, ${c.duracaoS} s, ${c.bytes} bytes`)
  console.log(
    `áudio ${audioS.toFixed(1)} s; síntese ${tempoDeSinteseS.toFixed(1)} s (RTF ${(tempoDeSinteseS / audioS).toFixed(3)}); relógio ${relogioS.toFixed(1)} s (RTF ${(relogioS / audioS).toFixed(3)})`,
  )
}

// Só roda como script; importado pelos testes não faz nada.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
