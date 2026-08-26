import type { MtResult, TranslationProvider } from '../capabilities'

/**
 * MyMemory — API pública de tradução, CORS-enabled, SEM chave (perfil Grátis/Web).
 * Limite anônimo ~5k chars/dia. Exige par de idiomas explícito (não autodetecta).
 * Usa `fetch`, logo roda igual no navegador e no Node (verificação).
 *
 * ⚠ ARMADILHA DESTA API — a causa de um bug real de FABRICAÇÃO:
 * a MyMemory responde **HTTP 200** quando recusa a tradução (cota estourada, idioma inválido) e
 * coloca a mensagem de erro **dentro do campo `translatedText`**. Este adapter declarava
 * `responseStatus` e nunca o lia: a string
 *   "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY…"
 * era aceita como tradução, gravada em `vocabCards.back` e exibida ao usuário como se fosse o
 * significado da palavra — com selo de procedência. Ou seja: a app ensinava uma "tradução" que era o
 * texto de erro da própria API, justamente nos idiomas que dependem dela como último recurso.
 *
 * Regra daqui em diante: melhor NÃO traduzir e dizer o motivo do que devolver algo plausível.
 */

/** Códigos de idioma aceitáveis (ISO-639-1/2, com subtag opcional: 'pt', 'pt-BR', 'zh-Hans'). */
const LANG_CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i

/**
 * Respostas-sentinela: a API devolve estes textos NO LUGAR da tradução, com HTTP 200.
 * Checagem de cinto e suspensório — o `responseStatus` já cobre a maioria dos casos, mas há
 * respostas de aviso que chegam com status 200.
 */
const SENTINEL =
  /(MYMEMORY WARNING|YOU USED ALL AVAILABLE FREE TRANSLATIONS|IS AN INVALID (TARGET|SOURCE) LANGUAGE|QUERY LENGTH LIMIT EXCEEDED)/i

/**
 * COTA LOCAL. A API não devolve quanto resta; sem contar, o app batia no teto (~5k chars/dia
 * anônimos) e a legenda passava a receber o aviso de cota no lugar da tradução. Contamos por dia
 * (UTC) em localStorage e paramos ANTES do teto, com folga — melhor "sem tradução" do que lixo.
 */
const COTA_CHAVE = 'babel.mymemory.cota'
const COTA_DIA = 4_500
function cotaDeHoje(): { dia: string; usados: number } {
  const dia = new Date().toISOString().slice(0, 10)
  try {
    const b = JSON.parse(localStorage.getItem(COTA_CHAVE) || 'null') as { dia?: string; usados?: number } | null
    if (b && b.dia === dia && typeof b.usados === 'number') return { dia, usados: b.usados }
  } catch { /* sem storage → sem cota (ambiente de teste) */ }
  return { dia, usados: 0 }
}
function registrarUso(chars: number): void {
  const c = cotaDeHoje()
  try { localStorage.setItem(COTA_CHAVE, JSON.stringify({ dia: c.dia, usados: c.usados + chars })) } catch { /* idem */ }
}
export function cotaMyMemoryRestante(): number { return Math.max(0, COTA_DIA - cotaDeHoje().usados) }

export class MyMemoryMt implements TranslationProvider {
  readonly id = 'mymemory'
  readonly runtime = 'browser' as const
  readonly cost = 'free' as const
  readonly label = 'MyMemory (grátis)'

  /**
   * A MyMemory cobre muitos pares, mas não valida o par antes de responder: um código inválido volta
   * como "'XX' IS AN INVALID TARGET LANGUAGE" **dentro** do campo de tradução. Rejeitar códigos
   * malformados aqui evita que essa string chegue a ser confundida com uma tradução lá na frente.
   */
  supports(src: string | null, tgt: string): boolean {
    if (!src || !tgt || src === tgt) return false
    if (cotaMyMemoryRestante() <= 0) return false
    return LANG_CODE.test(src) && LANG_CODE.test(tgt)
  }

  async translate(
    text: string,
    src: string | null,
    tgt: string,
    opts?: { signal?: AbortSignal }
  ): Promise<MtResult> {
    if (!src) throw new Error('MyMemory exige o idioma de origem')
    const langpair = `${src}|${tgt}`
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text
    )}&langpair=${encodeURIComponent(langpair)}`
    const res = await fetch(url, { signal: opts?.signal })
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`)
    const data = (await res.json()) as {
      responseData?: { translatedText?: string }
      responseStatus?: number | string
      responseDetails?: string
    }

    const translated = data.responseData?.translatedText?.trim()

    // 1) O status REAL da API vem no corpo, não no HTTP. É este o campo que era ignorado.
    const status = Number(data.responseStatus)
    if (Number.isFinite(status) && status !== 200) {
      const detail = data.responseDetails?.trim() || translated || 'sem detalhes'
      throw new Error(`MyMemory recusou a tradução (${status}): ${detail}`)
    }

    if (!translated) throw new Error('MyMemory devolveu resposta vazia')

    // 2) Aviso disfarçado de tradução (chega com status 200 em alguns casos).
    if (SENTINEL.test(translated)) {
      throw new Error(
        `MyMemory devolveu um aviso no lugar da tradução: "${translated.slice(0, 120)}"`
      )
    }

    registrarUso(text.length)
    // Último recurso público: correto em frases comuns, ruim em gíria e contexto. A UI marca "≈".
    return { text: translated, detectedSourceLang: src, engine: 'mymemory', approximate: true }
  }
}
