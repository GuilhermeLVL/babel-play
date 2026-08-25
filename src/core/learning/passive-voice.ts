/**
 * VOZ PASSIVA (inglês) — detecção DETERMINÍSTICA por padrão léxico, sem IA/rede.
 *
 * POR QUE ISTO EXISTE. `Metrics.tsx` tinha um aviso só: "Análise de tom, complexidade gramatical e
 * uso de voz passiva requer IA generativa — em breve." Duas das três coisas não precisam de IA
 * nenhuma. Complexidade gramatical já vinha de `computeTextStats` (text-stats.ts); voz passiva é
 * este módulo — o padrão sintático é regular o bastante para casar por regex sobre os tokens.
 *
 * A REGRA. Voz passiva em inglês = forma de "be" (am/is/are/was/were/be/been/being) + particípio
 * passado, com formas de "be" encadeadas ("was being") e no máximo UM advérbio/negação entre o "be"
 * e o particípio ("was not written", "were quickly built"). Particípio regular = termina em "-ed"
 * (mín. 4 letras); particípio irregular = lista curada abaixo (write→written, break→broken etc. não
 * seguem o padrão "-ed").
 *
 * HONESTIDADE SOBRE PRECISÃO — ESTE É UM HEURÍSTICO, NÃO UM PARSER GRAMATICAL:
 *  · Falsos NEGATIVOS: particípios irregulares fora da lista curada não são detectados (a lista
 *    cobre os ~90 mais comuns, não todos os ~200 do inglês).
 *  · Falsos POSITIVOS residuais: um punhado de adjetivos terminados em "-ed" usados de forma
 *    predicativa (não como voz passiva) ainda pode ser confundido com particípio regular — mitigado
 *    por `ADJETIVOS_ED_EXCLUIDOS` (os mais frequentes: "excited", "interested", "tired"...), mas a
 *    lista não é exaustiva. O mesmo módulo NÃO distingue "the door was closed" (estado, adjetivo)
 *    de "the door was closed by the wind" (ação, voz passiva) — ambos casam.
 *  · Não analisa sintaxe (sujeito/complemento/agente "by ..."): só a sequência de tokens.
 * A tela que consome isto DEVE mostrar esta ressalva — não apresentar a contagem como certeza.
 */

/** Formas do verbo "be" que podem preceder um particípio passado em voz passiva. */
const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being'])

/**
 * Advérbios/negação comuns que podem aparecer ENTRE o "be" e o particípio sem quebrar o padrão
 * ("was not written", "was recently built"). Curta de propósito: é só o que não muda a classificação.
 */
const ADVERBIOS_PERMITIDOS = new Set([
  'not', 'never', 'also', 'often', 'always', 'usually', 'still', 'just', 'already', 'clearly',
  'widely', 'commonly', 'recently', 'quickly', 'carefully', 'completely', 'fully', 'partially',
  'rarely', 'suddenly', 'barely', 'largely', 'mostly', 'nearly', 'once', 'only', 'really',
])

/**
 * Particípios irregulares mais comuns do inglês — não terminam em "-ed", então o padrão regular
 * (abaixo) não os pega. Lista curada, não exaustiva (ver ressalva de honestidade no topo do arquivo).
 */
const PARTICIPIOS_IRREGULARES = new Set([
  'been', 'born', 'beaten', 'become', 'begun', 'bent', 'bet', 'bitten', 'blown', 'broken',
  'brought', 'built', 'bought', 'caught', 'chosen', 'come', 'cut', 'done', 'drawn', 'dreamt',
  'driven', 'drunk', 'eaten', 'fallen', 'felt', 'fought', 'found', 'flown', 'forbidden',
  'forgiven', 'forgotten', 'frozen', 'given', 'gone', 'grown', 'had', 'heard', 'held', 'hidden',
  'hit', 'hurt', 'kept', 'known', 'laid', 'left', 'lent', 'let', 'lit', 'lost', 'made', 'meant',
  'met', 'paid', 'put', 'read', 'ridden', 'risen', 'run', 'said', 'seen', 'sent', 'set', 'shaken',
  'shot', 'shown', 'shut', 'sold', 'sought', 'spent', 'spoken', 'spread', 'stolen', 'struck',
  'sung', 'sat', 'slept', 'stood', 'stuck', 'sworn', 'swum', 'taken', 'taught', 'told', 'thought',
  'thrown', 'understood', 'woken', 'won', 'worn', 'written',
])

/**
 * Adjetivos terminados em "-ed" de altíssima frequência que normalmente descrevem um ESTADO (não
 * uma ação em voz passiva) — "she was excited" não é voz passiva no sentido gramatical que a tela
 * promete medir. Excluí-los reduz falso-positivo às custas de perder o raro caso em que a mesma
 * palavra É voz passiva ("she was excited by the crowd" — ainda assim, ambíguo até para humanos).
 */
const ADJETIVOS_ED_EXCLUIDOS = new Set([
  'excited', 'interested', 'tired', 'worried', 'scared', 'bored', 'confused', 'annoyed',
  'surprised', 'pleased', 'satisfied', 'disappointed', 'embarrassed', 'frustrated', 'stressed',
  'relaxed', 'concerned', 'shocked', 'amazed', 'thrilled', 'delighted', 'depressed', 'exhausted',
  'committed', 'dedicated', 'qualified', 'experienced', 'talented', 'motivated', 'organized',
])

/** Particípio regular: termina em "-ed", tamanho mínimo 4 (descarta "bed", "red", "led"-like ruído). */
function isParticipioRegular(w: string): boolean {
  return w.length >= 4 && /^[a-z]+ed$/.test(w) && !ADJETIVOS_ED_EXCLUIDOS.has(w)
}

function isParticipio(w: string): boolean {
  return PARTICIPIOS_IRREGULARES.has(w) || isParticipioRegular(w)
}

export interface VozPassivaResultado {
  /** Quantas construções "be + particípio" foram encontradas. */
  ocorrencias: number
  /** Palavras consideradas — denominador, para a taxa ser conferível. */
  palavras: number
  /** Ocorrências por 100 palavras, 1 casa decimal. Comparável entre textos de tamanhos diferentes. */
  por100Palavras: number
  /** Trechos que casaram o padrão (até 6), para a pessoa auditar o que foi contado. */
  exemplos: string[]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Varre `texto` (inglês) por construções de voz passiva. Puro/determinístico — mesma entrada,
 * mesma saída, sem IA/rede/DOM. Ver ressalvas de precisão no cabeçalho do arquivo.
 */
export function detectarVozPassiva(texto: string): VozPassivaResultado {
  const raw = texto ?? ''
  const tokens = raw.match(/[\p{L}']+/gu) ?? []
  const lower = tokens.map((t) => t.toLowerCase())
  const n = lower.length

  const exemplos: string[] = []
  let ocorrencias = 0

  let i = 0
  while (i < n) {
    if (!BE_FORMS.has(lower[i])) { i++; continue }

    // Encadeia formas de "be" consecutivas ("was being").
    let j = i
    while (j + 1 < n && BE_FORMS.has(lower[j + 1])) j++

    // No máximo um advérbio/negação entre o "be" e o particípio.
    let k = j + 1
    if (k < n && ADVERBIOS_PERMITIDOS.has(lower[k])) k++

    if (k < n && isParticipio(lower[k])) {
      ocorrencias++
      if (exemplos.length < 6) exemplos.push(tokens.slice(i, k + 1).join(' '))
      i = k + 1 // não deixa a mesma ocorrência ser recontada por sobreposição
      continue
    }
    i++
  }

  return {
    ocorrencias,
    palavras: n,
    por100Palavras: n > 0 ? round1((ocorrencias / n) * 100) : 0,
    exemplos,
  }
}
