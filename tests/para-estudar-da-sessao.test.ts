/**
 * "PARA ESTUDAR DESTA SESSÃO" (spec `frases-i-mais-1`): frases i+1 e palavras novas, com a régua da cobertura.
 */
import { describe, expect, it } from 'vitest'

import { paraEstudarDaSessao } from '../src/core/leitura/paraEstudarDaSessao'

const falas = (...textos: string[]) => textos.map((texto) => ({ texto, lang: 'en' }))
/** Preenchimento conhecido para passar do mínimo de 30 palavras. */
const ENCHIMENTO = 'I like the house and the dog. We go to the park with the dog and the cat every day.'
const SABIDAS = new Set([
  'like',
  'house',
  'dog',
  'go',
  'park',
  'cat',
  'day',
  'every',
  'eat',
  'good',
  'food',
  'very',
  'cook',
])

describe('paraEstudarDaSessao', () => {
  it('frase com exatamente UMA desconhecida vira i+1, com a palavra-alvo e o destaque', () => {
    const r = paraEstudarDaSessao(
      falas('We eat good food every day.', 'I cook very delicious food.', ENCHIMENTO, ENCHIMENTO),
      'en',
      SABIDAS,
    )!
    expect(r.frases.map((f) => f.palavra)).toEqual(['delicious'])
    const f = r.frases[0]!
    expect(f.frase.slice(f.destaque.inicio, f.destaque.fim)).toBe('delicious')
    expect(f.fala).toBe(1)
  })

  it('duas desconhecidas na frase: não é i+1, mas as palavras entram na lista', () => {
    const r = paraEstudarDaSessao(
      falas('I cook very delicious wonderful food.', ENCHIMENTO, ENCHIMENTO),
      'en',
      SABIDAS,
    )!
    expect(r.frases).toEqual([])
    expect(r.palavras.map((p) => p.palavra).sort()).toEqual(['delicious', 'wonderful'])
  })

  it('ignora funcionais e nomes próprios (como a cobertura) e a flexão conta como a palavra', () => {
    const r = paraEstudarDaSessao(
      falas('Then Maria and I cooked the good dogs.', 'We saw Maria at the park today.', ENCHIMENTO, ENCHIMENTO),
      'en',
      SABIDAS,
    )!
    const novas = r.palavras.map((p) => p.palavra)
    expect(novas).not.toContain('maria')
    expect(novas).not.toContain('the')
    expect(novas).not.toContain('cooked')
    expect(novas).not.toContain('dogs')
    expect(novas).toContain('saw')
  })

  it('frase curta demais ou longa demais não é candidata', () => {
    const longa = `${'dog '.repeat(25)}delicious.`
    const r = paraEstudarDaSessao(falas('Delicious food.', longa, ENCHIMENTO, ENCHIMENTO), 'en', SABIDAS)!
    expect(r.frases).toEqual([])
  })

  it('ordena por frequência na sessão e, no empate, pelo nível CEFR mais baixo', () => {
    const r = paraEstudarDaSessao(
      falas(
        'We eat very delicious food.',
        'I cook very delicious food.',
        'I cook very delicious food again.',
        'We eat very yummy food.',
        'We eat very scrumptious food.',
        ENCHIMENTO,
      ),
      'en',
      SABIDAS,
    )!
    expect(r.palavras[0]).toMatchObject({ palavra: 'delicious', vezes: 3 })
    expect(r.frases[0]!.palavra).toBe('delicious')
    expect(r.frases.map((f) => f.vezes)).toEqual([...r.frases.map((f) => f.vezes)].sort((a, b) => b - a))
  })

  it('uma frase por palavra-alvo, a de tamanho mais próximo do ideal', () => {
    const r = paraEstudarDaSessao(
      falas('We cook delicious food.', 'We eat good food every day and I cook very delicious food.', ENCHIMENTO),
      'en',
      SABIDAS,
    )!
    expect(r.frases.filter((f) => f.palavra === 'delicious')).toHaveLength(1)
    expect(r.frases[0]!.fala).toBe(1)
  })

  it('traz o nível CEFR quando a lista do idioma tem a palavra, e null quando não tem', () => {
    const r = paraEstudarDaSessao(falas('I cook very zzxqw food.', ENCHIMENTO, ENCHIMENTO), 'en', SABIDAS)!
    expect(r.palavras.find((p) => p.palavra === 'zzxqw')!.nivel).toBeNull()
    const c = paraEstudarDaSessao(falas('I cook very wonderful food.', ENCHIMENTO, ENCHIMENTO), 'en', SABIDAS)!
    expect(c.palavras.find((p) => p.palavra === 'wonderful')!.nivel).toBe('A1')
  })

  it('portão de honestidade: idioma sem espaço, pouco texto e fala de outro idioma não contam', () => {
    expect(paraEstudarDaSessao(falas('私は毎日学校に行きます。'.repeat(40)), 'ja', new Set())).toBeNull()
    expect(paraEstudarDaSessao(falas('I cook delicious food.'), 'en', SABIDAS)).toBeNull()
    const misto = [{ texto: 'Je mange une pomme rouge ici.'.repeat(10), lang: 'fr' }, ...falas(ENCHIMENTO, ENCHIMENTO)]
    const r = paraEstudarDaSessao(misto, 'en', SABIDAS)!
    expect(r.palavras.map((p) => p.palavra)).not.toContain('pomme')
  })

  it('francês: a elisão não vira palavra e o destaque aponta a palavra, não o "l\'"', () => {
    const fr = "Il mange l'homme rouge aujourd'hui. ".repeat(1)
    const base = 'Je mange la pomme et le pain avec le chat dans la maison tous les jours. '.repeat(3)
    const sabidas = new Set(['manger', 'homme', 'pomme', 'pain', 'chat', 'maison', 'jour', 'tout'])
    const r = paraEstudarDaSessao(
      [
        { texto: base, lang: 'fr' },
        { texto: fr, lang: 'fr' },
      ],
      'fr',
      sabidas,
    )!
    expect(r.palavras.map((p) => p.palavra)).not.toContain("l'homme")
    for (const f of r.frases) expect(f.frase.slice(f.destaque.inicio, f.destaque.fim)).toBe(f.palavra)
  })

  it('o índice da fala é o da lista recebida, mesmo com falas de outro idioma no meio', () => {
    const lista = [
      { texto: 'Bonjour tout le monde.', lang: 'fr' },
      ...falas('I cook very delicious food.', ENCHIMENTO, ENCHIMENTO),
    ]
    expect(paraEstudarDaSessao(lista, 'en', SABIDAS)!.frases[0]!.fala).toBe(1)
  })
})
