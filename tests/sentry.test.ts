/**
 * Fase 5 — Sentry sem SDK: o que sai, e principalmente o que NÃO sai.
 *
 * A promessa: nada de e-mail, IP, texto de transcrição, prompt ou chave. No servidor ela vem do
 * logger (allowlist + redação) e do sink montar o evento só da linha saneada; no navegador, do
 * mesmo recorte do relatório ao servidor, redigido, e só com conta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { log, registrarSinkDeErro } from '../server/lib/logger'
import { sinkDoSentry } from '../server/lib/sentry'
import { criarLimitador, interpretarDsn, montarEnvelope, urlDoEnvelope } from '../src/core/sentry'

const DSN = 'https://abc123@o999.ingest.us.sentry.io/4567'

describe('protocolo', () => {
  it('interpreta o DSN e monta a URL do envelope com a chave pública na query', () => {
    const d = interpretarDsn(DSN)
    expect(d).toEqual({ origem: 'https://o999.ingest.us.sentry.io', projeto: '4567', chavePublica: 'abc123' })
    expect(urlDoEnvelope(d!)).toBe(
      'https://o999.ingest.us.sentry.io/api/4567/envelope/?sentry_key=abc123&sentry_version=7',
    )
  })

  it('DSN malformado vira null', () => {
    expect(interpretarDsn('')).toBeNull()
    expect(interpretarDsn('https://o1.ingest.sentry.io/12')).toBeNull()
    expect(interpretarDsn('lixo')).toBeNull()
  })

  it('o envelope tem 3 linhas JSON, sem usuário, sem request, e pede infer_ip=never', () => {
    const env = montarEnvelope(
      { eventId: 'a'.repeat(32), timestamp: 1, platform: 'node', level: 'error', mensagem: 'm' },
      new Date(0),
    )
    const [cab, item, evento] = env.split('\n').map((l) => JSON.parse(l))
    expect(cab.event_id).toBe('a'.repeat(32))
    expect(item).toEqual({ type: 'event' })
    expect(evento.user).toBeUndefined()
    expect(evento.request).toBeUndefined()
    expect(evento.sdk.settings.infer_ip).toBe('never')
  })

  it('o limitador segura a enxurrada e reabre na janela seguinte', () => {
    let t = 0
    const pode = criarLimitador(2, () => t)
    expect([pode(), pode(), pode()]).toEqual([true, true, false])
    t = 60_000
    expect(pode()).toBe(true)
  })
})

describe('sink do servidor', () => {
  let enviados: string[]
  let desregistrar: () => void
  const buscar = vi.fn(async (_url: unknown, init?: RequestInit) => {
    enviados.push(String(init?.body))
    return new Response('{}')
  }) as unknown as typeof fetch

  beforeEach(() => {
    enviados = []
    const sink = sinkDoSentry({ dsn: DSN, ambiente: 'teste', release: 'abc', buscar })
    desregistrar = registrarSinkDeErro(sink!)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    desregistrar()
    vi.restoreAllMocks()
  })

  it('um log(error) vira evento, e e-mail, Bearer e parâmetros do SQL saem redigidos', () => {
    log('error', {
      event: 'sessions_route_error',
      route: '/api/sessions',
      status: 500,
      error: 'falhou para fulano@exemplo.com com Bearer eyJhbGciOi.abc.def params: minha transcrição secreta',
      requestId: 'req-1',
    })
    expect(enviados).toHaveLength(1)
    const evento = JSON.parse(enviados[0].split('\n')[2])
    const tudo = JSON.stringify(evento)
    expect(tudo).not.toContain('fulano@exemplo.com')
    expect(tudo).not.toContain('eyJhbGciOi')
    expect(tudo).not.toContain('transcrição secreta')
    expect(evento.tags).toMatchObject({ event: 'sessions_route_error', route: '/api/sessions', status: '500' })
    expect(evento.extra.requestId).toBe('req-1')
    expect(evento.environment).toBe('teste')
    expect(evento.release).toBe('abc')
  })

  it('campo fora da allowlist do logger nunca chega ao Sentry', () => {
    log('error', { event: 'x', error: 'y', ...({ transcricao: 'texto do usuário' } as object) } as never)
    expect(enviados.join('')).not.toContain('texto do usuário')
  })

  it('warn e info não vão', () => {
    log('warn', { event: 'aviso' })
    log('info', { event: 'info' })
    expect(enviados).toHaveLength(0)
  })

  it('DSN inválido não monta sink', () => {
    expect(sinkDoSentry({ dsn: 'lixo' })).toBeNull()
  })
})

describe('navegador', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function carregar(identidade: 'conta' | 'anonimo') {
    vi.resetModules()
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    const chamadas: Array<{ url: string; corpo: string }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        chamadas.push({ url: String(url), corpo: String(init?.body ?? '') })
        return new Response('{}')
      }),
    )
    vi.doMock('../src/data/api', () => ({ apiFetch: async () => new Response('{}') }))
    vi.doMock('../src/lib/identidade', () => ({ estadoDeIdentidade: () => identidade }))
    const mod = await import('../src/lib/relatorioDeErros')
    return { mod, chamadas }
  }

  it('com conta: envia direto ao Sentry, com a mensagem redigida', async () => {
    const { mod, chamadas } = await carregar('conta')
    mod.reportarErro('render', 'quebrou para ciclano@exemplo.com', 'at x (app.js:1:2)')
    const sentry = chamadas.filter((c) => c.url.includes('sentry.io'))
    expect(sentry).toHaveLength(1)
    expect(sentry[0].corpo).not.toContain('ciclano@exemplo.com')
  })

  it('sem conta: nada sai para o Sentry (a promessa do modo sem conta)', async () => {
    const { mod, chamadas } = await carregar('anonimo')
    mod.reportarErro('render', 'quebrou', undefined)
    expect(chamadas.filter((c) => c.url.includes('sentry.io'))).toHaveLength(0)
  })
})
