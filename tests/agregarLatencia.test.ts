/**
 * O AGREGADOR DA LATÊNCIA PUBLICADA (openspec `latencia-publicada-por-aparelho`, tarefa 1.1): o número tem de ser HONESTO.
 * Distribuições conhecidas (simulador), piso `N_MIN`, soma de baldes (nunca média de percentis) e o contrato do arquivo.
 */
import { describe, expect, it } from 'vitest'

import { LIMITES_DOS_BALDES_DE_CAMPO_MS } from '../server/http/metricas'
import {
  agregarLatencia,
  type AmostraDeCelula,
  baldeDoQuantil,
  LIMITES_DOS_BALDES_MS,
  N_BALDES_DA_LATENCIA,
  N_MIN,
  quantilEmMs,
  valorDoBalde,
} from '../src/core/latencia/agregarLatencia'
import { arquivoFresco, celulaDoSelo, celulasOk, validarLatencia } from '../src/core/latencia/contratoDaLatencia'
import { baldeDe, PERFIS_SINTETICOS, quantilExato, simularCelula } from './harness/simuladorDeLatencia'

const HOJE = new Date('2026-11-25T12:00:00Z')

function amostraDe(classe: string, idioma: string, falas: number, semente: number) {
  const s = simularCelula(classe, idioma, falas, semente)
  const baldes = Array.from({ length: N_BALDES_DA_LATENCIA }, () => 0)
  let n = 0
  let falhas = 0
  for (const l of s.lotes) {
    l.fimDaFalaAteLegenda.baldes.forEach((q, i) => (baldes[i] = (baldes[i] ?? 0) + q))
    n += l.fimDaFalaAteLegenda.n
    falhas += l.fimDaFalaAteLegenda.falhas
  }
  const amostra: AmostraDeCelula = { classe, idioma, baldes, falas: n, falhas }
  return { amostra, cruas: s.cruas.get(`${classe}|${idioma}`)! }
}

describe('limites dos baldes', () => {
  it('são os mesmos do servidor (a soma dos baldes só vale com os mesmos limites)', () => {
    expect([...LIMITES_DOS_BALDES_MS]).toEqual([...LIMITES_DOS_BALDES_DE_CAMPO_MS])
  })
})

describe('quantil por soma de baldes', () => {
  it('o quantil é o limite do balde que cruza; o último vale 30000', () => {
    expect(quantilEmMs([0, 0, 62, 38, 0, 0, 0, 0, 0], 0.5)).toBe(1000)
    expect(quantilEmMs([0, 0, 62, 38, 0, 0, 0, 0, 0], 0.75)).toBe(1500)
    expect(quantilEmMs([0, 0, 0, 0, 0, 0, 0, 0, 10], 0.5)).toBe(30000)
    expect(quantilEmMs([0, 0, 0, 0, 0, 0, 0, 0, 0], 0.5)).toBeNull()
    expect(baldeDoQuantil([], 0.5)).toBeNull()
    expect(valorDoBalde(8)).toBe(30000)
  })

  it('recupera o p50/p75 de distribuições conhecidas: o balde do quantil exato, erro de no máximo a largura do balde', () => {
    for (const classe of Object.keys(PERFIS_SINTETICOS)) {
      const { amostra, cruas } = amostraDe(classe, 'en', 6000, 7)
      for (const q of [0.5, 0.75]) {
        const exato = quantilExato(cruas, q)
        const publicado = quantilEmMs(amostra.baldes, q)!
        expect(publicado).toBe(valorDoBalde(baldeDe(exato)))
        const i = baldeDe(exato)
        const largura = valorDoBalde(i) - (i === 0 ? 0 : valorDoBalde(i - 1))
        expect(publicado - exato).toBeGreaterThanOrEqual(0)
        expect(publicado - exato).toBeLessThanOrEqual(largura)
      }
    }
  })
})

describe('agregarLatencia', () => {
  it('célula com 199 falas sai insuficiente e com 200 sai ok', () => {
    const r199 = agregarLatencia(
      [{ classe: 'celular-bom', idioma: 'en', baldes: [0, 0, 199, 0, 0, 0, 0, 0, 0], falas: 199, falhas: 0 }],
      HOJE,
    )
    expect(r199.celulas.find((c) => c.idioma === 'en')).toEqual({
      classe: 'celular-bom',
      idioma: 'en',
      n: 199,
      estado: 'insuficiente',
    })
    const r200 = agregarLatencia(
      [{ classe: 'celular-bom', idioma: 'en', baldes: [0, 0, 200, 0, 0, 0, 0, 0, 0], falas: N_MIN, falhas: 0 }],
      HOJE,
    )
    expect(r200.celulas.find((c) => c.idioma === 'en')).toMatchObject({
      estado: 'ok',
      n: 200,
      p50Ms: 1000,
      p75Ms: 1000,
      falha: 0,
    })
  })

  it('o p75 de dois lotes vem da soma dos baldes, NÃO da média dos p75 (1000 e 5000 não dão 3000)', () => {
    const A: AmostraDeCelula = {
      classe: 'quest',
      idioma: 'es',
      baldes: [0, 0, 300, 0, 0, 0, 0, 0, 0],
      falas: 300,
      falhas: 0,
    }
    const B: AmostraDeCelula = {
      classe: 'quest',
      idioma: 'es',
      baldes: [0, 0, 0, 0, 0, 0, 100, 0, 0],
      falas: 100,
      falhas: 0,
    }
    const r = agregarLatencia([A, B], HOJE)
    const c = r.celulas.find((x) => x.idioma === 'es')!
    expect(c.p75Ms).toBe(1000)
    expect(c.p75Ms).not.toBe(3000)
    expect(agregarLatencia([B, A], HOJE)).toEqual(r)
  })

  it('classe/idioma fora das listas viram `outro`, `todos` na entrada não duplica e a linha `todos` soma os baldes', () => {
    const r = agregarLatencia(
      [
        { classe: 'tv', idioma: 'xx', baldes: [200, 0, 0, 0, 0, 0, 0, 0, 0], falas: 200, falhas: 0 },
        { classe: 'celular-bom', idioma: 'pt', baldes: [0, 150, 0, 0, 0, 0, 0, 0, 0], falas: 150, falhas: 0 },
        { classe: 'celular-bom', idioma: 'en', baldes: [0, 150, 0, 0, 0, 0, 0, 0, 0], falas: 150, falhas: 0 },
        { classe: 'celular-bom', idioma: 'todos', baldes: [0, 0, 0, 0, 0, 0, 0, 0, 0], falas: 0, falhas: 0 },
      ],
      HOJE,
    )
    expect(r.celulas.find((c) => c.classe === 'outro' && c.idioma === 'outro')).toMatchObject({ estado: 'ok', n: 200 })
    expect(r.celulas.find((c) => c.classe === 'celular-bom' && c.idioma === 'pt')!.estado).toBe('insuficiente')
    expect(r.celulas.find((c) => c.classe === 'celular-bom' && c.idioma === 'todos')).toMatchObject({
      estado: 'ok',
      n: 300,
      p50Ms: 500,
    })
  })

  it('taxa de falha = falhas ÷ falas e o arquivo tem só o dia, sem hora', () => {
    const { amostra } = amostraDe('celular-fraco', 'pt', 4000, 11)
    const r = agregarLatencia([amostra], HOJE)
    const c = r.celulas.find((x) => x.idioma === 'pt')!
    expect(c.falha).toBeCloseTo(amostra.falhas / amostra.falas, 3)
    expect(r.geradoEm).toBe('2026-11-25')
    expect(JSON.stringify(r)).not.toMatch(/T\d\d:/)
  })

  it('o resultado passa no contrato estrito', () => {
    const r = agregarLatencia(
      [amostraDe('desktop-com-gpu', 'en', 3000, 3).amostra, amostraDe('quest', 'es', 50, 4).amostra],
      HOJE,
    )
    expect(validarLatencia(JSON.parse(JSON.stringify(r)))).toEqual(r)
  })
})

describe('contrato do arquivo', () => {
  const ok = agregarLatencia([amostraDe('celular-bom', 'en', 3000, 5).amostra], HOJE)

  it('recusa campo extra, versão errada, lista fora do fechado e ok sem número', () => {
    expect(validarLatencia({ ...ok, extra: 1 })).toBeNull()
    expect(validarLatencia({ ...ok, v: 2 })).toBeNull()
    expect(validarLatencia({ ...ok, celulas: [{ ...ok.celulas[0], classe: 'tv' }] })).toBeNull()
    expect(validarLatencia({ ...ok, celulas: [{ ...ok.celulas[0], hora: '10:00' }] })).toBeNull()
    expect(validarLatencia({ ...ok, celulas: [{ classe: 'quest', idioma: 'en', n: 300, estado: 'ok' }] })).toBeNull()
    expect(
      validarLatencia({ ...ok, celulas: [{ classe: 'quest', idioma: 'en', n: 10, estado: 'insuficiente', p50Ms: 1 }] }),
    ).toBeNull()
    expect(validarLatencia({ ...ok, geradoEm: '2026-11-25T10:00:00Z' })).toBeNull()
    expect(validarLatencia({ ...ok, celulas: [ok.celulas[0], ok.celulas[0]] })).toBeNull()
    expect(validarLatencia(null)).toBeNull()
    expect(validarLatencia('x')).toBeNull()
  })

  it('arquivo com mais de 35 dias não vale', () => {
    expect(arquivoFresco(ok, new Date('2026-12-20T00:00:00Z'))).toBe(true)
    expect(arquivoFresco(ok, new Date('2026-12-31T00:00:00Z'))).toBe(false)
  })

  it('celulaDoSelo: idioma exato, senão a linha `todos`, nunca insuficiente', () => {
    const l = agregarLatencia(
      [
        { classe: 'celular-bom', idioma: 'en', baldes: [0, 0, 300, 0, 0, 0, 0, 0, 0], falas: 300, falhas: 0 },
        { classe: 'celular-bom', idioma: 'es', baldes: [0, 0, 50, 0, 0, 0, 0, 0, 0], falas: 50, falhas: 0 },
      ],
      HOJE,
    )
    expect(celulaDoSelo(l, 'celular-bom', 'en-US')?.idioma).toBe('en')
    expect(celulaDoSelo(l, 'celular-bom', 'es')?.idioma).toBe('todos')
    expect(celulaDoSelo(l, 'celular-bom', null)?.idioma).toBe('todos')
    expect(celulaDoSelo(l, 'quest', 'en')).toBeNull()
    expect(celulasOk(l)).toBe(1)
  })
})
