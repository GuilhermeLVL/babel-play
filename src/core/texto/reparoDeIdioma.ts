/**
 * REPARO DO IDIOMA GRAVADO — sessões, falas e cartões antigos com o idioma errado.
 *
 * De onde vem o dado errado (auditoria 2026-09-26, idioma da sessão):
 *  - antes de `fix/idioma-detectado`, o "Detectar" transcrevia português como inglês e a FALA saía
 *    etiquetada `en`;
 *  - até esta correção, o CARTÃO recebia o idioma do seletor (`isSys ? targetLang : sourceLang`),
 *    não o da fala: áudio em português com o par "pt / estudo en" virava cartão `en`;
 *  - a SESSÃO gravava `config.mine`, não o idioma do conteúdo.
 *
 * O reparo RECLASSIFICA POR TEXTO (detector heurístico do núcleo, o mesmo em qualquer ambiente) e só
 * age com evidência: confiança mínima e número mínimo de palavras. Nunca apaga nada: só troca
 * etiquetas de idioma. É IDEMPOTENTE: depois de aplicado, o plano seguinte sai vazio, porque as
 * etiquetas passam a concordar com a detecção.
 *
 * Puro: recebe as linhas, devolve o PLANO. Quem grava é o chamador (IndexedDB no modo sem conta,
 * banco no servidor), cada um com a sua regra de chave única.
 */
import { detectarIdiomaPorTexto } from './detectarIdioma'
import { baseLang } from './idioma'

export interface SessaoParaReparo { id: string; sourceLang: string | null; targetLang: string | null }
export interface FalaParaReparo { id: string; sessionId: string; sourceLang: string | null; sourceText: string | null }
export interface CartaoParaReparo {
  id: string
  word: string
  sentence: string | null
  srcLang: string | null
  tgtLang: string | null
  sessionId: string | null
}

export interface OpcoesDoReparo {
  /** Confiança mínima da detecção de texto (0..1). Padrão 0,5. */
  confiancaMinima?: number
  /** Palavras mínimas no texto para a detecção valer. Padrão 4. */
  minimoDePalavras?: number
}

export interface TrocaDeIdioma { id: string; de: string | null; para: string }
export interface TrocaDoCartao { id: string; srcDe: string | null; srcPara: string; tgtDe: string | null; tgtPara: string | null }
export interface TrocaDaSessao { id: string; sourceDe: string | null; sourcePara: string; targetDe: string | null; targetPara: string | null }

export interface PlanoDeReparo {
  falas: TrocaDeIdioma[]
  cartoes: TrocaDoCartao[]
  sessoes: TrocaDaSessao[]
}

const palavras = (t: string | null | undefined) => (t ?? '').trim().split(/\s+/).filter(Boolean).length

/** Idioma do texto quando há evidência suficiente; `''` quando não há (nunca um chute). */
export function idiomaComEvidencia(texto: string | null | undefined, opcoes: OpcoesDoReparo = {}): string {
  const min = opcoes.minimoDePalavras ?? 4
  if (palavras(texto) < min) return ''
  const d = detectarIdiomaPorTexto(texto ?? '')
  return d && d.confidence >= (opcoes.confiancaMinima ?? 0.5) ? d.lang : ''
}

/** Mantém a região quando a base não muda ('pt-BR' continua 'pt-BR'); senão, o código novo. */
function manterOuTrocar(atual: string | null, novo: string): string {
  return baseLang(atual) === baseLang(novo) && atual ? atual : novo
}

/** O verso deixa de ser do mesmo idioma da frente: se ficaria igual, recebe o idioma antigo da frente. */
function versoCoerente(tgt: string | null, srcAntigo: string | null, srcNovo: string): string | null {
  if (baseLang(tgt) !== baseLang(srcNovo)) return tgt
  return srcAntigo && baseLang(srcAntigo) !== baseLang(srcNovo) ? srcAntigo : tgt
}

export function planejarReparoDeIdioma(
  dados: { sessoes: SessaoParaReparo[]; falas: FalaParaReparo[]; cartoes: CartaoParaReparo[] },
  opcoes: OpcoesDoReparo = {},
): PlanoDeReparo {
  const plano: PlanoDeReparo = { falas: [], cartoes: [], sessoes: [] }

  /* 1. FALAS: o texto decide quando há evidência; sem evidência, a etiqueta gravada fica. */
  const idiomaFinalDaFala = new Map<string, string>()
  const falasPorSessao = new Map<string, Array<{ texto: string; lang: string; peso: number; codigo: string }>>()
  for (const f of dados.falas) {
    const det = idiomaComEvidencia(f.sourceText, opcoes)
    let final = f.sourceLang ?? ''
    if (det && det !== baseLang(f.sourceLang)) {
      final = det
      plano.falas.push({ id: f.id, de: f.sourceLang, para: det })
    }
    idiomaFinalDaFala.set(f.id, final)
    if (baseLang(final)) {
      const lista = falasPorSessao.get(f.sessionId) ?? []
      lista.push({ texto: (f.sourceText ?? '').toLowerCase(), lang: baseLang(final), peso: Math.max(1, palavras(f.sourceText)), codigo: final })
      falasPorSessao.set(f.sessionId, lista)
    }
  }

  /* Idioma dominante (por palavras) de cada sessão, e se ela é MONOLÍNGUE (toda fala no mesmo). */
  const dominante = new Map<string, { lang: string; codigo: string; monolingue: boolean }>()
  for (const [sid, lista] of falasPorSessao) {
    const peso = new Map<string, { n: number; codigo: string }>()
    for (const f of lista) peso.set(f.lang, { n: (peso.get(f.lang)?.n ?? 0) + f.peso, codigo: peso.get(f.lang)?.codigo ?? f.codigo })
    let melhor = ''
    let n = 0
    for (const [l, v] of peso) if (v.n > n) { melhor = l; n = v.n }
    dominante.set(sid, { lang: melhor, codigo: peso.get(melhor)?.codigo ?? melhor, monolingue: peso.size === 1 })
  }

  /* 2. SESSÕES: o idioma do CONTEÚDO é o dominante das falas. */
  for (const s of dados.sessoes) {
    const dom = dominante.get(s.id)
    if (!dom?.lang || dom.lang === baseLang(s.sourceLang)) continue
    const targetPara = versoCoerente(s.targetLang, s.sourceLang, dom.lang)
    plano.sessoes.push({ id: s.id, sourceDe: s.sourceLang, sourcePara: dom.codigo, targetDe: s.targetLang, targetPara })
  }

  /* 3. CARTÕES: a frase de origem decide; sem evidência nela, a FALA que contém a frase; sem essa,
     a sessão — só se ela for monolíngue (numa conversa mista, a sessão não diz nada da palavra). */
  for (const c of dados.cartoes) {
    /* Só material CAPTURADO: cartão manual, da trilha ou de baralho Anki tem idioma declarado por
       quem o criou, e a frase de exemplo pode estar de propósito em outra língua. */
    if (!c.sessionId) continue
    let idioma = idiomaComEvidencia(c.sentence, opcoes)
    if (!idioma) {
      const frase = (c.sentence ?? '').trim().toLowerCase()
      const fala = frase ? falasPorSessao.get(c.sessionId)?.find((f) => f.texto.includes(frase) || frase.includes(f.texto)) : undefined
      if (fala) idioma = fala.lang
      else {
        const dom = dominante.get(c.sessionId)
        if (dom?.monolingue) idioma = dom.lang
      }
    }
    if (!idioma || idioma === baseLang(c.srcLang)) continue
    plano.cartoes.push({
      id: c.id,
      srcDe: c.srcLang,
      srcPara: manterOuTrocar(null, idioma),
      tgtDe: c.tgtLang,
      tgtPara: versoCoerente(c.tgtLang, c.srcLang, idioma),
    })
  }
  return plano
}

/** O plano não muda nada? (para registrar "nada a reparar" sem abrir transação) */
export function planoVazio(p: PlanoDeReparo): boolean {
  return !p.falas.length && !p.cartoes.length && !p.sessoes.length
}
