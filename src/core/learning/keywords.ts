/**
 * Extração de vocabulário DETERMINÍSTICA (sem IA): dada uma frase transcrita,
 * escolhe as palavras "de conteúdo" mais salientes para virar cartas de estudo.
 * Puro/isomórfico (sem DOM, sem rede) — roda no cliente e no servidor.
 *
 * Substitui a extração antiga por lista fixa (BUSINESS_LEXICON), que só
 * "reconhecia" ~25 palavras de negócios pré-cadastradas. Aqui a seleção sai da
 * fala real: remove stopwords, ignora tokens curtos/numéricos, e ranqueia por
 * saliência (raridade aproximada por comprimento). A tradução do verso (`back`)
 * vem depois do gateway de MT — este módulo só decide QUAIS palavras estudar.
 */

/**
 * Stopwords POR IDIOMA — o ruído gramatical (artigos, pronomes, preposições, auxiliares) que nunca
 * vira carta de vocabulário. Não é exaustivo de propósito; palavras de conteúdo passam.
 *
 * Eram um balde único com inglês e português juntos. Para um texto em japonês ou alemão isso
 * significava filtrar NADA e devolver a lista como se a régua tivesse sido aplicada: as partículas
 * e os artigos daquele idioma viravam sugestão de cartão. Separadas por idioma, quem chama sabe
 * quando não há lista (`temStopwords`) e a tela pode dizer isso (auditoria de 2026-09-07, A39).
 */
const STOPWORDS_POR_IDIOMA: Record<string, ReadonlySet<string>> = {
  en: new Set<string>([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'while',
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'as', 'into',
  'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'this', 'that',
  'these', 'those', 'here', 'there', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'am', 'do', 'does', 'did', 'have', 'has', 'had', 'having', 'will',
  'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'not',
  'no', 'yes', 'so', 'than', 'too', 'very', 'just', 'now', 'also', 'only',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'ours', 'theirs',
  'what', 'which', 'who', 'whom', 'whose', 'how', 'why', 'where', 'all', 'any',
  'some', 'each', 'few', 'more', 'most', 'other', 'such', 'own', 'same', 'get',
  'got', 'going', 'gonna', 'wanna', 'okay', 'yeah', 'well', 'like', 'really',
  ]),
  pt: new Set<string>([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'e', 'ou', 'mas', 'se',
  'que', 'porque', 'quando', 'enquanto', 'de', 'do', 'da', 'dos', 'das', 'em',
  'no', 'na', 'nos', 'nas', 'por', 'para', 'pra', 'com', 'sem', 'sobre', 'como',
  'ao', 'aos', 'à', 'às', 'num', 'numa', 'pelo', 'pela', 'pelos', 'pelas',
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'isso',
  'isto', 'aquilo', 'aqui', 'ali', 'lá', 'é', 'são', 'foi', 'era', 'ser',
  'estar', 'está', 'estão', 'ter', 'tem', 'têm', 'tinha', 'haver', 'há',
  'vai', 'vou', 'vamos', 'não', 'sim', 'já', 'ainda', 'muito', 'mais', 'menos',
  'também', 'só', 'apenas', 'agora', 'eu', 'tu', 'ele', 'ela', 'nós', 'vós',
  'eles', 'elas', 'você', 'vocês', 'me', 'te', 'lhe', 'nos', 'vos', 'meu',
  'minha', 'seu', 'sua', 'nosso', 'nossa', 'dele', 'dela', 'qual', 'quais',
  'quem', 'onde', 'todo', 'toda', 'todos', 'todas', 'algum', 'alguma', 'nada',
  'tudo', 'bem', 'então', 'assim', 'ok',
  ]),
}

const baseDoIdioma = (lang: string) => (lang || '').toLowerCase().split('-')[0]

/** Há lista de stopwords para este idioma? Sem ela a extração acontece SEM filtro gramatical. */
export function temStopwords(lang: string): boolean {
  return STOPWORDS_POR_IDIOMA[baseDoIdioma(lang)] !== undefined
}

export interface KeywordOptions {
  /** Máximo de palavras retornadas por frase (default 6). */
  max?: number
  /** Comprimento mínimo do token para ser candidato (default 4). */
  minLength?: number
  /**
   * Idioma do texto — decide qual lista de stopwords filtra o ruído gramatical. Sem ele (ou sem
   * lista para o idioma) a extração roda sem filtro, e `temStopwords` diz isso a quem exibe.
   */
  lang?: string
}

/** Token → forma de exibição (primeira ocorrência) + chave normalizada. */
interface Candidate {
  display: string
  key: string
  score: number
}

/**
 * Retorna as palavras de conteúdo mais salientes de uma frase, em ordem de
 * relevância, sem repetição. Vazio quando não há candidato utilizável.
 */
export function extractKeywords(text: string, opts: KeywordOptions = {}): string[] {
  const max = opts.max ?? 6
  const minLength = opts.minLength ?? 4
  /* Sem lista para o idioma, a extração continua (a alternativa seria devolver vazio e sumir com
     um recurso inteiro) mas sem filtro gramatical — e `temStopwords` deixa a tela declarar isso. */
  const stopwords = STOPWORDS_POR_IDIOMA[baseDoIdioma(opts.lang ?? '')] ?? new Set<string>()
  const raw = (text ?? '').normalize('NFC')

  // Tokeniza por sequências de letras (inclui acentuadas e apóstrofo interno).
  const tokens = raw.match(/[\p{L}][\p{L}'-]*/gu) ?? []
  const byKey = new Map<string, Candidate>()

  for (const tok of tokens) {
    const display = tok.replace(/^['-]+|['-]+$/g, '')
    const key = display.toLowerCase()
    if (key.length < minLength) continue
    if (stopwords.has(key)) continue
    if (/^\d+$/.test(key)) continue
    if (byKey.has(key)) continue // 1ª ocorrência define a exibição
    // Saliência: comprimento é um proxy barato de raridade/informação. Palavras
    // longas de conteúdo (ex.: "reconciliation") pontuam acima de curtas comuns.
    const score = key.length
    byKey.set(key, { display, key, score })
  }

  return [...byKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((c) => c.display)
}
