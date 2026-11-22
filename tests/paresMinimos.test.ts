import { describe, expect, it } from 'vitest'

import { estadoDoJogo } from '../src/core/minigames/estadoDosJogos'
import { pontuarRodada } from '../src/core/minigames/grade'
import {
  chaveDoContraste,
  conferirPar,
  IDIOMAS_COM_PARES,
  palavraTocada,
  PARES_MINIMOS,
  paresDoIdioma,
  resumirContrastes,
  rotuloDoContraste,
  sortearRodada,
} from '../src/core/minigames/paresMinimos'
import { MINIGAMES } from '../src/core/minigames/types'

describe('as listas de pares mínimos (dados curados)', () => {
  it('cobrem en, es, fr, de, it e pt', () => {
    expect([...IDIOMAS_COM_PARES].sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'pt'])
  })

  for (const [lang, lista] of Object.entries(PARES_MINIMOS)) {
    describe(lang, () => {
      it('tem pelo menos 15 pares', () => {
        expect(lista.length).toBeGreaterThanOrEqual(15)
      })

      it('não repete par (nem invertido)', () => {
        const vistos = new Set<string>()
        for (const p of lista) {
          const chave = [p.a, p.b]
            .map((x) => x.toLocaleLowerCase(lang))
            .sort()
            .join('|')
          expect(vistos.has(chave), `par repetido: ${p.a} × ${p.b}`).toBe(false)
          vistos.add(chave)
        }
      })

      it('as duas palavras são diferentes, simples e sem espaço', () => {
        for (const p of lista) {
          expect(p.a.trim().length, p.a).toBeGreaterThan(0)
          expect(p.b.trim().length, p.b).toBeGreaterThan(0)
          expect(p.a.toLocaleLowerCase(lang), `${p.a} = ${p.b}`).not.toBe(p.b.toLocaleLowerCase(lang))
          expect(/\s/.test(p.a + p.b), `${p.a} × ${p.b} tem espaço`).toBe(false)
        }
      })

      it('o contraste está preenchido e os dois sons são diferentes', () => {
        for (const p of lista) {
          expect(p.sons, `${p.a} × ${p.b}`).toHaveLength(2)
          expect(p.sons[0].trim(), `${p.a}: som`).not.toBe('')
          expect(p.sons[1].trim(), `${p.b}: som`).not.toBe('')
          expect(p.sons[0], `${p.a} × ${p.b}: sons iguais`).not.toBe(p.sons[1])
        }
      })
    })
  }
})

/* Palavras de baixo calão ou de duplo sentido comum (pt, es, en, fr, de, it): o app atende menores. */
const BLOQUEADAS = new Set(
  [
    'ano', 'cu', 'cul', 'culo', 'cona', 'coño', 'puta', 'puto', 'pene', 'pija', 'polla', 'verga', 'pico', 'teta',
    'porra', 'caralho', 'foda', 'fode', 'bitch', 'shit', 'piss', 'cunt', 'dick', 'cock', 'sex', 'fuck',
    'bite', 'con', 'merde', 'couille', 'putain', 'arsch', 'scheisse', 'scheiße', 'fotze', 'hure', 'hölle', 'cazzo',
    'figa', 'merda', 'culone', 'troia', 'bagascia',
  ].map((x) => x.toLocaleLowerCase()),
)

describe('adequação para menores', () => {
  it('nenhuma palavra de nenhum par está na lista de bloqueadas', () => {
    for (const [lang, lista] of Object.entries(PARES_MINIMOS)) {
      for (const p of lista) {
        for (const w of [p.a, p.b]) expect(BLOQUEADAS.has(w.toLocaleLowerCase(lang)) || w === 'cana' && lang === 'pt', `${lang}: ${w}`).toBe(false)
      }
    }
  })
})

describe('rótulo do contraste', () => {
  it('escreve /a/ × /b/ e a chave não depende da ordem', () => {
    expect(rotuloDoContraste(['ɪ', 'iː'])).toBe('/ɪ/ × /iː/')
    expect(chaveDoContraste(['ɪ', 'iː'])).toBe(chaveDoContraste(['iː', 'ɪ']))
  })
})

describe('sortearRodada', () => {
  it('só traz pares do idioma-alvo (aceita en-US) e nada para idioma sem lista', () => {
    const palavras = new Set(PARES_MINIMOS.en.flatMap((p) => [p.a, p.b]))
    const r = sortearRodada('en-US', { semente: 1 })
    expect(r.length).toBeGreaterThan(0)
    for (const x of r) for (const o of x.opcoes) expect(palavras.has(o.palavra)).toBe(true)
    expect(sortearRodada('ja')).toEqual([])
    expect(paresDoIdioma(undefined)).toEqual([])
  })

  it('respeita a quantidade e não repete par nem palavra na rodada', () => {
    for (const lang of IDIOMAS_COM_PARES) {
      for (let s = 0; s < 20; s++) {
        const r = sortearRodada(lang, { quantidade: 8, semente: s })
        expect(r).toHaveLength(8)
        expect(new Set(r.map((x) => x.id)).size).toBe(8)
        const palavras = r.flatMap((x) => x.opcoes.map((o) => o.palavra))
        expect(new Set(palavras).size, `${lang}/${s}: palavra repetida`).toBe(palavras.length)
      }
    }
  })

  it('é determinístico por semente e muda com ela', () => {
    expect(sortearRodada('es', { semente: 'a' })).toEqual(sortearRodada('es', { semente: 'a' }))
    const ids = (s: string) =>
      sortearRodada('es', { semente: s })
        .map((x) => x.id)
        .join()
    expect(new Set(['a', 'b', 'c', 'd', 'e'].map(ids)).size).toBeGreaterThan(1)
  })

  it('equilibra qual palavra toca e qual fica à esquerda (diferença de no máximo 1)', () => {
    for (const quantidade of [5, 6, 7, 8]) {
      for (let s = 0; s < 15; s++) {
        const r = sortearRodada('en', { quantidade, semente: s })
        const tocouAB = r.filter((x) => palavraTocada(x) === PARES_MINIMOS.en.find((p) => `${p.a}|${p.b}` === x.id)!.a)
        const aEsquerda = r.filter(
          (x) => x.opcoes[0].palavra === PARES_MINIMOS.en.find((p) => `${p.a}|${p.b}` === x.id)!.a,
        )
        expect(Math.abs(tocouAB.length - (r.length - tocouAB.length))).toBeLessThanOrEqual(1)
        expect(Math.abs(aEsquerda.length - (r.length - aEsquerda.length))).toBeLessThanOrEqual(1)
      }
    }
  })

  it('o contraste vem na ordem em que as opções aparecem', () => {
    for (const x of sortearRodada('fr', { semente: 3 })) {
      expect(x.contraste).toBe(rotuloDoContraste([x.opcoes[0].som, x.opcoes[1].som]))
      expect(palavraTocada(x)).toBe(x.opcoes[x.tocada].palavra)
    }
  })

  it('o que caiu há pouco só é demovido: sai da frente, e volta se faltar par', () => {
    const todos = PARES_MINIMOS.de.map((p) => `${p.a}|${p.b}`)
    const evitar = new Set(todos.slice(0, 6))
    const r = sortearRodada('de', { quantidade: 8, semente: 9, evitar })
    expect(r.filter((x) => evitar.has(x.id))).toHaveLength(0)
    /* Evitando quase tudo, a rodada ainda completa com o que foi evitado. */
    const quase = new Set(todos.slice(0, todos.length - 3))
    expect(sortearRodada('de', { quantidade: 8, semente: 9, evitar: quase }).length).toBeGreaterThanOrEqual(5)
  })
})

describe('conferir e resumir', () => {
  const rodada = sortearRodada('en', { quantidade: 8, semente: 'resumo' })

  it('conferirPar acerta só a posição da palavra que tocou', () => {
    for (const x of rodada) {
      expect(conferirPar(x, x.tocada)).toBe(true)
      expect(conferirPar(x, x.tocada === 0 ? 1 : 0)).toBe(false)
    }
  })

  it('sem erros, sem contrastes confundidos', () => {
    expect(resumirContrastes([])).toEqual([])
  })

  it('junta os pares do mesmo contraste (nas duas ordens) e ordena pelo que mais errou', () => {
    const faz = (a: string, sa: string, b: string, sb: string) => ({
      id: `${a}|${b}`,
      opcoes: [
        { palavra: a, som: sa },
        { palavra: b, som: sb },
      ] as const,
      tocada: 0 as const,
      contraste: rotuloDoContraste([sa, sb]),
    })
    const r = resumirContrastes([
      faz('thin', 'θ', 'sin', 's'),
      faz('ship', 'ɪ', 'sheep', 'iː'),
      faz('beat', 'iː', 'bit', 'ɪ'),
    ])
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ erros: 2, contraste: '/ɪ/ × /iː/' })
    expect(r[0].pares).toEqual(['ship × sheep', 'beat × bit'])
    expect(r[1]).toMatchObject({ erros: 1, contraste: '/θ/ × /s/' })
  })
})

describe('o gate do jogo (estadoDoJogo)', () => {
  const base = { cartas: [], frases: [], temAudio: false, fonteId: 'baralho' as const }

  it('abre para qualquer fonte, sem baralho, se há lista e voz', () => {
    for (const fonteId of ['baralho', 'sessao', 'trilha', 'dificeis'] as const) {
      const e = estadoDoJogo('paresMinimos', { ...base, fonteId, temVoz: true, lang: 'es' })
      expect(e).toMatchObject({ ok: true, fonte: 'idioma' })
      expect(e.tamanhoDaRodada).toBe(MINIGAMES.paresMinimos.maxItems)
    }
  })

  it('sem voz: motivo sem-voz; sem lista: motivo sem-lista-do-idioma', () => {
    expect(estadoDoJogo('paresMinimos', { ...base, temVoz: false, lang: 'en' })).toMatchObject({
      ok: false,
      motivo: 'sem-voz',
    })
    expect(estadoDoJogo('paresMinimos', { ...base, temVoz: true, lang: 'ja' })).toMatchObject({
      ok: false,
      motivo: 'sem-lista-do-idioma',
    })
  })
})

describe('nada vale por tempo (Decreto 12.880, art. 9º)', () => {
  it('responder rápido não rende bônus de velocidade nos pares de sons', () => {
    const rapido = [{ correct: true, attempts: 1, ms: 50 }]
    const lento = [{ correct: true, attempts: 1, ms: 60_000 }]
    expect(pontuarRodada('paresMinimos', rapido).bonusVelocidade).toBe(0)
    expect(pontuarRodada('paresMinimos', rapido).total).toBe(pontuarRodada('paresMinimos', lento).total)
  })

  it('a regra do jogo não pede relógio e não escreve no SRS', () => {
    expect(MINIGAMES.paresMinimos).toMatchObject({ writesSrs: false, doIdioma: true })
  })
})
