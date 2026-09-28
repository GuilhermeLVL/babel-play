/**
 * TRADUTOR NATIVO CRIADO NO CLIQUE (harness adaptativo §1.2, M3; integração de 2026-09-28).
 *
 * A Translator API só cria um tradutor cujo pacote vai baixar com ATIVAÇÃO DO USUÁRIO. Criado dentro
 * de uma tradução assíncrona, falhava e o par ficava "indisponível" a sessão inteira — e o opus-mt
 * (113 MB) baixava mesmo em Chrome que traduz de graça. Agora o clique em "Iniciar" prepara o
 * nativo (com `monitor` de progresso) e o aquecimento do opus-mt espera e pula o par pronto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

function stubTranslator(disp: string) {
  const create = vi.fn(
    async (o: {
      monitor?: (m: { addEventListener: (t: string, f: (e: { loaded: number }) => void) => void }) => void
    }) => {
      o.monitor?.({ addEventListener: (_t, f) => f({ loaded: 0.5 }) })
      return { translate: async (t: string) => `nativo: ${t}` }
    },
  )
  vi.stubGlobal('self', globalThis)
  vi.stubGlobal('Translator', { availability: vi.fn(async () => disp), create })
  return { create }
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('ChromeTranslatorMt.preparar', () => {
  it("'available': cria já e o par fica pronto", async () => {
    const { create } = stubTranslator('available')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    await expect(t.preparar('en', 'pt-BR')).resolves.toBe('available')
    expect(t.pronto('en', 'pt')).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
    // A tradução reaproveita a instância criada no clique.
    await t.translate('hi', 'en', 'pt')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("'downloadable': cria com monitor (progresso) e devolve sem esperar o download", async () => {
    stubTranslator('downloadable')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    const progresso: number[] = []
    await expect(t.preparar('en', 'pt', (p) => progresso.push(p))).resolves.toBe('downloadable')
    await Promise.resolve()
    await Promise.resolve()
    expect(progresso).toContain(0.5)
  })

  it("'unavailable' e sem a API: não cria nada, não lança", async () => {
    const { create } = stubTranslator('unavailable')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    await expect(new ChromeTranslatorMt().preparar('en', 'pt')).resolves.toBe('unavailable')
    expect(create).not.toHaveBeenCalled()
  })
})

describe('gateway: opus-mt não aquece o par que o nativo traduz', () => {
  async function montar() {
    const { buildGateway } = await import('../src/gateway/index')
    const gw = buildGateway({
      profile: {
        id: 't',
        name: 't',
        builtin: true,
        economyMode: true,
        budget: { maxCloudRequests: 0, maxTokens: 0 },
        bindings: { mt: [{ adapterId: 'chrome-translator' }, { adapterId: 'opus-mt-local' }] },
      } as never,
      cloudConsent: () => false,
    })
    const { OpusMtLocal } = await import('../src/gateway/adapters/opusMtLocal')
    const preload = vi.spyOn(OpusMtLocal.prototype, 'preload').mockImplementation(() => {})
    return { gw, preload }
  }

  it('nativo available → warmup e preload pulam o opus-mt', async () => {
    stubTranslator('available')
    const { gw, preload } = await montar()
    void gw.mt.prepararNativo([['en', 'pt']])
    gw.mt.warmup([['en', 'pt']])
    await gw.mt.preload('en', 'pt')
    await new Promise((r) => setTimeout(r, 0))
    expect(preload).not.toHaveBeenCalled()
  })

  it('nativo indisponível → o opus-mt aquece como antes', async () => {
    stubTranslator('unavailable')
    const { gw, preload } = await montar()
    void gw.mt.prepararNativo([['en', 'pt']])
    gw.mt.warmup([['en', 'pt']])
    await new Promise((r) => setTimeout(r, 0))
    expect(preload).toHaveBeenCalledWith('en', 'pt')
  })
})

/* ---------------------------------------------------------------------------------------------
 * ESTÁGIO 4 (parte 1): progresso do pacote na tela, qualquer par, parcial que nunca cria.
 * --------------------------------------------------------------------------------------------- */

type Par = { sourceLanguage: string; targetLanguage: string }

/** Translator com controle do download: `concluir()`/`falhar()` resolvem a criação pendente. */
function stubTranslatorControlado(disp: string | ((o: Par) => string)) {
  const ouvintes: Array<(e: { loaded: number }) => void> = []
  let concluir: () => void = () => {}
  let falhar: (e: Error) => void = () => {}
  const estado = (o: Par) => (typeof disp === 'function' ? disp(o) : disp)
  const availability = vi.fn(async (o: Par) => estado(o))
  const create = vi.fn(
    (
      o: Par & {
        monitor?: (m: { addEventListener: (t: string, f: (e: { loaded: number }) => void) => void }) => void
      },
    ) => {
      o.monitor?.({ addEventListener: (_t, f) => ouvintes.push(f) })
      if (estado(o) === 'available') return Promise.resolve({ translate: async (t: string) => `nativo: ${t}` })
      return new Promise<{ translate(t: string): Promise<string> }>((res, rej) => {
        concluir = () => res({ translate: async (t: string) => `nativo: ${t}` })
        falhar = rej
      })
    },
  )
  vi.stubGlobal('self', globalThis)
  vi.stubGlobal('Translator', { availability, create })
  return {
    availability,
    create,
    emitir: (loaded: number) => ouvintes.forEach((f) => f({ loaded })),
    concluir: () => concluir(),
    falhar: (e = new Error('rede caiu')) => falhar(e),
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('ChromeTranslatorMt.preparar — progresso do pacote para a tela', () => {
  it("'downloadable': 0 na hora (a barra aparece), os eventos do monitor e 1 quando fica pronto", async () => {
    const s = stubTranslatorControlado('downloadable')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    const progresso: number[] = []
    await expect(t.preparar('en', 'pt', (p) => progresso.push(p))).resolves.toBe('downloadable')
    expect(progresso).toEqual([0])
    s.emitir(0.4)
    s.concluir()
    await tick()
    expect(progresso).toEqual([0, 0.4, 1])
    expect(t.pronto('en', 'pt')).toBe(true)
  })

  it("'available': nenhuma barra (nada baixa), nem o 1 de conclusão", async () => {
    stubTranslatorControlado('available')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const progresso: number[] = []
    await new ChromeTranslatorMt().preparar('en', 'pt', (p) => progresso.push(p))
    expect(progresso).toEqual([])
  })

  it('o download falha: avisa uma vez, o par sai da cascata e a próxima tradução cai no próximo motor', async () => {
    const s = stubTranslatorControlado('downloadable')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    const aoFalhar = vi.fn()
    await t.preparar('en', 'pt', undefined, aoFalhar)
    s.falhar()
    await tick()
    expect(aoFalhar).toHaveBeenCalledTimes(1)
    expect(t.supports('en', 'pt')).toBe(false)
    expect(t.pronto('en', 'pt')).toBe(false)
  })
})

describe('ChromeTranslatorMt — qualquer par, consultado sob demanda e lembrado na sessão', () => {
  it('pergunta pelo par REAL da sessão (es→pt, ja→en), com o código base', async () => {
    const s = stubTranslatorControlado('available')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    await t.preparar('es-MX', 'pt-BR')
    await t.preparar('ja', 'en-US')
    expect(s.availability).toHaveBeenCalledWith({ sourceLanguage: 'es', targetLanguage: 'pt' })
    expect(s.availability).toHaveBeenCalledWith({ sourceLanguage: 'ja', targetLanguage: 'en' })
    expect(t.pronto('es', 'pt')).toBe(true)
    expect(t.pronto('ja', 'en')).toBe(true)
  })

  it('chinês tradicional (zh-TW, zh-HK) vira zh-Hant; o simplificado fica zh', async () => {
    const s = stubTranslatorControlado('available')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    await t.preparar('zh-TW', 'pt')
    await t.preparar('zh-CN', 'pt')
    expect(s.availability).toHaveBeenCalledWith({ sourceLanguage: 'zh-Hant', targetLanguage: 'pt' })
    expect(s.availability).toHaveBeenCalledWith({ sourceLanguage: 'zh', targetLanguage: 'pt' })
  })

  it('o mesmo par preparado de novo (retomar, desmutar) não pergunta nem cria outra vez', async () => {
    const s = stubTranslatorControlado('downloadable')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    await t.preparar('en', 'pt')
    await expect(t.preparar('en', 'pt')).resolves.toBe('downloadable')
    expect(s.availability).toHaveBeenCalledTimes(1)
    expect(s.create).toHaveBeenCalledTimes(1)
  })

  it('par que o navegador não cobre fica lembrado: a segunda preparação nem pergunta', async () => {
    const s = stubTranslatorControlado('unavailable')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    await t.preparar('eo', 'pt')
    await expect(t.preparar('eo', 'pt')).resolves.toBe('unavailable')
    expect(s.availability).toHaveBeenCalledTimes(1)
  })
})

describe('gateway: o parcial usa o nativo PRONTO e nunca cria um', () => {
  async function montarSoNativo() {
    const { buildGateway, PARCIAL_SEM_MOTOR_LOCAL } = await import('../src/gateway/index')
    const gw = buildGateway({
      profile: {
        id: 't',
        name: 't',
        builtin: true,
        economyMode: true,
        budget: { maxCloudRequests: 0, maxTokens: 0 },
        bindings: { mt: [{ adapterId: 'chrome-translator' }] },
      } as never,
      cloudConsent: () => false,
    })
    return { gw, PARCIAL_SEM_MOTOR_LOCAL }
  }

  it('nativo preparado no clique e pronto → o parcial sai por ele, de graça', async () => {
    stubTranslatorControlado('available')
    const { gw } = await montarSoNativo()
    await gw.mt.prepararNativo([['en', 'pt']])
    const r = await gw.mt.translate('hello', 'en', 'pt', { parcial: true })
    expect(r).toMatchObject({ text: 'nativo: hello', engine: 'chrome-translator' })
  })

  it('sem o tradutor criado, o parcial PULA o nativo: não cria (sem ativação do usuário)', async () => {
    const s = stubTranslatorControlado('available')
    const { gw, PARCIAL_SEM_MOTOR_LOCAL } = await montarSoNativo()
    const r = await gw.mt.translate('hello', 'en', 'pt', { parcial: true })
    expect(r.engine).toBe(PARCIAL_SEM_MOTOR_LOCAL)
    expect(s.create).not.toHaveBeenCalled()
  })

  it('pacote ainda baixando → o parcial pula o nativo (não espera o download)', async () => {
    const s = stubTranslatorControlado('downloadable')
    const { gw, PARCIAL_SEM_MOTOR_LOCAL } = await montarSoNativo()
    await gw.mt.prepararNativo([['en', 'pt']])
    const r = await gw.mt.translate('hello', 'en', 'pt', { parcial: true })
    expect(r.engine).toBe(PARCIAL_SEM_MOTOR_LOCAL)
    expect(s.create).toHaveBeenCalledTimes(1) // só a do clique
  })

  it('prepararNativo repassa o progresso e a falha com o par', async () => {
    const s = stubTranslatorControlado('downloadable')
    const { gw } = await montarSoNativo()
    const progresso: Array<[number, string]> = []
    const falhas: string[] = []
    await gw.mt.prepararNativo(
      [['en', 'pt']],
      (p, par) => progresso.push([p, par]),
      (par) => falhas.push(par),
    )
    s.emitir(0.25)
    s.falhar()
    await tick()
    expect(progresso).toEqual([
      [0, 'en|pt'],
      [0.25, 'en|pt'],
    ])
    expect(falhas).toEqual(['en|pt'])
  })
})
