/// <reference types="vite/client" />
import type { CefrLevel } from '../../core/learning/contract'
import type { DadoTrilha } from '../../core/learning/trilha'
import { registrarNiveis } from '../../core/learning/cefrWordlist'
import { baseDoIdioma } from './indice'

export { indiceDaTrilha } from './indice'
export type { EntradaDoIndice, Indice } from './indice'

/** `niveis/<lang>.json`: nível → palavras normalizadas, unidas por `|`. */
type Niveis = Record<string, string>

/** Trilha v2: monolíngue, `[palavra]` ou `[palavra, frase]`. A tradução mora no arquivo do par. */
interface TrilhaV2 {
  lang: string
  versao: number
  escala: 'cefr' | 'frequencia'
  procedencia: string
  fonte: string
  niveis: Partial<Record<CefrLevel, Array<[string, string?]>>>
}

interface ArquivoDeGlosas {
  par: string
  glosas: Record<string, string>
  frases?: Record<string, string>
}

const carregadores = import.meta.glob<{ default: unknown }>(['./*.json', '!./indice.json'])
const carregadoresDeGlosa = import.meta.glob<{ default: ArquivoDeGlosas }>('../glosas/*.json')

const carregadoresDeNiveis = import.meta.glob<{ default: Niveis }>('./niveis/*.json')

const cache = new Map<string, Promise<DadoTrilha | null>>()
const prontos = new Map<string, DadoTrilha>()

const base = baseDoIdioma

/**
 * Traz a lista palavra→nível do idioma para dentro do núcleo. Mora aqui, e não em `cefrWordlist`,
 * porque só o cliente tem Vite: o núcleo recebe o dado pronto e continua isomórfico.
 */
export async function precarregarNiveis(lang: string): Promise<void> {
  const idioma = base(lang)
  const carregador = carregadoresDeNiveis[`./niveis/${idioma}.json`]
  registrarNiveis(idioma, carregador ? (await carregador()).default : {})
}

const ehV2 = (d: unknown): d is TrilhaV2 =>
  !!d && typeof d === 'object' && (d as TrilhaV2).versao === 2

/**
 * Junta a trilha monolíngue com as glosas do par. Palavra sem glosa entra com tradução vazia:
 * ela ainda joga nos exercícios que só precisam da grafia, e quem exige pista a recusa pelo
 * campo vazio — some-la da trilha esconderia vocabulário que existe.
 */
function juntar(v2: TrilhaV2, glosas: ArquivoDeGlosas | null): DadoTrilha {
  const niveis: DadoTrilha['niveis'] = {}
  for (const [nivel, entradas] of Object.entries(v2.niveis)) {
    niveis[nivel as CefrLevel] = (entradas ?? []).map(([palavra, frase]) => {
      const traducao = glosas?.glosas?.[palavra] ?? ''
      const fraseTraduzida = frase ? glosas?.frases?.[frase] : undefined
      return [palavra, traducao, frase, fraseTraduzida] as [string, string, string?, string?]
    })
  }
  return {
    lang: v2.lang,
    fonte: v2.fonte,
    versao: String(v2.versao),
    escala: v2.escala,
    procedencia: v2.procedencia,
    niveis,
  }
}

async function carregarGlosas(idioma: string, nativo: string): Promise<ArquivoDeGlosas | null> {
  const carregador = carregadoresDeGlosa[`../glosas/${idioma}-${base(nativo)}.json`]
  return carregador ? (await carregador()).default : null
}

export function carregarTrilha(lang: string, nativo = 'pt'): Promise<DadoTrilha | null> {
  const idioma = base(lang)
  const chave = `${idioma}-${base(nativo)}`
  const carregador = carregadores[`./${idioma}.json`]
  if (!carregador) return Promise.resolve(null)

  let p = cache.get(chave)
  if (!p) {
    p = carregador().then(async (m) => {
      const cru = m.default
      const dado = ehV2(cru) ? juntar(cru, await carregarGlosas(idioma, nativo)) : (cru as DadoTrilha)
      prontos.set(chave, dado)
      return dado
    })
    cache.set(chave, p)
  }
  return p
}

export function trilhaEmCache(lang: string, nativo = 'pt'): DadoTrilha | null {
  return prontos.get(`${base(lang)}-${base(nativo)}`) ?? null
}
