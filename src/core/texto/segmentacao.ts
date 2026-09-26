/**
 * SEGMENTAÇÃO POR IDIOMA — palavras e frases de um texto, com o locale de quem falou.
 *
 * POR QUE ISTO EXISTE (relato do dono, 2026-09-26): a sessão em português virava material de
 * prática com "a separação de palavras e frases errada". Havia duas causas somadas:
 *
 *  1. O tokenizador era uma regex (`[\p{L}][\p{L}'-]*`) igual para todos os idiomas. Ela não sabe
 *     separar japonês, chinês nem tailandês (a frase inteira virava UMA "palavra"), e em português
 *     devolvia formas que não são verbete: `d'água`, `fazê-lo`, `dá-me`.
 *  2. O idioma que chegava aqui era o do SELETOR (inglês), não o da fala (português): a lista de
 *     stopwords aplicada era a inglesa, e "porque", "quando", "também" viravam cartão.
 *
 * O que muda: `Intl.Segmenter` (ICU, embutido no navegador e no Node, sem dependência) com o
 * locale da fala faz a quebra de palavra e de frase; por cima dele, regras pequenas e declaradas
 * por idioma — hífen de composto, clítico do português, elisão do francês/italiano/catalão,
 * abreviação que não encerra frase. Sem `Intl.Segmenter`, cai na regex antiga (nunca some texto).
 *
 * Puro e isomórfico: roda no navegador, no servidor e no Vitest.
 */
import { separarEmFrases, terminaEmAbreviacao } from './frases'
import { baseLang } from './idioma'

/** Idiomas que não separam palavras por espaço: só o segmentador de dicionário acerta. */
const SEM_ESPACO = new Set(['ja', 'zh', 'th', 'lo', 'km', 'my'])

/**
 * Pronomes clíticos do português (ênclise e mesóclise). `dá-me` é a forma "dá" com "me" colado;
 * o verbete que se estuda é o verbo. Composto de verdade (`guarda-chuva`, `bem-vindo`) não termina
 * em pronome e fica inteiro.
 */
const CLITICOS_PT = new Set([
  'me', 'te', 'se', 'lhe', 'lhes', 'nos', 'vos', 'o', 'a', 'os', 'as',
  'lo', 'la', 'los', 'las', 'no', 'na', 'nas',
])

/** Artigos/preposições elididos com apóstrofo: `d'água`, `l'homme`, `dell'anno`, `qu'il`. */
const ELISOES: Record<string, ReadonlySet<string>> = {
  pt: new Set(['d', 'n']),
  fr: new Set(['l', 'd', 'j', 'm', 'n', 's', 't', 'c', 'qu', 'jusqu', 'lorsqu', 'puisqu']),
  it: new Set(['l', 'd', 'un', 'dell', 'all', 'dall', 'nell', 'sull', 'quest', 'quell', 'c', 'po']),
  ca: new Set(['l', 'd', 'n', 's', 'm', 't']),
}

const APOSTROFOS = /['’ʼ]/
const HIFENS = new Set(['-', '‐', '‑'])
const TEM_LETRA = /\p{L}/u

type Segmento = { segment: string; isWordLike?: boolean }

function segmentar(texto: string, idioma: string, granularity: 'word' | 'sentence'): Segmento[] | null {
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<Segmento> } }).Segmenter
  if (!Segmenter) return null
  try {
    return [...new Segmenter(idioma || undefined, { granularity }).segment(texto)]
  } catch {
    // Locale inválido: o ICU recusa, a raiz serve.
    return [...new Segmenter(undefined, { granularity }).segment(texto)]
  }
}

/** Tokens-palavra crus (com hífens de composto já reunidos). */
function tokensCrus(texto: string, idioma: string): string[] {
  const segs = segmentar(texto, idioma, 'word')
  if (!segs) return texto.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []
  const saida: string[] = []
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    // Hífen ENTRE duas palavras, sem espaço: é um composto (ou clítico) e fica junto.
    if (HIFENS.has(s.segment) && saida.length && segs[i - 1]?.isWordLike && segs[i + 1]?.isWordLike) {
      saida[saida.length - 1] += '-' + segs[i + 1].segment
      i++
      continue
    }
    if (s.isWordLike) saida.push(s.segment)
  }
  return saida
}

/** Ênclise/mesóclise do português → o verbo. `fazê-lo` → `fazer`, `dá-me` → `dá`, `dar-lhe-ei` → `darei`. */
function semClitico(token: string): string {
  const partes = token.split('-')
  if (partes.length < 2) return token
  const [radical, segunda, ...resto] = partes
  if (!CLITICOS_PT.has(segunda.toLowerCase())) return token
  // Mesóclise: o pronome no meio, a desinência depois (`dar-lhe-ei`).
  if (resto.length) return radical + resto.join('')
  // Com -lo/-la/-los/-las o infinitivo perdeu o "r" e ganhou acento: `fazê-lo`, `pô-la`, `parti-lo`.
  if (/^l[oa]s?$/i.test(segunda)) {
    if (/[áâéêíóô]$/i.test(radical)) return radical.slice(0, -1) + radical.slice(-1).normalize('NFD')[0] + 'r'
    if (/i$/i.test(radical)) return radical + 'r'
  }
  return radical
}

/** Tira o artigo elidido (`d'água` → `água`) e o possessivo inglês (`John's` → `John`). */
function semElisao(token: string, base: string): string {
  const m = token.match(/^([\p{L}]+)['’ʼ](\p{L}.*)$/u)
  if (m && ELISOES[base]?.has(m[1].toLowerCase())) return m[2]
  if (base === 'en') return token.replace(/['’ʼ]s$/i, '')
  return token
}

/**
 * As PALAVRAS de um texto, na ordem, sem pontuação e sem número solto.
 *
 * `idioma` é o da fala (BCP-47 ou base). Ele decide a quebra (japonês sem espaço, por exemplo) e as
 * regras de clítico e elisão. Idioma vazio = regras neutras, nunca as de outro idioma.
 */
export function palavrasDoTexto(texto: string | null | undefined, idioma: string): string[] {
  const t = (texto ?? '').normalize('NFC')
  if (!t.trim()) return []
  const base = baseLang(idioma)
  const saida: string[] = []
  for (const cru of tokensCrus(t, base || idioma)) {
    let tok = cru.replace(/^[-'’ʼ]+|[-'’ʼ]+$/g, '')
    if (!tok) continue
    if (APOSTROFOS.test(tok)) tok = semElisao(tok, base)
    if (base === 'pt' && tok.includes('-')) tok = semClitico(tok)
    if (TEM_LETRA.test(tok)) saida.push(tok)
  }
  return saida
}

/**
 * As FRASES de um texto, com o texto inteiro distribuído entre elas (nada se perde).
 *
 * O ICU sabe onde terminam as frases em japonês (`。`) e tailandês, mas quebra em abreviação
 * ("O Dr. | Silva chegou"). A regex de `frases.ts` conhece as abreviações de pt/en e não sabe o
 * japonês. Aqui: o ICU corta, e o corte logo depois de abreviação ou inicial é desfeito.
 */
export function frasesDoTexto(texto: string | null | undefined, idioma: string): string[] {
  const t = (texto ?? '').trim()
  if (!t) return []
  const segs = segmentar(t, baseLang(idioma) || idioma, 'sentence')
  if (!segs) return separarEmFrases(t, { minimoDeCaracteres: 1 })
  const saida: string[] = []
  for (const { segment } of segs) {
    const trecho = segment.trim()
    if (!trecho) continue
    if (saida.length && terminaEmAbreviacao(saida[saida.length - 1])) saida[saida.length - 1] += ' ' + trecho
    else saida.push(trecho)
  }
  return saida
}

/**
 * A frase do texto em que a palavra aparece — o contexto do cartão.
 *
 * Uma fala capturada pode ter várias frases; usar a fala inteira como exemplo do cartão dava
 * lacunas de 150 caracteres. Sem achar a palavra (grafia diferente), devolve o texto inteiro.
 */
export function fraseQueContem(texto: string | null | undefined, palavra: string, idioma: string): string {
  const t = (texto ?? '').trim()
  const alvo = (palavra ?? '').trim().toLocaleLowerCase()
  if (!t || !alvo) return t
  const frases = frasesDoTexto(t, idioma)
  if (frases.length <= 1) return t
  const achada = frases.find((f) => palavrasDoTexto(f, idioma).some((p) => p.toLocaleLowerCase() === alvo))
    ?? frases.find((f) => f.toLocaleLowerCase().includes(alvo))
  return achada ?? t
}

/** O idioma escreve sem espaço entre palavras? (a tela e os jogos de lacuna precisam saber) */
export function escreveSemEspaco(idioma: string): boolean {
  return SEM_ESPACO.has(baseLang(idioma))
}
