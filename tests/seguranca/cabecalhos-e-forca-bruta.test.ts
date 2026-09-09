/**
 * FASE 4 — CABEÇALHOS, ORIGEM CRUZADA, COOKIES E FORÇA BRUTA.
 *
 * Quatro perguntas do mandato de segurança que só se respondem com o servidor de pé, porque todas
 * dependem da ORDEM da montagem e não do conteúdo de nenhum arquivo de rota:
 *
 *   1. os headers de hardening saem, e a CSP existe também fora de produção?
 *   2. uma origem estranha recebe `Access-Control-Allow-Origin`?
 *   3. alguma rota lê cookie? (é o que decide se CSRF é uma pergunta aberta ou não)
 *   4. quem erra o token repetidamente encontra teto?
 *
 * A 4 é a que mudou o código. As outras três são prova negativa: registram, por execução, um
 * estado que hoje está certo e que uma mudança futura pode quebrar em silêncio — em especial a 3,
 * porque a resposta "CSRF não se aplica" vale exatamente enquanto ninguém montar `cookie-parser`.
 *
 * `TRUST_PROXY=1` é ligado aqui porque o balde de 401 é chaveado por IP: sem ele todos os casos
 * chegariam como `127.0.0.1` e um contaminaria o outro. De quebra, é o único teste que exercita o
 * caminho de `interpretarTrustProxy`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
let trustProxyAnterior: string | undefined

/** Cada caso do balde de 401 fala de um IP próprio — o `X-Forwarded-For` é o que vira a chave. */
const IP_ATACANTE = '203.0.113.10'
const IP_DE_QUEM_NAVEGA = '203.0.113.20'

beforeAll(async () => {
  trustProxyAnterior = process.env.TRUST_PROXY
  process.env.TRUST_PROXY = '1'
  s = await subirApp({ modo: 'publico' })
  // O `subirApp` sobe banco efêmero, migrações e o app inteiro; 10 s (o default) é apertado nesta
  // máquina quando a suíte roda em paralelo.
}, 60_000)

afterAll(async () => {
  await s.encerrar()
  if (trustProxyAnterior === undefined) delete process.env.TRUST_PROXY
  else process.env.TRUST_PROXY = trustProxyAnterior
})

describe('cabeçalhos de hardening', () => {
  it('a resposta traz o conjunto do helmet', async () => {
    const r = await s.get('/api/health')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('x-frame-options')).toBeTruthy()
    expect(r.headers.get('referrer-policy')).toBeTruthy()
    // `X-Powered-By` diz a versão do framework de graça para quem procura alvo.
    expect(r.headers.get('x-powered-by')).toBeNull()
  })

  /**
   * FORA DE PRODUÇÃO A CSP EXISTE, EM MODO RELATÓRIO. Ela era `false` fora de produção, e o efeito
   * é o de qualquer portão que só liga no fim: a primeira vez que alguém vê a política é quando ela
   * já está bloqueando. As diretivas são as MESMAS dos dois lados — só muda qual dos dois headers
   * sai, e portanto se o navegador bloqueia ou só reclama.
   */
  it('em dev sai Content-Security-Policy-Report-Only, com as mesmas diretivas', async () => {
    const r = await s.get('/api/health')
    const relatorio = r.headers.get('content-security-policy-report-only')
    expect(relatorio, 'a CSP tem que existir fora de produção também').toBeTruthy()
    expect(r.headers.get('content-security-policy'), 'em dev ela não pode BLOQUEAR').toBeNull()

    // As diretivas que existem porque o app precisa delas — se alguém as apagar, o WASM do Whisper
    // e os workers em blob param em produção, e o teste é onde isso aparece primeiro.
    expect(relatorio).toContain("default-src 'self'")
    expect(relatorio).toContain("'wasm-unsafe-eval'")
    expect(relatorio).toContain('worker-src')
    expect(relatorio).toContain("object-src 'none'")
  })
})

describe('origem cruzada', () => {
  /**
   * Não há middleware de CORS montado, e é isso que se está travando: o servidor NUNCA devolve
   * `Access-Control-Allow-Origin`, então nenhuma página de outro domínio lê resposta daqui pelo
   * navegador. Se alguém acrescentar `cors()` sem lista de origens, este teste cai.
   */
  it('uma origem estranha não recebe Access-Control-Allow-Origin', async () => {
    const r = await s.chamar('GET', '/api/health', { headers: { origin: 'https://atacante.exemplo' } })
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
    expect(r.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('nem no preflight', async () => {
    const r = await s.chamar('OPTIONS', '/api/me', {
      headers: {
        origin: 'https://atacante.exemplo',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    })
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('cookies e CSRF', () => {
  /**
   * POR QUE CSRF NÃO SE APLICA AQUI, e por que isso precisa de teste em vez de comentário.
   *
   * A autenticação é `Authorization: Bearer` — um header que o navegador NÃO anexa sozinho numa
   * requisição disparada por outro site. Sem credencial ambiente não há CSRF. Mas essa frase deixa
   * de ser verdadeira no minuto em que alguém montar `cookie-parser` e ler um token de cookie, e
   * essa mudança não pareceria uma mudança de segurança para quem a fizesse.
   */
  it('o servidor não emite cookie', async () => {
    const r = await s.get('/api/health')
    expect(r.headers.get('set-cookie')).toBeNull()
  })

  it('um cookie enviado não autentica ninguém', async () => {
    const token = await s.token('usuario-do-teste')
    const r = await s.chamar('GET', '/api/me', {
      headers: { cookie: `authorization=Bearer ${token}; token=${token}`, 'x-forwarded-for': '203.0.113.30' },
    })
    expect(r.status, 'cookie não pode substituir o header').toBe(401)
  })
})

describe('força bruta contra o token', () => {
  /**
   * O ACHADO. Os dois limitadores existentes são montados DEPOIS do `authMiddleware`, porque a
   * chave deles é o tenant — então uma requisição que termina em 401 não chegava a limitador
   * nenhum. Quem adivinha token, ou testa um vazado contra várias contas, não encontrava teto.
   */
  it('401 repetido acaba em 429', async () => {
    let status = 0
    let tentativas = 0
    // O teto é 30 em 15 minutos; 40 tentativas passam dele com folga.
    for (let i = 0; i < 40; i++) {
      const r = await s.chamar('GET', '/api/me', {
        headers: { authorization: 'Bearer token-inventado', 'x-forwarded-for': IP_ATACANTE },
      })
      status = r.status
      tentativas = i + 1
      if (status === 429) break
    }
    expect(status, 'o servidor deveria ter parado de responder 401 e passado a 429').toBe(429)
    expect(tentativas, 'o teto declarado é 30').toBeGreaterThan(30)
  }, 60_000)

  /**
   * O OUTRO LADO, que é o que torna o limitador utilizável: `skipSuccessfulRequests` faz o contador
   * ignorar tudo que não é 401. Sem isso, um teto de 30 seria um teto de 30 REQUISIÇÕES por quarto
   * de hora, e derrubaria qualquer pessoa usando o produto.
   */
  it('quem navega autenticado não gasta o balde', async () => {
    const token = await s.token('usuario-que-navega')
    for (let i = 0; i < 40; i++) {
      const r = await s.chamar('GET', '/api/me', {
        headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': IP_DE_QUEM_NAVEGA },
      })
      expect(r.status, `a chamada ${i + 1} não podia ser barrada`).not.toBe(429)
    }
  }, 60_000)

  /**
   * O RAIO DE ALCANCE, medido e registrado porque é uma decisão e não um acidente.
   *
   * O limitador fica ANTES do `authMiddleware` — é o que faz dele proteção de verdade, porque
   * recusa a requisição em vez de só trocar a resposta. O preço é que, uma vez estourado, o balde
   * bloqueia TUDO daquela chave na janela, inclusive uma requisição com token bom. É o
   * comportamento de qualquer bloqueio por origem (é o que o `fail2ban` faz), e o motivo de a chave
   * precisar ser o IP REAL do cliente: atrás de proxy, sem `TRUST_PROXY`, a chave seria o IP do
   * proxy e o bloqueio de um atacante pegaria todo mundo junto.
   */
  it('caracterização: estourado o balde, a mesma origem é barrada mesmo com token válido', async () => {
    const token = await s.token('usuario-atras-do-mesmo-ip')
    const r = await s.chamar('GET', '/api/me', {
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': IP_ATACANTE },
    })
    expect(r.status).toBe(429)
  })
})
