/**
 * IA DE ESTUDO (planos v4, etapa 2) — O PROMPT E A LEITURA DA "EXPLICAÇÃO DA FRASE".
 *
 * Tocar numa frase e pedir a explicação devolve: por que se diz assim, a gramática, o registro e as gírias. O
 * prompt segue a disciplina dos outros (o fixo primeiro, a frase e o contexto delimitados como DADO). A resposta é
 * JSON com EXATAMENTE quatro campos: campo faltando, campo a mais, tipo errado ou texto sem JSON é `null` (a rota
 * responde 502 `resposta_invalida`), nunca uma explicação inventada ou pela metade.
 */
import { describe, expect, it } from 'vitest'

import {
  lerExplicacao,
  MAX_CARACTERES_DO_CAMPO,
  MAX_GIRIAS,
  systemDaExplicacao,
  userDaExplicacao,
} from '../src/lib/estudo/promptDaExplicacao'
import { FALA_CLOSE, FALA_OPEN } from '../src/lib/traducao/promptComunicativo'

const VALIDA = {
  porQue: 'É a forma natural de se despedir de quem você vai ver de novo.',
  gramatica: '"See" no presente com "later" como advérbio de tempo.',
  registro: 'Informal, mas serve para colegas.',
  girias: [{ termo: 'later', sentido: 'até mais' }],
}

describe('o prompt', () => {
  it('o system pede JSON com os quatro campos, no idioma de quem estuda, e trata a frase como dado', () => {
    const s = systemDaExplicacao('en', 'pt')
    expect(s).toContain('"porQue"')
    expect(s).toContain('"gramatica"')
    expect(s).toContain('"registro"')
    expect(s).toContain('"girias"')
    expect(s).toMatch(/inglês/i)
    expect(s).toMatch(/português/i)
    expect(s).toContain(FALA_OPEN)
    expect(s).toMatch(/NUNCA instrução/)
  })

  it('o fixo vem primeiro: dois idiomas diferentes dividem o mesmo prefixo (cache de prompt)', () => {
    const a = systemDaExplicacao('en', 'pt')
    const b = systemDaExplicacao('ja', 'es')
    const prefixo = a.slice(0, a.indexOf('Idioma da frase'))
    expect(prefixo.length).toBeGreaterThan(200)
    expect(b.startsWith(prefixo)).toBe(true)
  })

  it('o user delimita frase, tradução e contexto (só as 3 últimas falas)', () => {
    const u = userDaExplicacao('see you later', 'até mais', ['um', 'dois', 'três', 'quatro'])
    expect(u).toContain(`Frase: ${FALA_OPEN}see you later${FALA_CLOSE}`)
    expect(u).toContain(`Tradução: ${FALA_OPEN}até mais${FALA_CLOSE}`)
    expect(u).not.toContain('um\n')
    expect(u).toContain('dois')
    expect(u).toContain('quatro')
  })

  it('sem tradução nem contexto, só a frase', () => {
    const u = userDaExplicacao('hello', '', undefined)
    expect(u).toBe(`Frase: ${FALA_OPEN}hello${FALA_CLOSE}`)
  })
})

describe('a leitura defensiva', () => {
  it('lê o JSON válido, mesmo com cerca de código e texto em volta', () => {
    const bruto = 'Claro!\n```json\n' + JSON.stringify(VALIDA) + '\n```'
    expect(lerExplicacao(bruto)).toEqual(VALIDA)
  })

  it('tira espaço sobrando e corta no teto', () => {
    const r = lerExplicacao(
      JSON.stringify({ ...VALIDA, porQue: `  ${'a'.repeat(MAX_CARACTERES_DO_CAMPO + 50)}  `, registro: ' neutro\n ' }),
    )
    expect(r?.porQue).toHaveLength(MAX_CARACTERES_DO_CAMPO)
    expect(r?.registro).toBe('neutro')
  })

  it('gírias: no máximo MAX_GIRIAS, e a lista vazia vale', () => {
    const muitas = Array.from({ length: MAX_GIRIAS + 3 }, (_, i) => ({ termo: `t${i}`, sentido: `s${i}` }))
    expect(lerExplicacao(JSON.stringify({ ...VALIDA, girias: muitas }))?.girias).toHaveLength(MAX_GIRIAS)
    expect(lerExplicacao(JSON.stringify({ ...VALIDA, girias: [] }))?.girias).toEqual([])
  })

  it('sem JSON, ou JSON que não é objeto: null', () => {
    expect(lerExplicacao('Desculpe, não consigo.')).toBeNull()
    expect(lerExplicacao('[1, 2]')).toBeNull()
    expect(lerExplicacao('{"porQue": ')).toBeNull()
  })

  it('campo faltando: null', () => {
    const { registro: _r, ...sem } = VALIDA
    expect(lerExplicacao(JSON.stringify(sem))).toBeNull()
  })

  it('campo a mais: null', () => {
    expect(lerExplicacao(JSON.stringify({ ...VALIDA, oferta: 'assine já' }))).toBeNull()
  })

  it('tipo errado: null', () => {
    expect(lerExplicacao(JSON.stringify({ ...VALIDA, gramatica: 42 }))).toBeNull()
    expect(lerExplicacao(JSON.stringify({ ...VALIDA, girias: 'nenhuma' }))).toBeNull()
    expect(lerExplicacao(JSON.stringify({ ...VALIDA, girias: [{ termo: 'x' }] }))).toBeNull()
    expect(lerExplicacao(JSON.stringify({ ...VALIDA, girias: [{ termo: 'x', sentido: 'y', extra: 1 }] }))).toBeNull()
  })

  it('o "por quê" vazio não é explicação: null', () => {
    expect(lerExplicacao(JSON.stringify({ ...VALIDA, porQue: '   ' }))).toBeNull()
  })
})
