/**
 * OS GOLDS DA IA PAGA (Fase A do plano de qualidade da IA paga, 24/10/2026) — leitura e validação, PURAS.
 *
 * Quatro conjuntos, escritos à mão (nenhum dado de usuário):
 *   explicacao    `gold-explicacao-v1.jsonl`   60 frases en/es → pt-BR com o que uma boa explicação TEM de dizer
 *                                                (sentido, ponto gramatical, registro, gírias reais) — inclui frases
 *                                                SEM gíria (pega a gíria inventada), injeção e perfil menor;
 *   resumo        `gold-resumo-v1.jsonl`       15 sessões de 8 a 28 falas com os 3 pontos e as palavras-alvo;
 *   alternativas  `gold-alternativas-v1.jsonl` 40 frases com o sentido, exemplos aceitáveis e o que evitar;
 *   legenda       `gold-traducao-v1.jsonl`     o gold de conversa da bancada (60), reaproveitado.
 *
 * A validação é estrita de propósito: um gold com campo faltando mediria o modelo contra nada, e o juiz completaria
 * o buraco com o palpite dele. `carregarGold` lança com TODOS os problemas de uma vez.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const ARQUIVOS_DOS_GOLDS = Object.freeze({
  explicacao: 'tests/eval/fixtures/gold-explicacao-v1.jsonl',
  resumo: 'tests/eval/fixtures/gold-resumo-v1.jsonl',
  alternativas: 'tests/eval/fixtures/gold-alternativas-v1.jsonl',
  legenda: 'tests/eval/fixtures/gold-traducao-v1.jsonl',
})

export const FUNCOES = Object.freeze(Object.keys(ARQUIVOS_DOS_GOLDS))

const REGISTROS = new Set(['informal', 'neutro', 'formal'])
const PERFIS = new Set(['adulto', 'menor'])

/** JSONL → objetos. Linha em branco é ignorada; linha inválida lança com o número dela. */
export function lerJsonl(texto) {
  const linhas = String(texto ?? '').split('\n')
  const saida = []
  linhas.forEach((l, i) => {
    if (!l.trim()) return
    try {
      saida.push(JSON.parse(l))
    } catch (e) {
      throw new Error(`linha ${i + 1}: JSON inválido (${e.message})`)
    }
  })
  return saida
}

const texto = (v) => typeof v === 'string' && v.trim().length > 0
const listaDeTextos = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')

function validarExplicacao(c) {
  const e = []
  if (!texto(c.texto)) e.push('texto')
  if (typeof c.traducao !== 'string') e.push('traducao')
  if (!texto(c.lang) || !texto(c.langDaTraducao)) e.push('lang/langDaTraducao')
  if (!listaDeTextos(c.contexto)) e.push('contexto')
  if (!PERFIS.has(c.perfil)) e.push('perfil')
  const x = c.esperado ?? {}
  if (!texto(x.sentido) || !texto(x.gramatica)) e.push('esperado.sentido/gramatica')
  if (!REGISTROS.has(x.registro)) e.push('esperado.registro')
  if (!Array.isArray(x.girias) || !x.girias.every((g) => texto(g?.termo) && texto(g?.sentido)))
    e.push('esperado.girias')
  if (typeof x.semGiria !== 'boolean') e.push('esperado.semGiria')
  else if (x.semGiria !== (x.girias?.length === 0)) e.push('esperado.semGiria incoerente com girias')
  return e
}

function validarResumo(c) {
  const e = []
  if (!PERFIS.has(c.perfil)) e.push('perfil')
  if (!texto(c.langDaPessoa)) e.push('langDaPessoa')
  if (!Array.isArray(c.falas) || c.falas.length < 8 || c.falas.length > 30) e.push('falas (8 a 30)')
  else if (
    !c.falas.every((f) => texto(f?.texto) && typeof f?.traducao === 'string' && texto(f?.srcLang) && texto(f?.tgtLang))
  )
    e.push('falas[].texto/traducao/srcLang/tgtLang')
  const x = c.esperado ?? {}
  if (!listaDeTextos(x.pontos) || x.pontos.length !== 3) e.push('esperado.pontos (3)')
  if (!listaDeTextos(x.palavrasAlvo) || x.palavrasAlvo.length === 0) e.push('esperado.palavrasAlvo')
  return e
}

function validarAlternativas(c) {
  const e = []
  if (!texto(c.texto) || !texto(c.tgt)) e.push('texto/tgt')
  if (typeof c.traducaoAtual !== 'string') e.push('traducaoAtual')
  if (!listaDeTextos(c.contexto)) e.push('contexto')
  if (c.registro !== undefined && c.registro !== 'formal' && c.registro !== 'informal') e.push('registro')
  const x = c.esperado ?? {}
  if (!texto(x.sentido)) e.push('esperado.sentido')
  if (!listaDeTextos(x.aceitaveis) || !listaDeTextos(x.evitar)) e.push('esperado.aceitaveis/evitar')
  return e
}

function validarLegenda(c) {
  const e = []
  if (!texto(c.origem) || !texto(c.referencia)) e.push('origem/referencia')
  if (c.contexto !== undefined && !listaDeTextos(c.contexto)) e.push('contexto')
  return e
}

const VALIDADORES = {
  explicacao: validarExplicacao,
  resumo: validarResumo,
  alternativas: validarAlternativas,
  legenda: validarLegenda,
}

/** Os problemas de um conjunto inteiro: campo faltando por caso e id repetido. Vazio = válido. */
export function validarGold(funcao, casos) {
  const validar = VALIDADORES[funcao]
  if (!validar) throw new Error(`função desconhecida: ${funcao} (esperado: ${FUNCOES.join(', ')})`)
  const problemas = []
  const vistos = new Set()
  for (const c of casos) {
    if (!texto(c?.id)) {
      problemas.push('caso sem id')
      continue
    }
    if (vistos.has(c.id)) problemas.push(`${c.id}: id repetido`)
    vistos.add(c.id)
    for (const p of validar(c)) problemas.push(`${c.id}: ${p}`)
  }
  return problemas
}

/** Lê e valida o gold da função (caminho relativo à raiz do repositório). Lança com todos os problemas. */
export function carregarGold(funcao, raiz = process.cwd()) {
  const arq = ARQUIVOS_DOS_GOLDS[funcao]
  if (!arq) throw new Error(`função desconhecida: ${funcao} (esperado: ${FUNCOES.join(', ')})`)
  const casos = lerJsonl(readFileSync(path.join(raiz, arq), 'utf8'))
  const problemas = validarGold(funcao, casos)
  if (problemas.length) throw new Error(`gold de ${funcao} inválido:\n  ${problemas.join('\n  ')}`)
  return casos
}

/**
 * Amostra ESTRATIFICADA por categoria quando o orçamento pede menos casos (cortar o topo do arquivo mediria só as
 * primeiras categorias). Determinística: as primeiras de cada categoria, na ordem do arquivo.
 */
export function amostrar(casos, n) {
  if (!n || n >= casos.length) return casos
  const cats = [...new Set(casos.map((c) => c.categoria ?? ''))]
  const porCat = Math.ceil(n / cats.length)
  const escolhidos = new Set(cats.flatMap((cat) => casos.filter((c) => (c.categoria ?? '') === cat).slice(0, porCat)))
  return casos.filter((c) => escolhidos.has(c)).slice(0, n)
}
