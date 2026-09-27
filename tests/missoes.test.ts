/**
 * MISSÕES DIÁRIAS, META DO DIA E CONGELAMENTO DA OFENSIVA (recompensas v2, onda 5 — Task 5.2).
 *
 * O core (`src/core/missoes.ts`) é a régua dos dois servidores: aqui ficam as regras puras. O
 * crédito `meta:<dia>` conferido pelo Express e pelo espelho está em
 * `tests/integration/economia-missoes.test.ts`; os avisos, em `tests/missoes-avisos.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { diaNoFuso } from '../src/core/learning/economia'
import { REGRAS } from '../src/core/learning/economia'
import { type MinigameId, MINIGAMES } from '../src/core/minigames/types'
import {
  ALVOS_DAS_MISSOES,
  congelamentosDisponiveis,
  DURACAO_MAXIMA_DA_RODADA_MS,
  estadoDasMissoes,
  feitosDoDia,
  inicioDaRodada,
  type LinhaDeRodada,
  metaConcluida,
  missaoQuaseCompleta,
  missoesComProgresso,
  missoesDoDia,
  numeroDoDia,
  ofensivaComCongelamento,
  RECOMPENSA_DA_META,
} from '../src/core/missoes'

const FUSO = 'America/Sao_Paulo'
const TODOS = Object.keys(MINIGAMES) as MinigameId[]

function diasDe(n: number, inicio = Date.UTC(2026, 9, 1)): string[] {
  return Array.from({ length: n }, (_, i) => new Date(inicio + i * 86_400_000).toISOString().slice(0, 10))
}

/** Uma rodada gravada: `certas` de `total`, começando em `em`. */
function rodada(roundId: string, jogo: MinigameId, em: number, certas: number, total = 10): LinhaDeRodada[] {
  return Array.from({ length: total }, (_, i) => ({ exerciseKind: jogo, roundId, correct: i < certas ? 1 : 0, createdAt: em }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('as três missões do dia', () => {
  it('são três por dia e determinísticas: mesma entrada, mesmas missões', () => {
    for (const dia of diasDe(60)) {
      const a = missoesDoDia(dia, { jogosJogados: [] })
      const b = missoesDoDia(dia, { jogosJogados: [] })
      expect(a).toHaveLength(3)
      expect(a).toEqual(b)
      expect(new Set(a.map((m) => m.tipo)).size).toBe(3)
      for (const m of a) expect(ALVOS_DAS_MISSOES[m.tipo]).toContain(m.alvo)
    }
  })

  it('variam entre os dias', () => {
    const assinaturas = new Set(diasDe(30).map((d) => JSON.stringify(missoesDoDia(d, { jogosJogados: [] }))))
    expect(assinaturas.size).toBeGreaterThan(3)
  })

  it('nenhuma missão mede tempo: só revisão, palavra salva, rodada boa e jogo novo', () => {
    expect(Object.keys(ALVOS_DAS_MISSOES).sort()).toEqual(['jogoNovo', 'palavras', 'revisar', 'rodadaBoa'])
    for (const dia of diasDe(60)) {
      for (const m of missoesDoDia(dia, { jogosJogados: [] })) expect(m.tipo).not.toMatch(/tempo|minuto|sessao|abrir/i)
    }
  })

  it('"praticar um jogo novo" só aparece quando há jogo nunca jogado', () => {
    const comTodos = diasDe(60).flatMap((d) => missoesDoDia(d, { jogosJogados: TODOS }))
    expect(comTodos.some((m) => m.tipo === 'jogoNovo')).toBe(false)
    const comUmFaltando = diasDe(60).flatMap((d) => missoesDoDia(d, { jogosJogados: TODOS.slice(1) }))
    expect(comUmFaltando.some((m) => m.tipo === 'jogoNovo')).toBe(true)
  })

  it('a recompensa da meta é a da tabela de ganhos (15 Seeds, 20 XP)', () => {
    const regra = REGRAS.find((r) => r.id === 'metaDiaria')!
    expect(RECOMPENSA_DA_META).toEqual({ seeds: regra.seeds, xp: regra.xp })
    expect(RECOMPENSA_DA_META).toEqual({ seeds: 15, xp: 20 })
  })
})

describe('o progresso vem do que está gravado', () => {
  /* 12:00 em São Paulo num dia qualquer. */
  const meioDia = Date.UTC(2026, 9, 5, 15, 0)
  const dia = diaNoFuso(meioDia, FUSO)

  it('conta revisões, palavras salvas, rodadas de 2+ estrelas e jogos inéditos do dia', () => {
    const ontem = meioDia - 86_400_000
    const fontes = {
      revisoes: [meioDia, meioDia + 1, ontem],
      palavrasSalvas: [meioDia, ontem, ontem],
      rodadas: [
        ...rodada('r-velha', 'blitz', ontem, 10),
        ...rodada('r-boa', 'blitz', meioDia, 8), // 80% = 2 estrelas
        ...rodada('r-fraca', 'termo', meioDia, 5), // 50% = 1 estrela: não conta como boa
      ],
    }
    // Blitz foi jogado ontem; Termo é inédito hoje.
    expect(feitosDoDia(dia, FUSO, fontes)).toEqual({ revisar: 2, palavras: 1, rodadaBoa: 1, jogoNovo: 1 })
    // As missões sorteadas leem os mesmos números; "jogo novo" não conta o Blitz de ontem.
    const m = missoesComProgresso(dia, FUSO, fontes)
    const feitos = feitosDoDia(dia, FUSO, fontes)
    for (const x of m) expect(x.atual).toBe(feitos[x.tipo])
    expect(missoesComProgresso(dia, FUSO, fontes)).toEqual(missoesDoDia(dia, { jogosJogados: ['blitz'] }).map((x) => ({ ...x, atual: feitos[x.tipo] })))
  })

  it('a meta fecha quando as três fecham, e só então', () => {
    const tres = missoesDoDia(dia, { jogosJogados: [] })
    expect(metaConcluida(tres)).toBe(false)
    const cheias = tres.map((m) => ({ ...m, atual: m.alvo }))
    expect(metaConcluida(cheias)).toBe(true)
    const quase = cheias.map((m, i) => (i === 0 ? { ...m, atual: m.alvo - 1 } : m))
    expect(metaConcluida(quase)).toBe(false)
    expect(missaoQuaseCompleta(quase)).toBe(true)
    expect(missaoQuaseCompleta(cheias)).toBe(false)
    expect(missaoQuaseCompleta(tres)).toBe(false)
    expect(metaConcluida([])).toBe(false)
  })

  it('o estado da rota: dia no fuso, meta creditada e a recompensa', () => {
    const e = estadoDasMissoes({
      agora: meioDia,
      fuso: FUSO,
      fontes: { revisoes: [], palavrasSalvas: [], rodadas: [] },
      metasCreditadas: [dia],
      ofensiva: { atual: 3, congelamentos: 1 },
    })
    expect(e).toMatchObject({ dia, metaConcluida: false, metaCreditada: true, ofensiva: 3, congelamentos: 1 })
    expect(e.missoes).toHaveLength(3)
    expect(e.recompensa).toEqual(RECOMPENSA_DA_META)
  })
})

describe('virada de meia-noite: a rodada conta no dia em que COMEÇOU', () => {
  it('começou 23:59, gravada 00:01 → é do dia anterior, e só dele', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const inicio = Date.UTC(2026, 9, 6, 2, 59) // 05/10 23:59 em -03
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 6, 3, 1))) // 06/10 00:01 em -03
    const gravadaEm = inicioDaRodada(Date.now(), Date.now() - inicio)
    expect(gravadaEm).toBe(inicio)
    expect(diaNoFuso(gravadaEm, FUSO)).toBe('2026-10-05')

    const rodadas = rodada('r-virada', 'blitz', gravadaEm, 10)
    const fontes = { revisoes: [], palavrasSalvas: [], rodadas }
    expect(feitosDoDia('2026-10-05', FUSO, fontes)).toMatchObject({ rodadaBoa: 1, jogoNovo: 1 })
    expect(feitosDoDia(diaNoFuso(Date.now(), FUSO), FUSO, fontes)).toMatchObject({ rodadaBoa: 0, jogoNovo: 0 })
  })

  it('duração ausente ou inválida = agora; longa demais é limitada a 2 h', () => {
    expect(inicioDaRodada(1_000_000_000, undefined)).toBe(1_000_000_000)
    expect(inicioDaRodada(1_000_000_000, -5)).toBe(1_000_000_000)
    expect(inicioDaRodada(1_000_000_000, Number.NaN)).toBe(1_000_000_000)
    expect(inicioDaRodada(1_000_000_000, 10 * 3_600_000)).toBe(1_000_000_000 - DURACAO_MAXIMA_DA_RODADA_MS)
  })
})

describe('congelamento da ofensiva', () => {
  const d = (s: string) => numeroDoDia(s)!

  it('a meta rende 1 congelamento por semana, no máximo 2', () => {
    // Três semanas com meta todos os dias e prática todos os dias: guarda 2, nunca 3.
    const dias = diasDe(21, Date.UTC(2026, 9, 5)).map(d) // 05/10/2026 é segunda
    expect(congelamentosDisponiveis({ diasDePratica: dias, diasDeMeta: dias, hoje: dias.at(-1)! })).toBe(2)
    // Uma semana só, com várias metas: 1.
    const semana = dias.slice(0, 7)
    expect(congelamentosDisponiveis({ diasDePratica: semana, diasDeMeta: semana, hoje: semana.at(-1)! })).toBe(1)
    // Sem meta, nenhum — praticar sozinho não rende congelamento.
    expect(congelamentosDisponiveis({ diasDePratica: dias, diasDeMeta: [], hoje: dias.at(-1)! })).toBe(0)
  })

  it('um dia perdido gasta 1 congelamento e a ofensiva não quebra', () => {
    const pratica = ['2026-10-05', '2026-10-06', '2026-10-08'].map(d)
    const r = ofensivaComCongelamento({ diasDePratica: pratica, diasDeMeta: [d('2026-10-05')], hoje: d('2026-10-08') })
    expect(r.congelados).toEqual([d('2026-10-07')])
    expect(r.congelamentos).toBe(0)
    expect(r.atual).toBe(3) // o dia congelado não soma, mas não quebra
  })

  it('sem congelamento, o dia perdido zera a ofensiva', () => {
    const pratica = ['2026-10-05', '2026-10-06', '2026-10-08'].map(d)
    const r = ofensivaComCongelamento({ diasDePratica: pratica, diasDeMeta: [], hoje: d('2026-10-08') })
    expect(r.atual).toBe(1)
    expect(r.congelados).toEqual([])
  })

  it('hoje sem prática ainda não é dia perdido', () => {
    const pratica = ['2026-10-05', '2026-10-06'].map(d)
    const r = ofensivaComCongelamento({ diasDePratica: pratica, diasDeMeta: [d('2026-10-05')], hoje: d('2026-10-07') })
    expect(r).toEqual({ atual: 2, congelamentos: 1, congelados: [] })
  })

  it('dois dias perdidos com um congelamento só: quebra', () => {
    const pratica = ['2026-10-05', '2026-10-06', '2026-10-09'].map(d)
    const r = ofensivaComCongelamento({ diasDePratica: pratica, diasDeMeta: [d('2026-10-05')], hoje: d('2026-10-09') })
    expect(r.atual).toBe(1)
  })

  it('sem histórico: zero', () => {
    expect(ofensivaComCongelamento({ diasDePratica: [], diasDeMeta: [], hoje: 20_000 })).toEqual({
      atual: 0,
      congelamentos: 0,
      congelados: [],
    })
    expect(numeroDoDia('lixo')).toBeNull()
  })
})
