// @vitest-environment jsdom
/**
 * A CHAVE DA VERSÃO ATIVA NO CLIENTE (openspec `modelo-do-aluno-e-dados`, 5.4): com a flag `chave_dedup_v2` ligada, a
 * palavra marcada `año` (es) e a de circunflexo (pt) casam na legenda e no leitor; com a flag desligada nada muda
 * (v1, tudo sem marca); e a chave do cliente é a MESMA que o servidor grava (paridade).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  geracaoDeEscritas: vi.fn(() => 0),
  fetchDeck: vi.fn(async () => []),
  fetchSessions: vi.fn(async () => []),
  fetchPalavrasVistas: vi.fn(async () => null),
  fetchPalavrasMarcadas: vi.fn(),
  marcarPalavra: vi.fn(async () => true),
  desmarcarPalavra: vi.fn(async () => true),
}))
vi.mock('../src/data/api', () => api)

import { definirVersaoDaChaveDedup, versaoDaChaveDedup } from '../server/lib/versaoDaChaveDedup'
import { coberturaDoTexto } from '../src/core/leitura/coberturaDoTexto'
import { FLAG_CHAVE_DEDUP_V2 } from '../src/core/planos'
import { chaveAtiva, chaveDedupAtiva, registrarVersaoDaChave } from '../src/core/texto/chaveAtiva'
import { chaveDaPalavraNaVersao, chaveDedup } from '../src/core/texto/palavra'
import { chavesDoTexto } from '../src/core/texto/palavrasVistas'
import { palavrasDoTexto } from '../src/core/texto/segmentacao'
import {
  chaveIndexavel,
  etiquetaDaPalavra,
  montarIndiceDoCaderno,
  type VistasDoIdioma,
} from '../src/core/vocabulario/etiquetas'
import { chavesConhecidas, montarIndiceDeMarcadas } from '../src/core/vocabulario/marcadas'
import { pedacosDaLegenda } from '../src/lib/estilosDeLegenda'
import {
  carregarMarcadas,
  esquecerIndiceDeEtiquetas,
  lerSnapshotDasEtiquetas,
  marcarNoIndice,
} from '../src/lib/etiquetas/indiceDeEtiquetas'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'
import { palavrasAprendidas } from '../src/lib/palavrasAprendidas'
import { chaveDedupV2Ativa, ligarAVersaoDaChave, versaoDaChaveDoCliente } from '../src/lib/versaoDaChave'
import type { VocabCard } from '../src/types'

const LIGADA = { [FLAG_CHAVE_DEDUP_V2]: { ligada: true } }

/** Liga ou desliga a flag como o app a veria (cache das flags) e registra a fonte da versão, como o `main.tsx`. */
function flag(ligada: boolean) {
  definirEstadoDasFlags(ligada ? LIGADA : {})
  ligarAVersaoDaChave()
}

beforeEach(() => {
  esquecerIndiceDeEtiquetas()
  vi.clearAllMocks()
  api.fetchPalavrasMarcadas.mockResolvedValue([])
})
afterEach(() => {
  registrarVersaoDaChave(null)
  definirEstadoDasFlags(null)
  definirVersaoDaChaveDedup(1)
  vi.unstubAllEnvs()
})

describe('de onde vem a versão no cliente', () => {
  it('com servidor: segue a flag `chave_dedup_v2`', () => {
    flag(false)
    expect(versaoDaChaveDoCliente()).toBe(1)
    flag(true)
    expect(versaoDaChaveDoCliente()).toBe(2)
  })

  it('edição estática: v1 por padrão, mesmo com a flag no cache; só o `VITE_CHAVE_DEDUP_V2=1` do build liga', () => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
    flag(true)
    expect(versaoDaChaveDoCliente()).toBe(1)
    vi.stubEnv('VITE_CHAVE_DEDUP_V2', '1')
    expect(versaoDaChaveDoCliente()).toBe(2)
  })

  it('a regra pura', () => {
    expect(chaveDedupV2Ativa({ edicaoEstatica: true, envDoBuild: undefined, flagDoServidor: true })).toBe(false)
    expect(chaveDedupV2Ativa({ edicaoEstatica: false, envDoBuild: '1', flagDoServidor: false })).toBe(false)
    expect(chaveDedupV2Ativa({ edicaoEstatica: false, envDoBuild: undefined, flagDoServidor: true })).toBe(true)
  })

  it('sem registro (testes do núcleo, ou fora do app) a versão é 1', () => {
    expect(chaveAtiva('año', 'es')).toBe('ano')
  })
})

const cartao = (word: string, srcLang: string, extra: Partial<VocabCard> = {}) =>
  ({ id: word, word, srcLang, inDeck: true, ...extra }) as VocabCard

describe('legenda: a palavra do caderno e a marcada casam com a da tela', () => {
  const caderno = (lang: string, palavra: string) =>
    montarIndiceDoCaderno([{ palavra, lang, estado: 'aprendendo' as const }])

  it('flag ligada: `año` (es) no caderno pinta `año` e NÃO `ano`; `avô` (pt) não pinta `avó`', () => {
    flag(true)
    const es = caderno('es', 'año')
    expect(etiquetaDaPalavra('Año!', 'es', es, { nova: false })).toBe('aprendendo')
    expect(etiquetaDaPalavra('ano', 'es', es, { nova: false })).toBeUndefined()
    const pt = caderno('pt-BR', 'avô')
    expect(etiquetaDaPalavra('AVÔ', 'pt-BR', pt, { nova: false })).toBe('aprendendo')
    expect(etiquetaDaPalavra('avó', 'pt-BR', pt, { nova: false })).toBeUndefined()
    // o acento tônico segue sem distinguir: Água = agua
    expect(etiquetaDaPalavra('água', 'pt', caderno('pt', 'agua'), { nova: false })).toBe('aprendendo')
  })

  it('flag desligada: nada muda, `año` e `ano` são a mesma palavra', () => {
    flag(false)
    const es = caderno('es', 'año')
    expect(etiquetaDaPalavra('ano', 'es', es, { nova: false })).toBe('aprendendo')
    expect(etiquetaDaPalavra('año', 'es', es, { nova: false })).toBe('aprendendo')
    expect(etiquetaDaPalavra('avó', 'pt', caderno('pt', 'avô'), { nova: false })).toBe('aprendendo')
  })

  it('a marcada que o servidor devolve em v2 (`año`, `avô`) casa na legenda; em v1 a lista antiga continua casando', () => {
    flag(true)
    const marcadas = montarIndiceDeMarcadas([
      { lang: 'es', chave: 'año', estado: 'conhecida' },
      { lang: 'pt', chave: 'avô', estado: 'ignorada' },
    ])
    expect(etiquetaDaPalavra('Año', 'es', null, { nova: false, marcadas })).toBe('conhecida')
    expect(etiquetaDaPalavra('ano', 'es', null, { nova: false, marcadas })).toBeUndefined()
    expect(etiquetaDaPalavra('avô', 'pt-BR', null, { nova: false, marcadas })).toBe('ignorada')
    expect(etiquetaDaPalavra('avó', 'pt-BR', null, { nova: false, marcadas })).toBeUndefined()

    flag(false)
    const antigas = montarIndiceDeMarcadas([{ lang: 'es', chave: 'ano', estado: 'conhecida' }])
    expect(etiquetaDaPalavra('Año', 'es', null, { nova: false, marcadas: antigas })).toBe('conhecida')
  })

  it('"nova para você": a palavra vista (chave v2) não ganha o ponto, e a funcional com marca nunca ganha', () => {
    flag(true)
    const vistas: VistasDoIdioma = { chaves: new Set(['avô', 'año']), truncado: false, sessoes: 5 }
    const o = { nova: true, langDaPessoa: 'pt', vistas }
    expect(etiquetaDaPalavra('año', 'es', null, o)).toBeUndefined()
    expect(etiquetaDaPalavra('niño', 'es', null, o)).toBe('nova-para-voce')
    // `où` é funcional em francês (v1 `ou`): o servidor não a indexa, então o ponto não pode aparecer
    expect(chaveIndexavel(chaveAtiva('où', 'fr'), 'fr')).toBe(false)
    expect(
      etiquetaDaPalavra('où', 'fr', null, { ...o, vistas: { chaves: new Set(), truncado: false, sessoes: 5 } }),
    ).toBeUndefined()
  })

  it('as aprendidas da legenda (conjunto sem idioma) casam por idioma na v2 e juntam as duas na v1', () => {
    const cartas = [cartao('año', 'es'), cartao('avô', 'pt')]
    flag(true)
    const v2 = palavrasAprendidas(cartas)
    expect(
      pedacosDaLegenda('Tiene un año', v2, 'es')
        .filter((p) => p.aprendida)
        .map((p) => p.texto),
    ).toEqual(['año'])
    expect(pedacosDaLegenda('Tiene un ano', v2, 'es').some((p) => p.aprendida)).toBe(false)
    expect(
      pedacosDaLegenda('meu avô', v2, 'pt-BR')
        .filter((p) => p.aprendida)
        .map((p) => p.texto),
    ).toEqual(['avô'])
    expect(pedacosDaLegenda('minha avó', v2, 'pt-BR').some((p) => p.aprendida)).toBe(false)
    flag(false)
    const v1 = palavrasAprendidas(cartas)
    expect(
      pedacosDaLegenda('Tiene un ano', v1, 'es')
        .filter((p) => p.aprendida)
        .map((p) => p.texto),
    ).toEqual(['ano'])
  })
})

describe('leitor: a cobertura e as conhecidas usam a mesma chave', () => {
  it('flag ligada: `avô` conhecida cobre `avô` no texto e não `avó`', () => {
    flag(true)
    const marcadas = montarIndiceDeMarcadas([{ lang: 'pt', chave: 'avô', estado: 'conhecida' }])
    const conhecidas = chavesConhecidas(null, marcadas, 'pt')
    expect(coberturaDoTexto('Meu avô chegou.', 'pt', conhecidas).desconhecidas).not.toContain('avô')
    expect(coberturaDoTexto('Minha avó chegou.', 'pt', conhecidas).desconhecidas).toContain('avo')
  })

  it('flag desligada: as duas são a mesma palavra, como sempre', () => {
    flag(false)
    const marcadas = montarIndiceDeMarcadas([{ lang: 'pt', chave: 'avô', estado: 'conhecida' }])
    const conhecidas = chavesConhecidas(null, marcadas, 'pt')
    expect(coberturaDoTexto('Minha avó chegou.', 'pt', conhecidas).desconhecidas).not.toContain('avo')
  })
})

describe('índice das etiquetas: o que vai ao servidor e o que fica no snapshot', () => {
  it('marcar `Año` manda a chave v2 com a flag ligada e a v1 com ela desligada', async () => {
    flag(true)
    await marcarNoIndice('Año', 'es', 'conhecida')
    expect(api.marcarPalavra).toHaveBeenLastCalledWith('es', 'año', 'conhecida')
    expect(lerSnapshotDasEtiquetas().marcadas?.get('es')?.get('año')).toBe('conhecida')

    esquecerIndiceDeEtiquetas()
    flag(false)
    await marcarNoIndice('Año', 'es', 'conhecida')
    expect(api.marcarPalavra).toHaveBeenLastCalledWith('es', 'ano', 'conhecida')
  })

  it('a lista que o servidor devolve em v2 entra no índice sem perder a marca', async () => {
    flag(true)
    api.fetchPalavrasMarcadas.mockResolvedValue([{ lang: 'pt', chave: 'avô', estado: 'conhecida', atualizadoEm: 1 }])
    await carregarMarcadas()
    expect(lerSnapshotDasEtiquetas().marcadas?.get('pt')?.get('avô')).toBe('conhecida')
  })

  it('a flag que muda depois do primeiro índice refaz as chaves (sem recarregar a página)', async () => {
    flag(false)
    api.fetchPalavrasMarcadas.mockResolvedValue([{ lang: 'es', chave: 'ano', estado: 'conhecida', atualizadoEm: 1 }])
    const { useSnapshotDasEtiquetas } = await import('../src/lib/etiquetas/indiceDeEtiquetas')
    const { renderHook, waitFor, cleanup } = await import('@testing-library/react')
    const { result } = renderHook(() => useSnapshotDasEtiquetas())
    await waitFor(() => expect(result.current.marcadas?.get('es')?.get('ano')).toBe('conhecida'))
    // o servidor passou a v2 e a lista relida vem com a chave v2
    api.fetchPalavrasMarcadas.mockResolvedValue([{ lang: 'es', chave: 'año', estado: 'conhecida', atualizadoEm: 1 }])
    flag(true)
    window.dispatchEvent(new Event('babel_flags_changed'))
    await waitFor(() => expect(result.current.marcadas?.get('es')?.get('año')).toBe('conhecida'))
    cleanup()
  })
})

/* ── paridade com o servidor ── */

const PALAVRAS: Array<[palavra: string, lang: string]> = [
  ['año', 'es'],
  ['Año!', 'es-MX'],
  ['avô', 'pt-BR'],
  ['avó', 'pt'],
  ['Água', 'pt-BR'],
  ['mão', 'pt'],
  ['caça', 'pt'],
  ['schön', 'de'],
  ['Schön', 'de-DE'],
  ['où', 'fr'],
  ['sûr', 'fr'],
  ['café', 'fr'],
  ['café', 'en-US'],
  ['がっこう', 'ja'],
  ['й', 'ru'],
  ['', 'es'],
]

describe('paridade cliente x servidor', () => {
  it.each([1, 2] as const)('versão %i: o cliente monta a MESMA chave que o servidor grava', (versao) => {
    definirVersaoDaChaveDedup(versao)
    registrarVersaoDaChave(versaoDaChaveDedup)
    for (const [palavra, lang] of PALAVRAS) {
      // `norm_key` do cartão (server/db/repositories/vocab.ts) e a chave de `/marcadas`, `/palavra` e do índice
      expect(chaveDedupAtiva(palavra, lang), `${palavra}|${lang}`).toBe(chaveDedup(palavra, lang, versaoDaChaveDedup()))
      expect(chaveAtiva(palavra, lang)).toBe(chaveDaPalavraNaVersao(palavra, lang, versaoDaChaveDedup()))
      expect(chaveDedupAtiva(palavra, lang)).toBe(`${lang.toLowerCase().split('-')[0]}|${chaveAtiva(palavra, lang)}`)
    }
  })

  it.each([1, 2] as const)('versão %i: toda palavra vista que o servidor indexa é achada pela legenda', (versao) => {
    definirVersaoDaChaveDedup(versao)
    registrarVersaoDaChave(versaoDaChaveDedup)
    const frases: Array<[string, string]> = [
      ['Tiene diez años y un niño llamado Año', 'es'],
      ['O avô e a avó compraram uma caça na mão', 'pt-BR'],
      ['Das schöne Mädchen ist schön', 'de'],
      ['Où est le sûr ça', 'fr'],
    ]
    for (const [texto, lang] of frases) {
      const base = lang.split('-')[0]
      const doServidor = new Set(chavesDoTexto(texto, lang, versaoDaChaveDedup()))
      const daTela = new Set(palavrasDoTexto(texto, base).map((p) => chaveAtiva(p, base)))
      for (const chave of doServidor) expect(daTela.has(chave), `${lang}: ${chave}`).toBe(true)
    }
  })

  it('com a flag ligada o cliente e o servidor concordam em separar año de ano; desligada, em juntar', () => {
    definirVersaoDaChaveDedup(2)
    registrarVersaoDaChave(versaoDaChaveDedup)
    expect(chaveAtiva('año', 'es')).not.toBe(chaveAtiva('ano', 'es'))
    definirVersaoDaChaveDedup(1)
    expect(chaveAtiva('año', 'es')).toBe(chaveAtiva('ano', 'es'))
  })
})
