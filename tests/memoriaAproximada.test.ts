/**
 * MEMÓRIA DE TRADUÇÃO APROXIMADA (harness adaptativo §1.2, degrau M2): a frase QUASE igual a uma
 * já traduzida reaproveita a tradução — mas só quando a diferença não muda o sentido.
 *
 * O risco é o inverso do ganho: "I can go" e "I can't go" têm 3-gramas quase iguais e sentidos
 * opostos. Por isso a régua de similaridade sozinha não basta; número, negação, pronome e nome
 * próprio têm de bater exatamente, senão é falta (e a frase vai ao tradutor).
 */
import { describe, expect, it } from 'vitest'

import {
  criarIndiceAproximado,
  diferencaSegura,
  LIMIAR_APROXIMADA,
  LIMIAR_APROXIMADA_NUVEM,
  similaridade,
} from '../src/lib/traducao/memoriaAproximada'

describe('similaridade (Jaccard de 3-gramas de caractere)', () => {
  it('idêntica = 1; só pontuação/caixa diferente = 1', () => {
    expect(similaridade('how are you', 'how are you')).toBe(1)
    expect(similaridade('how are you?', 'How are you')).toBe(1)
  })

  it('frase diferente fica bem abaixo do limiar', () => {
    expect(similaridade('i love you', 'i loved you')).toBeLessThan(LIMIAR_APROXIMADA)
    expect(similaridade('good morning', 'good night')).toBeLessThan(0.5)
  })

  it('uma letra trocada: numa frase curta fica abaixo de 0,9; numa longa passa (é o caso da camada)', () => {
    expect(similaridade('i think we should go home now', 'i think we shoud go home now')).toBeLessThan(
      LIMIAR_APROXIMADA,
    )
    expect(
      similaridade(
        'i think we should really go back home before it gets dark',
        'i think we should realy go back home before it gets dark',
      ),
    ).toBeGreaterThanOrEqual(LIMIAR_APROXIMADA)
  })

  it('o limiar da nuvem é mais duro que o do local', () => {
    expect(LIMIAR_APROXIMADA).toBe(0.9)
    expect(LIMIAR_APROXIMADA_NUVEM).toBe(0.97)
  })
})

describe('diferença segura: número, negação, pronome e nome têm de bater', () => {
  it('erro de digitação/variação de grafia: segura', () => {
    expect(
      diferencaSegura(
        'i think we should realy go back home before it gets dark',
        'i think we should really go back home before it gets dark',
      ),
    ).toBe(true)
    expect(diferencaSegura('ok let us go', 'okay let us go')).toBe(true)
  })

  it('negação diferente: recusa (en, pt, es, contração)', () => {
    expect(diferencaSegura('i can go there today', "i can't go there today")).toBe(false)
    expect(diferencaSegura('i do like this movie', 'i do not like this movie')).toBe(false)
    expect(diferencaSegura('eu vou lá amanhã cedo', 'eu não vou lá amanhã cedo')).toBe(false)
    expect(diferencaSegura('eu sempre vou lá cedo', 'eu nunca vou lá cedo')).toBe(false)
    expect(diferencaSegura('yo quiero ir a casa', 'yo no quiero ir a casa')).toBe(false)
    expect(diferencaSegura('i will ever do it again', 'i will never do it again')).toBe(false)
  })

  it('número diferente: recusa (algarismo e por extenso)', () => {
    expect(diferencaSegura('see you at 7 tomorrow', 'see you at 8 tomorrow')).toBe(false)
    expect(diferencaSegura('i have two brothers', 'i have three brothers')).toBe(false)
    expect(diferencaSegura('tenho dois irmãos mais velhos', 'tenho três irmãos mais velhos')).toBe(false)
  })

  it('pronome diferente: recusa ("he" × "she" muda de quem se fala)', () => {
    expect(diferencaSegura('he is my best friend here', 'she is my best friend here')).toBe(false)
  })

  it('nome próprio diferente: recusa pela caixa do texto original', () => {
    expect(
      diferencaSegura('i met mary at the station', 'i met marc at the station', {
        consultaOriginal: 'I met Mary at the station',
      }),
    ).toBe(false)
  })

  it('nome do lado guardado: recusa quando a tradução guardada o traz em maiúscula', () => {
    expect(
      diferencaSegura('i met maria at the station', 'i met mario at the station', {
        traducaoCandidata: 'Conheci o Mario na estação',
      }),
    ).toBe(false)
  })

  it('"I" maiúsculo e a primeira palavra não contam como nome', () => {
    expect(
      diferencaSegura(
        'i think we should realy go back home before it gets dark',
        'i think we should really go back home before it gets dark',
        {
          consultaOriginal: 'I think we should realy go back home before it gets dark',
        },
      ),
    ).toBe(true)
  })
})

describe('índice aproximado', () => {
  it('acha a vizinha no MESMO par e ignora a de outro par', () => {
    const i = criarIndiceAproximado()
    i.adicionar('en|pt|i think we should really go back home before it gets dark')
    i.adicionar('en|es|i think we should realy go back home before it gets dark')
    const r = i.buscar('en|pt|i think we should realy go back home before it gets dark', LIMIAR_APROXIMADA)
    expect(r.map((c) => c.chave)).toEqual(['en|pt|i think we should really go back home before it gets dark'])
    expect(r[0].similaridade).toBeGreaterThanOrEqual(LIMIAR_APROXIMADA)
  })

  it('não devolve a própria chave e respeita a remoção', () => {
    const i = criarIndiceAproximado()
    i.adicionar('en|pt|how are you doing today')
    expect(i.buscar('en|pt|how are you doing today', 0.9)).toEqual([])
    i.adicionar('en|pt|how are you doing today?')
    expect(i.buscar('en|pt|how are you doing today', 0.9)).toHaveLength(1)
    i.remover('en|pt|how are you doing today?')
    expect(i.buscar('en|pt|how are you doing today', 0.9)).toEqual([])
  })

  it('limiar mais alto corta a vizinha que o baixo aceita', () => {
    const i = criarIndiceAproximado()
    i.adicionar('en|pt|i think we should really go back home before it gets dark')
    expect(i.buscar('en|pt|i think we should realy go back home before it gets dark', LIMIAR_APROXIMADA)).toHaveLength(
      1,
    )
    expect(
      i.buscar('en|pt|i think we should realy go back home before it gets dark', LIMIAR_APROXIMADA_NUVEM),
    ).toHaveLength(0)
  })

  it('DESEMPENHO: busca em 5.000 entradas fica em poucos ms no Node', () => {
    const palavras = (
      'the a we you they go come see want need like love know think make take give find tell ask ' +
      'work call try feel leave put mean keep let begin seem help talk turn start show hear play run ' +
      'move live believe hold bring happen write sit stand lose pay meet include continue set learn'
    ).split(' ')
    let semente = 42
    const aleatorio = () => (semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const frase = () =>
      Array.from(
        { length: 3 + Math.floor(aleatorio() * 9) },
        () => palavras[Math.floor(aleatorio() * palavras.length)],
      ).join(' ')
    const i = criarIndiceAproximado()
    const guardadas: string[] = []
    for (let k = 0; k < 5000; k++) {
      const f = frase()
      guardadas.push(f)
      i.adicionar(`en|pt|${f}`)
    }
    const consultas = Array.from({ length: 300 }, (_, k) => {
      const g = guardadas[(k * 17) % guardadas.length]
      return k % 2 ? `${g}s` : frase() // metade quase igual, metade qualquer
    })
    for (const c of consultas.slice(0, 20)) i.buscar(`en|pt|${c}`, LIMIAR_APROXIMADA) // aquece o JIT
    const t0 = performance.now()
    for (const c of consultas) i.buscar(`en|pt|${c}`, LIMIAR_APROXIMADA)
    const porBusca = (performance.now() - t0) / consultas.length
    expect(porBusca).toBeLessThan(3)
  })
})
