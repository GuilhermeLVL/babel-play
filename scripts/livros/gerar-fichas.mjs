/**
 * GERA AS FICHAS DOS LIVROS do catálogo PD (o "parceiro de leitura", L4 de Livros & Leitura) — SEM CRÉDITO DE API.
 *
 *   npx tsx scripts/livros/gerar-fichas.mjs                     # os 20 mais populares de en, es e pt (60)
 *   npx tsx scripts/livros/gerar-fichas.mjs --por-idioma=40     # os 40 de cada (retoma de onde parou)
 *   npx tsx scripts/livros/gerar-fichas.mjs --todos             # o catálogo inteiro
 *   npx tsx scripts/livros/gerar-fichas.mjs --ids=pg-1513,ws-pt-iracema
 *   ... --refazer          # regera quem já tem ficha (ou já foi recusado)
 *   ... --indice           # só remonta o índice e o arquivo do servidor, sem chamar CLI nenhuma
 *   ... --simular          # lista o que faria
 *
 * COMO (decisão de 26/10/2026, sem OpenRouter nem créditos): as assinaturas do dono, pelas CLIs em modo de impressão,
 * numa pasta de rascunho FORA do repositório e sem ferramentas — o mesmo método da pesquisa da L0
 * (`docs/pesquisa/2026-10-26-livros-e-leitura.md` §1):
 *   1. GERAÇÃO: `claude -p --safe-mode --tools "" --no-session-persistence --model opus`. Só fato bem estabelecido;
 *      sem citação do livro; spoiler e sensível marcados; "leia também" só com ids do catálogo; e o modelo se recusa
 *      (`conhecimento: baixo`) quando não conhece a obra — aí NÃO há ficha.
 *   2. REVISÃO pela OUTRA família: `agy -p --model gemini-4-argon-medium`, item por item. O que ela marcar como
 *      duvidoso SAI; o spoiler ou o sensível que ela apontar e o gerador não marcou passa a ser marcado. Item sem
 *      veredito também sai (falha fechada). O Gemini só VOTA: nenhum texto dele entra na ficha (o Gemini é proibido
 *      no produto — os termos vedam o uso por menores).
 *   3. VALIDAÇÃO (`src/core/livros/ficha.ts`): forma, tetos, mínimos DEPOIS da revisão, sem citação entre aspas,
 *      "leia também" dentro do catálogo. Reprovou, não grava.
 * No máximo 3 chamadas ao mesmo tempo; cada uma com um ALARME (o `agy` às vezes trava): estourou, mata o processo e
 * tenta de novo uma vez.
 *
 * RETOMA SOZINHO: quem já tem `public/catalogo/fichas/<id>.json` (ou foi recusado, em `scripts/livros/fichas-estado.json`)
 * fica como está. No fim, remonta `public/catalogo/fichas/indice.json` (quem tem ficha) e
 * `src/data/livros/fichasDoParceiro.json` (o que o servidor do parceiro lê: só o que não é spoiler).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AVISO_DA_FICHA,
  LIMITES_DA_FICHA,
  SECOES_DE_ITENS,
  temCitacaoLonga,
  validarFicha,
  VERSAO_DA_FICHA,
} from '../../src/core/livros/ficha.ts'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '../..')
const CATALOGO = join(RAIZ, 'public/catalogo/livros.json')
const PASTA = join(RAIZ, 'public/catalogo/fichas')
const INDICE = join(PASTA, 'indice.json')
const DO_SERVIDOR = join(RAIZ, 'src/data/livros/fichasDoParceiro.json')
const ESTADO = join(AQUI, 'fichas-estado.json')
const CLASSIFICACAO = join(AQUI, 'classificacao.json')
const SUGESTOES = join(RAIZ, 'docs/livros-classificacao-sugestoes.md')

const GERADOR = 'claude-opus (claude -p)'
const REVISOR = 'gemini-4-argon-medium (agy -p)'
const MAX_CONCORRENCIA = 3
const ALARME_GERACAO_MS = 360_000
const ALARME_REVISAO_MS = 300_000

const args = process.argv.slice(2)
const arg = (nome) => args.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
const CONHECIDOS = ['por-idioma', 'todos', 'ids', 'refazer', 'indice', 'simular', 'concorrencia', 'rascunho']
for (const a of args) {
  const nome = a.replace(/^--/, '').split('=')[0]
  if (!a.startsWith('--') || !CONHECIDOS.includes(nome)) throw new Error(`argumento desconhecido: ${a}`)
}
const concorrencia = Math.min(MAX_CONCORRENCIA, Math.max(1, Number(arg('concorrencia') ?? MAX_CONCORRENCIA)))
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

const catalogo = JSON.parse(readFileSync(CATALOGO, 'utf8'))
const livros = catalogo.livros
const porId = new Map(livros.map((l) => [l.id, l]))
const idsDoCatalogo = new Set(porId.keys())
const estado = existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, 'utf8')) : { nota: '', livros: {} }
estado.nota =
  'Estado da geração das fichas (scripts/livros/gerar-fichas.mjs). "ok" = ficha publicada; "sem_conhecimento" = o ' +
  'gerador disse que não conhece a obra o bastante (sem ficha, de propósito); "reprovada" = a revisão ou a validação ' +
  'derrubou a ficha (tente de novo com --ids=<id> --refazer).'

/* ── A proposta de classificação e o conteúdo sensível anotado (docs/livros-classificacao-sugestoes.md) ── */

const propostas = new Map(JSON.parse(readFileSync(CLASSIFICACAO, 'utf8')).revisados.map((r) => [r.id, r]))
const sensivelDoDoc = new Map()
for (const linha of readFileSync(SUGESTOES, 'utf8').split('\n')) {
  if (!linha.startsWith('|')) continue
  const celulas = linha
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim())
  const id = celulas.at(-1)?.match(/^`([^`]+)`$/)?.[1]
  if (!id) continue
  sensivelDoDoc.set(id, { porque: celulas.at(-3) ?? '', sensivel: celulas.at(-2) ?? '' })
}

function avisoDeConteudo(id) {
  const p = propostas.get(id)
  const d = sensivelDoDoc.get(id)
  if (!p && !d) return null
  const c = p?.classificacao
  return {
    classificacaoSugerida: ['livre', '12', '14', '16', '18'].includes(c) ? c : null,
    nota: (p?.nota ?? d?.porque ?? '').slice(0, 1000),
    sensivel: (d?.sensivel ?? '').slice(0, 1000),
  }
}

/* ── Quem entra ── */

function escolhidos() {
  const ids = arg('ids')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids) {
    for (const id of ids) if (!porId.has(id)) throw new Error(`id fora do catálogo: ${id}`)
    return ids.map((id) => porId.get(id))
  }
  if (args.includes('--todos')) return [...livros].sort((a, b) => b.popularidade - a.popularidade)
  const n = Number(arg('por-idioma') ?? 20)
  const lista = []
  for (const idioma of ['en', 'es', 'pt'])
    lista.push(
      ...livros
        .filter((l) => l.idioma === idioma)
        .sort((a, b) => b.popularidade - a.popularidade || a.id.localeCompare(b.id))
        .slice(0, n),
    )
  return lista
}

/* ── As CLIs, com alarme e no máximo 3 ao mesmo tempo ── */

let ativos = 0
const fila = []
async function vez() {
  if (ativos < concorrencia) {
    ativos++
    return
  }
  await new Promise((r) => fila.push(r))
  ativos++
}
function liberar() {
  ativos--
  fila.shift()?.()
}

const rascunho = arg('rascunho') ?? mkdtempSync(join(tmpdir(), 'frasy-fichas-'))
mkdirSync(rascunho, { recursive: true })

function rodar(comando, argumentos, entrada, alarmeMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(comando, argumentos, { cwd: rascunho, stdio: ['pipe', 'pipe', 'pipe'], env: process.env })
    let saida = ''
    let erro = ''
    const alarme = setTimeout(() => {
      p.kill('SIGKILL')
      reject(new Error(`${comando}: alarme de ${alarmeMs / 1000} s`))
    }, alarmeMs)
    p.stdout.on('data', (d) => (saida += d))
    p.stderr.on('data', (d) => (erro += d))
    p.on('error', (e) => {
      clearTimeout(alarme)
      reject(e)
    })
    p.on('close', (codigo) => {
      clearTimeout(alarme)
      if (codigo === 0) resolve(saida)
      else reject(new Error(`${comando} saiu com ${codigo}: ${erro.slice(0, 300)}`))
    })
    if (entrada !== null) p.stdin.end(entrada)
    else p.stdin.end()
  })
}

async function chamar(qual, prompt, alarmeMs) {
  let ultima
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    await vez()
    try {
      if (qual === 'claude')
        return await rodar(
          'claude',
          ['-p', '--safe-mode', '--tools', '', '--no-session-persistence', '--model', 'opus'],
          prompt,
          alarmeMs,
        )
      return await rodar(
        'agy',
        ['-p', prompt, '--model', 'gemini-4-argon-medium', '--print-timeout', `${Math.floor(alarmeMs / 1000) - 10}s`],
        null,
        alarmeMs,
      )
    } catch (e) {
      ultima = e
      console.warn(`  · ${qual} falhou (tentativa ${tentativa}): ${String(e.message).slice(0, 160)}`)
    } finally {
      liberar()
    }
  }
  throw ultima
}

function jsonDaResposta(texto) {
  const ini = texto.indexOf('{')
  const fim = texto.lastIndexOf('}')
  if (ini < 0 || fim <= ini) throw new Error('resposta sem JSON')
  return JSON.parse(texto.slice(ini, fim + 1))
}

/* ── Os prompts ── */

const NOME_DO_IDIOMA = { en: 'inglês', es: 'espanhol', pt: 'português' }
const nomeDoIdioma = (c) => NOME_DO_IDIOMA[c] ?? c

function listaDoCatalogo(livro) {
  return livros
    .filter((l) => l.id !== livro.id)
    .map((l) => `${l.id} | ${l.titulo} | ${l.autores.map((a) => a.nome).join(', ')} | ${l.idioma}`)
    .join('\n')
}

function promptDeGeracao(livro, aviso) {
  const autores = livro.autores.map((a) => `${a.nome} (†${a.anoMorte})`).join(', ')
  const tradutores = livro.tradutores?.length ? livro.tradutores.map((t) => t.nome).join(', ') : 'nenhum'
  const L = LIMITES_DA_FICHA
  return `Você prepara a "ficha do livro" de um app de leitura para quem aprende idiomas (o público inclui adolescentes a partir de 12 anos). A ficha é o que um bom professor de literatura, que já leu o livro e pesquisou sobre ele, contaria antes e durante a leitura.

LIVRO
- título: ${livro.titulo}
- autoria: ${autores}
- tradução: ${tradutores}
- idioma desta edição: ${nomeDoIdioma(livro.idioma)} (${livro.idioma})
- nota de classificação etária (proposta): ${aviso?.nota || '—'}
- conteúdo sensível anotado: ${aviso?.sensivel || '—'}

REGRAS (obrigatórias)
1. Só FATOS BEM ESTABELECIDOS, que qualquer obra de referência confirma. Na dúvida sobre data, nome, número ou atribuição, NÃO escreva o item. Prefira menos itens certos a mais itens incertos. Nada de "diz-se que", lendas ou anedotas sem fonte sólida.
2. NUNCA cite o texto do livro nem invente citações: nada entre aspas além de títulos de obras ou termos curtos (até 4 palavras).
3. Se você NÃO conhece esta obra específica (esta edição/este título) o bastante para cumprir a regra 1, responda só {"conhecimento":"baixo"}.
4. Tudo em português do Brasil, claro e direto, frases curtas. Exceções: "termo" do vocabulário e "noIdiomaDoLivro" das perguntas vêm no idioma do livro.
5. Marque "spoiler": true em todo item que revela acontecimento do enredo além do ponto de partida (mortes, reviravoltas, final, identidades secretas). Personagens: a descrição sem spoiler deve servir para quem está no começo.
6. Marque "sensivel": true em todo item que fala de violência forte, sexo, suicídio, drogas, abuso, ou racismo/preconceito com detalhe. Mencionar o tema com sobriedade é bom; detalhar não.
7. "leiaTambem": só ids da LISTA DO CATÁLOGO abaixo (nunca outro livro, nunca o próprio), escolhidos por afinidade real (tema, época, autor, estilo). Se nada fizer sentido, lista vazia.
8. Vocabulário e notas de época: palavras e usos DESTE livro e da época que travam quem aprende ${nomeDoIdioma(livro.idioma)} (arcaísmos, termos históricos, sentidos que mudaram, moedas, títulos, costumes). Sem inventar ocorrência no texto.

FORMATO: responda SÓ com um objeto JSON, sem texto em volta, sem cercas de código:
{
  "conhecimento": "alto" | "medio",
  "autorEContexto": [${L.autorEContexto.min + 2}–${L.autorEContexto.max} itens: autor e contexto histórico, uma frase por item],
  "porQueImporta": [${L.porQueImporta.min}–${L.porQueImporta.max} itens: por que o livro importa],
  "temas": [${L.temas.min + 1}–${L.temas.max} itens com "nome"],
  "personagens": [0–${L.personagens.max} itens com "nome" (0 se não for ficção)],
  "curiosidades": [8–${L.curiosidades.max} itens],
  "vocabulario": [0–${L.vocabulario.max} itens com "termo" (no idioma do livro) e "texto" (a explicação em português)],
  "notasDeEpoca": [0–${L.notasDeEpoca.max} itens],
  "perguntas": [6–${L.perguntas.max} perguntas de discussão, com "noIdiomaDoLivro" (a mesma pergunta em ${nomeDoIdioma(livro.idioma)}; "" se o livro é em português)],
  "leiaTambem": [0–${L.leiaTambem.max} itens {"id","motivo"}]
}
Todo item (menos leiaTambem) tem "texto" (até ${L.caracteresDoTexto} caracteres), "spoiler" e "sensivel" (booleanos).

LISTA DO CATÁLOGO (id | título | autoria | idioma)
${listaDoCatalogo(livro)}`
}

/** Achata a ficha em itens com id, para a revisão votar um a um. */
function itensParaRevisao(f) {
  const itens = []
  for (const secao of SECOES_DE_ITENS)
    (f[secao] ?? []).forEach((it, i) => {
      const nome = it.nome ? `${it.nome}: ` : it.termo ? `${it.termo} — ` : ''
      itens.push({ id: `${secao}.${i}`, texto: `${nome}${it.texto}` })
    })
  ;(f.leiaTambem ?? []).forEach((l, i) => {
    const alvo = porId.get(l.id)
    itens.push({
      id: `leiaTambem.${i}`,
      texto: `Leia também "${alvo?.titulo}" (${alvo?.autores?.[0]?.nome}): ${l.motivo}`,
    })
  })
  return itens
}

function promptDeRevisao(livro, itens) {
  const autores = livro.autores.map((a) => a.nome).join(', ')
  return `Você é um verificador de fatos rigoroso de obras literárias. Abaixo há itens de uma ficha sobre o livro "${livro.titulo}" (${autores}), escrita por outra IA para um app de leitura com público a partir de 12 anos.

Para CADA item, dê um veredito:
- "duvidoso": contém erro factual, data/nome/número incerto ou errado, atribuição discutível, anedota sem fonte sólida, citação literal do livro ou frase entre aspas que pareça citação, ou algo que não é consenso entre especialistas. Na dúvida, "duvidoso".
- "spoiler": está correto, mas revela acontecimento do enredo além do ponto de partida.
- "sensivel": está correto, mas fala com detalhe de violência forte, sexo, suicídio, drogas, abuso ou racismo.
- "ok": correto, bem estabelecido, sem os problemas acima.
(Se um item é spoiler E sensível, use "spoiler" e diga isso no motivo.)

Responda SÓ com JSON, sem texto em volta: {"itens":[{"id":"...","veredito":"ok|duvidoso|spoiler|sensivel","motivo":"curto"}]}, com TODOS os ids.

ITENS
${itens.map((i) => `[${i.id}] ${i.texto}`).join('\n')}`
}

/* ── Uma ficha ── */

const limpo = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()

function normalizar(bruto, livro) {
  const item = (o, extra = {}) => ({
    ...extra,
    texto: limpo(o?.texto).slice(0, LIMITES_DA_FICHA.caracteresDoTexto),
    spoiler: o?.spoiler === true,
    sensivel: o?.sensivel === true,
  })
  const f = {}
  for (const secao of SECOES_DE_ITENS) {
    const lista = Array.isArray(bruto[secao]) ? bruto[secao] : []
    f[secao] = lista
      .map((o) => {
        if (secao === 'temas' || secao === 'personagens') return item(o, { nome: limpo(o?.nome).slice(0, 80) })
        if (secao === 'vocabulario') return item(o, { termo: limpo(o?.termo).slice(0, 80) })
        if (secao === 'perguntas')
          return item(o, { noIdiomaDoLivro: livro.idioma === 'pt' ? '' : limpo(o?.noIdiomaDoLivro).slice(0, 600) })
        return item(o)
      })
      .filter((o) => o.texto && !temCitacaoLonga(o.texto) && !temCitacaoLonga(o.noIdiomaDoLivro ?? ''))
      .filter((o) => !('nome' in o) || o.nome)
      .filter((o) => !('termo' in o) || o.termo)
      .slice(0, LIMITES_DA_FICHA[secao].max)
  }
  f.leiaTambem = (Array.isArray(bruto.leiaTambem) ? bruto.leiaTambem : [])
    .map((l) => ({ id: limpo(l?.id), motivo: limpo(l?.motivo).slice(0, 600) }))
    .filter((l) => idsDoCatalogo.has(l.id) && l.id !== livro.id && l.motivo && !temCitacaoLonga(l.motivo))
    .filter((l, i, todos) => todos.findIndex((x) => x.id === l.id) === i)
    .slice(0, LIMITES_DA_FICHA.leiaTambem.max)
  return f
}

function aplicarRevisao(f, vereditos) {
  const porItem = new Map()
  const motivoDe = new Map()
  for (const v of vereditos ?? [])
    if (v && typeof v.id === 'string') {
      porItem.set(v.id, String(v.veredito))
      motivoDe.set(v.id, String(v.motivo ?? '').slice(0, 200))
    }
  let removidos = 0
  const motivos = []
  for (const secao of [...SECOES_DE_ITENS, 'leiaTambem']) {
    f[secao] = f[secao].filter((it, i) => {
      const v = porItem.get(`${secao}.${i}`)
      if (v === 'ok') return true
      if (v === 'spoiler' && secao !== 'leiaTambem') return (it.spoiler = true), true
      if (v === 'sensivel' && secao !== 'leiaTambem') return (it.sensivel = true), true
      removidos++
      /* Só no rascunho (fora do repositório): o que saiu e o porquê, para quem audita a revisão. */
      motivos.push({
        id: `${secao}.${i}`,
        veredito: v ?? 'sem_veredito',
        motivo: motivoDe.get(`${secao}.${i}`) ?? '',
        texto: it.texto ?? it.motivo,
      })
      return false
    })
  }
  return { removidos, motivos }
}

async function gerarFicha(livro) {
  const aviso = avisoDeConteudo(livro.id)
  const bruto = jsonDaResposta(await chamar('claude', promptDeGeracao(livro, aviso), ALARME_GERACAO_MS))
  if (bruto.conhecimento === 'baixo') return { status: 'sem_conhecimento' }
  const f = normalizar(bruto, livro)
  const itens = itensParaRevisao(f)
  let vereditos
  for (let i = 0; i < 2; i++) {
    const r = jsonDaResposta(await chamar('agy', promptDeRevisao(livro, itens), ALARME_REVISAO_MS))
    vereditos = Array.isArray(r.itens) ? r.itens : []
    const cobertos = new Set(vereditos.map((v) => v?.id))
    if (itens.filter((x) => cobertos.has(x.id)).length >= itens.length * 0.8) break
  }
  const { removidos, motivos } = aplicarRevisao(f, vereditos)
  const ficha = {
    versao: VERSAO_DA_FICHA,
    livroId: livro.id,
    titulo: livro.titulo,
    idioma: livro.idioma,
    geradaEm: hoje,
    procedencia: { geradoPor: GERADOR, revisadoPor: REVISOR, aviso: AVISO_DA_FICHA, removidosNaRevisao: removidos },
    ...f,
    avisoDeConteudo: aviso,
  }
  const v = validarFicha(ficha, idsDoCatalogo)
  if (!v.ok) return { status: 'reprovada', erros: v.erros, removidos, motivos }
  return { status: 'ok', ficha, removidos, motivos, itens: itens.length }
}

/* ── O índice e o arquivo do servidor ── */

function remontarIndice() {
  const ids = readdirSync(PASTA)
    .filter((n) => n.endsWith('.json') && n !== 'indice.json')
    .map((n) => n.slice(0, -5))
    .filter((id) => porId.has(id))
    .sort()
  writeFileSync(INDICE, `${JSON.stringify({ versao: 1, fichas: ids }, null, 2)}\n`)
  /* O SERVIDOR do parceiro (`server/ai/leitura/fichas.ts`) só precisa do que pode ir ao prompt: nada de spoiler (ele
     não sabe onde a pessoa está no livro), com a marca do sensível para o filtro do menor. */
  const servidor = {}
  for (const id of ids) {
    const f = JSON.parse(readFileSync(join(PASTA, `${id}.json`), 'utf8'))
    const so = (lista) => lista.filter((i) => !i.spoiler)
    servidor[id] = {
      ...f,
      personagens: so(f.personagens),
      curiosidades: so(f.curiosidades),
      temas: so(f.temas),
      autorEContexto: so(f.autorEContexto),
      porQueImporta: so(f.porQueImporta),
      notasDeEpoca: so(f.notasDeEpoca),
      vocabulario: [],
      perguntas: [],
      leiaTambem: [],
    }
  }
  mkdirSync(dirname(DO_SERVIDOR), { recursive: true })
  writeFileSync(DO_SERVIDOR, `${JSON.stringify({ versao: 1, fichas: servidor })}\n`)
  return ids.length
}

/* ── Principal ── */

mkdirSync(PASTA, { recursive: true })
if (args.includes('--indice')) {
  console.log(`índice: ${remontarIndice()} fichas`)
  process.exit(0)
}

const refazer = args.includes('--refazer')
const pendentes = escolhidos().filter(
  (l) => refazer || (!existsSync(join(PASTA, `${l.id}.json`)) && estado.livros[l.id]?.status !== 'sem_conhecimento'),
)
console.log(`${pendentes.length} livro(s) a gerar; rascunho em ${rascunho}; ${concorrencia} ao mesmo tempo`)
if (args.includes('--simular')) {
  for (const l of pendentes) console.log(`  ${l.id}  ${l.titulo}`)
  process.exit(0)
}

const gravarEstado = () => writeFileSync(ESTADO, `${JSON.stringify(estado, null, 2)}\n`)
let feitas = 0
await Promise.all(
  pendentes.map(async (livro) => {
    const t0 = Date.now()
    try {
      const r = await gerarFicha(livro)
      if (r.status === 'ok') {
        writeFileSync(join(PASTA, `${livro.id}.json`), `${JSON.stringify(r.ficha, null, 2)}\n`)
        feitas++
      }
      estado.livros[livro.id] = {
        status: r.status,
        data: hoje,
        ...(r.itens !== undefined ? { itensGerados: r.itens } : {}),
        ...(r.removidos !== undefined ? { removidosNaRevisao: r.removidos } : {}),
        ...(r.erros ? { erros: r.erros.slice(0, 10) } : {}),
      }
      writeFileSync(join(rascunho, `${livro.id}.revisao.json`), JSON.stringify(r.motivos ?? [], null, 1))
      console.log(
        `✓ ${livro.id} ${r.status} (${Math.round((Date.now() - t0) / 1000)} s; removidos ${r.removidos ?? 0}${r.erros ? `; ${r.erros.join('; ')}` : ''})`,
      )
    } catch (e) {
      estado.livros[livro.id] = { status: 'falhou', data: hoje, erro: String(e.message).slice(0, 200) }
      console.log(`✗ ${livro.id} falhou: ${String(e.message).slice(0, 200)}`)
    }
    gravarEstado()
  }),
)
console.log(`feitas agora: ${feitas}; índice: ${remontarIndice()} fichas`)
