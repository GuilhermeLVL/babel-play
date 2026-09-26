// @vitest-environment jsdom
/**
 * A EDIÇÃO ESTÁTICA (`VITE_EDICAO_ESTATICA=1`) — o build que vai para o Cloudflare Pages, sem o
 * servidor Node atrás.
 *
 * O contrato que este teste trava:
 *  - a identidade nasce `anonimo`, sem esperar Supabase nenhum;
 *  - NADA de `/api` sai para a rede — nem as rotas que no modo sem conta "passam direto"
 *    (`/api/flags`, `/api/metricas/ofertas`, loopback) nem os `fetch` crus deliberados (abertura,
 *    ranking);
 *  - a nuvem (Groq/LLM do servidor) não é oferecida pelo roteador;
 *  - o teto local continua, mas a mensagem fala da edição de demonstração, não de criar conta;
 *  - planos somem da navegação.
 *
 * E o contrário, que é o que protege a build normal: sem a variável, tudo segue como antes.
 *
 * O `fetch` global LANÇA: qualquer ida à rede derruba o teste com a URL.
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rede = vi.fn((url: unknown) => {
  throw new Error(`REDE PROIBIDA: ${String(url)}`)
})

async function carregarEstatica() {
  vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
  vi.resetModules()
}

describe('edição estática ligada', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', rede)
    rede.mockClear()
    await carregarEstatica()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('a identidade nasce anônima, sem armar espera por login', async () => {
    const { edicaoEstatica } = await import('../src/lib/edicaoEstatica')
    const { estadoDeIdentidade, aguardarIdentidade, definirIdentidade } = await import('../src/lib/identidade')
    expect(edicaoEstatica()).toBe(true)
    expect(estadoDeIdentidade()).toBe('anonimo')
    await expect(aguardarIdentidade()).resolves.toBe('anonimo')
    // Ninguém consegue promover a identidade: não há conta nesta edição.
    definirIdentidade('conta')
    expect(estadoDeIdentidade()).toBe('anonimo')
  })

  it('o Supabase fica desligado mesmo que as variáveis tenham vazado para o build', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'chave-publica-de-teste')
    vi.stubEnv('VITE_AUTH_REQUIRED', '1')
    vi.resetModules()
    const sb = await import('../src/lib/supabase')
    expect(sb.authRequired).toBe(false)
    await expect(sb.carregarSupabase()).resolves.toBeNull()
  })

  it('flags, métricas de oferta e loopback respondem sem rede', async () => {
    const { apiFetch } = await import('../src/data/funil')
    const flags = await apiFetch('/api/flags')
    expect(flags.ok).toBe(false)
    const metrica = await apiFetch('/api/metricas/ofertas', { method: 'POST', body: '{"v":1,"eventos":[]}' })
    expect(metrica.status).toBeLessThan(500)
    await apiFetch('/api/audio/loopback/suporte')
    expect(rede).not.toHaveBeenCalled()
  })

  it('as rotas de dados rodam no servidor em memória', async () => {
    const api = await import('../src/data/api')
    const { limparTudo, fecharStore } = await import('../src/data/efemero/store')
    await limparTudo()
    const rec = await api.createSession({
      title: 'Aula',
      kind: 'live',
      sourceLang: 'en',
      targetLang: 'pt',
      status: 'done',
      durationMs: 1000,
      utterances: [{ idx: 0, sourceText: 'hello friend', translatedText: 'olá amigo', tStartMs: 0, tEndMs: 900 }],
    })
    expect((await api.fetchSessions()).map((r) => r.id)).toContain(rec.id)
    await fecharStore()
    expect(rede).not.toHaveBeenCalled()
  })

  it('carregarFlags não pergunta a ninguém e mantém o padrão embutido', async () => {
    const { carregarFlags } = await import('../src/lib/flags')
    await carregarFlags()
    expect(rede).not.toHaveBeenCalled()
  })

  it('abertura e ranking não saem para a rede', async () => {
    const { lerAbertura } = await import('../src/data/rotas/idade')
    await expect(lerAbertura()).resolves.toEqual({ cadastro: false, checkout: false })
    const ranking = await import('../src/lib/ranking')
    await expect(ranking.lerRanking('blitz')).resolves.toBeNull()
    ranking.salvarApelido('alguem')
    await expect(ranking.enviarParaRanking('blitz', 10, 2)).resolves.toBe('indisponivel')
    expect(rede).not.toHaveBeenCalled()
  })

  it('a instrumentação de ofertas não envia nem por beacon', async () => {
    const beacon = vi.fn(() => true)
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })
    const inst = await import('../src/lib/ofertas/instrumentacao')
    inst.registrarEventoDeOferta('oferta_exibida', {
      gatilho: 'fim_de_sessao',
      componente: 'banner',
      plano_atual: 'gratis',
      plano_sugerido: 'pro',
      variante: 'a',
    } as never)
    inst.enviarLoteDeOfertas(true)
    expect(beacon).not.toHaveBeenCalled()
    expect(rede).not.toHaveBeenCalled()
  })

  it('o roteador de STT não oferece a nuvem e os adaptadores de nuvem se declaram indisponíveis', async () => {
    const { routeStt } = await import('../src/gateway/sttRouter')
    const base = { contentLang: 'pt', autoDetect: false, hasWebGpu: false, cloudAvailable: true, profileId: 'free-web' }
    expect(routeStt({ ...base, quality: 'auto' }).preferCloud).toBe(false)
    expect(routeStt({ ...base, quality: 'cloud' }).preferCloud).toBe(false)
    const { GroqWhisperStt } = await import('../src/gateway/adapters/groqWhisper')
    expect(new GroqWhisperStt({ model: 'whisper-large-v3-turbo' }).isAvailable()).toBe(false)
    const { ServerLlmMt } = await import('../src/gateway/adapters/serverLlmMt')
    expect(new ServerLlmMt().supports('en', 'pt')).toBe(false)
  })

  it('o teto continua, e a mensagem fala da edição de demonstração — não de criar conta', async () => {
    const { motivoDoTeto } = await import('../src/core/tetoAnonimo')
    for (const recurso of ['sessoes', 'palavras'] as const) {
      const texto = motivoDoTeto(recurso, { edicaoEstatica: true })
      expect(texto).toMatch(/demonstração/i)
      expect(texto).not.toMatch(/crie uma conta|criar conta|entrar/i)
    }
  })

  it('o avisos por marco de uso não mandam criar conta', async () => {
    const { avisoPendente } = await import('../src/lib/marcosDeConta')
    localStorage.clear()
    const aviso = avisoPendente({ sessoes: 4, palavras: 0, semConta: true })
    expect(aviso).not.toBeNull()
    expect(`${aviso!.titulo} ${aviso!.texto}`).not.toMatch(/conta/i)
    expect(aviso!.texto).toMatch(/demonstração/i)
  })

  it('os direitos são os de quem não tem conta, não os do dono do servidor', async () => {
    const { getEntitlements } = await import('../src/lib/entitlements')
    const e = getEntitlements()
    expect(e.plan).toBe('anonimo')
    expect(e.managedCloudStt || e.managedCloudLlm || e.youtubeImport).toBe(false)
  })

  it('planos saem da navegação principal', async () => {
    const { NAV_ITEMS } = await import('../src/components/shell/navItems')
    expect(NAV_ITEMS.map((i) => i.id)).not.toContain('planos')
  })
})

describe('build normal (sem a variável) não muda', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '')
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('a identidade continua selfhost sem Supabase', async () => {
    const { edicaoEstatica } = await import('../src/lib/edicaoEstatica')
    const { estadoDeIdentidade } = await import('../src/lib/identidade')
    expect(edicaoEstatica()).toBe(false)
    expect(estadoDeIdentidade()).toBe('selfhost')
  })

  it('a nuvem continua oferecida quando o servidor a tem', async () => {
    const { routeStt } = await import('../src/gateway/sttRouter')
    const r = routeStt({
      contentLang: 'pt',
      autoDetect: false,
      hasWebGpu: false,
      cloudAvailable: true,
      profileId: 'free-web',
      quality: 'auto',
    })
    expect(r.preferCloud).toBe(true)
  })

  it('o teto sem conta segue convidando a criar conta', async () => {
    const { motivoDoTeto } = await import('../src/core/tetoAnonimo')
    expect(motivoDoTeto('sessoes')).toMatch(/Crie uma conta/)
  })

  it('planos continuam na navegação', async () => {
    const { NAV_ITEMS } = await import('../src/components/shell/navItems')
    expect(NAV_ITEMS.map((i) => i.id)).toContain('planos')
  })
})
