/**
 * AS CONTAS DA AUDITORIA DE PERFORMANCE DAS TELAS (26/09/2026) — `scripts/perf/telas/_medidas.mjs`.
 * Os scripts que sobem servidor e navegador rodam à mão; o que decide os números do relatório
 * (mediana, INP, FPS/jank, TBT, trace) é função pura e fica travado aqui.
 */
import { describe, expect, it } from 'vitest'

import {
  celula,
  inpDe,
  mediana,
  nomeDoModulo,
  resumirQuadros,
  resumirTrace,
  tbtDe,
} from '../scripts/perf/telas/_medidas.mjs'

describe('mediana', () => {
  it('ímpar, par, e ignora nulos e não finitos', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 3, 2])).toBe(2.5)
    expect(mediana([null, 5, Number.NaN, undefined])).toBe(5)
    expect(mediana([])).toBeNull()
  })
})

describe('INP a partir do Event Timing', () => {
  it('cada interação vale a sua MAIOR entrada; o INP é a pior interação', () => {
    const r = inpDe([
      { interactionId: 1, duration: 40 }, // pointerdown
      { interactionId: 1, duration: 120 }, // click da mesma interação
      { interactionId: 2, duration: 64 },
      { interactionId: 0, duration: 900 }, // não é interação (hover)
    ])
    expect(r).toEqual({ interacoes: 2, inp: 120, mediana: 92 })
  })
  it('sem interação, INP nulo', () => {
    expect(inpDe([]).inp).toBeNull()
  })
})

describe('quadros', () => {
  it('60 fps sem jank', () => {
    const ts = Array.from({ length: 61 }, (_, i) => i * (1000 / 60))
    const r = resumirQuadros(ts)
    expect(r.fps).toBeCloseTo(60, 0)
    expect(r.jank).toBe(0)
  })
  it('um quadro de 100 ms conta como jank e puxa o p95', () => {
    const ts = [0, 16, 32, 132, 148]
    const r = resumirQuadros(ts)
    expect(r.jank).toBe(1)
    expect(r.p95Ms).toBe(100)
  })
  it('amostra curta demais não inventa número', () => {
    expect(resumirQuadros([5])).toEqual({ fps: null, jank: null, p95Ms: null })
  })
})

describe('TBT e a célula antes → depois', () => {
  it('Σ(duração − 50) só das tarefas acima de 50 ms', () => {
    expect(tbtDe([{ d: 40 }, { d: 70 }, { d: 250 }])).toBe(220)
  })
  it('variação com sinal; nulo e zero não dividem', () => {
    expect(celula(200, 100)).toBe('200 → 100 (-50%)')
    expect(celula(100, 130)).toBe('100 → 130 (+30%)')
    expect(celula(null, 3)).toBe('— → 3')
    expect(celula(0, 3)).toBe('0 → 3')
  })
})

describe('nome do módulo no bundle', () => {
  it('agrupa node_modules por pacote (com escopo) e relativiza o resto', () => {
    const raiz = 'C:\\repo'
    expect(nomeDoModulo('C:/repo/node_modules/lucide-react/dist/esm/icons/x.js', raiz)).toBe('node_modules/lucide-react')
    expect(nomeDoModulo('\0C:/repo/node_modules/@supabase/auth-js/x.js?commonjs', raiz)).toBe('node_modules/@supabase/auth-js')
    expect(nomeDoModulo('C:\\repo\\src\\App.tsx', raiz)).toBe('src/App.tsx')
  })
})

describe('resumo do trace', () => {
  const M = (tid: number, nome: string) => ({ ph: 'M', name: 'thread_name', pid: 1, tid, args: { name: nome } })
  const X = (tid: number, name: string, ts: number, dur: number) => ({ ph: 'X', pid: 1, tid, name, ts, dur })
  it('soma os filhos DIRETOS das tarefas da thread principal, por segundo', () => {
    const r = resumirTrace([
      M(7, 'CrRendererMain'),
      M(8, 'Compositor'),
      X(7, 'RunTask', 0, 80_000), // tarefa longa de 80 ms
      X(7, 'FireAnimationFrame', 1_000, 30_000),
      X(7, 'FunctionCall', 2_000, 20_000), // neta: dentro do FireAnimationFrame, não conta
      X(7, 'Paint', 40_000, 10_000),
      X(7, 'RunTask', 999_000, 1_000),
      X(8, 'Paint', 0, 500_000), // outra thread: fora
    ])
    expect(r).not.toBeNull()
    expect(r!.segundos).toBe(1)
    expect(r!.longas).toBe(1)
    expect(r!.top).toEqual([
      { nome: 'FireAnimationFrame', msPorS: 30 },
      { nome: 'Paint', msPorS: 10 },
    ])
    expect(r!.ocupadoMsPorS).toBe(81)
  })
  it('sem a thread principal, nulo', () => {
    expect(resumirTrace([M(8, 'Compositor')])).toBeNull()
  })
})
