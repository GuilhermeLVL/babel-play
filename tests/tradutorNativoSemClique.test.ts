/**
 * O NATIVO RESPONDE ANTES DE O OPUS-MT AQUECER — TAMBÉM SEM O CLIQUE (plano "Grátis sem travar", A9a).
 *
 * O clique em "Iniciar" prepara a Translator API (`prepararNativo`) e o `warmup`/`preload` do opus-mt
 * esperam por ela. Mas o pré-aquecimento da tela aberta (`preaquecerModelos`) roda ANTES de qualquer
 * clique: sem preparação para esperar, o opus-mt (113 MB na memória, o worker na CPU) aquecia mesmo no
 * Chrome que já traduz o par no aparelho. Agora, sem preparação, o gateway PERGUNTA ao nativo antes —
 * e só pergunta: criar o tradutor de um pacote que vai baixar exige o gesto do clique, e criar sem ele
 * marcaria o par como indisponível a sessão inteira.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

function stubTranslator(disp: string | (() => Promise<string>)) {
  const availability = vi.fn(typeof disp === 'function' ? disp : async () => disp)
  const create = vi.fn(async () => ({ translate: async (t: string) => `nativo: ${t}` }))
  vi.stubGlobal('self', globalThis)
  vi.stubGlobal('Translator', { availability, create })
  return { availability, create }
}

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

const tick = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('gateway: sem a preparação do clique, o nativo é perguntado antes do opus-mt', () => {
  it("'available' (pacote no disco): o warmup da tela aberta NÃO aquece o opus-mt, e nada é criado", async () => {
    const s = stubTranslator('available')
    const { gw, preload } = await montar()
    gw.mt.warmup([['en', 'pt']])
    await tick()
    expect(s.availability).toHaveBeenCalledWith({ sourceLanguage: 'en', targetLanguage: 'pt' })
    expect(preload).not.toHaveBeenCalled()
    expect(s.create).not.toHaveBeenCalled()
  })

  it("'available': o preload também resolve sem o opus-mt (a preparação não baixa os 113 MB)", async () => {
    stubTranslator('available')
    const { gw, preload } = await montar()
    await gw.mt.preload('en', 'pt-BR')
    expect(preload).not.toHaveBeenCalled()
  })

  it("'available': o par é perguntado UMA vez por sessão (a tela reaquece a cada troca de idioma)", async () => {
    const s = stubTranslator('available')
    const { gw } = await montar()
    gw.mt.warmup([['en', 'pt']])
    gw.mt.warmup([['en', 'pt']])
    await gw.mt.preload('en', 'pt')
    expect(s.availability).toHaveBeenCalledTimes(1)
  })

  it("'downloadable' (o pacote baixaria): o opus-mt aquece como antes, e o nativo NÃO é criado sem o clique", async () => {
    const s = stubTranslator('downloadable')
    const { gw, preload } = await montar()
    gw.mt.warmup([['en', 'pt']])
    await tick()
    expect(preload).toHaveBeenCalledWith('en', 'pt')
    expect(s.create).not.toHaveBeenCalled()
  })

  it('o clique depois da tela aberta: o que o clique descobre vale (a pergunta sem clique não atrapalha)', async () => {
    const s = stubTranslator('downloadable')
    const { gw } = await montar()
    gw.mt.warmup([['en', 'pt']])
    await tick()
    await gw.mt.prepararNativo([['en', 'pt']])
    expect(s.create).toHaveBeenCalledTimes(1)
  })

  it('sem a Translator API: o opus-mt aquece na hora, sem esperar pergunta nenhuma', async () => {
    const { gw, preload } = await montar()
    gw.mt.warmup([['en', 'pt']])
    expect(preload).toHaveBeenCalledWith('en', 'pt')
  })

  it('a pergunta que não volta (headless: 6 s): passado o prazo, o opus-mt aquece', async () => {
    stubTranslator(() => new Promise<string>(() => {}))
    const { PRAZO_DA_PERGUNTA_SEM_CLIQUE_MS } = await import('../src/gateway/adapters/chromeTranslator')
    const { gw, preload } = await montar()
    vi.useFakeTimers()
    gw.mt.warmup([['en', 'pt']])
    await vi.advanceTimersByTimeAsync(PRAZO_DA_PERGUNTA_SEM_CLIQUE_MS - 1)
    expect(preload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(preload).toHaveBeenCalledWith('en', 'pt')
  })
})

describe('ChromeTranslatorMt.atendeSemBaixar', () => {
  it('só pergunta: não cria o tradutor nem muda o que a sessão sabe do par', async () => {
    const s = stubTranslator('available')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    await expect(t.atendeSemBaixar('en-US', 'pt-BR')).resolves.toBe(true)
    expect(s.create).not.toHaveBeenCalled()
    // O clique ainda prepara (cria) o tradutor: a pergunta não marcou o par como pronto.
    expect(t.pronto('en', 'pt')).toBe(false)
    await t.preparar('en', 'pt')
    expect(s.create).toHaveBeenCalledTimes(1)
  })

  it("'downloadable', 'unavailable', mesmo idioma e sem a API: não atende", async () => {
    stubTranslator('downloadable')
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    const t = new ChromeTranslatorMt()
    await expect(t.atendeSemBaixar('en', 'pt')).resolves.toBe(false)
    await expect(t.atendeSemBaixar('pt-BR', 'pt')).resolves.toBe(false)
    vi.unstubAllGlobals()
    await expect(new ChromeTranslatorMt().atendeSemBaixar('en', 'pt')).resolves.toBe(false)
  })

  it('a pergunta que rejeita: não atende (e não lança)', async () => {
    stubTranslator(async () => {
      throw new Error('quebrou')
    })
    const { ChromeTranslatorMt } = await import('../src/gateway/adapters/chromeTranslator')
    await expect(new ChromeTranslatorMt().atendeSemBaixar('en', 'pt')).resolves.toBe(false)
  })
})
