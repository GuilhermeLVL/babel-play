/**
 * DISTINÇÃO ENTRE POSES do alfabeto manual: um PISO por par de letras que se confundem, medido nos dados.
 *
 * A medida (graus): raiz da média dos quadrados da diferença dos 24 ângulos de articulação + a média dos ângulos entre as
 * orientações (dedos e palma). Zero = a mesma pose. É uma medida de DISTÂNCIA GEOMÉTRICA entre as formas autoradas: serve
 * para impedir que uma edição aproxime demais duas letras (regressão), NÃO prova que a forma é a de Libras ou da ASL e não
 * substitui a revisão por pessoas surdas (as poses são de DEMONSTRAÇÃO, não revisadas).
 *
 * Os pisos abaixo vêm das poses de 29/10/2026 (polimento das lacunas) com folga de ~7% a 10%. Valores medidos então
 * (asl/libras): G-H 37,3 · G-Q 92,5 · H-P 95,9 · P-Q 103,2 · M-N 23,2/32,5 · Z-G 108,1.
 * Antes do polimento: G-H 41,6 · G-Q 95,8 · H-P 108,5 · P-Q 101,2 · M-N 16,1/32,5 · Z-G 129,0. A tentativa de mostrar
 * melhor o polegar do G e do Q (e a palma do M e do N) mexeu nas distâncias nos dois sentidos; o que o piso garante é que
 * nenhuma delas fica abaixo do que está escrito aqui, e o M-N da ASL (o par mais fraco) subiu de 16,1 para 23,2.
 */
import { describe, expect, it } from 'vitest'

import { poseDaLetra } from '../src/core/avatar/sinais/pose'
import type { Alfabeto, Limites, PoseDeMao, Vec3 } from '../src/core/avatar/sinais/tipos'
import alfabetoAsl from '../src/data/avatar/sinais/alfabeto-asl.json'
import alfabetoLibras from '../src/data/avatar/sinais/alfabeto-libras.json'
import limites from '../src/data/avatar/sinais/limites.json'

const lim = limites as unknown as Limites
const ALFABETOS = { asl: alfabetoAsl as unknown as Alfabeto, libras: alfabetoLibras as unknown as Alfabeto }

const anguloEntre = (u: Vec3, v: Vec3) => {
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const n = Math.hypot(...u) * Math.hypot(...v)
  return (Math.acos(Math.max(-1, Math.min(1, d / n))) * 180) / Math.PI
}
function distancia(p: PoseDeMao, q: PoseDeMao): number {
  const rms = Math.sqrt(p.a.reduce((s, x, i) => s + (x - (q.a[i] as number)) ** 2, 0) / p.a.length)
  return rms + (anguloEntre(p.dedos, q.dedos) + anguloEntre(p.palma, q.palma)) / 2
}
const pose = (alf: keyof typeof ALFABETOS, letra: string) =>
  poseDaLetra(ALFABETOS[alf].letras[letra] as Parameters<typeof poseDaLetra>[0], lim)
const dist = (alf: keyof typeof ALFABETOS, par: string) => distancia(pose(alf, par[0]!), pose(alf, par[1]!))

/** [par, piso na ASL, piso em Libras]. Os pares que se confundem na mão (mesma orientação, ou só o dedo muda). */
const PISOS: Array<[string, number, number]> = [
  ['GH', 34, 34], // só muda o dedo médio e o polegar: o par mais próximo em orientação
  ['GQ', 85, 85],
  ['HP', 88, 88],
  ['PQ', 95, 95],
  ['MN', 21, 30], // ASL: três x dois dedos caídos (palma a quem olha); Libras: três x dois dedos esticados
  ['ZG', 98, 98],
  ['ZD', 88, 88], // o indicador do Z não pode virar o D
]

describe('piso de distinção por par de letras (distância geométrica; NÃO é validação linguística)', () => {
  for (const [par, asl, libras] of PISOS) {
    it(`${par[0]} x ${par[1]}: ASL >= ${asl} e Libras >= ${libras}`, () => {
      expect(dist('asl', par)).toBeGreaterThanOrEqual(asl)
      expect(dist('libras', par)).toBeGreaterThanOrEqual(libras)
    })
  }

  it('entre quaisquer duas LETRAS diferentes a distância é positiva, salvo as que a forma é a mesma de propósito', () => {
    // formas iguais por definição do alfabeto (diferem só no movimento): I-J, C-Ç. Os algarismos 0-O, 2-V, 9-F... repetem
    // formas de letras por descrição e ficam fora desta conta.
    const IGUAIS_DE_PROPOSITO = new Set(['IJ', 'CÇ'])
    for (const alf of ['asl', 'libras'] as const) {
      const letras = Object.keys(ALFABETOS[alf].letras).filter((k) => /[A-ZÇ]/.test(k))
      for (let i = 0; i < letras.length; i += 1)
        for (let j = i + 1; j < letras.length; j += 1) {
          const par = `${letras[i]}${letras[j]}`
          if (IGUAIS_DE_PROPOSITO.has(par)) continue
          // o piso geral: o menor par (U-V, só o afastamento dos dedos) fica em ~4,3
          expect(dist(alf, par), `${alf} ${par}`).toBeGreaterThanOrEqual(4)
        }
    }
  })

  it('a medida é simétrica e zero para a mesma pose', () => {
    expect(dist('asl', 'GH')).toBeCloseTo(dist('asl', 'HG'), 6)
    expect(dist('asl', 'GG')).toBe(0)
  })
})
