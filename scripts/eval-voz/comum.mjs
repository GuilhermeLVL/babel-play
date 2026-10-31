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
 *   (`acertoDosItens` em `metricas.mjs`) normaliza os dois lados com `normalizarParaComparar`
 *   (minúsculas, sem pontuação, números por extenso em pt) e ainda dobra o acento, então caixa
 *   mista e "Dostoiévski"/"Dostoievski" não importam. O casamento é por sequência de palavras
 *   inteiras (fronteira de palavra): "un", "3", "vinte" não acertam dentro de outra palavra.
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

/**
 * Medidas de uma voz num idioma. Todas as taxas são FRAÇÕES em [0,1] (3,0 % = 0.03).
 * @typedef {object} MedidasDoIdioma
 * @property {number} cer  CER agregado (erros ÷ caracteres da referência)
 * @property {number} wer  WER agregado (erros ÷ palavras da referência)
 * @property {number} itensAcerto  fração dos itens difíceis (nome, número, sigla, ano) corretos; 1 se não há itens
 * @property {number} itensNumerosEAnos  fração só dos itens `numero` e `ano`; 1 se não há
 * @property {number} semAudio  CONTAGEM de frases sem áudio (WAV ausente); fora do WER
 * @property {number} invalidos  CONTAGEM de frases cujo WAV existe mas é inválido (8 bits, truncado,
 *   sem fmt/data, vazio ou só silêncio) ou cuja transcrição falhou; fora do WER, com o erro no registro
 *   da frase. Nota: frases com siglas ("CPF"/"cê pê efe"/"C P F") normalizam diferente e inflam o WER;
 *   para elas vale o acerto do item difícil.
 * @property {number} [estabilidade]  inserções + deleções no texto longo, fração das palavras;
 *   vem de `medir-estabilidade.mjs`, não do round-trip (ausente = não medida)
 * @property {number} [foraDaMediana]  fração das frases com duração/caractere fora de ±30% da
 *   mediana da própria voz; só existe se o chamador informou as durações (ausente = não medida)
 */

/**
 * @typedef {object} Medidas
 * @property {Partial<Record<'pt'|'en'|'es', MedidasDoIdioma>>} porIdioma  só os idiomas presentes no corpus
 */

/**
 * Limiares de um idioma (spec §7.2). Taxas em fração; um campo ausente não é checado.
 * @typedef {object} LimiaresDoIdioma
 * @property {number} cerMax  CER agregado, eliminatório (pt 3,0 % / en 2,0 % / es 3,0 %)
 * @property {number} werMax  WER agregado, eliminatório (pt 8,0 % / en 5,0 % / es 7,0 %)
 * @property {number} itensAcertoMin  itens difíceis corretos (pt 85 % / en 90 % / es 90 %)
 * @property {number} itensNumerosEAnosMin  números e anos corretos (100 % nos três)
 * @property {number} estabilidadeMax  inserções + deleções no texto longo (1,0 %)
 * @property {number} foraDaMedianaMax  frases fora de ±30% da mediana de duração/caractere (3 %)
 * @property {number} semAudioMax  frases sem áudio, em contagem (0)
 * @property {number} invalidosMax  frases com áudio inválido, em contagem (0; "truncada" da spec §7.2)
 */

/**
 * @typedef {Record<'pt'|'en'|'es', LimiaresDoIdioma>} Limiares
 */

/**
 * Limiares automáticos da spec §7.2 (PROPOSTA; a F0 calibra e trava em `limiares.json`).
 * O RTF (≤ 0,5) é medido na síntese, não aqui.
 * @type {Limiares}
 */
export const LIMIARES_DA_SPEC = {
  pt: {
    cerMax: 0.03,
    werMax: 0.08,
    itensAcertoMin: 0.85,
    itensNumerosEAnosMin: 1,
    estabilidadeMax: 0.01,
    foraDaMedianaMax: 0.03,
    semAudioMax: 0,
    invalidosMax: 0,
  },
  en: {
    cerMax: 0.02,
    werMax: 0.05,
    itensAcertoMin: 0.9,
    itensNumerosEAnosMin: 1,
    estabilidadeMax: 0.01,
    foraDaMedianaMax: 0.03,
    semAudioMax: 0,
    invalidosMax: 0,
  },
  es: {
    cerMax: 0.03,
    werMax: 0.07,
    itensAcertoMin: 0.9,
    itensNumerosEAnosMin: 1,
    estabilidadeMax: 0.01,
    foraDaMedianaMax: 0.03,
    semAudioMax: 0,
    invalidosMax: 0,
  },
}
