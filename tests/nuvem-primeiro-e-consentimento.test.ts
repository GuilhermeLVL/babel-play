/**
 * A NUVEM NO GATEWAY DO NAVEGADOR — quem vai primeiro e quem pode ir (Fase 2 do lançamento).
 *
 * 1. ÁUDIO DO SISTEMA NA NUVEM PRIMEIRO PARA QUEM PAGA. Só a fala do microfone (`falada`) ia ao LLM
 *    do servidor antes da cascata local; a legenda do vídeo passava primeiro pelo opus-mt/Chrome e
 *    o assinante recebia a tradução literal que motivou a assinatura. Com `nuvemPrimeiro` (plano com
 *    `managedCloudLlm`), o texto do sistema também tenta o servidor primeiro — com o prompt FIEL de
 *    texto, não o comunicativo da fala — e cai na cascata local se falhar.
 *
 * 2. CONSENTIMENTO DE NUVEM DE VERDADE. Seis telas montavam o gateway com `cloudConsent: () => true`
 *    e o gateway só considerava "nuvem" o binding com credencial BYOK: o Tradutor IA do servidor, a
 *    transcrição gerenciada e o MyMemory passavam sem pergunta. Agora os três exigem o
 *    consentimento, que vem de Ajustes → Privacidade.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

const PERFIL = {
  id: 'teste',
  name: 'teste',
  builtin: true,
  economyMode: false,
  budget: { maxCloudRequests: 100, maxTokens: 100_000 },
  bindings: { mt: [{ adapterId: 'mymemory' }, { adapterId: 'server-llm-mt' }] },
}

/** MyMemory responde pelo `fetch` global; o servidor, pelo `apiFetch` do funil. */
function stubMyMemory(chamadas: string[]) {
  vi.stubGlobal('fetch', async (url: any) => {
    chamadas.push(String(url))
    return new Response(
      JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'Olá mundo pela memória' } }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  })
}

async function montar(consentiu: boolean) {
  const { apiFetch } = await import('../src/data/api')
  const api = apiFetch as unknown as ReturnType<typeof vi.fn>
  api.mockReset() // o mock do módulo sobrevive ao resetModules: sem isto, as chamadas do caso anterior contam
  const { buildGateway } = await import('../src/gateway/index')
  const gw = buildGateway({ profile: PERFIL as never, cloudConsent: () => consentiu })
  return { gw, api }
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe('áudio do sistema: nuvem primeiro para quem paga', () => {
  it('com `nuvemPrimeiro`, o texto do sistema vai ao servidor ANTES da cascata local, com o prompt de texto', async () => {
    const chamadasMyMemory: string[] = []
    stubMyMemory(chamadasMyMemory)
    const { gw, api } = await montar(true)
    api.mockResolvedValue(new Response(JSON.stringify({ text: 'Olá, mundo, pelo servidor' }), { status: 200 }))

    const r = await gw.mt.translate('Hello world, this is a video subtitle', 'en', 'pt', { nuvemPrimeiro: true })
    expect(r.engine).toBe('server-llm-mt')
    expect(chamadasMyMemory).toEqual([])
    const corpo = JSON.parse(api.mock.calls[0][1].body as string)
    expect(corpo.falada).toBe(false)
  })

  it('sem `nuvemPrimeiro` (plano sem nuvem), a cascata segue a ordem do perfil', async () => {
    const chamadasMyMemory: string[] = []
    stubMyMemory(chamadasMyMemory)
    const { gw, api } = await montar(true)
    api.mockResolvedValue(new Response(JSON.stringify({ text: 'nao deveria' }), { status: 200 }))
    const r = await gw.mt.translate('Hello world, this is a video subtitle', 'en', 'pt')
    expect(r.engine).not.toBe('server-llm-mt')
    expect(api).not.toHaveBeenCalled()
  })

  it('a nuvem falhou (cota, orçamento, 503): cai no resto da cascata', async () => {
    const chamadasMyMemory: string[] = []
    stubMyMemory(chamadasMyMemory)
    const { gw, api } = await montar(true)
    api.mockResolvedValue(new Response(JSON.stringify({ code: 'orcamento_esgotado' }), { status: 503 }))
    const r = await gw.mt.translate('Hello world, this is a video subtitle', 'en', 'pt', { nuvemPrimeiro: true })
    expect(r.text).toContain('memória')
  })
})

describe('consentimento de nuvem', () => {
  it('sem consentimento, nem o servidor nem o MyMemory são chamados — nada vai à nuvem', async () => {
    const chamadasMyMemory: string[] = []
    stubMyMemory(chamadasMyMemory)
    const { gw, api } = await montar(false)
    api.mockResolvedValue(new Response(JSON.stringify({ text: 'nao deveria' }), { status: 200 }))
    await expect(
      gw.mt.translate('Hello world, this is a video subtitle', 'en', 'pt', { nuvemPrimeiro: true, falada: true }),
    ).rejects.toThrow()
    expect(api).not.toHaveBeenCalled()
    expect(chamadasMyMemory).toEqual([])
  })

  it('o consentimento é o de Ajustes → Privacidade, desligado por padrão', async () => {
    const { PADRAO } = await import('../src/lib/preferencias')
    expect(PADRAO.consentimentos.nuvem).toBe(false)
    const { consentiuNuvem } = await import('../src/lib/consentimentoDeNuvem')
    expect(consentiuNuvem()).toBe(false)
  })

  it('nenhuma tela monta o gateway com consentimento fixo em true', async () => {
    const { readFileSync } = await import('node:fs')
    for (const arquivo of [
      'src/components/AiEnginePanel.tsx',
      'src/components/views/Analysis.tsx',
      'src/components/views/LiveCapture.tsx',
      'src/components/views/Reading.tsx',
      'src/lib/exercicios/activeProduction.tsx',
      'src/lib/useExameDePalavra.ts',
    ]) {
      expect(readFileSync(arquivo, 'utf8'), arquivo).not.toMatch(/cloudConsent:\s*\(\)\s*=>\s*true/)
    }
  })
})
