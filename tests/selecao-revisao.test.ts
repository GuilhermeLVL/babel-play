/**
 * CARACTERIZAÇÃO DA FILA DA REVISÃO (openspec `modelo-do-aluno-e-dados`, 3.1 e 3.2) e o seletor único.
 *
 * `filaAntiga` é a conta que `startReviewSession` (`Study.tsx`) fazia no navegador ANTES do seletor, copiada sem
 * mudança. O seletor de `src/core/selecao/` tem de dar a mesma fila, na mesma ordem, para o mesmo estado (300
 * vencidas com limite de 20 novas incluídas), e o que é novo (estudo livre, pilha, lacuna, difícil) é provado à parte.
 */
import { isDueNow } from '@core'
import { describe, expect, it } from 'vitest'

import { ehDificil, soOsDificeis } from '../src/core/selecao/dificil'
import { formatoDoCartao, fraseDaRevisao, lacunaValida } from '../src/core/selecao/formato'
import { planejarSaidaDaPilha } from '../src/core/selecao/pilha'
import {
  type CartaoDaRevisao,
  embaralharAoAcaso,
  selecionarEstudoLivre,
  selecionarRevisao,
} from '../src/core/selecao/revisao'
import type { SchedulerType, VocabCard } from '../src/types'

const AGORA = Date.UTC(2026, 10, 28, 12)
const DIA = 86_400_000

type C = CartaoDaRevisao & { lapses?: number }

function cartao(id: number, estado: 'New' | 'Learning' | 'Review', venceEmDias: number | null, inDeck = true): C {
  const dueAtMs = venceEmDias === null ? null : AGORA + venceEmDias * DIA
  return {
    id: `c${id}`,
    inDeck,
    fsrsState: estado,
    fsrsDueAt: dueAtMs === null ? '' : new Date(dueAtMs).toISOString(),
    leitnerDueAt: '',
    dueAtMs,
  }
}

/** Gerador pseudoaleatório fixo (mulberry32): a caracterização é a mesma em toda máquina. */
function sorte(semente: number) {
  let a = semente
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Estado {
  ativos: C[]
  scheduler: SchedulerType
  novasPorDia: number
  revisoesPorDia: number
  restam: { novas: number; revisoes: number } | null
  ordem: 'vencidas' | 'misturar'
  limite?: number
  soNovas?: boolean
}

/** A CONTA ANTIGA de `startReviewSession`, copiada de `Study.tsx` (antes do seletor). `null` = não abriu rodada. */
function filaAntiga(e: Estado, embaralhar: (l: C[]) => C[]): { fila: C[] | null; limiteDoDia: boolean } {
  const noBaralho = e.ativos.filter((c) => c.inDeck)
  if (e.soNovas) {
    const nuncaVistas = noBaralho.filter((c) => c.fsrsState === 'New').slice(0, e.limite ?? e.novasPorDia)
    return { fila: nuncaVistas.length > 0 ? nuncaVistas : null, limiteDoDia: false }
  }
  const due = noBaralho.filter((c) => isDueNow(c as unknown as VocabCard, e.scheduler, AGORA))
  const base = due.length > 0 ? due : noBaralho
  const limiteDeNovas = e.restam ? e.restam.novas : e.novasPorDia
  const limiteDeRevisoes = e.restam ? e.restam.revisoes : e.revisoesPorDia
  const novas = base.filter((c) => c.fsrsState === 'New').slice(0, limiteDeNovas)
  const revisoes = base.filter((c) => c.fsrsState !== 'New').slice(0, limiteDeRevisoes)
  let fila =
    e.ordem === 'misturar'
      ? embaralhar([...revisoes, ...novas])
      : [...revisoes.sort((a, b) => (a.dueAtMs ?? 0) - (b.dueAtMs ?? 0)), ...novas]
  if (!fila.length) {
    const cabiaSemOLimiteDoDia =
      due.some((c) => (c.fsrsState === 'New' ? e.novasPorDia > 0 : true)) && !!e.restam && due.length > 0
    if (cabiaSemOLimiteDoDia) return { fila: null, limiteDoDia: true }
    fila = base.slice(0, Math.max(1, e.revisoesPorDia))
  }
  if (e.limite) fila = fila.slice(0, e.limite)
  return { fila: fila.length > 0 ? fila : null, limiteDoDia: false }
}

function novoSeletor(e: Estado, embaralhar: (l: C[]) => C[]) {
  const r = selecionarRevisao(e.ativos, { agora: AGORA, ...e, embaralhar })
  return { fila: r.fila.length > 0 ? r.fila : null, limiteDoDia: r.limiteDoDia }
}

describe('seletor da revisão: paridade com a conta antiga', () => {
  it('300 vencidas, 20 novas de limite: mesma quantidade e mesma ordem', () => {
    const ativos: C[] = []
    for (let i = 0; i < 300; i++) ativos.push(cartao(i, 'Review', -((i * 7) % 40) - 0.1))
    for (let i = 300; i < 340; i++) ativos.push(cartao(i, 'New', -1))
    const e: Estado = {
      ativos,
      scheduler: 'fsrs',
      novasPorDia: 20,
      revisoesPorDia: 200,
      restam: null,
      ordem: 'vencidas',
    }
    const antiga = filaAntiga(e, (l) => l)
    const nova = novoSeletor(e, (l) => l)
    expect(antiga.fila).toHaveLength(220)
    expect(nova.fila?.map((c) => c.id)).toEqual(antiga.fila?.map((c) => c.id))
    expect(nova.fila?.filter((c) => c.fsrsState === 'New')).toHaveLength(20)
  })

  it('mil estados sorteados (vencidas, novas, limites do dia, só novas, só 10, misturar) dão a mesma fila', () => {
    const r = sorte(2026)
    for (let n = 0; n < 1000; n++) {
      const total = Math.floor(r() * 40)
      const ativos: C[] = []
      for (let i = 0; i < total; i++) {
        const tipo = r()
        ativos.push(
          tipo < 0.3
            ? cartao(i, 'New', r() < 0.5 ? null : -1)
            : cartao(i, tipo < 0.5 ? 'Learning' : 'Review', (r() - 0.6) * 20, r() > 0.1),
        )
      }
      const e: Estado = {
        ativos,
        scheduler: r() < 0.9 ? 'fsrs' : 'leitner',
        novasPorDia: Math.floor(r() * 10),
        revisoesPorDia: 1 + Math.floor(r() * 30),
        restam: r() < 0.5 ? null : { novas: Math.floor(r() * 5), revisoes: Math.floor(r() * 15) },
        ordem: r() < 0.5 ? 'vencidas' : 'misturar',
        limite: r() < 0.3 ? 1 + Math.floor(r() * 12) : undefined,
        soNovas: r() < 0.15 ? true : undefined,
      }
      const embaralhar = (l: C[]) => l.slice().reverse()
      const antiga = filaAntiga(e, embaralhar)
      const nova = novoSeletor(e, embaralhar)
      expect(nova.limiteDoDia).toBe(antiga.limiteDoDia)
      expect(nova.fila?.map((c) => c.id) ?? null).toEqual(antiga.fila?.map((c) => c.id) ?? null)
    }
  })
})

describe('seletor da revisão: o que é novo', () => {
  const ativos: C[] = [
    cartao(1, 'Review', 3),
    cartao(2, 'Review', 9),
    cartao(3, 'New', null),
    cartao(4, 'Review', 1, false),
  ]

  it('sem nada vencido e com a flag: não cai no baralho inteiro (a tela oferece o estudo livre)', () => {
    const base = {
      agora: AGORA,
      scheduler: 'fsrs' as const,
      novasPorDia: 20,
      revisoesPorDia: 200,
      restam: null,
      ordem: 'vencidas' as const,
      embaralhar: embaralharAoAcaso,
    }
    expect(selecionarRevisao(ativos, base).fila.length).toBeGreaterThan(0) // antes: baralho inteiro
    const r = selecionarRevisao(ativos, { ...base, semFallbackDoBaralho: true })
    expect(r).toEqual({ fila: [], limiteDoDia: false, nadaVence: true })
  })

  it('estudo livre: só do baralho e já vistas, as que vencem antes primeiro, respeitando o limite', () => {
    expect(selecionarEstudoLivre(ativos).map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(selecionarEstudoLivre(ativos, 1).map((c) => c.id)).toEqual(['c1'])
  })

  it('o estudo livre não altera os cartões nem as datas', () => {
    const antes = JSON.stringify(ativos)
    selecionarEstudoLivre(ativos)
    expect(JSON.stringify(ativos)).toBe(antes)
  })
})

describe('palavra difícil: uma definição só', () => {
  it('8 erros ou mais; ausente é zero', () => {
    expect(ehDificil({ lapses: 7 })).toBe(false)
    expect(ehDificil({ lapses: 8 })).toBe(true)
    expect(ehDificil({})).toBe(false)
    expect(ehDificil({ lapses: null })).toBe(false)
  })
  it('só as difíceis: as que mais escapam primeiro, empate pela ordem de entrada', () => {
    const l = [
      { id: 'a', lapses: 9 },
      { id: 'b', lapses: 3 },
      { id: 'c', lapses: 12 },
      { id: 'd', lapses: 9 },
    ]
    expect(soOsDificeis(l).map((c) => c.id)).toEqual(['c', 'a', 'd'])
  })
})

describe('saídas da pilha', () => {
  const pilha = Array.from({ length: 300 }, (_, i) => ({
    id: `p${i}`,
    dueAtMs: AGORA - (i % 30) * DIA,
    stability: i % 3 === 0 ? null : 5 + (i % 17),
    lastReview: AGORA - (10 + (i % 11)) * DIA,
  }))
  const inicioDoDia = AGORA - 12 * 3_600_000

  it('300 vencidas viram N por dia, sem perder nenhuma', () => {
    const plano = planejarSaidaDaPilha(pilha, { agora: AGORA, inicioDoDia, restamHoje: 20, porDia: 40 })
    expect(plano.hoje).toHaveLength(20)
    expect(plano.adiar).toHaveLength(280)
    const ids = new Set([...plano.hoje, ...plano.adiar.map((a) => a.id)])
    expect(ids.size).toBe(300)
    for (let d = 1; d <= 7; d++) expect(plano.adiar.filter((a) => a.emDias === d)).toHaveLength(40)
    expect(Math.max(...plano.adiar.map((a) => a.emDias))).toBe(7)
    expect(plano.adiar.every((a) => a.adiarAte > AGORA)).toBe(true)
  })

  it('o teto de dias empilha o excedente no último dia (nada some) e a ordem é estável', () => {
    const o = { agora: AGORA, inicioDoDia, restamHoje: 0, porDia: 10, diasMax: 5 }
    const a = planejarSaidaDaPilha(pilha, o)
    const b = planejarSaidaDaPilha(pilha, o)
    expect(a).toEqual(b)
    expect(a.adiar).toHaveLength(300)
    expect(Math.max(...a.adiar.map((x) => x.emDias))).toBe(5)
  })

  it('soAsQueAguentam: só as de lembrança alta vão para frente; as outras ficam hoje', () => {
    const plano = planejarSaidaDaPilha(pilha, {
      agora: AGORA,
      inicioDoDia,
      restamHoje: 10,
      porDia: 50,
      soAsQueAguentam: 0.5,
    })
    expect(plano.hoje.length + plano.adiar.length).toBe(300)
    expect(plano.adiar.length).toBeGreaterThan(0)
    expect(plano.hoje.length).toBeGreaterThanOrEqual(10)
    const porId = new Map(pilha.map((c) => [c.id, c]))
    expect(plano.adiar.every((a) => (porId.get(a.id)?.stability ?? 0) > 0)).toBe(true)
  })

  it('quem mais precisa fica para hoje: lembrança mais baixa e sem estabilidade primeiro', () => {
    const plano = planejarSaidaDaPilha(pilha, { agora: AGORA, inicioDoDia, restamHoje: 5, porDia: 10 })
    expect(plano.hoje.every((id) => pilha.find((c) => c.id === id)?.stability === null)).toBe(true)
  })
})

describe('formato lacuna e frase da vez', () => {
  it('lacuna só vale com a palavra inteira na frase e texto em volta', () => {
    expect(lacunaValida('I really want to run today', 'run')).toBe(true)
    expect(lacunaValida('I want to running today', 'run')).toBe(false)
    expect(lacunaValida('run', 'run')).toBe(false)
    expect(lacunaValida('', 'run')).toBe(false)
    expect(lacunaValida(undefined, 'run')).toBe(false)
  })
  it('cartão com frase e lacuna válida alterna; sem frase fica no formato normal', () => {
    const base = { lacunaLigada: true, tipo: 'lembrar' as const, palavra: 'run' }
    expect(formatoDoCartao({ ...base, frase: 'I want to run today' })).toBe('lacuna')
    expect(formatoDoCartao({ ...base, frase: '' })).toBe('normal')
    expect(formatoDoCartao({ ...base, frase: 'I want to run today', lacunaLigada: false })).toBe('normal')
    expect(formatoDoCartao({ ...base, frase: 'I want to run today', tipo: 'digitar' })).toBe('normal')
  })
  it('a frase gira a cada revisão e ignora frase vazia', () => {
    const f = ['a run b', '', 'c run d']
    expect([0, 1, 2, 3].map((n) => fraseDaRevisao(f, n))).toEqual(['a run b', 'c run d', 'a run b', 'c run d'])
    expect(fraseDaRevisao([], 3)).toBe('')
  })
})
