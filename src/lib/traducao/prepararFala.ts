/**
 * PREPARAÇÃO DA FALA ANTES DE TRADUZIR — só para o que VOCÊ diz ao microfone em português.
 *
 * A transcrição do mic é FALA: vem com "né", "tipo assim", repetições ("eu eu acho"), contrações
 * orais ("tá", "pra", "cê") e gíria. Os motores de frase (opus-mt, Chrome Translator, MyMemory)
 * foram treinados em texto ESCRITO e vertem isso ao pé da letra — "a gente" vira "the people",
 * "pois é" vira "so it is". Reescrever a fala em português claro ANTES de traduzir é a única
 * melhoria de sentido que funciona em TODOS os motores, inclusive offline.
 *
 * O que NÃO faz: não toca texto que não seja português, não remove palavra de conteúdo ("tipo"
 * em "que tipo de", "assim" como advérbio), não inventa nada. Puro e determinístico — testado.
 *
 * A lista de hesitações é a mesma da Análise (`core/learning/fillers.ts`, medida por idioma) mais
 * "aham/uhum": uma verdade só sobre o que é vício.
 */
import { FRASES_INTEIRAS,PARAFRASES } from './expressoes'

/**
 * OS IDIOMAS COM PREPARACAO — hoje um so, e a lista existe para dizer isso em voz alta.
 *
 * A funcao ja so agia em portugues (`origem !== 'pt' → return`), mas isso era um `if` cravado no
 * meio do fluxo: quem lia o codigo nao tinha como saber se as outras linguas estavam esquecidas ou
 * deliberadamente de fora, e quem chamava nao tinha como perguntar (auditoria de 2026-09-07, A39).
 * Agora as tabelas sao endereçadas por idioma e a ausencia e consultavel: acrescentar alemao e
 * acrescentar uma entrada neste mapa, nao mexer no fluxo.
 */
export function idiomasComPreparacaoDeFala(): string[] {
  return Object.keys(TABELAS_POR_IDIOMA)
}

/** Marcadores só de hesitação — só caem quando isolados por pontuação/bordas. */
const VICIOS_PT = ['ah', 'ahn', 'ahm', 'hum', 'hmm', 'uhm', 'eh', 'ehh', 'né', 'tipo assim', 'aham', 'uhum']

/** Contrações orais → forma escrita. Casadas por palavra inteira (fronteira de letra, acento incluso). */
const CONTRACOES: ReadonlyArray<readonly [string, string]> = [
  ['tá', 'está'], ['tô', 'estou'], ['tava', 'estava'], ['tavam', 'estavam'],
  ['tamo', 'estamos'], ['tamos', 'estamos'], ['tão', 'estão'],
  ['pra', 'para'], ['pras', 'para as'], ['pro', 'para o'], ['pros', 'para os'],
  ['cê', 'você'], ['ocê', 'você'], ['cês', 'vocês'],
  ['a gente', 'nós'],
]

interface TabelaDeFala {
  vicios: readonly string[]
  contracoes: ReadonlyArray<readonly [string, string]>
}

/** As tabelas por idioma. Idioma ausente = sem preparacao, e o texto sai intacto. */
const TABELAS_POR_IDIOMA: Record<string, TabelaDeFala> = {
  pt: { vicios: VICIOS_PT, contracoes: CONTRACOES },
}

export interface FalaPreparada {
  /** Texto pronto para o motor de tradução (pode ser igual ao original). */
  texto: string
  /** Tradução PRONTA quando a fala inteira é uma expressão conhecida — dispensa o motor. */
  traducaoPronta?: string
  /** Algo mudou (para log/diagnóstico). */
  mudou: boolean
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function porPalavra(expr: string): RegExp {
  return new RegExp('(?<!\\p{L})' + escapar(expr) + '(?!\\p{L})', 'giu')
}
function comCaixaDe(original: string, nova: string): string {
  const inicial = original.charAt(0)
  const maiuscula = inicial !== inicial.toLowerCase() && inicial === inicial.toUpperCase()
  return maiuscula ? nova.charAt(0).toUpperCase() + nova.slice(1) : nova
}

/** Remove vícios isolados (entre pontuação/bordas) e duplicações imediatas ("eu eu"). */
export function limparVicios(texto: string): string {
  let t = texto
  for (const v of VICIOS_PT) {
    t = t.replace(new RegExp('(^|[,.;!?…]\\s*|\\s)' + escapar(v) + '(?=\\s*(?:[,.;!?…]|$))', 'giu'), '$1')
  }
  // Duplicação imediata da mesma palavra (gagueira de fala): "eu eu acho" → "eu acho".
  t = t.replace(/(?<!\p{L})(\p{L}{2,})\s+\1(?!\p{L})/giu, '$1')
  // Pontuação órfã ("acho , que"), vírgula colada em ponto ("sim,."), dobrada e espaços duplos.
  for (let i = 0; i < 2; i++) {
    t = t.replace(/\s+([,.;!?…])/g, '$1').replace(/([,.;!?…])(?:\s*\1)+/g, '$1').replace(/[,;]\s*([.!?…])/g, '$1').replace(/\s{2,}/g, ' ')
  }
  t = t.replace(/^[\s,.;…]+/, '').trim()
  // Se a fala começava em maiúscula e o vício inicial saiu, a nova primeira palavra herda a maiúscula.
  const primeira = texto.trim().charAt(0)
  if (t && primeira === primeira.toUpperCase() && primeira !== primeira.toLowerCase()) t = t.charAt(0).toUpperCase() + t.slice(1)
  return t
}

/** Contrações orais para a forma escrita, preservando a inicial maiúscula. */
export function normalizarContracoes(texto: string): string {
  let t = texto
  for (const [oral, escrita] of CONTRACOES) t = t.replace(porPalavra(oral), (m) => comCaixaDe(m, escrita))
  return t
}

/** Gíria e expressão idiomática → paráfrase clara (dentro da frase). Do mais longo ao mais curto. */
const PARAFRASES_ORDENADAS = [...PARAFRASES].sort((a, b) => b[0].length - a[0].length)
export function parafrasearExpressoes(texto: string): string {
  let t = texto
  for (const [expr, clara] of PARAFRASES_ORDENADAS) t = t.replace(porPalavra(expr), (m) => comCaixaDe(m, clara))
  return t
}

/** A fala inteira é uma expressão conhecida? Devolve a tradução pronta no idioma-alvo. */
export function traducaoDeFraseInteira(texto: string, alvo: string): string | undefined {
  const lista = FRASES_INTEIRAS[alvo.split('-')[0].toLowerCase()]
  if (!lista) return undefined
  const bruto = texto.trim().toLowerCase()
  const interrogativa = /\?\s*$/.test(bruto)
  const chave = bruto.replace(/[!.…?\s]+$/g, '').trim()
  // Com "?", prefere a forma interrogativa da lista; sem "?", a afirmativa.
  const alvoChave = interrogativa ? chave + '?' : chave
  const exato = lista.find(([e]) => e === alvoChave)
  if (exato) return exato[1]
  const semSinal = lista.find(([e]) => e.replace(/\?$/, '') === chave && !e.endsWith('?'))
  return semSinal?.[1]
}

/**
 * Pipeline completo. `origem` é o idioma da fala; age apenas nos idiomas que têm tabela
 * (`idiomasComPreparacaoDeFala`). Qualquer outro sai intacto — ausência de régua, não erro.
 */
export function prepararFala(texto: string, origem: string | null | undefined, alvo: string): FalaPreparada {
  const t0 = (texto ?? '').trim()
  const idioma = (origem ?? '').split('-')[0].toLowerCase()
  if (!t0 || !TABELAS_POR_IDIOMA[idioma]) return { texto: t0, mudou: false }
  const pronta = traducaoDeFraseInteira(t0, alvo)
  if (pronta) return { texto: t0, traducaoPronta: pronta, mudou: true }
  let t = limparVicios(t0)
  t = normalizarContracoes(t)
  t = parafrasearExpressoes(t).trim()
  if (!t) return { texto: t0, mudou: false } // só vícios: melhor traduzir o original do que nada
  // Depois de limpar, a fala pode ter virado uma expressão inteira ("né, valeu" → "valeu").
  const prontaDepois = traducaoDeFraseInteira(t, alvo)
  if (prontaDepois) return { texto: t, traducaoPronta: prontaDepois, mudou: true }
  return { texto: t, mudou: t !== t0 }
}

/** Chave de cache tolerante: caixa, pontuação final e espaços não geram entradas diferentes. */
export function chaveNormalizada(texto: string): string {
  return texto.trim().toLowerCase().replace(/[.!…\s]+$/g, '').replace(/\s+/g, ' ')
}
