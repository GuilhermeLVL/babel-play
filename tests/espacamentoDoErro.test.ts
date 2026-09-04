/**
 * A ESCADA DE ESPAÇAMENTO DO ERRO ESTAVA MORTA EM PRODUÇÃO.
 *
 * `memoriaDeItens.ts` define a régua: 1º erro → volta 2 rodadas depois; 2º seguido → 4 rodadas;
 * 3º → amanhã; 4º → LEECH (sai do sorteio comum, volta só na rodada de resgate). Ela lê dois
 * campos do histórico agregado: `errosSeguidos` e `rodadasDesdeUltimoErro`.
 *
 * O SERVIDOR EFÊMERO (modo sem conta, IndexedDB) calcula os dois. O SERVIDOR REAL — o que atende
 * todo mundo que tem conta — nunca calculou: `listarHistoricoPorItem` devolvia só
 * `{itemRef, vezes, erros, ultimaEm, ultimoAcerto}`. O comentário no cliente registrava a lacuna
 * ("a edição completa ainda não os calcula; o core trata ausência"), mas ninguém traçou a
 * CONSEQUÊNCIA, e ela é grave nos dois sentidos:
 *
 *   · `estadoDoItem` cai no fallback `ultimoAcerto ? 0 : min(erros, 1)` — trava em 1. Com
 *     `LEECH_APOS = 4`, NENHUMA palavra vira leech: a rodada de resgate é inalcançável.
 *   · `prontoParaVoltar` lê `rodadasDesdeUltimoErro ?? Infinity` — `Infinity >= 2` é sempre
 *     verdadeiro. A palavra errada volta na PRIMEIRA camada da rodada seguinte, sempre.
 *
 * Ou seja: quem tem conta erra uma palavra e a recebe de volta imediatamente, para sempre, sem
 * espaçamento e sem escape. Exatamente a queixa de "palavras se repetindo infinitamente".
 */
import { describe, it, expect } from 'vitest'
import { agregarHistorico } from '../server/db/repositories/exerciseResults'
import { estadoDoItem, prontoParaVoltar } from '../src/core/learning/memoriaDeItens'

const T0 = Date.UTC(2026, 8, 1, 10)
const diaDe = (ts: number) => Math.floor(ts / 86_400_000)

type Linha = { itemRef: string; correct: number; createdAt: number; roundId: string | null; exerciseKind: string | null }
const linha = (itemRef: string, correct: 0 | 1, min: number, roundId: string, jogo = 'termo'): Linha =>
  ({ itemRef, correct, createdAt: T0 + min * 60_000, roundId, exerciseKind: jogo })

const de = (rows: Linha[], ref: string) => agregarHistorico(rows).find((h) => h.itemRef === ref)!

describe('o histórico agregado conta erros SEGUIDOS', () => {
  it('quatro erros em sequência somam quatro — e é o que faz a palavra virar leech', () => {
    const h = de([
      linha('again', 0, 0, 'r1'), linha('again', 0, 10, 'r2'),
      linha('again', 0, 20, 'r3'), linha('again', 0, 30, 'r4'),
    ], 'again')
    expect(h.errosSeguidos).toBe(4)
    expect(estadoDoItem(h).tag).toBe('leech')
  })

  it('um acerto zera a contagem: a palavra volta como "aprendendo", não como leech', () => {
    const h = de([
      linha('again', 0, 0, 'r1'), linha('again', 0, 10, 'r2'),
      linha('again', 0, 20, 'r3'), linha('again', 1, 30, 'r4'),
    ], 'again')
    expect(h.errosSeguidos).toBe(0)
    expect(estadoDoItem(h).tag).toBe('aprendendo')
  })
})

describe('o histórico agregado conta RODADAS desde o último erro', () => {
  it('sem nenhuma rodada depois do erro, a palavra NÃO volta na seguinte', () => {
    const h = de([linha('again', 0, 0, 'r1')], 'again')
    expect(h.rodadasDesdeUltimoErro).toBe(0)
    expect(estadoDoItem(h).janela).toBe(2)
    expect(prontoParaVoltar(h, T0 + 60_000, diaDe)).toBe(false)
  })

  it('passadas duas rodadas do MESMO jogo, a janela vence e a palavra volta', () => {
    const h = de([
      linha('again', 0, 0, 'r1'),
      linha('other', 1, 10, 'r2'), linha('other', 1, 20, 'r3'),
    ], 'again')
    expect(h.rodadasDesdeUltimoErro).toBe(2)
    expect(prontoParaVoltar(h, T0 + 60_000, diaDe)).toBe(true)
  })

  it('rodada de OUTRO jogo não conta: a janela é por jogo', () => {
    const h = de([
      linha('again', 0, 0, 'r1'),
      linha('other', 1, 10, 'r2', 'memory'), linha('other', 1, 20, 'r3', 'memory'),
    ], 'again')
    expect(h.rodadasDesdeUltimoErro).toBe(0)
    expect(prontoParaVoltar(h, T0 + 60_000, diaDe)).toBe(false)
  })

  it('linhas da mesma rodada contam UMA vez', () => {
    const h = de([
      linha('again', 0, 0, 'r1'),
      linha('x', 1, 10, 'r2'), linha('y', 1, 10, 'r2'), linha('z', 1, 10, 'r2'),
    ], 'again')
    expect(h.rodadasDesdeUltimoErro).toBe(1)
  })
})

describe('os campos de sempre continuam certos', () => {
  it('vezes, erros e ultimoAcerto não mudam de significado', () => {
    const h = de([linha('again', 0, 0, 'r1'), linha('again', 1, 10, 'r2')], 'again')
    expect(h.vezes).toBe(2)
    expect(h.erros).toBe(1)
    expect(h.ultimoAcerto).toBe(true)
    expect(h.ultimaEm).toBe(T0 + 10 * 60_000)
  })
})
