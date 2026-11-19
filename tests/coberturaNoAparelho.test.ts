import { describe, expect, it } from 'vitest'

import { coberturaNoAparelho, modelosDoParNoAparelho } from '../src/core/traducao/coberturaNoAparelho'
import { passaPeloIngles } from '../src/core/traducao/viaIngles'

/**
 * CEL-01 (auditoria de 17/11/2026): espanhol → português no celular, sem nativo e sem nuvem, não tinha rota
 * nenhuma — 9 de 9 falas sem tradução. Todo par entre pt, es, fr, it e de tem de ter rota no aparelho.
 */
const CINCO = ['pt', 'es', 'fr', 'it', 'de'] as const
const PARES = CINCO.flatMap((a) => CINCO.filter((b) => b !== a).map((b) => [a, b] as const))
const SEM_NADA = { nativo: false, nuvemAutorizada: false, bergamotNoCdn: false }

describe('coberturaNoAparelho: a matriz dos 20 pares', () => {
  it('são 20 pares ordenados', () => expect(PARES).toHaveLength(20))

  it.each(PARES)('%s → %s tem rota no aparelho sem nativo e sem nuvem', (de, para) => {
    const c = coberturaNoAparelho(de, para, SEM_NADA)
    expect(c.rota).not.toBe('sem-rota')
    expect(['direta', 'pelo-ingles']).toContain(c.rota)
    expect(c.mb).toBeGreaterThan(0)
  })

  it('nenhum par entre os cinco tem modelo direto: todos passam pelo inglês', () => {
    for (const [de, para] of PARES) expect(passaPeloIngles(de, para), `${de}→${para}`).toBe(true)
  })

  it('hindi → português sem nativo e sem nuvem: sem rota', () => {
    expect(coberturaNoAparelho('hi', 'pt', SEM_NADA)).toEqual({ rota: 'sem-rota', modelos: [], mb: 0 })
  })

  it('hindi → português com a nuvem autorizada: nuvem', () => {
    expect(coberturaNoAparelho('hi', 'pt', { ...SEM_NADA, nuvemAutorizada: true }).rota).toBe('nuvem')
  })
})

describe('coberturaNoAparelho: a ordem das rotas', () => {
  it('o nativo vem antes de tudo e não baixa nada', () => {
    expect(coberturaNoAparelho('es', 'pt', { ...SEM_NADA, nativo: true })).toEqual({
      rota: 'nativo',
      modelos: [],
      mb: 0,
    })
  })

  it('a nuvem autorizada vem antes do pivô (o inglês no meio piora o que a nuvem faz bem)', () => {
    expect(coberturaNoAparelho('es', 'pt', { ...SEM_NADA, nuvemAutorizada: true }).rota).toBe('nuvem')
  })

  it('o modelo direto vem antes da nuvem (en → pt é local mesmo com a nuvem autorizada)', () => {
    const c = coberturaNoAparelho('en', 'pt', { ...SEM_NADA, nuvemAutorizada: true })
    expect(c.rota).toBe('direta')
    expect(c.modelos).toEqual(['Xenova/opus-mt-en-ROMANCE'])
  })

  it('mesmo idioma: nada a traduzir', () => {
    expect(coberturaNoAparelho('pt-BR', 'pt', SEM_NADA)).toEqual({ rota: 'mesmo-idioma', modelos: [], mb: 0 })
  })
})

describe('coberturaNoAparelho: o download soma as duas pernas', () => {
  it('es → pt sem o CDN: opus-mt es-en + en-ROMANCE (2 × 113 MB)', () => {
    const c = coberturaNoAparelho('es', 'pt', SEM_NADA)
    expect(c.rota).toBe('pelo-ingles')
    expect(c.modelos).toEqual(['Xenova/opus-mt-es-en', 'Xenova/opus-mt-en-ROMANCE'])
    expect(c.mb).toBe(226)
  })

  it('es → pt com o CDN do Bergamot: bergamot/es-en (~32 MB) + en-ROMANCE', () => {
    const c = coberturaNoAparelho('es', 'pt', { ...SEM_NADA, bergamotNoCdn: true })
    expect(c.modelos).toEqual(['bergamot/es-en', 'Xenova/opus-mt-en-ROMANCE'])
    expect(c.mb).toBe(32 + 113)
  })

  it('quem chama pode dar o tamanho real de cada modelo', () => {
    const c = coberturaNoAparelho('es', 'pt', {
      ...SEM_NADA,
      mbDoModelo: (id) => (id.startsWith('bergamot/') ? 30 : 100),
    })
    expect(c.mb).toBe(200)
  })

  it('pt → es: a perna pt→en é do ROMANCE-en (ou do Bergamot embutido)', () => {
    expect(modelosDoParNoAparelho('pt', 'es', {})).toEqual(['Xenova/opus-mt-ROMANCE-en', 'Xenova/opus-mt-en-es'])
    expect(modelosDoParNoAparelho('pt', 'es', { bergamot: (par) => par === 'pt-en' })).toEqual([
      'bergamot/pt-en',
      'Xenova/opus-mt-en-es',
    ])
  })

  it('a perna X→en do opus-mt é o modelo dedicado (o mesmo que o adaptador carrega)', () => {
    expect(modelosDoParNoAparelho('de', 'fr', {})).toEqual(['Xenova/opus-mt-de-en', 'Xenova/opus-mt-en-fr'])
    expect(modelosDoParNoAparelho('es', 'en', {})).toEqual(['Xenova/opus-mt-es-en'])
  })

  it('os pares que já existiam seguem iguais', () => {
    expect(modelosDoParNoAparelho('en', 'pt', {})).toEqual(['Xenova/opus-mt-en-ROMANCE'])
    // en→es é o dedicado (o mesmo que o adaptador carrega; a lista dizia en-ROMANCE e o cache nunca batia).
    expect(modelosDoParNoAparelho('en', 'es', {})).toEqual(['Xenova/opus-mt-en-es'])
    expect(modelosDoParNoAparelho('ja', 'pt', {})).toEqual(['Xenova/opus-mt-ja-en', 'Xenova/opus-mt-en-ROMANCE'])
    expect(modelosDoParNoAparelho('zh', 'de', {})).toEqual(['Xenova/opus-mt-zh-en', 'Xenova/opus-mt-en-de'])
    expect(modelosDoParNoAparelho('ro', 'en', {})).toEqual(['Xenova/opus-mt-ROMANCE-en'])
    expect(modelosDoParNoAparelho('hi', 'pt', {})).toEqual([])
  })
})
