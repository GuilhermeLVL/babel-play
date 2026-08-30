/**
 * Divide um texto em FRASES, para tradutores que só sabem traduzir uma.
 *
 * POR QUE ISTO EXISTE. O `opus-mt` é treinado em pares de UMA sentença, e diante de duas ele emite
 * o token de fim depois da primeira — a segunda simplesmente some. Medido: *"My doctor said I am
 * fine. She was very kind."* devolve só *"Meu médico disse que estou bem."*, e junto com a segunda
 * frase vai embora o `she` que resolveria o gênero ("médico" onde deveria ser "médica").
 *
 * NÃO É LIMITE DE TOKENS. Verificado com `max_new_tokens` 128 e 256: saída idêntica, com 9 tokens.
 * O modelo decide parar. Por isso a correção é segmentar antes de chamar, e não afrouxar um teto.
 *
 * O enunciado do VAD chega com até 6 segundos de fala, o que comporta várias frases — então este
 * caso não é raro na captura ao vivo, é o normal de quem fala corrido.
 *
 * DELIBERADAMENTE SIMPLES. Um segmentador linguístico completo (Punkt, ICU) resolveria mais casos e
 * custaria uma dependência e um modelo. Aqui basta acertar a pontuação final de frase sem quebrar
 * nas armadilhas frequentes — abreviação, número decimal e reticências. Quando errar, o pior que
 * acontece é traduzir um pedaço a mais ou a menos junto: nunca perder texto, porque as partes são
 * reunidas de volta.
 *
 * Puro e isomórfico: sem I/O. Roda no worker, no servidor e no Vitest.
 */

/**
 * Abreviações depois das quais um ponto NÃO termina a frase.
 *
 * Sem esta lista, "Dr. Silva chegou" viraria duas frases e o tradutor receberia "Dr." sozinho —
 * que ele traduz como lixo. A lista cobre pt e en porque as duas pontas do produto passam por aqui.
 */
const ABREVIACOES = new Set([
  // Português
  'sr', 'sra', 'srta', 'dr', 'dra', 'prof', 'profa', 'eng', 'av', 'r', 'ltda', 'etc',
  'p.ex', 'ex', 'obs', 'ref', 'núm', 'num', 'pág', 'pag', 'fl', 'art', 'cia', 'ed',
  // Inglês
  'mr', 'mrs', 'ms', 'jr', 'sr.', 'st', 'vs', 'inc', 'ltd', 'co', 'approx', 'dept',
  'e.g', 'i.e', 'no', 'fig', 'vol', 'pp',
])

/** Terminadores de frase. As reticências entram como caractere único e como três pontos. */
const TERMINADORES = /[.!?…]/

/**
 * `true` quando o ponto na posição `i` realmente encerra a frase.
 *
 * As três armadilhas, na ordem em que aparecem em fala transcrita:
 *  · abreviação  — "Dr. Silva"      (o ponto pertence à palavra)
 *  · decimal     — "3.14" / "1.500" (o ponto está entre dígitos)
 *  · inicial     — "J. R. R."       (uma letra sozinha antes do ponto)
 */
function terminaFrase(texto: string, i: number): boolean {
  const ch = texto[i]
  if (!TERMINADORES.test(ch)) return false

  // Depois do terminador precisa vir espaço (ou o fim do texto). "3.14" não quebra por isso.
  const depois = texto.slice(i + 1)
  if (depois.length > 0 && !/^\s/.test(depois)) return false

  if (ch === '.') {
    // A palavra imediatamente antes do ponto.
    const antes = texto.slice(0, i)
    const palavra = (antes.match(/([\p{L}\p{N}.]+)$/u)?.[1] ?? '').toLowerCase()
    if (ABREVIACOES.has(palavra)) return false
    // Inicial isolada: uma única letra antes do ponto ("J. R. R. Tolkien").
    if (/^\p{L}$/u.test(palavra)) return false
  }

  // O que vem depois começa frase? Espaço seguido de maiúscula, dígito ou aspas. Minúscula depois
  // do ponto quase sempre é abreviação ou erro de transcrição, e juntar erra menos que separar.
  const proximo = depois.replace(/^\s+/, '')
  if (proximo.length === 0) return true
  return /^[\p{Lu}\p{N}"“'(¿¡]/u.test(proximo)
}

export interface OpcoesDeSeparacao {
  /**
   * Frases com menos caracteres que isto são coladas na anterior.
   *
   * Um fragmento de duas letras não é uma frase para o tradutor — é ruído que ele traduz mal e
   * isoladamente. Colar preserva o texto e dá contexto.
   */
  minimoDeCaracteres?: number
}

/**
 * Separa em frases. Sempre devolve o texto INTEIRO distribuído entre as partes — nada se perde.
 * Texto sem pontuação (o caso comum em fala transcrita) volta como uma única frase.
 */
export function separarEmFrases(texto: string, opcoes: OpcoesDeSeparacao = {}): string[] {
  const minimo = opcoes.minimoDeCaracteres ?? 4
  const t = (texto ?? '').trim()
  if (!t) return []

  const partes: string[] = []
  let inicio = 0
  for (let i = 0; i < t.length; i++) {
    if (!terminaFrase(t, i)) continue
    // Absorve terminadores repetidos ("!!!", "...") num só corte.
    let fim = i
    while (fim + 1 < t.length && TERMINADORES.test(t[fim + 1])) fim++
    const trecho = t.slice(inicio, fim + 1).trim()
    if (trecho) partes.push(trecho)
    inicio = fim + 1
    i = fim
  }
  const resto = t.slice(inicio).trim()
  if (resto) partes.push(resto)

  if (partes.length <= 1) return partes

  // Cola os fragmentos curtos demais na frase anterior.
  const saida: string[] = []
  for (const p of partes) {
    if (saida.length > 0 && p.length < minimo) saida[saida.length - 1] += ` ${p}`
    else saida.push(p)
  }
  return saida
}

/**
 * Reúne as traduções na mesma ordem, descartando as vazias.
 *
 * Uma parte que falhou NÃO derruba as outras: é melhor entregar duas frases de três do que nada.
 * Espelha a doutrina do resto do produto — degradar dizendo o que saiu, em vez de sumir.
 */
export function juntarFrases(partes: string[]): string {
  return partes.map((p) => p.trim()).filter(Boolean).join(' ')
}
