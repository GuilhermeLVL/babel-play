/**
 * Nível CEFR por LOOKUP EM WORDLIST REAL — substitui `estimateCefr`.
 *
 * O QUE ISTO SUBSTITUI: `cefr.ts:estimateCefr` decidia o nível pelo COMPRIMENTO da palavra mais um
 * set de 68 termos comuns. Medido no banco real (2026-08-08): **2.087 de 2.126 cartões com
 * confiança < 0,5**, e a distribuição saiu invertida — A1 com 100 palavras contra B1 com 739 —
 * porque palavra longa virava nível alto. Um dado que parecia CEFR e era comprimento de string.
 *
 * ESCOLHA DA FONTE (Ajuste 1 pedia Kelly, EFLLex ou SUBTLEX; escolhi outra e registro o porquê):
 *  - **CEFR-J Vocabulary Profile 1.5** (Tono Laboratory, TUFS) + **Octanove Vocabulary Profile
 *    C1/C2 1.0** — já vendorizados em `src/data/trilha/en.json`; aqui se lê o derivado
 *    `niveis/en.json` (só palavra→nível, gerado por `scripts/trilha/derivar.mjs`), com atribuição em
 *    `src/data/trilha/FONTES.md`.
 *  - Por que não SUBTLEX: dá FREQUÊNCIA, não banda CEFR. Converter frequência em A1..C2 exige
 *    cortes arbitrários — trocaria um chute por outro, mais bem vestido.
 *  - Por que não Kelly/EFLLex: são boas e teriam a MESMA cobertura de idioma (inglês) que já
 *    temos, ao custo de nova dependência de dados e nova revisão de licença.
 *  - CEFR-J é CEFR-nativo, feito para aprendizes, e já está no repositório licenciado e atribuído.
 *
 * LIMITAÇÃO DECLARADA, não escondida: são **2.784 palavras, só em inglês**. Palavra fora da lista
 * NÃO recebe nível — recebe `null` com procedência `ausente`. Nível ausente pesa ZERO no modelo de
 * dificuldade (F4); é a diferença entre "não sei" e "chutei".
 */
import niveisEn from '../../data/trilha/niveis/en.json'
import { indiceDaTrilha } from '../../data/trilha/carregar'

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type ProcedenciaCefr = 'curado' | 'wordlist' | 'ausente'

/** Ordem fixa e exaustiva — a UI usa isto para rotular a procedência do nível. */
export const PROCEDENCIAS: readonly ProcedenciaCefr[] = ['curado', 'wordlist', 'ausente'] as const

export interface NivelCefr {
  level: CefrLevel | null
  source: ProcedenciaCefr
  /** 1 = curado pelo usuário/importação · 0,95 = wordlist medida · 0 = ausente. */
  confidence: number
}

const NIVEIS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/** Normalização mínima e estável: sem caixa, sem espaços de borda, sem diacríticos. */
function chave(palavra: string): string {
  return palavra.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/** `niveis/<lang>.json`: nível → palavras já normalizadas e unidas por `|`. */
type Niveis = Partial<Record<CefrLevel, string>>

/** Índice palavra → nível, montado uma vez por idioma. */
const indices = new Map<string, Map<string, CefrLevel>>()

function indiceDe(lang: string): Map<string, CefrLevel> {
  const idioma = (lang || '').toLowerCase().split('-')[0]
  const existente = indices.get(idioma)
  if (existente) return existente

  const mapa = new Map<string, CefrLevel>()
  if (idioma === 'en') {
    const n = niveisEn as Niveis
    for (const nivel of NIVEIS) {
      for (const palavra of (n[nivel] ?? '').split('|')) {
        // Primeiro nível vence — a derivação já aplicou a regra, mas o guard mantém o invariante.
        if (palavra && !mapa.has(palavra)) mapa.set(palavra, nivel)
      }
    }
  }
  indices.set(idioma, mapa)
  return mapa
}

/**
 * Nível CEFR de uma palavra.
 *
 * `opts.curado` é o nível que veio de fonte confiável (importação com nível, curadoria manual) e
 * vence a wordlist — é o dado mais forte que existe sobre aquela palavra.
 */
export function nivelCefr(
  palavra: string,
  lang = 'en',
  opts: { curado?: string | null } = {},
): NivelCefr {
  if (opts.curado && (NIVEIS as string[]).includes(opts.curado)) {
    return { level: opts.curado as CefrLevel, source: 'curado', confidence: 1 }
  }
  const nivel = indiceDe(lang).get(chave(palavra))
  if (nivel) return { level: nivel, source: 'wordlist', confidence: 0.95 }
  return { level: null, source: 'ausente', confidence: 0 }
}

/** Cobertura da wordlist — para a limitação ser mensurável, e não presumida. */
export function coberturaDaWordlist(lang = 'en'): { total: number; porNivel: Record<string, number> } {
  const idioma = (lang || '').toLowerCase().split('-')[0]
  const entrada = indiceDaTrilha()[idioma]
  if (!entrada) return { total: 0, porNivel: {} }
  return { total: entrada.total, porNivel: { ...entrada.porNivel } }
}
