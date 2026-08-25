/**
 * Invariantes das FRASES DE EXEMPLO embutidas na trilha (Tatoeba, CC BY 2.0 FR).
 *
 * Estes testes olham o DADO REAL, não uma fixture. É o que pegou, na geração anterior deste arquivo,
 * uma régua defeituosa do próprio app (`pistaUtil` casando "estação" com `/^esta\b/`) — o dado
 * reprovou o código, não o contrário.
 *
 * O que travam: a frase CONTÉM a palavra, o comprimento está na faixa que a tela aguenta, e frase e
 * tradução andam sempre juntas. Um par com frase e sem tradução daria pista sem gabarito.
 */
import { describe, it, expect } from 'vitest'
import trilhaEn from '../src/data/trilha/en.json'
import { cartoesDaTrilha, proximasPalavras, frasesDaTrilha, NIVEIS_CEFR } from '../src/core/learning/trilha'
import { buildScrambleRounds } from '../src/core/minigames/scramble'
import type { DadoTrilha } from '../src/core/learning/trilha'

const dado = trilhaEn as unknown as DadoTrilha

/** Todos os pares, achatados, com o nível de origem. */
function todos() {
  const saida: Array<{ nivel: string; palavra: string; traducao: string; frase?: string; pt?: string }> = []
  for (const nivel of NIVEIS_CEFR) {
    for (const par of dado.niveis[nivel] ?? []) {
      saida.push({ nivel, palavra: par[0], traducao: par[1], frase: par[2], pt: par[3] })
    }
  }
  return saida
}

const palavras = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

describe('frases de exemplo da trilha', () => {
  it('a maioria das palavras tem frase, e a contagem é a medida', () => {
    const t = todos()
    const com = t.filter(x => x.frase).length
    expect(t.length).toBe(2784)
    expect(com).toBe(2552)
    /* 91,7%. Se cair muito abaixo disso, alguém regerou o arquivo com um filtro mais severo. */
    expect(com / t.length).toBeGreaterThan(0.9)
  })

  it('frase e tradução andam SEMPRE juntas', () => {
    const orfas = todos().filter(x => (x.frase && !x.pt) || (!x.frase && x.pt))
    expect(orfas.map(x => x.palavra)).toEqual([])
  })

  it('toda frase CONTÉM a palavra que ela exemplifica', () => {
    const semAPalavra = todos()
      .filter(x => x.frase)
      .filter(x => {
        const tokens = new Set(x.frase!.toLowerCase().match(/[a-z']+/g) ?? [])
        return !tokens.has(x.palavra.toLowerCase())
      })
      .map(x => `${x.palavra} → "${x.frase}"`)
    expect(semAPalavra).toEqual([])
  })

  it('toda frase tem de 5 a 12 palavras — a faixa que cabe na tela de um jogo', () => {
    const foraDaFaixa = todos()
      .filter(x => x.frase)
      .filter(x => palavras(x.frase!) < 5 || palavras(x.frase!) > 12)
      .map(x => `${x.palavra} (${palavras(x.frase!)}): "${x.frase}"`)
    expect(foraDaFaixa).toEqual([])
  })

  it('nenhuma tradução portuguesa vem vazia', () => {
    const vazias = todos().filter(x => x.frase && !(x.pt ?? '').trim()).map(x => x.palavra)
    expect(vazias).toEqual([])
  })

  it('a fonte declara o Tatoeba e aponta o arquivo de atribuição', () => {
    expect(dado.fonte).toContain('Tatoeba')
    expect(dado.fonte).toContain('CC BY 2.0 FR')
    expect(dado.fonte).toContain('FONTES.md')
  })
})

describe('a frase chega ao cartão e à palavra', () => {
  it('`cartoesDaTrilha` põe a frase em `sentence`, o nome que o cartão do banco usa', () => {
    const cartoes = cartoesDaTrilha(dado, 'A1', { quantidade: 200, shuffle: xs => xs })
    const comFrase = cartoes.filter(c => c.sentence)
    expect(comFrase.length).toBeGreaterThan(150)
    for (const c of comFrase) {
      expect(c.sentence!.toLowerCase()).toContain(c.word.toLowerCase())
      expect((c.sentenceTranslation ?? '').trim().length).toBeGreaterThan(0)
    }
  })

  /* Cartão sem frase NÃO pode carregar `sentence: ''` — string vazia afirma que há um exemplo. */
  it('cartão sem frase não tem o campo, em vez de tê-lo vazio', () => {
    const cartoes = cartoesDaTrilha(dado, 'C2', { quantidade: 64, shuffle: xs => xs })
    const semFrase = cartoes.filter(c => !c.sentence)
    expect(semFrase.length).toBeGreaterThan(0)
    for (const c of semFrase) {
      expect('sentence' in c).toBe(false)
      expect('sentenceTranslation' in c).toBe(false)
    }
  })

  it('`proximasPalavras` também carrega a frase quando ela existe', () => {
    const p = proximasPalavras(dado, 'A1', { jaTem: new Set(), quantidade: 50, shuffle: xs => xs })
    const comFrase = p.filter(x => x.frase)
    expect(comFrase.length).toBeGreaterThan(30)
    for (const x of comFrase) {
      expect(x.frase!.toLowerCase()).toContain(x.palavra.toLowerCase())
      expect((x.fraseTraduzida ?? '').length).toBeGreaterThan(0)
    }
  })

  it('palavra sem frase não ganha o campo', () => {
    const p = proximasPalavras(dado, 'C2', { jaTem: new Set(), quantidade: 64, shuffle: xs => xs })
    for (const x of p.filter(y => !y.frase)) expect('frase' in x).toBe(false)
  })
})

describe('frasesDaTrilha — a ponte para os jogos de frase', () => {
  it('devolve SÓ pares que têm frase, e sempre a quantidade pedida', () => {
    const f = frasesDaTrilha(dado, 'A1', { quantidade: 6, shuffle: xs => xs })
    expect(f).toHaveLength(6)
    for (const x of f) {
      expect(x.text.length).toBeGreaterThan(0)
      expect(x.translation.length).toBeGreaterThan(0)
    }
  })

  /* Se o filtro viesse DEPOIS do corte, uma rodada de 6 poderia sair com 2. */
  it('filtra antes de cortar — nível magro não devolve rodada furada', () => {
    const f = frasesDaTrilha(dado, 'C2', { quantidade: 10, shuffle: xs => xs })
    expect(f.length).toBe(10)
    expect(f.every(x => x.text && x.translation)).toBe(true)
  })

  /* Zero é o sinal de "não há clipe, fale o texto" para `criarFalante`. */
  it('startMs/endMs são ZERO — a trilha não tem áudio para recortar', () => {
    for (const x of frasesDaTrilha(dado, 'A2', { quantidade: 20, shuffle: xs => xs })) {
      expect(x.startMs).toBe(0)
      expect(x.endMs).toBe(0)
    }
  })

  it('o id é estável entre chamadas — é o que o histórico usa', () => {
    const a = frasesDaTrilha(dado, 'A1', { quantidade: 5, shuffle: xs => xs })
    const b = frasesDaTrilha(dado, 'A1', { quantidade: 5, shuffle: xs => xs })
    expect(a.map(x => x.id)).toEqual(b.map(x => x.id))
    expect(a.every(x => x.id.startsWith('trilha:'))).toBe(true)
  })

  it('nível ausente do arquivo devolve lista vazia, não quebra', () => {
    expect(frasesDaTrilha({ ...dado, niveis: {} }, 'A1')).toEqual([])
  })

  /* O teste que importa de verdade: a Frase embaralhada aceita este material. */
  it('a Frase embaralhada monta rodadas a partir da trilha', () => {
    const f = frasesDaTrilha(dado, 'A1', { quantidade: 40, shuffle: xs => xs })
    const rodadas = buildScrambleRounds(f, { quantidade: 5, rand: () => 0.5 })
    expect(rodadas.length).toBe(5)
    for (const r of rodadas) {
      expect(r.correta.length).toBeGreaterThanOrEqual(5)
      expect(r.embaralhada.length).toBe(r.correta.length)
      expect(r.traducao.length).toBeGreaterThan(0)
      expect(r.sentenceId).toMatch(/^trilha:/)
    }
  })
})
