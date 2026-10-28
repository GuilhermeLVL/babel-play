import { describe, expect, it } from 'vitest'

import { clampOsso } from '../src/core/avatar/sinais/limites'
import { normalizarTexto } from '../src/core/avatar/sinais/normalizar'
import { comDelta, espelharPose, limitarAngulos, misturar, poseDaLetra } from '../src/core/avatar/sinais/pose'
import { amostrar, soletrar } from '../src/core/avatar/sinais/soletrar'
import type { Alfabeto, Limites, PoseDeMao } from '../src/core/avatar/sinais/tipos'
import alfabetoAsl from '../src/data/avatar/sinais/alfabeto-asl.json'
import alfabetoLibras from '../src/data/avatar/sinais/alfabeto-libras.json'
import limitesJson from '../src/data/avatar/sinais/limites.json'

const limites = limitesJson as unknown as Limites
const libras = alfabetoLibras as unknown as Alfabeto
const asl = alfabetoAsl as unknown as Alfabeto
const sol = (t: string, a: Alfabeto = libras, o: Partial<Parameters<typeof soletrar>[2]> = {}) =>
  soletrar(t, a, { limites, ...o })

describe('normalização', () => {
  it('Libras: acentos ignorados, Ç próprio, Ã/Õ com til', () => {
    const n = normalizarTexto('Conceição', 'libras')
    const l = n.palavras[0].grupos[0]
    expect(l.map((x) => x.disp).join('')).toBe('CONCEIÇÃO')
    expect(l.map((x) => x.chave).join('')).toBe('CONCEIÇAO')
    expect(l.filter((x) => x.til).map((x) => x.disp)).toEqual(['Ã'])
    expect(l[3].chave).toBe('C')
    expect(l[6].chave).toBe('Ç')
    expect(normalizarTexto('Çá', 'libras').palavras[0].grupos[0].map((x) => x.chave)).toEqual(['Ç', 'A'])
  })

  it('ASL: Ç vira C, Ã vira A, sem til', () => {
    const l = normalizarTexto('Conceição', 'asl').palavras[0].grupos[0]
    expect(l.map((x) => x.chave).join('')).toBe('CONCEICAO')
    expect(l.some((x) => x.til)).toBe(false)
  })

  it('números são pulados e marcados; hífen e pontuação separam; desconhecidos viram pausa', () => {
    const n = normalizarTexto('R2D2 ab-cd 123 olá😀mundo ß', 'libras')
    expect(n.palavras[0].temNumeros).toBe(true)
    expect(n.palavras[0].grupos[0].map((x) => x.chave)).toEqual(['R', 'D'])
    expect(n.palavras[1].grupos.map((g) => g.map((x) => x.chave).join(''))).toEqual(['AB', 'CD'])
    expect(n.palavras[2]).toMatchObject({ temNumeros: true, letras: 0 })
    expect(n.palavras[3].grupos.map((g) => g.length)).toEqual([3, 5])
    expect(n.desconhecidos).toEqual(expect.arrayContaining(['😀', 'ß']))
  })

  it('RTL, emoji composto e Hangul não quebram nem viram letra', () => {
    const n = normalizarTexto('مرحبا 👨‍👩‍👧 한국 עברית', 'asl')
    expect(n.palavras.every((p) => p.letras === 0)).toBe(true)
    expect(n.desconhecidos.length).toBeGreaterThan(3)
  })
})

describe('pose', () => {
  it('DIP acoplado = 2/3 do PIP; polegar zero é relativo à palma (sem somar o zero do rig)', () => {
    const p = poseDaLetra(libras.letras.A, limites)
    expect(p.acoplado).toEqual([true, true, true, true])
    expect(p.a[7]).toBeCloseTo(p.a[6] * limites.dip_acoplado, 6)
    expect(p.a[1]).toBe(libras.letras.A.mao.polegar.cmc_abd)
  })

  it('o DIP acoplado segue o PIP no percurso; DIP explícito não', () => {
    const base = poseDaLetra(libras.letras.A, limites)
    const q = comDelta(base, { dflex: { indicador: [0, 30, 0, 0] } }, limites)
    expect(q.a[7 + 4 * 0] - base.a[7]).toBeCloseTo(30 * limites.dip_acoplado, 6)
    const exp = { ...base, acoplado: [false, true, true, true] }
    const r = comDelta(exp, { dflex: { indicador: [0, 30, 0, 0] } }, limites)
    expect(r.a[7]).toBe(base.a[7])
  })

  it('clamp por osso limita ao teto e conta ativações; dados válidos não ativam', () => {
    expect(clampOsso(130, [0, 115])).toBe(115)
    expect(clampOsso(-5, [0, 115])).toBe(0)
    const ex: number[] = []
    clampOsso(130, [0, 115], (e) => ex.push(e))
    expect(ex).toEqual([15])
    expect(clampOsso(115.0005, [0, 115])).toBeCloseTo(115.0005) // tolerância de 1e-3 não conta
    let ativacoes = 0
    for (const alf of [libras, asl]) {
      for (const letra of Object.values(alf.letras)) {
        const p = poseDaLetra(letra, limites)
        ativacoes += limitarAngulos(p.a, limites).ativacoes
        for (const w of letra.caminho ?? []) ativacoes += limitarAngulos(comDelta(p, w, limites).a, limites).ativacoes
      }
    }
    expect(ativacoes).toBe(0)
    const ruim = poseDaLetra(libras.letras.A, limites)
    ruim.a[6] = 200
    const r = limitarAngulos(ruim.a, limites)
    expect(r.a[6]).toBe(limites.dedo.pip[1])
    expect(r.ativacoes).toBe(1)
  })

  it('o mínimo usa o limite de abdução por osso', () => {
    const p = poseDaLetra(libras.letras.A, limites)
    p.a[8 + 4 * 3] = 33 // mínimo: até 35
    expect(limitarAngulos(p.a, limites).ativacoes).toBe(0)
    p.a[8 + 4 * 0] = 33 // indicador: até 30
    expect(limitarAngulos(p.a, limites).ativacoes).toBe(1)
  })

  it('espelhar reflete x e é involutivo', () => {
    const p = poseDaLetra(libras.letras.L, limites)
    const e = espelharPose(p)
    expect(e.posicao[0]).toBe(-p.posicao[0])
    expect(e.dedos[0]).toBe(-p.dedos[0])
    expect(e.palma[0]).toBe(-p.palma[0])
    expect(e.espelhada).toBe(true)
    expect(e.a).toEqual(p.a)
    expect(espelharPose(e)).toEqual(p)
  })

  it('mistura: extremos exatos, ponto médio entre os ângulos e orientação unitária', () => {
    const a = poseDaLetra(libras.letras.A, limites)
    const b = poseDaLetra(libras.letras.B, limites)
    expect(misturar(a, b, 0)).toBe(a)
    expect(misturar(a, b, 1)).toBe(b)
    const m = misturar(a, b, 0.5)
    expect(m.a[6]).toBeCloseTo((a.a[6] + b.a[6]) / 2, 6)
    expect(Math.hypot(...m.dedos)).toBeCloseTo(1, 6)
    expect(Math.abs(m.dedos[0] * m.palma[0] + m.dedos[1] * m.palma[1] + m.dedos[2] * m.palma[2])).toBeLessThan(1e-6)
  })
})

describe('soletrar', () => {
  it('sequência de passos coerente: ordem, tempos crescentes e letras', () => {
    const s = sol('Casa')
    expect(s.passos.map((p) => p.letra).join('')).toBe('CASA')
    for (let i = 0; i < s.passos.length; i += 1) {
      const p = s.passos[i]
      expect(p.inicioMs).toBeLessThan(p.chegadaMs)
      expect(p.chegadaMs).toBeLessThan(p.fimMs)
      if (i) expect(p.inicioMs).toBeGreaterThanOrEqual(s.passos[i - 1].fimMs - 1e-9)
    }
    expect(s.palavras[0]).toMatchObject({ estado: 'soletrada' })
    expect(s.duracaoMs).toBeGreaterThan(s.passos[3].fimMs)
    expect(s.chaves[0].pose).toEqual(s.repouso)
    expect(s.chaves[s.chaves.length - 1].pose).toEqual(s.repouso)
  })

  it('velocidade: 2x dura metade; retenção por letra', () => {
    const base = sol('Casa', libras, { velocidade: 1 })
    const rapido = sol('Casa', libras, { velocidade: 2 })
    expect(rapido.duracaoMs).toBeCloseTo(base.duracaoMs / 2, 6)
    const longa = sol('Casa', libras, { retencaoMs: 900 })
    expect(longa.duracaoMs).toBeGreaterThan(base.duracaoMs)
    expect(longa.passos[0].fimMs - longa.passos[0].chegadaMs).toBeCloseTo(900, 6)
    expect(sol('Casa', libras, { velocidade: 99 }).duracaoMs).toBeCloseTo(base.duracaoMs / 4, 6) // teto 4x
    expect(sol('Casa', libras, { velocidade: Number.NaN }).duracaoMs).toBeCloseTo(base.duracaoMs, 6)
  })

  it('letra com movimento retém 1,7x; letra dupla faz rebote', () => {
    const j = sol('Hh', libras)
    expect(j.passos[0].movimento).toBe(true)
    expect(j.passos[0].fimMs - j.passos[0].chegadaMs).toBeCloseTo(450 * 1.7, 6)
    const dupla = sol('Casa Mm')
    expect(dupla.passos.find((p) => p.rebote)?.chave).toBe('M')
    const rebote = dupla.passos.find((p) => p.rebote)!
    expect(rebote.chegadaMs - rebote.inicioMs).toBeCloseTo(200, 6)
    expect(sol('Casa').passos.some((p) => p.rebote)).toBe(false)
  })

  it('Conceição em Libras e ASL: soletra sem erro, Libras com til', () => {
    const l = sol('Conceição', libras)
    expect(l.passos.map((p) => p.letra).join('')).toBe('CONCEIÇÃO')
    expect(l.passos.filter((p) => p.til)).toHaveLength(1)
    const a = sol('Conceição', asl)
    expect(a.passos.map((p) => p.letra).join('')).toBe('CONCEICAO')
    expect(a.passos.some((p) => p.til)).toBe(false)
  })

  it('teto de tempo: nomes próprios primeiro, ordem do texto na reprodução, resto marcado', () => {
    const s = sol('uma casa grande Maria mora aqui perto', libras, { tetoMs: 6000 })
    const sole = s.palavras.filter((p) => p.estado === 'soletrada').map((p) => p.texto)
    expect(sole).toContain('Maria')
    expect(s.duracaoMs).toBeLessThanOrEqual(6000 + 350 + 1)
    const naoSole = s.palavras.filter((p) => p.estado === 'nao_soletrada')
    expect(naoSole.length).toBeGreaterThan(0)
    expect(naoSole.every((p) => p.motivo === 'teto' || p.motivo === 'uma_letra')).toBe(true)
    expect(s.tetoAtingido).toBe(true)
    // ordem de reprodução = ordem do texto
    const idx = s.passos.map((p) => p.palavra)
    expect([...idx].sort((x, y) => x - y)).toEqual(idx)
  })

  it('palavras de uma letra não gastam o teto à toa', () => {
    const s = sol('a e o é Ana')
    expect(s.palavras.slice(0, 4).every((p) => p.estado === 'nao_soletrada' && p.motivo === 'uma_letra')).toBe(true)
    expect(s.passos.map((p) => p.letra).join('')).toBe('ANA')
    expect(sol('a', libras, { soletrarUmaLetra: true }).passos).toHaveLength(1)
    // com teto apertado, a palavra de uma letra não tira a vez da seguinte
    const apertado = sol('a Ana', libras, { tetoMs: 3000 })
    expect(apertado.palavras[1].estado).toBe('soletrada')
  })

  it('só nomes próprios; números e símbolos marcados; dicionário vazio', () => {
    const n = sol('ontem a Marta viu 2025', libras, { soNomesProprios: true })
    expect(n.palavras.map((p) => p.motivo)).toEqual(['so_nomes', 'uma_letra', undefined, 'so_nomes', 'numero'])
    expect(n.numerosPulados).toBe(true)
    const s = sol('?! 😀 99')
    expect(s.passos).toHaveLength(0)
    expect(s.palavras.map((p) => p.motivo)).toEqual(['sem_letras', 'sem_letras', 'numero'])
    expect(s.duracaoMs).toBe(0)
    expect(s.desconhecidos).toContain('😀')
  })

  it('dicionário de sinais (ponto de extensão): palavra com sinal gravado sai da soletração', () => {
    const s = sol('oi Maria', libras, {
      dicionario: { oi: { clipe: 'oi', duracaoMs: 800, revisadoPorSurdos: true } },
    })
    expect(s.palavras[0].motivo).toBe('dicionario')
    expect(s.passos.map((p) => p.letra).join('')).toBe('MARIA')
  })

  it('5.000 caracteres: termina rápido, respeita o teto e não estoura', () => {
    const texto = 'Maria casa verde '.repeat(300).slice(0, 5000)
    const t0 = performance.now()
    const s = sol(texto, libras)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(s.duracaoMs).toBeLessThanOrEqual(10_000 + 350 + 1)
    expect(s.tetoAtingido).toBe(true)
    expect(s.palavras.length).toBeGreaterThan(500)
    expect(sol('x'.repeat(30_000)).textoCortado).toBe(true)
  })

  it('emoji, RTL e vazio não quebram', () => {
    expect(() => sol('مرحبا 👋🏽 Ana עברית')).not.toThrow()
    expect(
      sol('مرحبا 👋🏽 Ana עברית')
        .passos.map((p) => p.letra)
        .join(''),
    ).toBe('ANA')
    expect(sol('').passos).toEqual([])
    expect(sol('   \n\t ').palavras).toEqual([])
  })

  it('espelhar: todas as poses saem espelhadas', () => {
    const d = sol('Ana')
    const e = sol('Ana', libras, { espelhar: true })
    expect(e.passos.every((p) => p.pose.espelhada)).toBe(true)
    expect(e.chaves.every((c) => c.pose.espelhada)).toBe(true)
    expect(e.passos[0].pose.posicao[0]).toBe(-d.passos[0].pose.posicao[0])
  })
})

describe('amostrar (linha do tempo)', () => {
  const s = sol('Zé Ana')
  it('com interpolação: no instante de chegada a pose é a da letra; entre letras é intermediária', () => {
    const p = s.passos[0]
    const chegou = amostrar(s, p.chegadaMs).pose
    expect(chegou.a).toEqual(p.pose.a)
    const meio = amostrar(s, (p.inicioMs + p.chegadaMs) / 2).pose
    expect(meio.a).not.toEqual(p.pose.a)
    expect(meio.a).not.toEqual(s.repouso.a)
    expect(amostrar(s, 0).pose.a).toEqual(s.repouso.a)
    expect(amostrar(s, s.duracaoMs + 5000).pose.a).toEqual(s.repouso.a)
  })

  it('movimento reduzido: SEM interpolação (só poses de letra, descanso ou repouso)', () => {
    const validas = [s.repouso.a, s.descanso.a, ...s.passos.map((p) => p.pose.a)].map((a) => JSON.stringify(a))
    for (let t = 0; t <= s.duracaoMs + 200; t += 17) {
      const { pose } = amostrar(s, t, { reduzido: true })
      expect(validas).toContain(JSON.stringify(pose.a))
    }
    // sem percurso: a letra com movimento fica na forma-base
    const z = sol('Zz')
    const p = z.passos[0]
    expect(amostrar(z, p.chegadaMs + (p.fimMs - p.chegadaMs) * 0.9, { reduzido: true }).pose).toBe(p.pose)
  })

  it('a palavra atual acompanha a soletração', () => {
    const p2 = s.passos[s.passos.length - 1]
    expect(amostrar(s, p2.chegadaMs + 10).palavra).toBe(p2.palavra)
    expect(amostrar(s, s.duracaoMs + 1).palavra).toBe(-1)
    expect(amostrar(s, -5).passo).toBe(-1)
  })

  it('o percurso (J) sai da forma-base durante a retenção', () => {
    const j = sol('Jj', asl)
    const p = j.passos[0]
    const meio = amostrar(j, p.chegadaMs + (p.fimMs - p.chegadaMs) * 0.5).pose
    const mudou =
      meio.posicao.some((v, i) => Math.abs(v - p.pose.posicao[i]) > 1e-4) ||
      meio.a.some((v, i) => Math.abs(v - p.pose.a[i]) > 1e-3)
    expect(mudou).toBe(true)
  })

  it('pose sempre dentro dos limites ao longo da fala toda (clamp não age em dados válidos)', () => {
    const f = sol('abcdefghijklmnopqrstuvwxyz çãõ', libras, { tetoMs: 60_000 })
    let ativ = 0
    for (let t = 0; t <= f.duracaoMs; t += 23) {
      const pose: PoseDeMao = amostrar(f, t).pose
      ativ += limitarAngulos(pose.a, limites).ativacoes
    }
    expect(ativ).toBe(0)
  })
})
