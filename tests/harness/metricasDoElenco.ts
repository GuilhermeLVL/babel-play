/**
 * Métricas do elenco contra o conjunto de ouro (`tests/fixtures/elenco/ouro.json`). Usado pelo teste de regressão
 * e pelo juiz (`scripts/avatar/juiz-elenco.mjs`, via tsx).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CONFIANCA_MINIMA, type FraseMarcada, marcarFrases } from '../../src/core/avatar/elenco'

export type Pista = 'explicita' | 'implicita' | 'ambigua' | 'fraca'

export interface FraseDeOuro {
  texto: string
  /** 'narrador' ou o nome da ficha. */
  falante: string
  emocao: string
  pistaFalante: Pista
  pistaEmocao: Pista
  nota: string
}

export interface PassagemDeOuro {
  id: string
  idioma: 'pt' | 'en' | 'es'
  tema: string
  personagens: string[]
  frases: FraseDeOuro[]
}

export interface Ouro {
  versao: number
  passagens: PassagemDeOuro[]
}

export const CAMINHO_DO_OURO = join(process.cwd(), 'tests/fixtures/elenco/ouro.json')

export const carregarOuro = (): Ouro => JSON.parse(readFileSync(CAMINHO_DO_OURO, 'utf8')) as Ouro

/** Como o marcador (heurística) lê a passagem. */
export const marcarPassagem = (p: PassagemDeOuro): FraseMarcada[] =>
  marcarFrases(
    p.frases.map((f) => f.texto),
    { idioma: p.idioma, personagens: p.personagens },
  )

export const nomeDoFalante = (m: Pick<FraseMarcada, 'falante'>): string =>
  m.falante.tipo === 'narrador' ? 'narrador' : m.falante.tipo === 'personagem' ? (m.falante.nome ?? '?') : '?'

/** O que a pessoa ouviria: marcação com pouca confiança fala como o narrador, neutra. */
export function efetiva(m: FraseMarcada): { falante: string; emocao: string } {
  return m.confianca >= CONFIANCA_MINIMA
    ? { falante: nomeDoFalante(m), emocao: m.emocao }
    : { falante: 'narrador', emocao: 'neutro' }
}

export interface Taxa {
  acertos: number
  total: number
  taxa: number
}
const taxa = (acertos: number, total: number): Taxa => ({ acertos, total, taxa: total ? acertos / total : 1 })

export interface Metricas {
  falante: Taxa
  falanteExplicito: Taxa
  falanteDePersonagem: Taxa
  /** Frases de personagem em que a voz ouvida é a certa (confiança suficiente). */
  falanteAudivel: Taxa
  emocao: Taxa
  emocaoExplicita: Taxa
  /** Emoção NÃO neutra esperada e acertada (revocação) e emoção não neutra dada e correta (precisão). */
  emocaoPrecisao: Taxa
  emocaoRevocacao: Taxa
  /** Personagem dada que não existe na ficha. */
  inventadas: number
  /** Narração marcada como personagem (a voz errada lendo o narrador). */
  narradorViradoPersonagem: number
}

export function calcularMetricas(ouro: Ouro, marcadas: readonly (readonly FraseMarcada[])[]): Metricas {
  const c = {
    f: [0, 0],
    fe: [0, 0],
    fp: [0, 0],
    fa: [0, 0],
    e: [0, 0],
    ee: [0, 0],
    ep: [0, 0],
    er: [0, 0],
  }
  const soma = (par: number[], ok: boolean) => {
    par[1] += 1
    if (ok) par[0] += 1
  }
  let inventadas = 0
  let narradorViradoPersonagem = 0
  ouro.passagens.forEach((p, pi) => {
    p.frases.forEach((g, fi) => {
      const m = marcadas[pi]?.[fi]
      if (!m) return
      const dado = nomeDoFalante(m)
      const okF = dado === g.falante
      soma(c.f, okF)
      if (g.pistaFalante === 'explicita') soma(c.fe, okF)
      if (g.falante !== 'narrador') {
        soma(c.fp, okF)
        soma(c.fa, efetiva(m).falante === g.falante)
      }
      if (m.falante.tipo === 'personagem' && m.falante.nome && !p.personagens.includes(m.falante.nome)) inventadas += 1
      if (g.falante === 'narrador' && m.falante.tipo === 'personagem') narradorViradoPersonagem += 1
      const okE = m.emocao === g.emocao
      soma(c.e, okE)
      if (g.pistaEmocao === 'explicita') soma(c.ee, okE)
      if (m.emocao !== 'neutro') soma(c.ep, okE)
      if (g.emocao !== 'neutro') soma(c.er, okE)
    })
  })
  const T = (p: number[]) => taxa(p[0], p[1])
  return {
    falante: T(c.f),
    falanteExplicito: T(c.fe),
    falanteDePersonagem: T(c.fp),
    falanteAudivel: T(c.fa),
    emocao: T(c.e),
    emocaoExplicita: T(c.ee),
    emocaoPrecisao: T(c.ep),
    emocaoRevocacao: T(c.er),
    inventadas,
    narradorViradoPersonagem,
  }
}

/** Linha legível para o relatório e para o `console`. */
export const fmt = (t: Taxa): string => `${(t.taxa * 100).toFixed(1)}% (${t.acertos}/${t.total})`
