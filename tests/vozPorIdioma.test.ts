// @vitest-environment jsdom
/**
 * TER O MOTOR DE VOZ NÃO É TER A VOZ DO IDIOMA.
 *
 * O portão dos jogos de escuta da trilha perguntava só se o navegador tem `speechSynthesis` — e
 * a resposta é sim em praticamente todo lugar. Um Chrome sem o pacote de francês abria Ditado,
 * Qual foi? e Karaokê da trilha francesa e não falava nada. `hasVoiceFor` existia desde sempre e
 * nunca tinha sido chamada (achado F25).
 *
 * A regra difícil não é essa, é a outra: `getVoices()` volta VAZIO no primeiro acesso e só popula
 * no evento `voiceschanged`. Enquanto a lista não chegou, "não achei voz" quer dizer "ainda não
 * sei" — e bloquear por informação ausente daria um jogo trancado por engano, que é pior que o
 * defeito original.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

type VozFalsa = { lang: string; name: string }

function instalarVozes(vozes: VozFalsa[]) {
  const ouvintes: Array<() => void> = []
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => vozes,
      addEventListener: (_: string, cb: () => void) => {
        ouvintes.push(cb)
      },
      removeEventListener: vi.fn(),
      speak: vi.fn(),
      cancel: vi.fn(),
    },
  })
  return { avisarQueChegaram: () => ouvintes.forEach((cb) => cb()) }
}

/** Recarrega o módulo: o cache de vozes é de módulo e precisa nascer de novo a cada cenário. */
async function carregarTts() {
  vi.resetModules()
  return import('../src/lib/tts')
}

beforeEach(() => {
  vi.resetModules()
})

describe('vozesCarregadas', () => {
  it('é falso enquanto a lista não chegou — o navegador ainda não respondeu', async () => {
    instalarVozes([])
    const tts = await carregarTts()
    expect(tts.vozesCarregadas()).toBe(false)
  })

  it('é verdadeiro quando há vozes instaladas', async () => {
    instalarVozes([{ lang: 'pt-BR', name: 'Luciana' }])
    const tts = await carregarTts()
    expect(tts.vozesCarregadas()).toBe(true)
  })
})

describe('hasVoiceFor', () => {
  it('acha a voz pelo idioma base, mesmo com região diferente', async () => {
    instalarVozes([{ lang: 'fr-CA', name: 'Amelie' }])
    const tts = await carregarTts()
    expect(tts.hasVoiceFor('fr')).toBe(true)
    expect(tts.hasVoiceFor('fr-FR')).toBe(true)
  })

  it('diz não para um idioma que não está instalado', async () => {
    instalarVozes([{ lang: 'en-US', name: 'Samantha' }])
    const tts = await carregarTts()
    expect(tts.hasVoiceFor('ja')).toBe(false)
  })
})

describe('a conta do portão: na dúvida, libera', () => {
  /* É a expressão exata que o `temVoz` de `Play.tsx` usa. Reproduzida aqui porque é ELA que
     decide bloquear, e um teste do `hasVoiceFor` sozinho não pegaria a inversão. */
  const portao = (tts: Awaited<ReturnType<typeof carregarTts>>, lang: string) =>
    tts.isTtsSupported() && (!tts.vozesCarregadas() || tts.hasVoiceFor(lang))

  it('libera enquanto a lista de vozes não chegou', async () => {
    instalarVozes([])
    const tts = await carregarTts()
    expect(portao(tts, 'fr')).toBe(true)
  })

  it('bloqueia quando a lista chegou e o idioma não está nela', async () => {
    instalarVozes([{ lang: 'en-US', name: 'Samantha' }])
    const tts = await carregarTts()
    expect(portao(tts, 'fr')).toBe(false)
  })

  it('libera quando a lista chegou e o idioma está nela', async () => {
    instalarVozes([
      { lang: 'fr-FR', name: 'Thomas' },
      { lang: 'en-US', name: 'Samantha' },
    ])
    const tts = await carregarTts()
    expect(portao(tts, 'fr')).toBe(true)
  })

  it('sem motor de voz nenhum, bloqueia — aí não é dúvida, é ausência', async () => {
    // `speechSynthesis` nao e opcional no lib.dom; o cast expoe a propriedade como opcional para
    // que o `delete` (que e exatamente o que o teste quer simular) seja aceito pelo compilador.
    delete (window as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
    const tts = await carregarTts()
    expect(portao(tts, 'fr')).toBe(false)
  })
})

describe('aoMudarVozes', () => {
  it('avisa quando a lista chega, e devolve como cancelar', async () => {
    const { avisarQueChegaram } = instalarVozes([])
    const tts = await carregarTts()
    const avisado = vi.fn()
    const cancelar = tts.aoMudarVozes(avisado)
    avisarQueChegaram()
    expect(avisado).toHaveBeenCalledTimes(1)
    expect(typeof cancelar).toBe('function')
  })

  it('sem suporte a voz, devolve um cancelador inofensivo em vez de quebrar', async () => {
    // `speechSynthesis` nao e opcional no lib.dom; o cast expoe a propriedade como opcional para
    // que o `delete` (que e exatamente o que o teste quer simular) seja aceito pelo compilador.
    delete (window as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
    const tts = await carregarTts()
    expect(() => tts.aoMudarVozes(() => {})()).not.toThrow()
  })
})
