#!/usr/bin/env node
/**
 * SEMENTE DA MEMÓRIA DE TRADUÇÃO — frases curtas e frequentes do Tatoeba, já traduzidas por gente
 * (harness adaptativo §1.2, degrau M2). Saída: `public/semente-traducao/<a>-<b>.tsv`, lida
 * preguiçosamente por `src/lib/traducao/sementeDeTraducao.ts` (nunca entra no bundle).
 *
 *   node scripts/semente-traducao/gerar.mjs                 # en-pt e es-pt, do cache
 *   node scripts/semente-traducao/gerar.mjs --baixar        # baixa o que faltar (confere o tamanho antes)
 *   node scripts/semente-traducao/gerar.mjs --pares=en-pt --max-kb=140
 *
 * FONTE (Tatoeba, CC BY 2.0 FR — atribuição obrigatória, vai no cabeçalho do arquivo e na tela
 * Sobre). Os exports POR IDIOMA, não o dump global (que tem centenas de MB):
 *   https://downloads.tatoeba.org/exports/per_language/<iso3>/<iso3>_sentences.tsv.bz2   (id \t lang \t texto)
 *   https://downloads.tatoeba.org/exports/per_language/<a>/<a>-<b>_links.tsv.bz2          (id_a \t id_b)
 * Em 28/09/2026: eng 24 MB, por 6,4 MB, spa 6,4 MB, eng-por 1,9 MB, spa-por 0,5 MB (bz2). Acima de
 * 100 MB o `--baixar` desiste. O cache é o da trilha (`.cache/trilha/`, fora do git), com os nomes
 * que `scripts/trilha/fontes.mjs` já usa: `tatoeba-<iso3>.tsv` e `links-<a>-<b>.tsv`.
 *
 * FILTROS: até 8 palavras dos dois lados; sem algarismo, aspas, parênteses ou barra; sem nome
 * próprio (maiúscula no meio da frase, ou a mesma palavra maiúscula dos dois lados — o "Tom" do
 * Tatoeba); uma tradução por frase (a mais curta), sem repetir a frase normalizada.
 *
 * ORDEM: das frases de vocabulário mais básico e mais DITAS para as raras. Nota = nível médio das
 * palavras do lado estrangeiro − 0,75 · log2(traduções da frase no Tatoeba). O nível vem da lista
 * da trilha (`public/trilha/<idioma>.json`, A1 = 1 … C2 = 6), que é CEFR e não lista palavra
 * funcional ("you", "thank", "how"): vale o MENOR entre ela e a FREQUÊNCIA do token no próprio corpo
 * ligado (100 mais comuns = 1, 500 = 2, 2.000 = 3, 5.000 = 4, o resto = 7). As traduções medem o
 * uso: "Thank you!" tem seis em português, "You're old." uma. Empate, a mais curta. Corta onde o
 * arquivo passa de `--max-kb` em gzip (orçamento de 150 KB por par; o padrão deixa folga).
 */
import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { baixar, DIR_CACHE, ISO3 } from '../trilha/fontes.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const DESTINO = path.join(RAIZ, 'public', 'semente-traducao')
const URL_BASE = 'https://downloads.tatoeba.org/exports/per_language'
const MAX_MB_DOWNLOAD = 100
export const MAX_PALAVRAS = 8

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d

/** A mesma normalização da chave da memória (`prepararFala.ts#chaveNormalizada`). */
export function chaveNormalizada(texto) {
  return texto
    .trim()
    .toLowerCase()
    .replace(/[.!…\s]+$/g, '')
    .replace(/\s+/g, ' ')
}

const palavras = (t) => t.trim().split(/\s+/).filter(Boolean)
const limpa = (p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, '')

/** Maiúsculas com cara de nome: no meio da frase (menos o "I"), ou a mesma dos dois lados. */
function temNome(a, b) {
  const tokA = palavras(a).map(limpa).filter(Boolean)
  const tokB = palavras(b).map(limpa).filter(Boolean)
  const maiuscula = (p) => /^\p{Lu}/u.test(p) && p.length > 1
  const noMeio = (t) => t.some((p, k) => k > 0 && maiuscula(p))
  return noMeio(tokA) || noMeio(tokB) || tokA.some((p) => maiuscula(p) && tokB.includes(p))
}

/** A frase serve de semente? (ver FILTROS no topo.) */
export function serve(a, b) {
  for (const t of [a, b]) {
    const n = palavras(t).length
    if (n < 1 || n > MAX_PALAVRAS || t.length > 80) return false
    if (/[\p{N}"“”«»()[\]/\\]/u.test(t)) return false
  }
  return !temNome(a, b)
}

/** palavra → nível (1 = A1 … 6 = C2), da trilha do idioma. Sem trilha, mapa vazio. */
export function niveisDaTrilha(lang) {
  const arquivo = path.join(RAIZ, 'public', 'trilha', `${lang}.json`)
  const fora = new Map()
  if (!existsSync(arquivo)) return fora
  const { niveis = {} } = JSON.parse(readFileSync(arquivo, 'utf8'))
  ;['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].forEach((nivel, k) => {
    for (const e of niveis[nivel] ?? []) {
      const p = String(Array.isArray(e) ? e[0] : e).toLowerCase()
      if (!fora.has(p)) fora.set(p, k + 1)
    }
  })
  return fora
}

const tokens = (frase) =>
  palavras(frase)
    .map((p) => limpa(p).toLowerCase())
    .filter(Boolean)

/** token → nível pela frequência no corpo (fallback da trilha para palavra funcional). */
export function niveisPorFrequencia(frases) {
  const conta = new Map()
  for (const f of frases) for (const t of tokens(f)) conta.set(t, (conta.get(t) ?? 0) + 1)
  const ordem = [...conta].sort((x, y) => y[1] - x[1]).map(([t]) => t)
  return new Map(ordem.map((t, k) => [t, k < 100 ? 1 : k < 500 ? 2 : k < 2000 ? 3 : k < 5000 ? 4 : 7]))
}

export function pontuar(frase, niveis, frequencia = new Map()) {
  const t = tokens(frase)
  if (!t.length) return 99
  // O MENOR dos dois: a trilha não lista "thank" nem "you", e a frequência não sabe que "action" é A1.
  return t.reduce((s, p) => s + Math.min(niveis.get(p) ?? 7, frequencia.get(p) ?? 7), 0) / t.length
}

/**
 * Português de PORTUGAL e ênclise ("Amo-a.", "Tens", "contigo"): corretos, mas não é como o público
 * (brasileiro) fala. Pesam contra na escolha entre traduções da mesma frase; não a excluem.
 */
const ENCLISE = /\p{L}-(?:a|o|as|os|la|lo|las|los|me|te|se|nos|lhe|lhes)(?!\p{L})/u
const EUROPEU = new Set([
  'tu',
  'teu',
  'tua',
  'teus',
  'tuas',
  'contigo',
  'vós',
  'tens',
  'estás',
  'és',
  'sabes',
  'podes',
  'queres',
  'vais',
  'fazes',
  'estavas',
  'tinhas',
  'podeis',
])
export function estranheza(b) {
  return (ENCLISE.test(b) ? 2 : 0) + tokens(b).filter((t) => EUROPEU.has(t)).length
}

/** A tradução sem pontuação nem caixa: "Obrigado!" e "obrigado." são o mesmo voto. */
const semPontuacao = (b) => tokens(b).join(' ')
const voto = (p) => `${chaveNormalizada(p.a)}\t${semPontuacao(p.b)}`

/**
 * Junta, filtra, deduplica e ordena. Puro (para teste): `pares` = [{ idA, a, idB, b }].
 *
 * Uma tradução por frase normalizada, por VOTO: a forma que mais colaboradores do Tatoeba deram
 * (sem pontuação); empate, a menos estranha ao português do Brasil (`estranheza`), depois a de
 * palavras mais comuns no corpo, depois a mais curta.
 */
export function escolher(pares, niveis) {
  const traducoes = new Map()
  const votos = new Map()
  for (const p of pares) {
    const k0 = chaveNormalizada(p.a)
    traducoes.set(k0, (traducoes.get(k0) ?? 0) + 1)
    const v = voto(p)
    votos.set(v, (votos.get(v) ?? 0) + 1)
  }
  const frequencia = niveisPorFrequencia(pares.map((p) => p.a))
  const freqB = niveisPorFrequencia(pares.map((p) => p.b))
  const custo = (p) => [-(votos.get(voto(p)) ?? 0), estranheza(p.b), pontuar(p.b, new Map(), freqB), p.b.length]
  const menor = (x, y) => {
    const [cx, cy] = [custo(x), custo(y)]
    for (let i = 0; i < cx.length; i++) if (cx[i] !== cy[i]) return cx[i] < cy[i]
    return x.b < y.b
  }
  const porFrase = new Map()
  for (const p of pares) {
    if (!serve(p.a, p.b)) continue
    const k = chaveNormalizada(p.a)
    const atual = porFrase.get(k)
    if (!atual || menor(p, atual)) porFrase.set(k, p)
  }
  return [...porFrase.values()]
    .map((p) => ({
      ...p,
      nota: pontuar(p.a, niveis, frequencia) - 0.75 * Math.log2(traducoes.get(chaveNormalizada(p.a)) ?? 1),
      n: palavras(p.a).length,
    }))
    .sort((x, y) => x.nota - y.nota || x.n - y.n || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0))
}

export function cabecalho(a, b) {
  return [
    `# Semente da memória de tradução do Babel Play (${a}-${b}). Gerada por scripts/semente-traducao/gerar.mjs.`,
    '# Fonte: Tatoeba (https://tatoeba.org), licença CC BY 2.0 FR (https://creativecommons.org/licenses/by/2.0/fr/).',
    `# Frases e traduções dos colaboradores do Tatoeba; os ids de cada linha estão em ${a}-${b}.ids.tsv.`,
  ].join('\n')
}

/** Corta a lista no maior prefixo cujo arquivo cabe em `maxBytes` gzip (busca binária). */
export function cortarNoOrcamento(escolhidas, topo, maxBytes) {
  const texto = (n) =>
    `${topo}\n${escolhidas
      .slice(0, n)
      .map((p) => `${p.a}\t${p.b}`)
      .join('\n')}\n`
  let lo = 0
  let hi = escolhidas.length
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2)
    if (gzipSync(texto(meio)).length <= maxBytes) lo = meio
    else hi = meio - 1
  }
  return { n: lo, tsv: texto(lo) }
}

async function linhas(arquivo, cada) {
  const rl = createInterface({ input: createReadStream(arquivo, 'utf8'), crlfDelay: Infinity })
  for await (const l of rl) cada(l)
}

/** Baixa um `.bz2` do Tatoeba para o cache, conferindo o tamanho antes, e descomprime. */
async function garantir(url, nomeTsv) {
  const tsv = path.join(DIR_CACHE, nomeTsv)
  if (existsSync(tsv)) return tsv
  if (!process.argv.includes('--baixar'))
    throw new Error(`falta ${tsv}. Rode com --baixar, ou baixe ${url} e descomprima (bunzip2) para esse nome.`)
  const head = await fetch(url, { method: 'HEAD' })
  const mb = Number(head.headers.get('content-length') ?? 0) / 1e6
  if (!head.ok || mb > MAX_MB_DOWNLOAD)
    throw new Error(`${url}: ${head.status}, ${mb.toFixed(1)} MB — desisto (teto ${MAX_MB_DOWNLOAD} MB)`)
  const bz2 = await baixar(url, `${nomeTsv}.bz2`)
  const r = spawnSync('bunzip2', ['-c', bz2], { maxBuffer: 1 << 30 })
  if (r.status !== 0) throw new Error(`bunzip2 falhou em ${bz2}: descomprima à mão para ${tsv}`)
  writeFileSync(tsv, r.stdout)
  return tsv
}

async function gerarPar(a, b, maxKb) {
  const [ia, ib] = [ISO3[a], ISO3[b]]
  const links = await garantir(`${URL_BASE}/${ia}/${ia}-${ib}_links.tsv.bz2`, `links-${ia}-${ib}.tsv`)
  const frasesA = await garantir(`${URL_BASE}/${ia}/${ia}_sentences.tsv.bz2`, `tatoeba-${ia}.tsv`)
  const frasesB = await garantir(`${URL_BASE}/${ib}/${ib}_sentences.tsv.bz2`, `tatoeba-${ib}.tsv`)

  const ligacoes = []
  const idsA = new Set()
  const idsB = new Set()
  await linhas(links, (l) => {
    const [x, y] = l.split('\t')
    if (!x || !y) return
    ligacoes.push([x.trim(), y.trim()])
    idsA.add(x.trim())
    idsB.add(y.trim())
  })
  const ler = async (arquivo, ids) => {
    const m = new Map()
    await linhas(arquivo, (l) => {
      const c = l.split('\t')
      if (c.length >= 3 && ids.has(c[0])) m.set(c[0], c[2].trim())
    })
    return m
  }
  const [textoA, textoB] = [await ler(frasesA, idsA), await ler(frasesB, idsB)]
  const pares = []
  for (const [x, y] of ligacoes) {
    const pa = textoA.get(x)
    const pb = textoB.get(y)
    if (pa && pb) pares.push({ idA: x, a: pa, idB: y, b: pb })
  }
  const escolhidas = escolher(pares, niveisDaTrilha(a))
  const { n, tsv } = cortarNoOrcamento(escolhidas, cabecalho(a, b), maxKb * 1024)
  mkdirSync(DESTINO, { recursive: true })
  writeFileSync(path.join(DESTINO, `${a}-${b}.tsv`), tsv)
  writeFileSync(
    path.join(DESTINO, `${a}-${b}.ids.tsv`),
    `# ids Tatoeba (${ia} \\t ${ib}) de cada linha de ${a}-${b}.tsv, na mesma ordem\n${escolhidas
      .slice(0, n)
      .map((p) => `${p.idA}\t${p.idB}`)
      .join('\n')}\n`,
  )
  console.log(
    `${a}-${b}: ${pares.length} pares ligados → ${escolhidas.length} servem → ${n} publicadas, ${(gzipSync(tsv).length / 1024).toFixed(1)} KB gzip`,
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const maxKb = Number(arg('max-kb', '140'))
  for (const par of arg('pares', 'en-pt,es-pt').split(',')) {
    const [a, b] = par.split('-')
    await gerarPar(a, b, maxKb)
  }
}
