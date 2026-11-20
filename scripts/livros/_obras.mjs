/**
 * A OBRA DE CADA EDIÇÃO (`obra` e `titulosAlternativos` do catálogo), pela Wikidata.
 *
 * Só o QID da obra liga edições de idiomas diferentes. De onde ele vem, edição por edição:
 *   · Wikisource pt: o item da Wikidata que a página da Wikisource descreve (`sites=ptwikisource`) é a obra;
 *   · Gutenberg: o item com `P2034` (identificador do Project Gutenberg). Se ele for uma EDIÇÃO, o `P629`
 *     (edição ou tradução de) aponta para a obra; se não tiver `P629`, o próprio item é a obra;
 *   · Standard Ebooks: os números do Gutenberg que o próprio EPUB cita como fonte (lidos do cache, sem baixar
 *     EPUB), e daí o mesmo caminho do Gutenberg;
 *   · o que sobrar (a Wikidata não tem o identificador do Gutenberg): o AUTOR é confirmado pela Wikidata (nome +
 *     ano de morte IGUAL ao do catálogo, candidato único) e o título da edição tem de ser, no idioma dela, um
 *     rótulo ou apelido de UMA obra desse autor (`P50`, obra escrita). Autor não confirmado, ou título que
 *     serve a duas obras, não liga nada.
 * Sem QID, `obra` é `local:<idioma>:<autor>-<título>`: só desambigua dentro do idioma e NUNCA liga idiomas.
 *
 * Os títulos alternativos são os rótulos (labels) do item da obra nos idiomas da trilha, mais alguns apelidos
 * (aliases) em en/es/pt/fr/de/it. Rede educada e com cache em disco, pelo `_rede.mjs`.
 */
import { strFromU8, unzipSync } from 'fflate'

import { montarTitulosAlternativos, obraLocal, tituloEquivale } from '../../src/core/livros/obras.ts'
import { baixar, esquecerDoCache, lerDoCache } from './_rede.mjs'

const IDIOMAS_DOS_ROTULOS = [
  'en',
  'es',
  'pt',
  'pt-br',
  'fr',
  'de',
  'it',
  'ru',
  'nl',
  'pl',
  'sv',
  'tr',
  'ar',
  'he',
  'hi',
  'ja',
  'ko',
  'zh',
]
const IDIOMAS_DOS_APELIDOS = new Set(['en', 'es', 'pt', 'fr', 'de', 'it'])
const WIKIDATA = 'https://www.wikidata.org/w/api.php'
const QID = /^Q\d+$/

/** Os números do Gutenberg que o EPUB do Standard Ebooks cita como fonte (`dc:source`), só do que já está no cache. */
function numerosDoGutenbergDoSe(livro) {
  const url = livro.formatos?.epub
  if (!url) return []
  const bin = lerDoCache(`${url}?source=download`, 'binario')
  if (!bin) return []
  try {
    const z = unzipSync(bin, { filter: (f) => /\.opf$/i.test(f.name) })
    const opf = Object.values(z)
      .map((v) => strFromU8(v))
      .join('\n')
    return [...opf.matchAll(/gutenberg\.org\/(?:ebooks\/|files\/)?(\d+)/g)].map((m) => m[1])
  } catch {
    return []
  }
}

/** `pg-1342` → `1342`. */
const numeroDoPg = (livro) => (livro.fonte === 'gutenberg-curado' ? livro.fonteId : null)

/** Item (ou obra, via P629) de cada número do Gutenberg: `Map<numero, Set<qidDaObra>>`. */
async function obrasPorNumeroDoGutenberg(numeros) {
  const mapa = new Map()
  /* "Fraco": o item do identificador não tem P629 e quase nenhuma página ligada. Costuma ser o registro da
     EDIÇÃO (ex.: "Hamlet (Spanish)"), não a obra: a conferência por autor e título pode corrigi-lo. */
  const fracos = new Set()
  const todos = [...new Set(numeros)]
  for (let i = 0; i < todos.length; i += 60) {
    const lote = todos.slice(i, i + 60)
    const sparql = `SELECT ?id ?item ?obra ?links WHERE { VALUES ?id { ${lote.map((n) => `"${n}"`).join(' ')} } ?item wdt:P2034 ?id . OPTIONAL { ?item wdt:P629 ?obra . } OPTIONAL { ?item wikibase:sitelinks ?links . } }`
    const j = await baixar(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}`, 'json', {
      aceitar: 'application/sparql-results+json',
    })
    for (const b of j?.results?.bindings ?? []) {
      const id = b.id.value
      const qid = (b.obra ?? b.item).value.split('/').pop()
      if (!QID.test(qid)) continue
      if (!mapa.has(id)) mapa.set(id, new Set())
      mapa.get(id).add(qid)
      if (!b.obra && Number(b.links?.value ?? 0) < 5) fracos.add(qid)
    }
  }
  return { mapa, fracos }
}

/** Item da Wikidata da página da Wikisource pt: `Map<título, qid>`. */
async function obrasDaWikisource(titulos) {
  const mapa = new Map()
  const todos = [...new Set(titulos)]
  for (let i = 0; i < todos.length; i += 40) {
    const lote = todos.slice(i, i + 40)
    const url = `${WIKIDATA}?action=wbgetentities&sites=ptwikisource&titles=${encodeURIComponent(lote.join('|'))}&props=sitelinks&sitefilter=ptwikisource&redirects=yes&format=json`
    const j = await baixar(url, 'json')
    for (const [qid, ent] of Object.entries(j?.entities ?? {})) {
      const titulo = ent.sitelinks?.ptwikisource?.title
      if (QID.test(qid) && titulo) mapa.set(titulo, qid)
    }
  }
  return mapa
}

/** Rótulos e apelidos de cada obra, na ordem dos idiomas, seguindo redirecionamento: `Map<qid, {obra, rotulos}>`. */
async function rotulosDasObras(qids) {
  const mapa = new Map()
  const todos = [...new Set(qids)]
  for (let i = 0; i < todos.length; i += 40) {
    const lote = todos.slice(i, i + 40)
    const url = `${WIKIDATA}?action=wbgetentities&ids=${lote.join('|')}&props=labels|aliases&languages=${IDIOMAS_DOS_ROTULOS.join('|')}&redirects=yes&format=json`
    const j = await baixar(url, 'json')
    for (const [qid, ent] of Object.entries(j?.entities ?? {})) {
      if (!QID.test(qid) || ent.missing !== undefined) continue
      const rotulos = []
      for (const lang of IDIOMAS_DOS_ROTULOS) if (ent.labels?.[lang]?.value) rotulos.push(ent.labels[lang].value)
      for (const lang of IDIOMAS_DOS_ROTULOS)
        if (IDIOMAS_DOS_APELIDOS.has(lang)) for (const a of ent.aliases?.[lang] ?? []) rotulos.push(a.value)
      const v = { obra: qid, rotulos }
      mapa.set(qid, v)
      for (const dePara of ent.redirects ? [ent.redirects] : []) mapa.set(dePara.from, v)
    }
    /* O pedido original com redirecionamento: o QID pedido responde pelo item de destino. */
    for (const q of lote) {
      if (mapa.has(q)) continue
      const destino = Object.values(j?.entities ?? {}).find((e) => e.redirects?.from === q)
      if (destino && mapa.has(destino.id)) mapa.set(q, mapa.get(destino.id))
    }
  }
  return mapa
}

/** Ano de uma data da Wikidata (`+1616-04-22T00:00:00Z`). */
const anoDaData = (t) => {
  const m = String(t ?? '').match(/^([+-]?)(\d{1,4})/)
  return m ? Number(m[1] === '-' ? -m[2] : m[2]) : null
}

/** QID do autor: nome + ano de morte IGUAL ao do catálogo, e só se houver um único candidato. `Map<chave, qid|null>`. */
const autorPorChave = new Map()
async function qidDoAutor(pessoa) {
  if (!pessoa?.nome || !Number.isInteger(pessoa.anoMorte)) return null
  const chave = `${pessoa.nome}|${pessoa.anoMorte}`
  if (autorPorChave.has(chave)) return autorPorChave.get(chave)
  const partes = pessoa.nome.split(/\s+/)
  const consultas = [
    ...new Set([pessoa.nome, partes.length > 2 ? `${partes[0]} ${partes[partes.length - 1]}` : null].filter(Boolean)),
  ]
  const candidatos = new Set()
  for (const q of consultas) {
    const j = await baixar(
      `${WIKIDATA}?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&uselang=en&type=item&limit=10&format=json`,
      'json',
    )
    for (const r of j?.search ?? []) if (QID.test(r.id)) candidatos.add(r.id)
  }
  const certos = []
  const lista = [...candidatos]
  for (let i = 0; i < lista.length; i += 25) {
    const lote = lista.slice(i, i + 25)
    const j = await baixar(`${WIKIDATA}?action=wbgetentities&ids=${lote.join('|')}&props=claims&format=json`, 'json')
    for (const [qid, ent] of Object.entries(j?.entities ?? {})) {
      const mortes = (ent.claims?.P570 ?? []).map((c) => anoDaData(c.mainsnak?.datavalue?.value?.time))
      if (
        mortes.includes(pessoa.anoMorte) &&
        (ent.claims?.P31 ?? []).some((c) => c.mainsnak?.datavalue?.value?.id === 'Q5')
      )
        certos.push(qid)
    }
  }
  const qid = certos.length === 1 ? certos[0] : null
  autorPorChave.set(chave, qid)
  return qid
}

/** As obras de um autor (itens com P50 que não são edição: sem P629; o caminho por P31/P279* estoura o tempo do WDQS) com rótulos e apelidos nos idiomas da trilha: `Map<qid, Map<idioma, string[]>>`. */
const obrasPorAutor = new Map()
async function obrasDoAutor(autorQid) {
  if (obrasPorAutor.has(autorQid)) return obrasPorAutor.get(autorQid)
  const langs = IDIOMAS_DOS_ROTULOS.map((l) => `"${l}"`).join(', ')
  const sparql = `SELECT ?obra ?rotulo ?links WHERE {
  ?obra wdt:P50 wd:${autorQid} . ?obra wikibase:sitelinks ?links . FILTER NOT EXISTS { ?obra wdt:P629 [] }
  { ?obra rdfs:label ?rotulo } UNION { ?obra skos:altLabel ?rotulo }
  FILTER(LANG(?rotulo) IN (${langs}))
}`
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql + ' LIMIT 4000')}`
  let j = null
  for (let tentativa = 0; tentativa < 3 && !j; tentativa++) {
    try {
      j = await baixar(url, 'json', { aceitar: 'application/sparql-results+json' })
      break
    } catch (e) {
      /* O WDQS às vezes corta a resposta no tempo-limite com HTTP 200: o cache dela não vale. */
      if (!(e instanceof SyntaxError)) throw e
      esquecerDoCache(url)
    }
  }
  const mapa = new Map()
  for (const b of j?.results?.bindings ?? []) {
    const qid = b.obra.value.split('/').pop()
    const lang = b.rotulo['xml:lang']
    if (!QID.test(qid) || !lang) continue
    if (!mapa.has(qid)) mapa.set(qid, { links: Number(b.links?.value ?? 0), porIdioma: new Map() })
    const { porIdioma } = mapa.get(qid)
    porIdioma.set(lang, [...(porIdioma.get(lang) ?? []), b.rotulo.value])
  }
  obrasPorAutor.set(autorQid, mapa)
  return mapa
}

/** A obra do autor confirmado cujo título (no idioma do livro) é o da edição; `null` se não há ou se há duas. */
async function obraPorAutorETitulo(livro, relatorio) {
  for (const pessoa of livro.autores) {
    const autor = await qidDoAutor(pessoa)
    if (!autor) {
      relatorio(`${livro.id}: autor "${pessoa.nome}" (†${pessoa.anoMorte}) não confirmado na Wikidata`)
      continue
    }
    const obras = await obrasDoAutor(autor)
    const idiomas = livro.idioma === 'pt' ? ['pt', 'pt-br'] : [livro.idioma]
    const iguais = [...obras]
      .filter(([, { porIdioma }]) =>
        idiomas.some((i) => (porIdioma.get(i) ?? []).some((r) => tituloEquivale(livro.titulo, r))),
      )
      .sort((a, b) => b[1].links - a[1].links)
    if (iguais.length === 1) return iguais[0][0]
    /* Vários itens com o mesmo título (a peça, partes, traduções cadastradas como obra): vale o canônico, o que
       tem MUITO mais páginas ligadas (pelo menos o dobro do segundo e 10 ou mais). Senão, ambíguo: não liga. */
    if (iguais.length > 1 && iguais[0][1].links >= 10 && iguais[0][1].links >= 2 * iguais[1][1].links)
      return iguais[0][0]
    relatorio(
      iguais.length
        ? `${livro.id}: "${livro.titulo}" serve a ${iguais.length} obras de ${autor} (${iguais.map((x) => `${x[0]}:${x[1].links}`).join(', ')})`
        : `${livro.id}: nenhuma obra de ${autor} (${obras.size} obras) tem o título "${livro.titulo}" em ${livro.idioma}`,
    )
    if (iguais.length > 1) return null
  }
  return null
}

/**
 * Para cada livro: `{ obra, titulosAlternativos? }`. `Map<id, campos>`. Edição sem QID leva só `obra` local.
 * `relatorio` recebe o que não resolveu, para a montagem avisar.
 */
export async function resolverObras(livros, relatorio = () => {}) {
  const qidDoLivro = new Map()

  const doWikisource = livros.filter((l) => l.fonte === 'wikisource')
  const itens = await obrasDaWikisource(doWikisource.map((l) => l.fonteId))
  for (const l of doWikisource) if (itens.has(l.fonteId)) qidDoLivro.set(l.id, itens.get(l.fonteId))

  const numerosDoLivro = new Map()
  for (const l of livros) {
    const nums = l.fonte === 'standard-ebooks' ? numerosDoGutenbergDoSe(l) : [numeroDoPg(l)].filter(Boolean)
    if (nums.length) numerosDoLivro.set(l.id, nums)
  }
  const { mapa: porNumero, fracos } = await obrasPorNumeroDoGutenberg([...numerosDoLivro.values()].flat())
  for (const [id, nums] of numerosDoLivro) {
    /* Só vale quando TODOS os números do livro apontam para uma única obra: ambíguo não liga. */
    const qids = new Set(nums.flatMap((n) => [...(porNumero.get(n) ?? [])]))
    if (qids.size === 1) qidDoLivro.set(id, [...qids][0])
    else if (qids.size > 1) relatorio(`${id}: mais de uma obra na Wikidata (${[...qids].join(', ')}), fica local`)
  }

  /* O resto: o autor confirmado + o título como rótulo de uma obra dele. */
  for (const l of livros) {
    const atual = qidDoLivro.get(l.id)
    if (l.fonte === 'wikisource' || (atual && !fracos.has(atual))) continue
    const qid = await obraPorAutorETitulo(l, relatorio)
    if (qid) qidDoLivro.set(l.id, qid)
  }

  const rotulos = await rotulosDasObras([...qidDoLivro.values()])
  const saida = new Map()
  for (const l of livros) {
    const info = rotulos.get(qidDoLivro.get(l.id))
    if (!info) {
      saida.set(l.id, { obra: obraLocal(l) })
      continue
    }
    const titulosAlternativos = montarTitulosAlternativos(info.rotulos, l.titulo)
    saida.set(l.id, { obra: info.obra, ...(titulosAlternativos.length ? { titulosAlternativos } : {}) })
  }
  return saida
}
