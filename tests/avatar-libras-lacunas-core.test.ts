/**
 * LACUNAS DO MODO LIBRAS, núcleo puro: o modo "nomes" x "tudo" da soletração do Intérprete, o estado do palco das mãos,
 * as letras feitas/atual, o guia do alfabeto manual e a lista local de poses marcadas como incorretas.
 * Soletração do alfabeto manual, não tradução; poses de demonstração NÃO revisadas por pessoas surdas.
 */
import { describe, expect, it } from 'vitest'

import { PREFERENCIAS_PADRAO, validarPreferencias } from '../src/core/avatar/interprete'
import {
  instanteDaPose,
  proximaTecla,
  teclaDoTeclado,
  teclasDoAlfabeto,
} from '../src/core/avatar/sinais/guiaDoAlfabeto'
import {
  adicionarMarcacao,
  exportarMarcacoes,
  lerMarcacoes,
  MAX_DE_MARCACOES,
  removerMarcacao,
} from '../src/core/avatar/sinais/marcacoesLocais'
import {
  decidirSoletracao,
  estadoDoPalco,
  letrasDoPalco,
  modoDaSoletracao,
  palavrasASoletrar,
  rotuloSoletrando,
} from '../src/core/avatar/sinais/soletracaoDoInterprete'
import { soletrar } from '../src/core/avatar/sinais/soletrar'
import type { Alfabeto, Limites } from '../src/core/avatar/sinais/tipos'
import alfabetoAsl from '../src/data/avatar/sinais/alfabeto-asl.json'
import alfabetoLibras from '../src/data/avatar/sinais/alfabeto-libras.json'
import limites from '../src/data/avatar/sinais/limites.json'

const libras = alfabetoLibras as unknown as Alfabeto
const asl = alfabetoAsl as unknown as Alfabeto
const lim = limites as unknown as Limites

const base = {
  ligada: true,
  item: { id: 'a', texto: 'fale com Conceição amanhã' },
  naFila: 0,
  alfabeto: 'libras' as const,
  ritmo: 'normal' as const,
  espelhar: false,
}

describe('modo nomes x tudo', () => {
  it('a preferência soletrarTudo é desligada por padrão e o modo vem dela', () => {
    expect(PREFERENCIAS_PADRAO.soletrarTudo).toBe(false)
    expect(modoDaSoletracao({ soletrarTudo: false })).toBe('nomes')
    expect(modoDaSoletracao({ soletrarTudo: true })).toBe('tudo')
    expect(validarPreferencias({ soletrarTudo: true }).soletrarTudo).toBe(true)
    expect(validarPreferencias({ soletrarTudo: 'sim' }).soletrarTudo).toBe(false)
    expect(validarPreferencias(null).soletrarTudo).toBe(false)
  })

  it('"nomes" só leva o nome próprio; "tudo" leva as palavras de 2 letras ou mais', () => {
    expect(palavrasASoletrar('fale com Conceição amanhã', 'libras', 'nomes')).toEqual(['Conceição'])
    expect(palavrasASoletrar('fale com Conceição amanhã', 'libras', 'tudo')).toEqual([
      'fale',
      'com',
      'Conceição',
      'amanhã',
    ])
    // palavra de uma letra e pontuação não entram
    expect(palavrasASoletrar('eu vi a Ana, e o Léo.', 'libras', 'tudo')).toEqual(['eu', 'vi', 'Ana', 'Léo'])
  })

  it('sem nome próprio, "nomes" não faz nada, mas "tudo" soletra', () => {
    const d = { ...base, item: { id: 'b', texto: 'bom dia a todos' } }
    expect(decidirSoletracao(d).tipo).toBe('nada')
    const t = decidirSoletracao({ ...d, modo: 'tudo' })
    expect(t.tipo).toBe('soletrar')
    if (t.tipo === 'soletrar') {
      expect(t.modo).toBe('tudo')
      expect(t.soNomesProprios).toBe(false)
      expect(t.palavras).toEqual(['bom', 'dia', 'todos'])
      expect(t.tetoMs).toBeGreaterThan(8_000) // "tudo" precisa de mais tempo que um nome
    }
  })

  it('o modo padrão é "nomes" e a decisão de nomes não muda', () => {
    const t = decidirSoletracao(base)
    expect(t.tipo).toBe('soletrar')
    if (t.tipo === 'soletrar') {
      expect(t.modo).toBe('nomes')
      expect(t.soNomesProprios).toBe(true)
      expect(t.nomes).toEqual(['Conceição'])
      expect(t.palavras).toEqual(['Conceição'])
    }
  })

  it('"tudo" pula assim que há outra fala esperando; "nomes" aguenta uma', () => {
    expect(decidirSoletracao({ ...base, naFila: 1 }).tipo).toBe('soletrar')
    expect(decidirSoletracao({ ...base, naFila: 1, modo: 'tudo' })).toEqual({ tipo: 'pulada', motivo: 'fila' })
    expect(decidirSoletracao({ ...base, naFila: 2 })).toEqual({ tipo: 'pulada', motivo: 'fila' })
  })

  it('"tudo" respeita o ritmo, desligada, toque manual e idioma sem alfabeto', () => {
    expect(decidirSoletracao({ ...base, modo: 'tudo', ligada: false })).toEqual({ tipo: 'desligada' })
    expect(decidirSoletracao({ ...base, modo: 'tudo', item: { id: 'x', texto: 'oi pessoal', manual: true } })).toEqual({
      tipo: 'nada',
    })
    expect(decidirSoletracao({ ...base, modo: 'tudo', alfabeto: null })).toEqual({
      tipo: 'pulada',
      motivo: 'sem_alfabeto',
    })
    const rapida = decidirSoletracao({ ...base, modo: 'tudo', ritmo: 'rapida' })
    const lenta = decidirSoletracao({ ...base, modo: 'tudo', ritmo: 'lenta' })
    if (rapida.tipo === 'soletrar' && lenta.tipo === 'soletrar')
      expect(rapida.velocidade).toBeGreaterThan(lenta.velocidade)
    else throw new Error('esperava soletrar')
  })

  it('a contagem de palavras do modo "tudo" bate com o que o soletrar de fato toca', () => {
    const texto = 'fale com Conceição amanhã'
    const seq = soletrar(texto, libras, { limites: lim, soNomesProprios: false, tetoMs: 60_000 })
    const tocadas = seq.palavras.filter((p) => p.estado === 'soletrada').map((p) => p.texto)
    expect(tocadas).toEqual(palavrasASoletrar(texto, 'libras', 'tudo'))
  })
})

describe('letras do palco e o rótulo "Soletrando"', () => {
  it('marca feitas, a atual e as que faltam', () => {
    const ls = letrasDoPalco(['C', 'O', 'N', 'C'], 2)
    expect(ls.map((l) => l.estado)).toEqual(['feita', 'feita', 'atual', 'futura'])
    expect(ls.map((l) => l.letra)).toEqual(['C', 'O', 'N', 'C'])
  })

  it('índice fora da palavra: nada atual (tudo feito ou nada começou)', () => {
    expect(letrasDoPalco(['A', 'B'], -1).every((l) => l.estado === 'futura')).toBe(true)
    expect(letrasDoPalco(['A', 'B'], 5).every((l) => l.estado === 'feita')).toBe(true)
    expect(letrasDoPalco([], 0)).toEqual([])
  })

  it('o rótulo mostra as letras feitas e reticências enquanto faltam', () => {
    expect(rotuloSoletrando(['C', 'O', 'N', 'C'], 2)).toBe('C-O-N-…')
    expect(rotuloSoletrando(['C', 'O', 'N', 'C'], 3)).toBe('C-O-N-C')
    expect(rotuloSoletrando(['A', 'N', 'A'], 0)).toBe('A-…')
    expect(rotuloSoletrando([], 0)).toBe('')
  })
})

describe('estado do palco', () => {
  const decisaoSoletrar = decidirSoletracao({ ...base, modo: 'tudo' })
  it('desligada: sem palco', () => {
    expect(estadoDoPalco({ ligada: false, soletrando: false, pulada: null, atual: null, naFila: 0 })).toEqual({
      tipo: 'desligado',
    })
  })
  it('ligada e sem nada a soletrar: "Aguardando"', () => {
    expect(estadoDoPalco({ ligada: true, soletrando: false, pulada: null, atual: null, naFila: 0 })).toEqual({
      tipo: 'aguardando',
    })
  })
  it('soletrando: palavra, letras e rótulo', () => {
    const e = estadoDoPalco({
      ligada: true,
      soletrando: true,
      pulada: null,
      atual: { palavra: 'Conceição', letras: ['C', 'O', 'N', 'C', 'E', 'Ç', 'Ã', 'O'], indice: 1 },
      naFila: 0,
    })
    expect(e.tipo).toBe('soletrando')
    if (e.tipo === 'soletrando') {
      expect(e.palavra).toBe('Conceição')
      expect(e.rotulo).toBe('C-O-…')
      expect(e.letras[1]?.estado).toBe('atual')
    }
  })
  it('entre palavras (soletrando sem palavra atual) segue "soletrando" mas sem letras', () => {
    const e = estadoDoPalco({ ligada: true, soletrando: true, pulada: null, atual: null, naFila: 0 })
    expect(e.tipo).toBe('soletrando')
    if (e.tipo === 'soletrando') expect(e.letras).toEqual([])
  })
  it('pulada vence o aguardando e leva o motivo', () => {
    expect(estadoDoPalco({ ligada: true, soletrando: false, pulada: 'fila', atual: null, naFila: 3 })).toEqual({
      tipo: 'pulada',
      motivo: 'fila',
    })
  })
  it('usa a decisão sem quebrar o tipo', () => {
    expect(decisaoSoletrar.tipo).toBe('soletrar')
  })
})

describe('guia do alfabeto manual', () => {
  it('as teclas: A a Z, depois Ç (Libras) e os algarismos 0 a 9', () => {
    const l = teclasDoAlfabeto(libras)
    expect(l.slice(0, 3)).toEqual(['A', 'B', 'C'])
    expect(l).toContain('Ç')
    expect(l.slice(-10)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    const a = teclasDoAlfabeto(asl)
    expect(a).not.toContain('Ç')
    expect(a.filter((x) => /[A-Z]/.test(x))).toHaveLength(26)
    expect(a.slice(-10)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
  })

  it('o teclado escolhe a letra digitada (sem acento, sem maiúscula) ou ignora o resto', () => {
    const teclas = teclasDoAlfabeto(libras)
    expect(teclaDoTeclado('g', teclas)).toBe('G')
    expect(teclaDoTeclado('G', teclas)).toBe('G')
    expect(teclaDoTeclado('7', teclas)).toBe('7')
    expect(teclaDoTeclado('ç', teclas)).toBe('Ç')
    expect(teclaDoTeclado('Enter', teclas)).toBeNull()
    expect(teclaDoTeclado('é', teclas)).toBeNull()
    expect(teclaDoTeclado(' ', teclas)).toBeNull()
  })

  it('as setas andam na grade, sem sair dela', () => {
    const t = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    expect(proximaTecla(t, 'A', 'direita', 3)).toBe('B')
    expect(proximaTecla(t, 'C', 'direita', 3)).toBe('D') // a linha seguinte
    expect(proximaTecla(t, 'G', 'direita', 3)).toBe('G') // o fim para
    expect(proximaTecla(t, 'A', 'esquerda', 3)).toBe('A')
    expect(proximaTecla(t, 'A', 'baixo', 3)).toBe('D')
    expect(proximaTecla(t, 'F', 'baixo', 3)).toBe('G') // a última coluna da última linha: vai à última
    expect(proximaTecla(t, 'E', 'cima', 3)).toBe('B')
    expect(proximaTecla(t, 'B', 'cima', 3)).toBe('B')
    expect(proximaTecla(t, 'A', 'inicio', 3)).toBe('A')
    expect(proximaTecla(t, 'D', 'fim', 3)).toBe('G')
    expect(proximaTecla(t, 'ZZ', 'direita', 3)).toBe('A') // tecla desconhecida: começa do início
  })

  it('o instante da pose cai dentro da retenção da letra, para todas as letras dos dois alfabetos', () => {
    for (const alf of [libras, asl]) {
      for (const k of teclasDoAlfabeto(alf)) {
        const seq = soletrar(k, alf, { limites: lim, soletrarUmaLetra: true })
        expect(seq.passos, k).toHaveLength(1)
        const p = seq.passos[0]!
        const ms = instanteDaPose(seq)
        expect(ms, k).toBeGreaterThanOrEqual(p.chegadaMs)
        expect(ms, k).toBeLessThanOrEqual(p.fimMs)
      }
    }
  })

  it('sem passos, o instante é zero', () => {
    const seq = soletrar('', libras, { limites: lim })
    expect(instanteDaPose(seq)).toBe(0)
  })
})

describe('poses marcadas como incorretas (lista local, exportável)', () => {
  const m = (alfabeto: 'libras' | 'asl', letra: string, em = 1) => ({ alfabeto, letra, espelhada: false, em })

  it('adiciona, não duplica a mesma pose e remove', () => {
    let l = lerMarcacoes(null)
    l = adicionarMarcacao(l, m('libras', 'G'))
    l = adicionarMarcacao(l, m('libras', 'G', 2))
    l = adicionarMarcacao(l, m('asl', 'G'))
    expect(l).toHaveLength(2)
    l = removerMarcacao(l, 'libras', 'G')
    expect(l.map((x) => x.alfabeto)).toEqual(['asl'])
  })

  it('a leitura aceita lixo (JSON quebrado, tipos errados, letra inventada) e devolve só o válido', () => {
    expect(lerMarcacoes('{não é json')).toEqual([])
    expect(lerMarcacoes('{"a":1}')).toEqual([])
    const bruto = JSON.stringify([
      { alfabeto: 'libras', letra: 'H', espelhada: true, em: 5 },
      { alfabeto: 'klingon', letra: 'H', espelhada: false, em: 5 },
      { alfabeto: 'asl', letra: 'ab', espelhada: false, em: 5 },
      { alfabeto: 'asl', letra: 'Z', espelhada: 'sim', em: 'x' },
      null,
      7,
    ])
    const l = lerMarcacoes(bruto)
    expect(l.map((x) => `${x.alfabeto}:${x.letra}`)).toEqual(['libras:H', 'asl:Z'])
    expect(l[1]).toMatchObject({ espelhada: false, em: 0 })
  })

  it('a lista tem teto', () => {
    let l = lerMarcacoes(null)
    for (let i = 0; i < MAX_DE_MARCACOES + 20; i += 1) l = adicionarMarcacao(l, m('asl', `L${i}`.slice(0, 2), i))
    expect(l.length).toBeLessThanOrEqual(MAX_DE_MARCACOES)
  })

  it('o JSON exportado diz o que é e o que NÃO é, e não leva dados da pessoa', () => {
    const l = adicionarMarcacao(lerMarcacoes(null), m('libras', 'P', 1_700_000_000_000))
    const json = exportarMarcacoes(l, '2026-10-29T12:00:00.000Z')
    const o = JSON.parse(json) as Record<string, unknown>
    expect(o.esquema).toBe('frasy-poses-marcadas/1')
    expect(String(o.aviso)).toMatch(/NÃO revisadas por pessoas surdas/)
    expect(String(o.aviso)).toMatch(/não é tradução/i)
    expect(o.exportadoEm).toBe('2026-10-29T12:00:00.000Z')
    expect(o.itens).toEqual([{ alfabeto: 'libras', letra: 'P', espelhada: false, em: 1_700_000_000_000 }])
    expect(Object.keys(o).sort()).toEqual(['aviso', 'esquema', 'exportadoEm', 'itens'])
    // ida e volta
    expect(lerMarcacoes(JSON.stringify(o.itens))).toEqual(l)
  })
})
