/// <reference types="vite/client" />
import type { CefrLevel } from '../../core/learning/contract'
import type { DadoTrilha } from '../../core/learning/trilha'
import { registrarNiveis } from '../../core/learning/cefrWordlist'
import { baseDoIdioma } from './indice'

export { indiceDaTrilha } from './indice'
import { indiceDaTrilha } from './indice'
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

/**
 * A TRILHA É BAIXADA, NÃO EMBUTIDA — e a diferença é de escala, não de gosto.
 *
 * Enquanto eram um ou dois idiomas, `import.meta.glob` era o caminho mais simples: o Vite fazia um
 * chunk por idioma e o navegador baixava só o do usuário. Com dezesseis, os mesmos arquivos passam
 * a pesar 6,4 MB dentro do repositório, do build e do deploy — sem que ninguém baixe mais nada,
 * porque o usuário continua pegando um idioma só. Servidos de `public/`, saem do grafo de módulos:
 * o build não os processa, o CDN os cacheia com o resto dos estáticos, e acrescentar um idioma
 * deixa de ser uma mudança no bundle.
 *
 * `indice.json` e `niveis/*.json` CONTINUAM embutidos, de propósito: o índice é lido de forma
 * síncrona (4 kB, responde "existe trilha?" sem rede) e os níveis são usados pelo servidor, que
 * não tem de onde buscar por HTTP.
 */
const RAIZ = '/trilha'
const RAIZ_DAS_GLOSAS = '/glosas'

const carregadoresDeNiveis = import.meta.glob<{ default: Niveis }>('./niveis/*.json')

async function baixarJson<T>(caminho: string): Promise<T | null> {
  try {
    const r = await fetch(caminho)
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    // Offline ou arquivo ausente: quem chama trata `null` como "este idioma não tem trilha".
    return null
  }
}

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

/**
 * A trilha v1 traz a tradução EMBUTIDA, e ela é de um par só (o inglês tem glosa portuguesa). Para
 * quem estuda com outro idioma nativo isso não é uma pista — é a palavra em uma terceira língua
 * que ela não fala, servida como se fosse a resposta. O índice diz para quais nativos a tradução
 * vale; fora deles ela sai, e a trilha joga monolíngue como qualquer outra sem par.
 */
function semGlosaDeOutroPar(dado: DadoTrilha, idioma: string, nativo: string): DadoTrilha {
  const pares = (indiceDaTrilha()[idioma]?.glosas ?? []) as string[]
  if (pares.includes(base(nativo))) return dado

  const niveis: DadoTrilha['niveis'] = {}
  for (const [nivel, entradas] of Object.entries(dado.niveis)) {
    niveis[nivel as CefrLevel] = (entradas ?? []).map(([palavra, , frase, fraseTraduzida]) =>
      [palavra, '', frase, fraseTraduzida] as [string, string, string?, string?])
  }
  return { ...dado, niveis }
}

async function carregarGlosas(idioma: string, nativo: string): Promise<ArquivoDeGlosas | null> {
  return baixarJson<ArquivoDeGlosas>(`${RAIZ_DAS_GLOSAS}/${idioma}-${base(nativo)}.json`)
}

export function carregarTrilha(lang: string, nativo = 'pt'): Promise<DadoTrilha | null> {
  const idioma = base(lang)
  const chave = `${idioma}-${base(nativo)}`
  /* O ÍNDICE DECIDE se vale buscar. Sem ele, um idioma sem trilha custaria um 404 por visita —
     e é justamente o índice que existe para responder isso de graça. */
  if (!indiceDaTrilha()[idioma]) return Promise.resolve(null)

  let p = cache.get(chave)
  if (!p) {
    p = baixarJson<unknown>(`${RAIZ}/${idioma}.json`).then(async (cru) => {
      if (!cru) return null
      const dado = ehV2(cru)
        ? juntar(cru, await carregarGlosas(idioma, nativo))
        : semGlosaDeOutroPar(cru as DadoTrilha, idioma, nativo)
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
