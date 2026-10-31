/**
 * Peças comuns da bancada de voz (`scripts/eval-voz/`).
 *
 * Aqui mora só o que mais de um script precisa. As métricas (round-trip, itens difíceis,
 * estabilidade) entram nesta pasta nas tarefas seguintes.
 */
import { readFileSync } from 'node:fs'

/**
 * @typedef {object} ItemDificil
 * @property {string} texto  trecho exato que aparece no texto da frase
 * @property {string[]} aceita  grafias aceitas na transcrição (por extenso, em dígitos, variantes
 *   ORTOGRÁFICAS da mesma palavra; nada de respelling fonético nem outra palavra). A métrica
 *   (Tarefa 7) compara DEPOIS de normalizar os dois lados (minúsculas, sem acento nem pontuação),
 *   então caixa mista em `aceita` não importa. Entradas curtas ("un", "3", "vinte") exigem
 *   casamento por fronteira de palavra lá, para não acertar dentro de outra palavra.
 * @property {'nome'|'numero'|'sigla'|'ano'} tipo
 */

/**
 * @typedef {object} CorpusItem
 * @property {string} id
 * @property {'pt'|'en'|'es'} idioma
 * @property {string} texto
 * @property {string} categoria
 * @property {ItemDificil[]} itens  gabarito dos itens difíceis (pode ser vazio)
 */

export const IDIOMAS = ['pt', 'en', 'es']
export const TIPOS_DE_ITEM = ['nome', 'numero', 'sigla', 'ano']

/**
 * Valida um item do corpus. Devolve a mensagem do primeiro defeito ou `null`.
 * @param {unknown} o
 * @returns {string|null}
 */
export function validarItem(o) {
  if (!o || typeof o !== 'object') return 'não é um objeto'
  for (const campo of ['id', 'texto', 'categoria']) {
    if (typeof o[campo] !== 'string' || !o[campo].trim()) return `campo "${campo}" ausente ou vazio`
  }
  if (!IDIOMAS.includes(o.idioma)) return `idioma "${o.idioma}" inválido (use ${IDIOMAS.join('|')})`
  if (!Array.isArray(o.itens)) return 'campo "itens" ausente (use [] se não houver)'
  for (const [k, d] of o.itens.entries()) {
    if (!d || typeof d.texto !== 'string' || !d.texto) return `itens[${k}].texto ausente`
    if (!Array.isArray(d.aceita) || d.aceita.length === 0 || d.aceita.some((a) => typeof a !== 'string' || !a)) {
      return `itens[${k}].aceita vazio ou inválido`
    }
    if (!TIPOS_DE_ITEM.includes(d.tipo)) return `itens[${k}].tipo "${d.tipo}" inválido (use ${TIPOS_DE_ITEM.join('|')})`
  }
  return null
}

/**
 * Lê um JSONL de corpus de voz e valida cada linha.
 * @param {string} caminho
 * @returns {CorpusItem[]}
 */
export function lerCorpus(caminho) {
  const itens = []
  const linhas = readFileSync(caminho, 'utf8').split('\n')
  for (const [n, linha] of linhas.entries()) {
    if (!linha.trim()) continue
    let o
    try {
      o = JSON.parse(linha)
    } catch (e) {
      throw new Error(`${caminho}: linha ${n + 1}: JSON inválido (${e.message})`)
    }
    const erro = validarItem(o)
    if (erro) throw new Error(`${caminho}: linha ${n + 1}: ${erro}`)
    itens.push(o)
  }
  return itens
}
