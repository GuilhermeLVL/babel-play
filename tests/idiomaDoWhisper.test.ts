/**
 * O IDIOMA QUE O MOTOR JÁ MEDIU.
 *
 * O Whisper identifica o idioma a partir do ÁUDIO, dentro do decode. O proxy pedia
 * `response_format: 'json'`, que devolve só `{ text }`, e o cliente reconstruía o idioma passando o
 * texto por um detector de palavras-função — que não tem sinal em fala curta. Foi assim que uma
 * sessão inteira em espanhol apareceu com a bandeira do inglês.
 *
 * `verbose_json` traz `language` no mesmo custo de API. Falta normalizar, porque cada provedor
 * escreve de um jeito: a OpenAI devolve o nome em inglês, a Groq o código, e há compatíveis que
 * devolvem BCP-47.
 */
import { describe, it, expect } from 'vitest'
import { normalizarIdiomaDoWhisper } from '../server/lib/idiomaDoWhisper'

describe('normalizar o idioma devolvido pelo provedor', () => {
  it('nome em inglês (OpenAI) → ISO-639-1', () => {
    expect(normalizarIdiomaDoWhisper('spanish')).toBe('es')
    expect(normalizarIdiomaDoWhisper('portuguese')).toBe('pt')
    expect(normalizarIdiomaDoWhisper('english')).toBe('en')
  })

  it('tolera caixa e espaços — o provedor escreve como quiser', () => {
    expect(normalizarIdiomaDoWhisper('  Spanish ')).toBe('es')
    expect(normalizarIdiomaDoWhisper('CZECH')).toBe('cs')
  })

  it('código já pronto passa direto', () => {
    expect(normalizarIdiomaDoWhisper('es')).toBe('es')
    expect(normalizarIdiomaDoWhisper('PT')).toBe('pt')
  })

  it('BCP-47 vira a base', () => {
    expect(normalizarIdiomaDoWhisper('es-ES')).toBe('es')
    expect(normalizarIdiomaDoWhisper('pt_BR')).toBe('pt')
  })

  it('ausência é ausência: devolve vazio em vez de inventar', () => {
    // Vazio significa "não sei" — o cliente volta ao detector de texto. Chutar um código aqui
    // envenenaria o perfil adaptativo com um voto falso.
    expect(normalizarIdiomaDoWhisper(undefined)).toBe('')
    expect(normalizarIdiomaDoWhisper(null)).toBe('')
    expect(normalizarIdiomaDoWhisper('')).toBe('')
    expect(normalizarIdiomaDoWhisper('   ')).toBe('')
  })

  it('idioma que não conhecemos também devolve vazio', () => {
    expect(normalizarIdiomaDoWhisper('klingon')).toBe('')
    expect(normalizarIdiomaDoWhisper('serbo-croatian')).toBe('')
  })

  it('cobre os idiomas de script próprio, onde o detector de texto até funciona bem', () => {
    expect(normalizarIdiomaDoWhisper('japanese')).toBe('ja')
    expect(normalizarIdiomaDoWhisper('russian')).toBe('ru')
    expect(normalizarIdiomaDoWhisper('arabic')).toBe('ar')
  })

  it('e os latinos parecidos, onde ele erra — que é o motivo de tudo isto existir', () => {
    expect(normalizarIdiomaDoWhisper('catalan')).toBe('ca')
    expect(normalizarIdiomaDoWhisper('galician')).toBe('gl')
    expect(normalizarIdiomaDoWhisper('romanian')).toBe('ro')
  })
})
