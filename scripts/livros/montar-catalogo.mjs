#!/usr/bin/env node
/**
 * MONTA O CATÁLOGO DE LIVROS (`public/catalogo/livros.json`) — L1 de `docs/specs/2026-10-26-livros-e-leitura.md`.
 *
 * Script ÚNICO, rodado por uma pessoa e versionado junto com o que ele gera. Não é job, não roda no CI, não
 * roda no servidor. Como rodar e como revisar: `docs/livros-catalogo.md`.
 *
 *   npx tsx scripts/livros/montar-catalogo.mjs --ano=2026            # monta (usa o cache em data/livros-cache)
 *   npx tsx scripts/livros/montar-catalogo.mjs --verificar           # só confere o JSON publicado (sai ≠ 0 se violar)
 *   npx tsx scripts/livros/montar-catalogo.mjs --ano=2026 --rapido   # alvo pequeno, para testar a montagem
 *
 * FONTES (nenhuma página do gutenberg.org é lida; ver `_rede.mjs`):
 *   · Standard Ebooks: a listagem pública por popularidade e o EPUB de cada livro (metadados do OPF);
 *   · Gutendex: metadados do Gutenberg (`death_year`, `translators`, `download_count`), por idioma;
 *     o texto vem do ESPELHO `gutenberg.pglaf.org`, uma vez, só para medir o nível;
 *   · Wikisource em português + Wikidata: obras escritas em português, com o ano de morte de cada autor;
 *   · Wikidata também dá o ano de morte das pessoas do Standard Ebooks (pelos links da Wikipedia do OPF).
 *
 * O FILTRO LEGAL é `src/core/livros/filtroLegal.ts`, o mesmo que os testes cobrem. Ao fim, TODO livro do JSON é
 * conferido de novo contra ele; um só que viole faz o script sair com código 1 sem gravar nada.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { strFromU8, unzipSync } from 'fflate'

import {
  categoriasDosAssuntos,
  ehAutorDoVestibular,
  nomeNaOrdemDireta,
  slug,
} from '../../src/core/livros/categorias.ts'
import { lerEpubComoTexto } from '../../src/core/livros/epub.ts'
import { ehClassificacao } from '../../src/core/livros/catalogo.ts'
import {
  anoEmSaoPaulo,
  anoLimite,
  avaliarLegalidade,
  passaNaDefesaDoCliente,
} from '../../src/core/livros/filtroLegal.ts'
import { metadadosLegaisDoGutendex, pessoaDoGutendex } from '../../src/core/livros/fontes.ts'
import {
  LINHA_DE_CREDITO,
  limparTextoDoGutenberg,
  TextoComDireitosDeclarados,
} from '../../src/core/livros/gutenberg.ts'
import { textoDizQueETraducao } from '../../src/core/livros/traducao.ts'
import { contarPalavras, estimarNivel, montarIndiceCefr } from '../../src/core/livros/nivelEstimado.ts'
import { textoDoEspelho } from './_espelho.mjs'
import { resolverObras } from './_obras.mjs'
import { baixar, pedidosFeitos, usarCache } from './_rede.mjs'

const RAIZ = fileURLToPath(new URL('../..', import.meta.url))
const AQUI = dirname(fileURLToPath(import.meta.url))

/* ── Argumentos ──────────────────────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2)
const arg = (nome) => args.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
/* O ano é o CIVIL NO BRASIL (America/Sao_Paulo): a virada do domínio público é 1º de janeiro daqui. No CI
   (que só roda `--verificar`) e em qualquer montagem automatizada, o ano tem de vir explícito. */
if (process.env.CI && !arg('ano') && !args.includes('--verificar'))
  throw new Error('no CI, --ano=AAAA é obrigatório (o relógio da máquina não decide o domínio público)')
const ANO = Number(arg('ano') ?? anoEmSaoPaulo(new Date()))
const SAIDA = join(RAIZ, arg('saida') ?? 'public/catalogo/livros.json')
const SO_VERIFICAR = args.includes('--verificar')
const RAPIDO = args.includes('--rapido')
/* Só acrescenta `obra`/`titulosAlternativos` ao JSON publicado (Wikidata, com cache); não muda a lista de livros. */
const SO_OBRAS = args.includes('--obras')
if (!Number.isInteger(ANO) || ANO < 2000 || ANO > 2200) throw new Error(`--ano inválido: ${arg('ano')}`)
const LIMITE = anoLimite(ANO)

/** Os 16 idiomas da trilha, mais o português; profundidade em en, es e pt (decisão do dono, 26/10). */
const ALVO = RAPIDO
  ? { en: 8, es: 4, pt: 6, fr: 2 }
  : {
      en: 110,
      es: 60,
      pt: 70,
      fr: 12,
      de: 12,
      it: 12,
      ru: 12,
      nl: 12,
      pl: 12,
      sv: 12,
      tr: 12,
      ar: 12,
      he: 12,
      hi: 12,
      ja: 12,
      ko: 12,
      zh: 12,
    }
const MAX_SE = RAPIDO ? 4 : 70
const MAX_WIKISOURCE = RAPIDO ? 3 : 50
/** Páginas do Gutendex (32 livros cada) por idioma, no máximo. */
const MAX_PAGINAS = RAPIDO ? 1 : 8

const PALAVRAS_POR_MINUTO = 180

/* ── Listas revisadas por pessoa ─────────────────────────────────────────────────────────────── */

const lerJson = (arq) => JSON.parse(readFileSync(join(AQUI, arq), 'utf8'))
/**
 * `id → classificação`, revisada à mão (`classificacao.json`). Fora dela: `null`, "a revisar". Só vale o item
 * com `revisor` de pessoa: a PROPOSTA (`"revisor": "proposta-claude"`) sai `null` até o dono trocar o revisor
 * pelo nome dele. Valor fora de livre/12/14/16/18 para a montagem (falha fechada, nunca vira "livre").
 */
export const REVISOR_DE_PROPOSTA = 'proposta-claude'
const CLASSIFICACAO = new Map()
for (const r of lerJson('classificacao.json').revisados) {
  if (!ehClassificacao(r.classificacao)) throw new Error(`classificacao.json: "${r.classificacao}" inválida em ${r.id}`)
  if (typeof r.revisor !== 'string' || !r.revisor.trim() || r.revisor === REVISOR_DE_PROPOSTA) continue
  CLASSIFICACAO.set(r.id, r.classificacao)
}
/**
 * Idiomas de autor decididos à mão (`idiomas-de-autor.json`), para quando a Wikidata não decide (pessoa não
 * achada, ou sem idioma de escrita). Nome na ordem direta → códigos de duas letras.
 */
const IDIOMAS_MANUAIS = new Map(Object.entries(lerJson('idiomas-de-autor.json').autores))
/** Obras anônimas ou coletivas que entram por justificativa escrita (`excecoes.json`). */
const EXCECOES = new Map(lerJson('excecoes.json').obras.map((o) => [`${o.fonte}:${o.fonteId}`, o]))

/* ── Listas CEFR da trilha ───────────────────────────────────────────────────────────────────── */

const indices = new Map()
function indiceDe(lang) {
  if (!indices.has(lang)) {
    const arq = join(RAIZ, 'src/data/trilha/niveis', `${lang}.json`)
    indices.set(lang, existsSync(arq) ? montarIndiceCefr(JSON.parse(readFileSync(arq, 'utf8'))) : new Map())
  }
  return indices.get(lang)
}

/* ── O que sai ───────────────────────────────────────────────────────────────────────────────── */

const livros = []
const exclusoes = []
const idsUsados = new Set()
/** Chave de duplicata: título + sobrenome do primeiro autor, por idioma. */
const obrasVistas = new Set()

const chaveDaObra = (idioma, titulo, autores) =>
  `${idioma}|${slug(titulo.replace(/\(.*?\)/g, ''))}|${slug((autores[0]?.nome ?? '').split(' ').pop() ?? '')}`

function excluir(meta, veredito) {
  exclusoes.push({
    titulo: meta.titulo,
    autores: meta.autores.map((a) => a.nome),
    idioma: meta.idioma,
    fonte: meta.fonteRotulo,
    motivo: veredito.motivo,
    detalhe: veredito.detalhe,
  })
}

const anoDe = (texto) => {
  const m = String(texto ?? '').match(/^([+-]?)(\d{1,4})/)
  return m ? Number(m[1] === '-' ? -m[2] : m[2]) : null
}

function licencaDe(autores, tradutores) {
  const quem = [
    ...autores.map((a) => `${a.nome} †${a.anoMorte}`),
    ...tradutores.map((t) => `tradução de ${t.nome} †${t.anoMorte}`),
  ].join('; ')
  return `Domínio público no Brasil (Lei 9.610, art. 41): ${quem}.`
}

/** Acima disto é coletânea de obras completas ou dicionário, não um livro para ler: fica de fora. */
const TETO_DE_PALAVRAS = 650_000

/** Dicionário, genealogia, catálogo, índice: referência, não leitura. Fica fora sem virar "exclusão" legal. */
const NAO_E_LEITURA =
  /dicion|diccion|dictionar|w(?:ö|oe)rterbuch|genealog|cat[aá]logo|catalogue|vocabul[aá]rio|\bindex\b|\bíndice\b/i

/** Mede e monta o livro; devolve `false` quando ele não entra por tamanho ou por não ser leitura. */
function aceitar(meta, texto) {
  if (NAO_E_LEITURA.test(meta.titulo)) return false
  const palavras = meta.palavras ?? (texto ? contarPalavras(texto, meta.idioma) : 0)
  if (palavras > TETO_DE_PALAVRAS) {
    console.warn(`[catalogo] ${meta.id} (${meta.titulo}): ${palavras} palavras, fica de fora`)
    return false
  }
  const categorias = new Set(categoriasDosAssuntos(meta.assuntos))
  if (meta.idioma === 'pt' && meta.autores.some((a) => ehAutorDoVestibular(a.nome))) categorias.add('enem')
  /* Verso e teatro quebram as fórmulas de legibilidade (linha curta não é frase curta): só a cobertura. */
  const semLegibilidade = categorias.has('poesia') || categorias.has('teatro')
  const nivel = texto ? estimarNivel(texto, meta.idioma, indiceDe(meta.idioma), { semLegibilidade }) : null
  let id = meta.id
  for (let i = 2; idsUsados.has(id); i++) id = `${meta.id}-${i}`
  idsUsados.add(id)
  livros.push({
    id,
    titulo: meta.titulo,
    autores: meta.autores,
    tradutores: meta.tradutores,
    idioma: meta.idioma,
    fonte: meta.fonte,
    fonteId: meta.fonteId,
    formatos: meta.formatos,
    categorias: [...categorias],
    classificacao: CLASSIFICACAO.get(id) ?? null,
    nivel: nivel?.nivel ?? null,
    ...(nivel
      ? { nivelDetalhe: { cobertura: nivel.cobertura, legibilidade: nivel.legibilidade, amostras: nivel.amostras } }
      : {}),
    palavras,
    minutosEstimados: Math.max(1, Math.round(palavras / PALAVRAS_POR_MINUTO)),
    popularidade: 0,
    downloads: meta.downloads ?? 0,
    credito: meta.credito,
    licenca: licencaDe(meta.autores, meta.tradutores),
    ...(meta.resumo ? { resumo: meta.resumo } : {}),
    ...(meta.traducaoDeclarada ? { traducaoDeclarada: true } : {}),
  })
  obrasVistas.add(chaveDaObra(meta.idioma, meta.titulo, meta.autores))
  return true
}

/* ── Wikidata: pessoas (ano de morte e idiomas de escrita) ──────────────────────────────────── */

/** `https://en.wikipedia.org/wiki/Fyodor_Dostoevsky` → QID (pageprops), em lotes de 50. */
async function qidsPorWikipedia(links) {
  const porWiki = new Map()
  for (const link of links) {
    const m = link.match(/^https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/)
    if (!m) continue
    const titulo = decodeURIComponent(m[2]).replace(/_/g, ' ')
    porWiki.set(m[1], [...(porWiki.get(m[1]) ?? []), { link, titulo }])
  }
  const qidPorLink = new Map()
  for (const [wiki, itens] of porWiki) {
    for (let i = 0; i < itens.length; i += 50) {
      const lote = itens.slice(i, i + 50)
      const url = `https://${wiki}.wikipedia.org/w/api.php?action=query&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(lote.map((x) => x.titulo).join('|'))}`
      const j = await baixar(url, 'json')
      const destino = new Map(lote.map((x) => [x.titulo, x.titulo]))
      for (const n of j?.query?.normalized ?? []) destino.set(n.from, n.to)
      for (const r of j?.query?.redirects ?? []) for (const [k, v] of destino) if (v === r.from) destino.set(k, r.to)
      const qidPorTitulo = new Map((j?.query?.pages ?? []).map((p) => [p.title, p.pageprops?.wikibase_item]))
      for (const x of lote) {
        const qid = qidPorTitulo.get(destino.get(x.titulo))
        if (qid) qidPorLink.set(x.link, qid)
      }
    }
  }
  return qidPorLink
}

/** As afirmações válidas de uma propriedade: sem as obsoletas (deprecated); havendo "preferida", só ela. */
function afirmacoes(ent, prop) {
  const validas = (ent.claims?.[prop] ?? []).filter((c) => c.rank !== 'deprecated')
  const preferidas = validas.filter((c) => c.rank === 'preferred')
  return preferidas.length ? preferidas : validas
}

/** O ano (P570, P569); com mais de uma data, a MAIS RECENTE (para a morte, a mais restritiva). */
const anoDaEntidade = (ent, prop) => {
  const anos = afirmacoes(ent, prop)
    .map((c) => anoDe(c.mainsnak?.datavalue?.value?.time))
    .filter((a) => a != null)
  return anos.length ? Math.max(...anos) : null
}

/** Três letras (ISO 639-2/3) → duas, para os idiomas que a P218 não cobre (chinês clássico, por exemplo). */
const DE_TRES_LETRAS = {
  eng: 'en',
  spa: 'es',
  por: 'pt',
  fra: 'fr',
  fre: 'fr',
  deu: 'de',
  ger: 'de',
  ita: 'it',
  rus: 'ru',
  nld: 'nl',
  dut: 'nl',
  pol: 'pl',
  swe: 'sv',
  tur: 'tr',
  ara: 'ar',
  heb: 'he',
  hin: 'hi',
  jpn: 'ja',
  kor: 'ko',
  zho: 'zh',
  chi: 'zh',
  lzh: 'zh',
  cmn: 'zh',
  och: 'zh',
  yue: 'zh',
  lat: 'la',
  grc: 'grc',
  ell: 'el',
  gre: 'el',
}

const codigoPorQidDeIdioma = new Map()
async function codigosDosIdiomas(qids) {
  const faltam = qids.filter((q) => !codigoPorQidDeIdioma.has(q))
  for (let i = 0; i < faltam.length; i += 50) {
    const lote = faltam.slice(i, i + 50)
    const j = await baixar(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=${lote.join('|')}`,
      'json',
    )
    for (const [qid, ent] of Object.entries(j?.entities ?? {})) {
      const valor = (p) => afirmacoes(ent, p)[0]?.mainsnak?.datavalue?.value
      const duas = valor('P218')
      const tres = valor('P219') ?? valor('P220')
      const codigo = duas ?? DE_TRES_LETRAS[tres] ?? null
      codigoPorQidDeIdioma.set(qid, typeof codigo === 'string' ? codigo.toLowerCase() : null)
    }
    for (const q of lote) if (!codigoPorQidDeIdioma.has(q)) codigoPorQidDeIdioma.set(q, null)
  }
}

/**
 * Nome (pt, senão en), anos de nascimento e de morte e os IDIOMAS DE ESCRITA de cada QID, seguindo
 * redirecionamento. Idiomas: P6886 (idioma de escrita), P1412 (idiomas falados, escritos ou sinalizados) e
 * P103 (língua materna), juntos.
 */
const pessoaPorQid = new Map()
async function pessoasPorQid(qids) {
  const faltam = [...new Set(qids)].filter((q) => !pessoaPorQid.has(q))
  const brutas = new Map()
  for (let i = 0; i < faltam.length; i += 50) {
    const lote = faltam.slice(i, i + 50)
    const j = await baixar(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&props=labels|claims&languages=pt|en&redirects=yes&format=json&ids=${lote.join('|')}`,
      'json',
    )
    for (const [qid, ent] of Object.entries(j?.entities ?? {})) {
      brutas.set(qid, ent)
      if (ent.redirects?.from) brutas.set(ent.redirects.from, ent)
    }
  }
  const qidsDeIdioma = new Set()
  for (const ent of brutas.values())
    for (const p of ['P6886', 'P1412', 'P103'])
      for (const c of afirmacoes(ent, p))
        if (c.mainsnak?.datavalue?.value?.id) qidsDeIdioma.add(c.mainsnak.datavalue.value.id)
  await codigosDosIdiomas([...qidsDeIdioma])
  for (const [qid, ent] of brutas) {
    const idiomas = new Set()
    for (const p of ['P6886', 'P1412', 'P103'])
      for (const c of afirmacoes(ent, p)) {
        const codigo = codigoPorQidDeIdioma.get(c.mainsnak?.datavalue?.value?.id)
        if (codigo) idiomas.add(codigo)
      }
    pessoaPorQid.set(qid, {
      nome: ent.labels?.pt?.value ?? ent.labels?.en?.value ?? null,
      anoMorte: anoDaEntidade(ent, 'P570'),
      anoNascimento: anoDaEntidade(ent, 'P569'),
      idiomas: [...idiomas],
    })
  }
  return new Map([...new Set(qids)].map((q) => [q, pessoaPorQid.get(q) ?? null]))
}

/**
 * Os idiomas de escrita de uma pessoa do Gutendex. A Wikidata é buscada pelo nome, e o candidato só vale se
 * o ano de morte bater (e o de nascimento também, quando os dois lados têm): homônimo não decide nada. Sem
 * candidato que bata, a lista manual; sem ela, `null` (desconhecido = tradução, falha fechada).
 */
const idiomasResolvidos = new Map()
async function idiomasDaPessoaDoGutendex(p) {
  const nome = nomeNaOrdemDireta(p.name)
  if (IDIOMAS_MANUAIS.has(nome)) return IDIOMAS_MANUAIS.get(nome)
  if (!Number.isInteger(p.death_year)) return null
  const chave = `${nome}|${p.birth_year}|${p.death_year}`
  if (idiomasResolvidos.has(chave)) return idiomasResolvidos.get(chave)
  const j = await baixar(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(nome)}&language=en&uselang=en&type=item&limit=10&format=json`,
    'json',
  )
  const candidatos = await pessoasPorQid((j?.search ?? []).map((r) => r.id))
  const bate = [...candidatos.values()].find(
    (c) =>
      c &&
      c.anoMorte === p.death_year &&
      (!Number.isInteger(p.birth_year) || c.anoNascimento == null || c.anoNascimento === p.birth_year),
  )
  const idiomas = bate?.idiomas?.length ? bate.idiomas : null
  idiomasResolvidos.set(chave, idiomas)
  return idiomas
}

/** Os idiomas de todas as pessoas de um livro do Gutendex, pelo nome na ordem direta. */
async function idiomasDoLivroDoGutendex(b) {
  const mapa = new Map()
  for (const p of [...(b.authors ?? []), ...(b.translators ?? [])])
    mapa.set(nomeNaOrdemDireta(p.name), await idiomasDaPessoaDoGutendex(p))
  return mapa
}

/* ── Gutendex ────────────────────────────────────────────────────────────────────────────────── */

async function downloadsDoGutendex(ids) {
  const mapa = new Map()
  for (let i = 0; i < ids.length; i += 30) {
    const j = await baixar(`https://gutendex.com/books/?ids=${ids.slice(i, i + 30).join(',')}`, 'json')
    for (const b of j?.results ?? []) mapa.set(b.id, b)
  }
  return mapa
}

/* ── Standard Ebooks ─────────────────────────────────────────────────────────────────────────── */

async function standardEbooks() {
  const caminhos = []
  for (let pagina = 1; caminhos.length < MAX_SE * 2 && pagina <= 4; pagina++) {
    const html = await baixar(`https://standardebooks.org/ebooks?sort=popularity&per-page=48&page=${pagina}`)
    if (!html) break
    for (const m of html.matchAll(/typeof="schema:Book"\s+about="(\/ebooks\/[^"]+)"/g)) caminhos.push(m[1])
  }
  const candidatos = []
  for (const caminho of [...new Set(caminhos)]) {
    const arquivo = caminho
      .replace(/^\/ebooks\//, '')
      .split('/')
      .join('_')
    const url = `https://standardebooks.org${caminho}/downloads/${arquivo}.epub`
    const bin = await baixar(`${url}?source=download`, 'binario')
    if (!bin) continue
    let epub
    try {
      const z = unzipSync(bin, { filter: (f) => /\.(x?html?|opf|xml)$/i.test(f.name) })
      epub = lerEpubComoTexto(Object.fromEntries(Object.entries(z).map(([k, v]) => [k, strFromU8(v)])))
    } catch (e) {
      console.warn(`[se] ${caminho}: ${e.message}`)
      continue
    }
    candidatos.push({ caminho, url, epub })
    if (candidatos.length >= MAX_SE * 1.6) break
  }
  /* Anos de morte e idiomas, de uma vez: todas as pessoas com link da Wikipedia. */
  const links = candidatos.flatMap((c) =>
    [...c.epub.metadados.autores, ...c.epub.metadados.colaboradores].flatMap((p) => p.links),
  )
  const qidPorLink = await qidsPorWikipedia([...new Set(links)])
  const pessoaPorLink = new Map()
  const pessoas = await pessoasPorQid([...new Set(qidPorLink.values())])
  for (const [link, qid] of qidPorLink) pessoaPorLink.set(link, pessoas.get(qid))
  const idsDoGutenberg = candidatos.flatMap((c) =>
    c.epub.metadados.fontes.map((f) => Number(f.match(/gutenberg\.org\/(?:ebooks\/)?(\d+)/)?.[1])).filter(Boolean),
  )
  const doGutendex = await downloadsDoGutendex([...new Set(idsDoGutenberg)])
  const usadosDoGutenberg = new Set()
  let aceitos = 0
  for (const c of candidatos) {
    const md = c.epub.metadados
    const fontesPg = md.fontes.map((f) => Number(f.match(/gutenberg\.org\/(?:ebooks\/)?(\d+)/)?.[1])).filter(Boolean)
    const gutendex = fontesPg.map((id) => doGutendex.get(id)).filter(Boolean)
    const anoPorNome = (nome) => {
      const sobrenome = slug(nome).split('-').pop()
      for (const b of gutendex)
        for (const p of [...(b.authors ?? []), ...(b.translators ?? [])])
          if (slug(p.name).includes(sobrenome) && Number.isInteger(p.death_year)) return p.death_year
      return null
    }
    const pessoa = (p) => {
      const daWikidata = p.links.map((l) => pessoaPorLink.get(l)).find(Boolean)
      const idiomas = daWikidata?.idiomas?.length ? daWikidata.idiomas : IDIOMAS_MANUAIS.get(p.nome)
      return {
        nome: p.nome,
        anoMorte: daWikidata?.anoMorte ?? anoPorNome(p.nome),
        ...(idiomas?.length ? { idiomas } : {}),
      }
    }
    const autores = md.autores.filter((p) => !p.papeis.length || p.papeis.includes('aut')).map(pessoa)
    const tradutores = md.colaboradores.filter((p) => p.papeis.includes('trl')).map(pessoa)
    const meta = {
      id: `se-${slug(c.caminho.replace(/^\/ebooks\//, ''))}`,
      titulo: md.titulo,
      autores,
      tradutores,
      idioma: md.idioma || 'en',
      fonte: 'standard-ebooks',
      fonteRotulo: 'Standard Ebooks',
      fonteId: c.caminho.replace(/^\/ebooks\//, ''),
      formatos: { epub: c.url, pagina: `https://standardebooks.org${c.caminho}` },
      assuntos: md.assuntos,
      palavras: md.palavras,
      downloads: gutendex.reduce((s, b) => Math.max(s, b.download_count ?? 0), 0),
      credito: `Edição do Standard Ebooks (CC0), produzida por voluntários a partir de texto em domínio público.`,
      resumo: md.descricao ? md.descricao.split('\n\n')[0].slice(0, 400) : undefined,
    }
    if (aceitos >= MAX_SE) continue
    const texto = c.epub.capitulos.map((x) => x.texto).join('\n\n')
    meta.traducaoDeclarada = textoDizQueETraducao(texto)
    const v = avaliarLegalidade(meta, ANO)
    if (!v.entra) {
      excluir(meta, v)
      continue
    }
    if (!aceitar(meta, texto)) continue
    for (const id of fontesPg) usadosDoGutenberg.add(id)
    aceitos++
  }
  console.log(`[se] ${aceitos} aceitos de ${candidatos.length} lidos`)
  return usadosDoGutenberg
}

async function gutendex(idioma, alvo, jaTem, pularIds) {
  let aceitos = jaTem
  let url = `https://gutendex.com/books/?languages=${idioma}&sort=popular`
  for (let pagina = 0; url && pagina < MAX_PAGINAS && aceitos < alvo; pagina++) {
    const j = await baixar(url, 'json')
    if (!j) break
    url = j.next
    for (const b of j.results ?? []) {
      if (aceitos >= alvo) break
      if (pularIds.has(b.id) || b.media_type !== 'Text' || (b.languages ?? []).length !== 1) continue
      const excecao = EXCECOES.get(`gutenberg-curado:${b.id}`)
      const titulo = b.title.split(/[:;]\s|\r?\n/)[0].trim()
      /* Primeiro o que não custa rede: os anos de morte. Só quem passa ali vai à Wikidata atrás do idioma. */
      const semIdioma = new Map()
      const autoresSemIdioma = excecao?.autores ?? (b.authors ?? []).map((p) => pessoaDoGutendex(p, semIdioma))
      const tradutoresSemIdioma = (b.translators ?? []).map((p) => pessoaDoGutendex(p, semIdioma))
      const previa = avaliarLegalidade(
        {
          autores: autoresSemIdioma.map((a) => ({ ...a, idiomas: [idioma] })),
          tradutores: tradutoresSemIdioma,
          idioma,
          fonte: 'gutenberg-curado',
        },
        ANO,
      )
      if (!previa.entra) {
        excluir({ titulo, autores: autoresSemIdioma, idioma, fonteRotulo: 'Project Gutenberg' }, previa)
        continue
      }
      const idiomasDasPessoas = excecao ? new Map() : await idiomasDoLivroDoGutendex(b)
      const legais = metadadosLegaisDoGutendex(b, idioma, idiomasDasPessoas)
      const autores = excecao?.autores ?? legais.autores
      const tradutores = legais.tradutores
      const meta = {
        id: `pg-${b.id}`,
        titulo,
        autores,
        tradutores,
        idioma,
        fonte: 'gutenberg-curado',
        fonteRotulo: 'Project Gutenberg',
        fonteId: String(b.id),
        formatos: { r2: `livros/pg-${b.id}.epub` },
        assuntos: [...(b.subjects ?? []), ...(b.bookshelves ?? [])],
        palavras: null,
        downloads: b.download_count ?? 0,
        credito: LINHA_DE_CREDITO,
      }
      if (obrasVistas.has(chaveDaObra(idioma, titulo, autores))) continue
      const antes = avaliarLegalidade(meta, ANO)
      if (!antes.entra) {
        excluir(meta, antes)
        continue
      }
      const bruto = await textoDoEspelho(b.id)
      if (!bruto) continue
      let texto
      try {
        texto = limparTextoDoGutenberg(bruto).texto
      } catch (e) {
        if (e instanceof TextoComDireitosDeclarados)
          excluir(meta, { motivo: 'direitos-declarados-na-fonte', detalhe: e.message })
        continue
      }
      /* A fonte não disse que é tradução, mas o texto diz: sem tradutor identificado, fora. */
      meta.traducaoDeclarada = textoDizQueETraducao(texto)
      const depois = avaliarLegalidade(meta, ANO)
      if (!depois.entra) {
        excluir(meta, depois)
        continue
      }
      if (contarPalavras(texto.slice(0, 20_000), idioma) < 300 && idioma !== 'zh' && idioma !== 'ja') continue
      if (aceitar(meta, texto)) aceitos++
    }
  }
  return aceitos
}

/* ── Wikisource em português ─────────────────────────────────────────────────────────────────── */

const SPARQL_PT = `SELECT ?obra ?titulo ?links ?autor ?autorLabel ?morte ?tradutor ?generoLabel WHERE {
  ?pagina schema:about ?obra ; schema:isPartOf <https://pt.wikisource.org/> ; schema:name ?titulo .
  ?obra wdt:P407 wd:Q5146 ; wikibase:sitelinks ?links .
  OPTIONAL { ?obra wdt:P50 ?autor . OPTIONAL { ?autor wdt:P570 ?morte . } }
  OPTIONAL { ?obra wdt:P655 ?tradutor . }
  OPTIONAL { ?obra wdt:P136 ?genero . }
  FILTER(!CONTAINS(?titulo, "/") && !CONTAINS(?titulo, ":"))
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
} ORDER BY DESC(?links) LIMIT 1500`

const API_PT = 'https://pt.wikisource.org/w/api.php'

const htmlParaTexto = (html) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(
      /<(div|table|span)[^>]*class="[^"]*(?:ws-noexport|noprint|ws-header|mw-editsection|reference)[^"]*"[\s\S]*?<\/\1>/gi,
      '',
    )
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|dd|tr)>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

async function paginaDaWikisource(titulo) {
  const j = await baixar(
    `${API_PT}?action=parse&page=${encodeURIComponent(titulo)}&prop=text&redirects=1&format=json&formatversion=2`,
    'json',
  )
  return j?.parse ? { titulo: j.parse.title, html: j.parse.text } : null
}

async function wikisourcePt(alvo) {
  const j = await baixar(`https://query.wikidata.org/sparql?query=${encodeURIComponent(SPARQL_PT)}`, 'json', {
    aceitar: 'application/sparql-results+json',
  })
  const obras = new Map()
  for (const b of j?.results?.bindings ?? []) {
    const qid = b.obra.value.split('/').pop()
    const o = obras.get(qid) ?? {
      qid,
      titulo: b.titulo.value,
      links: Number(b.links.value),
      autores: new Map(),
      tradutores: new Set(),
      generos: new Set(),
    }
    if (b.autor) {
      /* Duas datas de morte para a mesma pessoa (fontes divergentes): vale a MAIS RECENTE, a mais restritiva;
         uma linha sem data deixa a pessoa sem data. */
      const ano = b.morte ? anoDe(b.morte.value) : null
      const antes = o.autores.get(b.autor.value)
      o.autores.set(b.autor.value, {
        qid: b.autor.value.split('/').pop(),
        nome: b.autorLabel?.value ?? '?',
        anoMorte: !antes ? ano : antes.anoMorte == null || ano == null ? null : Math.max(antes.anoMorte, ano),
      })
    }
    if (b.tradutor) o.tradutores.add(b.tradutor.value.split('/').pop())
    if (b.generoLabel) o.generos.add(b.generoLabel.value)
    if (o.titulo !== 'Página principal') obras.set(qid, o)
  }
  /* Nome, ano de morte e idiomas de escrita de TODAS as pessoas (autores e tradutores, P655) pela Wikidata, a
     mesma régua das outras fontes. O ano de morte fica o MAIS RECENTE entre a consulta e a entidade. */
  const todas = [...obras.values()].flatMap((o) => [...[...o.autores.values()].map((a) => a.qid), ...o.tradutores])
  const pessoas = await pessoasPorQid(todas)
  const pessoaDaWikidata = (qid, rotulo, anoDaConsulta) => {
    const r = pessoas.get(qid)
    const anos = [anoDaConsulta, r?.anoMorte].filter((a) => a != null)
    return {
      nome: r?.nome ?? (rotulo && !/^Q\d+$/.test(rotulo) ? rotulo : qid),
      anoMorte: anos.length && anoDaConsulta !== null ? Math.max(...anos) : (r?.anoMorte ?? null),
      ...(r?.idiomas?.length ? { idiomas: r.idiomas } : {}),
    }
  }
  let aceitos = 0
  for (const o of [...obras.values()].sort((a, b) => b.links - a.links)) {
    if (aceitos >= alvo) break
    const autores = [...o.autores.values()].map((a) => pessoaDaWikidata(a.qid, a.nome, a.anoMorte))
    const tradutores = [...o.tradutores].map((q) => pessoaDaWikidata(q, null, null))
    const meta = {
      id: `ws-pt-${slug(o.titulo)}`,
      titulo: o.titulo.replace(/\s*\((?:\d{4}|[^)]*edição[^)]*)\)\s*$/i, ''),
      autores,
      tradutores,
      idioma: 'pt',
      /* P655 na obra = tradução declarada, mesmo que a pessoa não tenha sido resolvida. */
      traducaoDeclarada: o.tradutores.size > 0,
      fonte: 'wikisource',
      fonteRotulo: 'Wikisource',
      fonteId: o.titulo,
      formatos: {
        wikisource: { api: API_PT, pagina: o.titulo },
        pagina: `https://pt.wikisource.org/wiki/${encodeURIComponent(o.titulo.replace(/ /g, '_'))}`,
      },
      assuntos: [...o.generos],
      palavras: null,
      downloads: o.links,
      credito: 'Texto da Wikisource em português, transcrito e revisado por voluntários.',
    }
    if (obrasVistas.has(chaveDaObra('pt', meta.titulo, autores))) continue
    const v = avaliarLegalidade(meta, ANO)
    if (!v.entra) {
      excluir(meta, v)
      continue
    }
    const principal = await paginaDaWikisource(o.titulo)
    if (!principal) continue
    const prefixo = `/wiki/${encodeURIComponent(principal.titulo.replace(/ /g, '_')).replace(/%2F/g, '/')}/`
    const subpaginas = [
      ...new Set(
        [...principal.html.matchAll(/href="(\/wiki\/[^"#?]+)"/g)]
          .map((m) => m[1])
          .filter((h) => h.startsWith(prefixo))
          .map((h) => decodeURIComponent(h.slice('/wiki/'.length)).replace(/_/g, ' ')),
      ),
    ]
    let texto
    let palavras
    if (subpaginas.length === 0) {
      texto = htmlParaTexto(principal.html)
      palavras = contarPalavras(texto, 'pt')
    } else {
      const quantas = Math.min(12, subpaginas.length)
      const amostra = Array.from(
        { length: quantas },
        (_, i) => subpaginas[Math.floor((i * subpaginas.length) / quantas)],
      )
      const textos = []
      for (const s of amostra) {
        const p = await paginaDaWikisource(s)
        if (p) textos.push(htmlParaTexto(p.html))
      }
      texto = textos.join('\n\n')
      const media = textos.length ? contarPalavras(texto, 'pt') / textos.length : 0
      palavras = Math.round(media * subpaginas.length)
    }
    /* Menos de 1000 palavras (ou uma página principal sem os capítulos): não dá para ler nem medir. */
    if (palavras < 1000) continue
    meta.palavras = palavras
    if (aceitar(meta, texto)) aceitos++
  }
  console.log(`[wikisource] ${aceitos} aceitos de ${obras.size} obras`)
  return aceitos
}

/* ── Ranking, categorias derivadas e conferência ─────────────────────────────────────────────── */

function normalizarPopularidade() {
  const grupos = new Map()
  for (const l of livros) {
    const k = `${l.idioma}|${l.fonte === 'standard-ebooks' ? 'gutenberg-curado' : l.fonte}`
    grupos.set(k, [...(grupos.get(k) ?? []), l])
  }
  for (const g of grupos.values()) {
    const ordem = [...g].sort((a, b) => a.downloads - b.downloads)
    ordem.forEach((l, i) => (l.popularidade = g.length === 1 ? 1 : Number((i / (g.length - 1)).toFixed(3))))
  }
  for (const l of livros) {
    const cat = new Set(l.categorias)
    if (l.popularidade >= 0.6) cat.add('classicos')
    if (l.nivel === 'A1' || l.nivel === 'A2') cat.add('simples')
    l.categorias = [...cat]
  }
}

/**
 * Confere TODO livro contra o filtro (a MESMA regra da montagem: `avaliarLegalidade`, com a tradução decidida
 * pelos idiomas dos autores gravados no JSON) e o JSON contra a estrutura. Devolve a lista de problemas.
 */
function conferir(catalogo, agora = new Date()) {
  const problemas = []
  if (catalogo.anoLimite !== anoLimite(catalogo.ano)) problemas.push(`anoLimite ${catalogo.anoLimite} ≠ ano − 71`)
  if (catalogo.ano > anoEmSaoPaulo(agora))
    problemas.push(`catálogo montado para ${catalogo.ano}, mas no Brasil ainda é ${anoEmSaoPaulo(agora)}`)
  const ids = new Set()
  const propostas = new Set(
    lerJson('classificacao.json')
      .revisados.filter((r) => !r.revisor || r.revisor === REVISOR_DE_PROPOSTA)
      .map((r) => r.id),
  )
  for (const l of catalogo.livros) {
    if (ids.has(l.id)) problemas.push(`id repetido: ${l.id}`)
    ids.add(l.id)
    const v = avaliarLegalidade(l, catalogo.ano)
    if (!v.entra) problemas.push(`${l.id} (${l.titulo}): ${v.motivo}: ${v.detalhe}`)
    if (!passaNaDefesaDoCliente(l, catalogo.anoLimite, agora))
      problemas.push(`${l.id}: o cliente o recusaria (ano-limite ${catalogo.anoLimite})`)
    if (l.classificacao !== null && !ehClassificacao(l.classificacao))
      problemas.push(`${l.id}: classificação inválida "${l.classificacao}"`)
    if (l.classificacao !== null && propostas.has(l.id))
      problemas.push(`${l.id}: classificação de PROPOSTA publicada sem revisão do dono`)
    if (l.fonte === 'gutenberg-curado' && (l.formatos.epub || !l.formatos.r2))
      problemas.push(`${l.id}: Gutenberg só pela cópia curada no R2`)
    if (l.obra !== undefined && !/^(Q\d+|local:[a-z]{2}:[a-z0-9-]+)$/.test(l.obra))
      problemas.push(`${l.id}: obra inválida "${l.obra}"`)
    if (l.obra?.startsWith('local:') && !l.obra.startsWith(`local:${l.idioma}:`))
      problemas.push(`${l.id}: obra local de outro idioma (${l.obra})`)
    if (
      l.titulosAlternativos !== undefined &&
      !(Array.isArray(l.titulosAlternativos) && l.titulosAlternativos.every((x) => typeof x === 'string' && x.trim()))
    )
      problemas.push(`${l.id}: titulosAlternativos malformado`)
  }
  return problemas
}

/** Acrescenta `obra` e `titulosAlternativos` (Wikidata) a cada livro; devolve quantos ficaram ligados por QID. */
async function anexarObras(lista) {
  const campos = await resolverObras(lista, (m) => console.warn(`[obras] ${m}`))
  for (const l of lista) {
    delete l.obra
    delete l.titulosAlternativos
    Object.assign(l, campos.get(l.id))
  }
  const grupos = new Map()
  for (const l of lista) if (/^Q\d+$/.test(l.obra)) grupos.set(l.obra, [...(grupos.get(l.obra) ?? []), l])
  const entreIdiomas = [...grupos.entries()].filter(([, g]) => new Set(g.map((x) => x.idioma)).size > 1)
  console.log(
    `[obras] ${grupos.size} obras com QID (${lista.filter((l) => /^Q\d+$/.test(l.obra)).length} de ${lista.length} livros); ${entreIdiomas.length} em 2+ idiomas`,
  )
  for (const [qid, g] of entreIdiomas)
    console.log(`[obras]   ${qid}: ${g.map((x) => `${x.idioma}:${x.id}`).join(', ')} (${g[0].titulo})`)
}

/* ── Principal ───────────────────────────────────────────────────────────────────────────────── */

async function principal() {
  if (SO_VERIFICAR) {
    const catalogo = JSON.parse(readFileSync(SAIDA, 'utf8'))
    const problemas = conferir(catalogo)
    if (problemas.length) {
      console.error(`[catalogo] ${problemas.length} problema(s):\n  ${problemas.join('\n  ')}`)
      process.exit(1)
    }
    console.log(
      `[catalogo] ok: ${catalogo.livros.length} livros respeitam o filtro de ${catalogo.ano} (morte ≤ ${catalogo.anoLimite})`,
    )
    return
  }
  usarCache(join(RAIZ, 'data', 'livros-cache'))
  if (SO_OBRAS) {
    const catalogo = JSON.parse(readFileSync(SAIDA, 'utf8'))
    const antes = catalogo.livros.map((l) => l.id).join('|')
    await anexarObras(catalogo.livros)
    if (catalogo.livros.map((l) => l.id).join('|') !== antes)
      throw new Error('--obras não pode mudar a lista de livros')
    const problemas = conferir(catalogo)
    if (problemas.length) {
      console.error(`[catalogo] NÃO GRAVADO: ${problemas.length} problema(s):\n  ${problemas.join('\n  ')}`)
      process.exit(1)
    }
    writeFileSync(SAIDA, JSON.stringify(catalogo) + '\n')
    console.log(
      `[catalogo] ${catalogo.livros.length} livros com obra gravados em ${SAIDA} (pedidos de rede: ${pedidosFeitos})`,
    )
    return
  }
  console.log(`[catalogo] ano ${ANO}: entra quem morreu até ${LIMITE}`)
  const doSe = await standardEbooks()
  const porIdioma = {}
  porIdioma.pt = await wikisourcePt(MAX_WIKISOURCE)
  for (const [idioma, alvo] of Object.entries(ALVO)) {
    const ja = livros.filter((l) => l.idioma === idioma).length
    porIdioma[idioma] = await gutendex(idioma, alvo, ja, doSe)
    console.log(`[gutendex] ${idioma}: ${porIdioma[idioma]} livros`)
  }
  normalizarPopularidade()
  livros.sort((a, b) => a.idioma.localeCompare(b.idioma) || b.popularidade - a.popularidade)
  /* Uma exclusão por obra (a mesma obra aparece em várias edições). */
  const vistas = new Set()
  const exclusoesUnicas = exclusoes.filter((e) => {
    const k = `${e.idioma}|${slug(e.titulo)}|${e.motivo}`
    if (vistas.has(k)) return false
    vistas.add(k)
    return true
  })
  const catalogo = {
    versao: 1,
    ano: ANO,
    anoLimite: LIMITE,
    geradoEm: new Date().toISOString(),
    livros,
    exclusoes: exclusoesUnicas,
  }
  await anexarObras(livros)
  const problemas = conferir(catalogo)
  if (problemas.length) {
    console.error(`[catalogo] NÃO GRAVADO: ${problemas.length} problema(s):\n  ${problemas.join('\n  ')}`)
    process.exit(1)
  }
  mkdirSync(dirname(SAIDA), { recursive: true })
  writeFileSync(SAIDA, JSON.stringify(catalogo) + '\n')
  const porLingua = Object.fromEntries(
    [...new Set(livros.map((l) => l.idioma))].map((i) => [i, livros.filter((l) => l.idioma === i).length]),
  )
  const porMotivo = exclusoesUnicas.reduce((m, e) => ({ ...m, [e.motivo]: (m[e.motivo] ?? 0) + 1 }), {})
  const semNivel = livros.filter((l) => !l.nivel).length
  console.log(`[catalogo] ${livros.length} livros gravados em ${SAIDA}`)
  console.log('[catalogo] por idioma:', JSON.stringify(porLingua))
  console.log('[catalogo] exclusões por motivo:', JSON.stringify(porMotivo))
  console.log(
    `[catalogo] sem nível estimado: ${semNivel}; com classificação revisada: ${livros.filter((l) => l.classificacao).length}`,
  )
  console.log(
    `[catalogo] pedidos de rede: ${pedidosFeitos}; cache: ${readdirSync(join(RAIZ, 'data', 'livros-cache')).length} arquivos`,
  )
}

principal().catch((e) => {
  console.error(`[catalogo] FALHOU: ${e.stack ?? e.message}`)
  process.exit(1)
})
