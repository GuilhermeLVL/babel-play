// @vitest-environment jsdom
/**
 * EDIÇÃO LEVE (VITE_EDICAO=leve): sem conta, menu de 4 itens, identidade nasce anônima.
 * O módulo `edicao` é o único ponto de leitura; os testes o substituem e reimportam o resto.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/edicao', () => ({ EDICAO_LEVE: true }))

describe('edição leve', () => {
  beforeEach(() => vi.resetModules())

  it('menu = Início · Capturar · Biblioteca · Vocabulário · Jogar · Ajustes', async () => {
    const { NAV_ITEMS } = await import('../src/components/shell/navItems')
    // A ordem vem da lista mestra (navItems); aqui só importa QUAIS telas existem na leve.
    expect([...NAV_ITEMS.map((i) => i.id)].sort()).toEqual(['capture', 'hub', 'library', 'metrics', 'play', 'settings', 'sobre'])
  })

  it('identidade nasce anônima (tudo no IndexedDB, zero rede) e a porta de login nunca abre', async () => {
    const { estadoDeIdentidade } = await import('../src/lib/identidade')
    const { authRequired } = await import('../src/lib/supabase')
    expect(estadoDeIdentidade()).toBe('anonimo')
    expect(authRequired).toBe(false)
  })

  it('o servidor em memória não dispara convite de conta', async () => {
    const { naoDisponivelSemConta, EVENTO_EXIGE_CONTA } = await import('../src/data/efemero/servidor')
    const h = vi.fn()
    window.addEventListener(EVENTO_EXIGE_CONTA, h)
    const r = naoDisponivelSemConta('POST /api/gemini/chat')
    expect(r.status).toBe(501)
    expect(h).not.toHaveBeenCalled()
    window.removeEventListener(EVENTO_EXIGE_CONTA, h)
  })

  it('o roteador de STT escolhe tiny para inglês e base para o resto, mesmo com WebGPU', async () => {
    const { routeStt, WHISPER_MODELS } = await import('../src/gateway/sttRouter')
    const en = routeStt({ contentLang: 'en', autoDetect: false, quality: 'auto', hasWebGpu: true, cloudAvailable: false, profileId: 'free-web' } as never)
    const es = routeStt({ contentLang: 'es', autoDetect: false, quality: 'auto', hasWebGpu: true, cloudAvailable: false, profileId: 'free-web' } as never)
    expect(JSON.stringify(en)).toContain(WHISPER_MODELS.tiny)
    expect(JSON.stringify(es)).toContain(WHISPER_MODELS.base)
  })
})
