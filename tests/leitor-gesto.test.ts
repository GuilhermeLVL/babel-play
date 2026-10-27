/**
 * O GESTO NO TEXTO DO LIVRO (`src/core/leitura/gestoDoLeitor.ts`): só o toque LIMPO abre o cartão da palavra.
 * A queixa do dono: começar a arrastar para selecionar um trecho abria a folha da palavra.
 */
import { describe, expect, it } from 'vitest'

import {
  classificarGesto,
  criarReconhecedorDeToque,
  type DadosDoGesto,
  LIMITES_DO_GESTO,
  type PontoDoGesto,
} from '../src/core/leitura/gestoDoLeitor'

const p = (t: number, x = 100, y = 100): PontoDoGesto => ({ t, x, y })
const gesto = (g: Partial<DadosDoGesto>): DadosDoGesto => ({
  inicio: p(0),
  fim: p(120),
  selecaoAoComecar: false,
  selecaoDuranteGesto: false,
  selecaoNoFim: false,
  ...g,
})

describe('classificarGesto', () => {
  it('toque limpo: rápido, parado, sem seleção', () => {
    expect(classificarGesto(gesto({}))).toBe('toque')
    expect(classificarGesto(gesto({ fim: p(250, 105, 100) }))).toBe('toque')
  })

  it('arrasto: 6 px ou mais do ponto de descida, mesmo que o ponteiro volte', () => {
    expect(classificarGesto(gesto({ fim: p(120, 106, 100) }))).toBe('arrasto')
    expect(classificarGesto(gesto({ fim: p(120, 100, 100), maiorDistancia: 40 }))).toBe('arrasto')
  })

  it('toque longo (≥ 400 ms) é seleção, nunca cartão; entre 250 e 400 ms, na dúvida, nada', () => {
    expect(classificarGesto(gesto({ fim: p(LIMITES_DO_GESTO.longoMs) }))).toBe('longo')
    expect(classificarGesto(gesto({ fim: p(900) }))).toBe('longo')
    expect(classificarGesto(gesto({ fim: p(251) }))).toBe('demorado')
    expect(classificarGesto(gesto({ fim: p(399) }))).toBe('demorado')
  })

  it('seleção no fim ou durante o gesto: seleção (a barra do trecho ganha)', () => {
    expect(classificarGesto(gesto({ selecaoNoFim: true }))).toBe('selecao')
    expect(classificarGesto(gesto({ selecaoDuranteGesto: true }))).toBe('selecao')
  })

  it('o toque que desfaz uma seleção, ou logo depois de ela sumir, não abre nada', () => {
    expect(classificarGesto(gesto({ selecaoAoComecar: true }))).toBe('limpar')
    expect(classificarGesto(gesto({ inicio: p(1000), fim: p(1100), selecaoSumiuEm: 800 }))).toBe('limpar')
    // Passada a janela, o toque volta a valer.
    expect(classificarGesto(gesto({ inicio: p(1000), fim: p(1100), selecaoSumiuEm: 600 }))).toBe('toque')
  })

  it('o segundo toque de um toque duplo é "duplo"', () => {
    expect(classificarGesto(gesto({ segundoToque: true }))).toBe('duplo')
  })
})

/** Um relógio de mentira: `andar(ms)` dispara o que venceu. */
function relogio() {
  let agora = 0
  let fila: Array<{ em: number; f: () => void; vivo: boolean }> = []
  return {
    agora: () => agora,
    esperar(ms: number, f: () => void) {
      const item = { em: agora + ms, f, vivo: true }
      fila.push(item)
      return () => {
        item.vivo = false
      }
    },
    andar(ms: number) {
      agora += ms
      const vencidos = fila.filter((i) => i.vivo && i.em <= agora)
      fila = fila.filter((i) => !vencidos.includes(i))
      for (const i of vencidos) i.f()
    },
  }
}

function montar() {
  const r = relogio()
  const toques: string[] = []
  const classes: string[] = []
  const rec = criarReconhecedorDeToque<string>({
    relogio: r,
    aoToque: (_p, carga) => toques.push(carga),
    aoClassificar: (c) => classes.push(c),
  })
  return { r, rec, toques, classes }
}

describe('criarReconhecedorDeToque', () => {
  it('o toque limpo abre o cartão só depois da janela do toque duplo', () => {
    const { r, rec, toques } = montar()
    rec.baixou(p(0), false)
    r.andar(100)
    expect(rec.subiu(p(100), false, 'raposa')).toBe('toque')
    expect(toques).toEqual([])
    r.andar(LIMITES_DO_GESTO.duploMs - 1)
    expect(toques).toEqual([])
    r.andar(1)
    expect(toques).toEqual(['raposa'])
  })

  it('arrastar para selecionar nunca abre o cartão', () => {
    const { r, rec, toques, classes } = montar()
    rec.baixou(p(0), false)
    r.andar(30)
    rec.moveu(p(30, 104, 100))
    rec.selecaoMudou(true)
    rec.moveu(p(60, 160, 100))
    r.andar(60)
    rec.subiu(p(90, 160, 100), true, 'x')
    r.andar(1000)
    expect(toques).toEqual([])
    expect(classes).toEqual(['selecao'])
  })

  it('o toque longo parado nunca abre o cartão', () => {
    const { r, rec, toques } = montar()
    rec.baixou(p(0), false)
    r.andar(500)
    expect(rec.subiu(p(500), false, 'x')).toBe('longo')
    r.andar(1000)
    expect(toques).toEqual([])
  })

  it('toque duplo: seleciona a palavra e não abre o cartão', () => {
    const { r, rec, toques, classes } = montar()
    rec.baixou(p(0), false)
    r.andar(80)
    rec.subiu(p(80), false, 'primeiro')
    r.andar(100)
    rec.baixou(p(180), false)
    rec.selecaoMudou(true) // o navegador seleciona a palavra no segundo toque
    r.andar(60)
    rec.subiu(p(240), true, 'segundo')
    r.andar(1000)
    expect(toques).toEqual([])
    expect(classes).toEqual(['toque', 'duplo'])
  })

  it('a seleção que aparece na janela do toque duplo cancela o toque', () => {
    const { r, rec, toques } = montar()
    rec.baixou(p(0), false)
    r.andar(80)
    rec.subiu(p(80), false, 'x')
    r.andar(100)
    rec.selecaoMudou(true)
    r.andar(1000)
    expect(toques).toEqual([])
  })

  it('tocar para desfazer a seleção não abre; tocar logo depois também não; depois da janela, abre', () => {
    const { r, rec, toques, classes } = montar()
    rec.selecaoMudou(true) // havia um trecho selecionado
    r.andar(1000)
    rec.baixou(p(1000), true) // este toque desfaz a seleção
    rec.selecaoMudou(false)
    r.andar(80)
    rec.subiu(p(1080), false, 'a')
    r.andar(120)
    rec.baixou(p(1200), false) // logo depois de a seleção sumir
    r.andar(80)
    rec.subiu(p(1280), false, 'b')
    r.andar(1000)
    expect(toques).toEqual([])
    rec.baixou(p(r.agora()), false)
    r.andar(80)
    rec.subiu(p(r.agora()), false, 'c')
    r.andar(LIMITES_DO_GESTO.duploMs)
    expect(toques).toEqual(['c'])
    expect(classes).toEqual(['limpar', 'limpar', 'toque'])
  })

  it('gesto cancelado pelo navegador (rolagem, menu do toque longo) não abre nada', () => {
    const { r, rec, toques } = montar()
    rec.baixou(p(0), false)
    expect(rec.emCurso()).toBe(true)
    rec.cancelou()
    expect(rec.emCurso()).toBe(false)
    expect(rec.subiu(p(100), false, 'x')).toBeNull()
    r.andar(1000)
    expect(toques).toEqual([])
  })
})
