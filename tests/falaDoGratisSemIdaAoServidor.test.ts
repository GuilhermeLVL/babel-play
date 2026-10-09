/**
 * NADA DE IDA AO SERVIDOR QUE JÁ SE SABE RECUSADA.
 *
 * A fala do microfone (`falada`) ia PRIMEIRO ao LLM do servidor para todo mundo. Para quem está no
 * Grátis o servidor responde 402 (`traduzirNoNivel.ts`: sem `managedCloudLlm` e sem alívio), a nuvem
 * pausa 60 s (`pausaDaNuvem.ts`) e no minuto seguinte a fala ia de novo: uma ida e volta inútil por
 * minuto, na frente da cadeia local. Agora o gateway só faz essa ida para quem o servidor atende:
 *   - o plano com `managedCloudLlm` (nada muda);
 *   - o Grátis que ACEITOU a nuvem de alívio (o adaptador manda o cabeçalho; nada muda);
 *   - a nuvem do site e o `nuvemPrimeiro` seguem como estavam.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))
const plano = { managedCloudLlm: false }
vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => plano }))

const PERFIL = {
  id: 'teste',
  name: 'teste',
  builtin: true,
  economyMode: false,
  budget: { maxCloudRequests: 100, maxTokens: 100_000 },
  bindings: { mt: [{ adapterId: 'mymemory' }, { adapterId: 'server-llm-mt' }] },
}
const FALA = 'We were just chilling at home yesterday'

async function montar() {
  const { apiFetch } = await import('../src/data/api')
  const api = apiFetch as unknown as ReturnType<typeof vi.fn>
  api.mockReset()
  api.mockResolvedValue(new Response(JSON.stringify({ text: 'A gente estava de boa em casa ontem' }), { status: 200 }))
  const { buildGateway } = await import('../src/gateway/index')
  const gw = buildGateway({ profile: PERFIL as never, cloudConsent: () => true })
  return { gw, api }
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  plano.managedCloudLlm = false
  /* A cadeia "local" do teste: o MyMemory responde pelo `fetch` global. */
  vi.stubGlobal('fetch', async () =>
    Response.json({ responseStatus: 200, responseData: { translatedText: 'Nós estávamos bem em casa ontem' } }),
  )
})

describe('a fala do microfone e o LLM do servidor', () => {
  it('Grátis: não vai ao servidor; a cadeia local traduz direto', async () => {
    const { gw, api } = await montar()
    const r = await gw.mt.translate(FALA, 'en', 'pt', { falada: true, nuvemPrimeiro: false, escalarSeRuim: false })
    expect(api).not.toHaveBeenCalled()
    expect(r.engine).toBe('mymemory')
    /* E continua não indo, fala após fala (antes: uma ida a cada pausa de 60 s). */
    await gw.mt.translate(`${FALA} de novo`, 'en', 'pt', { falada: true })
    expect(api).not.toHaveBeenCalled()
  })

  it('quem tem `managedCloudLlm`: a fala vai primeiro ao servidor, como antes', async () => {
    plano.managedCloudLlm = true
    const { gw, api } = await montar()
    const r = await gw.mt.translate(FALA, 'en', 'pt', { falada: true, nuvemPrimeiro: true })
    expect(r.engine).toBe('server-llm-mt')
    expect(api).toHaveBeenCalledTimes(1)
    expect(JSON.parse(api.mock.calls[0][1].body as string).falada).toBe(true)
  })

  it('Grátis com a nuvem de alívio ACEITA: a ida continua, com o cabeçalho do alívio', async () => {
    const { aceitarAlivio } = await import('../src/lib/nuvemDeAlivio/estado')
    aceitarAlivio()
    const { gw, api } = await montar()
    const r = await gw.mt.translate(FALA, 'en', 'pt', { falada: true })
    expect(r.engine).toBe('server-llm-mt')
    expect(api.mock.calls[0][1].headers['x-nuvem-alivio']).toBe('1')
  })

  it('Grátis: o servidor segue na cadeia como ÚLTIMO recurso quando o local falha (isso não mudou)', async () => {
    vi.stubGlobal('fetch', async () => new Response('fora', { status: 500 }))
    const { gw, api } = await montar()
    const r = await gw.mt.translate(FALA, 'en', 'pt', { falada: true })
    expect(r.engine).toBe('server-llm-mt')
    expect(api).toHaveBeenCalledTimes(1)
  })
})
