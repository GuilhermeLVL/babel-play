// @vitest-environment jsdom
/**
 * A VOZ ESCOLHIDA POR IDIOMA — uma preferência só para o app inteiro (`src/lib/voz/preferenciaDeVoz.ts`).
 *
 *   · POR IDIOMA: a voz do inglês não mexe na do português, e `en-US` e `en` são o mesmo idioma;
 *   · ONDE FICA: na conta, em `settings.ui.preferencias.vozes` (o caminho das outras preferências), com o
 *     `localStorage` de `tts.ts` como reserva — a escolha vale no aparelho mesmo quando a conta não grava;
 *   · A CONTA MANDA quando chega com vozes guardadas; a que nunca guardou não apaga as do aparelho;
 *   · A VOZ QUE SUMIU (outro aparelho, pacote removido, plano sem a nuvem) vira a automática, sem erro, e
 *     continua guardada para o aparelho que a tem;
 *   · O MOTOR (`nativeTts`, por onde passam o "Ouvir", os jogos e o intérprete do Grátis) fala com a voz
 *     escolhida do idioma do texto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const patchUiSettings = vi.fn()
const fetchSettings = vi.fn()
vi.mock('../src/data/api', () => ({
  patchUiSettings: (...a: unknown[]) => patchUiSettings(...a),
  fetchSettings: (...a: unknown[]) => fetchSettings(...a),
}))
const plano = { vozNatural: false }
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => plano,
  onPlanChange: () => () => undefined,
}))

interface VozFalsa {
  name: string
  lang: string
  localService: boolean
}
const VOZES: VozFalsa[] = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US', localService: true },
  { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', localService: false },
  { name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR', localService: true },
  { name: 'Google português do Brasil', lang: 'pt-BR', localService: false },
]
const DAVID = VOZES[0].name
const ARIA = VOZES[1].name
const MARIA = VOZES[2].name

class FalaFalsa {
  lang = ''
  voice: VozFalsa | null = null
  rate = 1
  pitch = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public text: string) {}
}

function instalar(vozes: VozFalsa[] = VOZES) {
  const faladas: FalaFalsa[] = []
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => vozes,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      speak: (u: FalaFalsa) => faladas.push(u),
      cancel: vi.fn(),
      resume: vi.fn(),
      paused: false,
      speaking: false,
    },
  })
  vi.stubGlobal('SpeechSynthesisUtterance', FalaFalsa)
  return faladas
}

/** Os módulos nascem de novo a cada cenário: o cache de vozes e as preferências são de módulo. */
async function carregar() {
  vi.resetModules()
  const tts = await import('../src/lib/tts')
  const voz = await import('../src/lib/voz/preferenciaDeVoz')
  const preferencias = await import('../src/lib/preferencias')
  return { tts, voz, preferencias }
}

const ligarFlag = (ligada: boolean) => localStorage.setItem('babel.flags', JSON.stringify({ voz_natural: { ligada } }))

beforeEach(() => {
  localStorage.clear()
  patchUiSettings.mockReset()
  fetchSettings.mockReset()
  patchUiSettings.mockResolvedValue({ id: 'x' })
  fetchSettings.mockResolvedValue(null)
  plano.vozNatural = false
})

describe('a voz por idioma', () => {
  it('cada idioma guarda a sua, e a região do código não cria outro idioma', async () => {
    instalar()
    const { voz } = await carregar()
    await voz.escolherVoz('en-US', ARIA)
    await voz.escolherVoz('pt', MARIA)
    expect(voz.vozGuardada('en')).toBe(ARIA)
    expect(voz.vozGuardada('en-GB')).toBe(ARIA)
    expect(voz.vozGuardada('pt-BR')).toBe(MARIA)
    expect(voz.vozGuardada('es')).toBe(voz.VOZ_AUTOMATICA)
    expect(voz.vozEmUso('en')).toBe(ARIA)
  })

  it('"Automática" apaga a escolha daquele idioma e deixa a dos outros', async () => {
    instalar()
    const { voz } = await carregar()
    await voz.escolherVoz('en', ARIA)
    await voz.escolherVoz('pt', MARIA)
    await voz.escolherVoz('en', voz.VOZ_AUTOMATICA)
    expect(voz.vozGuardada('en')).toBe('')
    expect(voz.vozGuardada('pt')).toBe(MARIA)
    expect(JSON.parse(localStorage.getItem('babel_voice_prefs')!)).toEqual({ pt: MARIA })
  })
})

describe('onde a voz fica guardada', () => {
  it('vai para a conta com as outras preferências (`settings.ui.preferencias.vozes`), o mapa inteiro', async () => {
    instalar()
    // Uma voz escolhida antes de a conta guardar vozes (só no aparelho) sobe junto na próxima escolha.
    localStorage.setItem('babel_voice_prefs', JSON.stringify({ pt: MARIA }))
    const { voz } = await carregar()
    expect(await voz.escolherVoz('en', ARIA)).toBe(true)
    expect(patchUiSettings).toHaveBeenLastCalledWith({
      preferencias: expect.objectContaining({ vozes: { pt: MARIA, en: ARIA } }),
    })
  })

  it('a conta não gravou (sem rede): devolve false e a escolha continua valendo neste aparelho', async () => {
    instalar()
    patchUiSettings.mockResolvedValue(null)
    const { voz, preferencias } = await carregar()
    voz.ligarVozesAConta()
    expect(await voz.escolherVoz('en', ARIA)).toBe(false)
    expect(voz.vozGuardada('en')).toBe(ARIA)
    expect(JSON.parse(localStorage.getItem('babel_voice_prefs')!)).toEqual({ en: ARIA })
    // As preferências da conta voltaram ao que o servidor tem: nada de voz.
    expect(preferencias.lerPreferencias().vozes).toBeNull()
  })

  it('a conta chega com vozes guardadas em outro aparelho: elas passam a valer aqui', async () => {
    instalar()
    localStorage.setItem('babel_voice_prefs', JSON.stringify({ en: DAVID, es: 'Helena' }))
    fetchSettings.mockResolvedValue({ ui: JSON.stringify({ preferencias: { vozes: { en: ARIA, 'pt-BR': MARIA } } }) })
    const { voz, preferencias } = await carregar()
    voz.ligarVozesAConta()
    await preferencias.carregarPreferencias()
    expect(voz.vozGuardada('en')).toBe(ARIA)
    expect(voz.vozGuardada('pt')).toBe(MARIA)
    // A conta é a fonte: o que só existia neste aparelho sai.
    expect(voz.vozGuardada('es')).toBe('')
  })

  it('a conta que nunca guardou vozes não apaga as do aparelho', async () => {
    instalar()
    localStorage.setItem('babel_voice_prefs', JSON.stringify({ en: DAVID }))
    fetchSettings.mockResolvedValue({ ui: JSON.stringify({ preferencias: { metaMin: 20 } }) })
    const { voz, preferencias } = await carregar()
    voz.ligarVozesAConta()
    await preferencias.carregarPreferencias()
    expect(preferencias.lerPreferencias().metaMin).toBe(20)
    expect(preferencias.lerPreferencias().vozes).toBeNull()
    expect(voz.vozGuardada('en')).toBe(DAVID)
  })

  it('as vozes da conta são saneadas: só texto, com a chave no código base', async () => {
    instalar()
    const { preferencias } = await carregar()
    expect(preferencias.normalizar({ vozes: { 'EN-us': ARIA, pt: 7, es: '', fr: null } }).vozes).toEqual({ en: ARIA })
    expect(preferencias.normalizar({ vozes: ['x'] }).vozes).toBeNull()
    expect(preferencias.normalizar({}).vozes).toBeNull()
  })
})

describe('a voz que sumiu', () => {
  it('voz de outro aparelho: vale a automática, sem erro, e a escolha continua guardada', async () => {
    const faladas = instalar()
    localStorage.setItem('babel_voice_prefs', JSON.stringify({ en: 'Samantha' }))
    const { tts, voz } = await carregar()
    expect(voz.vozGuardada('en')).toBe('Samantha')
    expect(voz.vozEmUso('en')).toBe(voz.VOZ_AUTOMATICA)
    expect(voz.prefereVozDoAparelho('en')).toBe(false)
    expect(() => tts.nativeTts.speak('hello', { lang: 'en-US' })).not.toThrow()
    // A automática: a melhor voz instalada do idioma (a natural antes da comum).
    expect(faladas.at(-1)?.voice?.name).toBe(ARIA)
    expect(localStorage.getItem('babel_voice_prefs')).toContain('Samantha')
  })

  it('a voz natural só vale com a capacidade do plano E a flag ligada', async () => {
    instalar()
    const { voz } = await carregar()
    await voz.escolherVoz('en', voz.VOZ_DA_NUVEM)
    expect(voz.vozDaNuvemDisponivel()).toBe(false)
    expect(voz.vozEmUso('en')).toBe(voz.VOZ_AUTOMATICA)

    plano.vozNatural = true
    expect(voz.vozDaNuvemDisponivel()).toBe(false) // o plano tem, a flag não
    ligarFlag(true)
    const comFlag = (await carregar()).voz
    expect(comFlag.vozDaNuvemDisponivel()).toBe(true)
    expect(comFlag.vozEmUso('en')).toBe(comFlag.VOZ_DA_NUVEM)
    // A voz natural não é uma voz do aparelho: o intérprete continua indo à nuvem.
    expect(comFlag.prefereVozDoAparelho('en')).toBe(false)
  })
})

describe('quem fala usa a voz escolhida', () => {
  it('o motor do aparelho lê cada idioma com a voz escolhida para ele', async () => {
    const faladas = instalar()
    const { tts, voz } = await carregar()
    await voz.escolherVoz('en', DAVID)
    await voz.escolherVoz('pt', MARIA)
    tts.nativeTts.speak('good morning', { lang: 'en-US' })
    expect(faladas.at(-1)?.voice?.name).toBe(DAVID)
    tts.nativeTts.speak('bom dia', { lang: 'pt-BR' })
    expect(faladas.at(-1)?.voice?.name).toBe(MARIA)
  })

  it('"Ouvir" e os jogos (`falar`): a voz do idioma do texto, não a do idioma vizinho', async () => {
    const faladas = instalar()
    const { tts, voz } = await carregar()
    await voz.escolherVoz('en', DAVID)
    expect(tts.falar('river', 'en')).toBe(true)
    expect(faladas.at(-1)).toMatchObject({ text: 'river', voice: { name: DAVID } })
    // O português não tem escolha: a automática dele (a natural), e nunca a voz inglesa.
    expect(tts.falar('rio', 'pt')).toBe(true)
    expect(faladas.at(-1)?.voice?.lang).toBe('pt-BR')
  })

  it('a voz natural guardada não vira nome de voz no aparelho: lê a automática', async () => {
    const faladas = instalar()
    const { tts, voz } = await carregar()
    await voz.escolherVoz('en', voz.VOZ_DA_NUVEM)
    tts.nativeTts.speak('hello', { lang: 'en-US' })
    expect(faladas.at(-1)?.voice?.name).toBe(ARIA)
  })
})
