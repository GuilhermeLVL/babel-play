/// <reference types="vite/client" />
import type { DadoTrilha } from '../../core/learning/trilha'
import indiceJson from './indice.json'

export interface EntradaDoIndice {
  escala: 'cefr' | 'frequencia'
  versao: number
  total: number
  comFrase: number
  porNivel: Record<string, number>
  glosas: string[]
}

export type Indice = Record<string, EntradaDoIndice>

const carregadores = import.meta.glob<{ default: DadoTrilha }>(['./*.json', '!./indice.json'])

const cache = new Map<string, Promise<DadoTrilha>>()
const prontos = new Map<string, DadoTrilha>()

function base(lang: string): string {
  return (lang || '').toLowerCase().split('-')[0]
}

export function indiceDaTrilha(): Indice {
  return indiceJson as unknown as Indice
}

export function carregarTrilha(lang: string): Promise<DadoTrilha | null> {
  const idioma = base(lang)
  const carregador = carregadores[`./${idioma}.json`]
  if (!carregador) return Promise.resolve(null)

  let p = cache.get(idioma)
  if (!p) {
    p = carregador().then((m) => {
      const dado = m.default
      prontos.set(idioma, dado)
      return dado
    })
    cache.set(idioma, p)
  }
  return p
}

export function trilhaEmCache(lang: string): DadoTrilha | null {
  return prontos.get(base(lang)) ?? null
}
