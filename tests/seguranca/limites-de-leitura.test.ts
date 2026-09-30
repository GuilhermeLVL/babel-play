/**
 * AUDITORIA DE SEGURANÇA 2026-09-26 — LEITURA SEM TETO.
 *
 * A matriz rota × guarda (`matriz-de-rotas.test.ts`) cobra limitador em toda ESCRITA privada, e
 * esse é o único eixo que ela olha: o `writeLimiter` pula GET e HEAD por desenho. A auditoria leu
 * a outra metade da pilha e achou quatro leituras que custam caro e não encontravam teto nenhum:
 *
 *   - `GET /api/me/exportar` lê a conta INTEIRA em memória (17 tabelas) a cada chamada — num laço,
 *     é a forma mais barata de ocupar o SQLite e o heap do processo com uma conta só;
 *   - `GET /api/images/search` faz uma chamada de SAÍDA ao Openverse por requisição: o servidor
 *     vira amplificador contra um terceiro, e é o IP dele que acaba bloqueado;
 *   - `GET /api/ready` é PÚBLICA e, a cada chamada, consulta o banco, confere as migrações e (com
 *     R2 configurado) faz um HEAD no armazenamento — operação cobrada pelo provedor, disparável por
 *     qualquer estranho sem token;
 *   - `GET /api/rank/:jogo` é pública e vai ao banco sem balde nenhum.
 *
 * E, em geral, nenhuma leitura autenticada tinha teto por usuário.
 *
 * `TRUST_PROXY=1` pelo mesmo motivo de `cabecalhos-e-forca-bruta.test.ts`: os baldes públicos são
 * por IP, e sem ele todos os casos chegariam como `127.0.0.1`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
let trustProxyAnterior: string | undefined

beforeAll(async () => {
  trustProxyAnterior = process.env.TRUST_PROXY
  process.env.TRUST_PROXY = '1'
  s = await subirApp({ modo: 'publico' })
}, 60_000)

afterAll(async () => {
  await s.encerrar()
  if (trustProxyAnterior === undefined) delete process.env.TRUST_PROXY
  else process.env.TRUST_PROXY = trustProxyAnterior
})

/** Faz `n` GETs e devolve o índice (1-based) do primeiro 429, ou 0 se não houve. */
async function primeiro429(n: number, caminho: string, headers: Record<string, string>): Promise<number> {
  for (let i = 0; i < n; i++) {
    const r = await s.chamar('GET', caminho, { headers })
    await r.arrayBuffer()
    if (r.status === 429) return i + 1
  }
  return 0
}

/**
 * O balde da busca de imagens é o MINUTO DO RELÓGIO (`rateLimitStore.ts`: `Math.floor(t / 60_000)`).
 * Um laço que atravessa a virada começa a contar de novo no meio, e o primeiro 429 chega depois do
 * teto (visto no CI: o 62º; reproduzido começando o laço 50 ms antes da virada). Com menos de
 * `folgaMs` sobrando no minuto, espera o próximo — o teste mede o teto, não a sorte do relógio.
 */
async function noComecoDeUmMinuto(folgaMs = 30_000): Promise<void> {
  const resta = 60_000 - (Date.now() % 60_000)
  if (resta < folgaMs) await new Promise((r) => setTimeout(r, resta + 50))
}

describe('exportação da conta', () => {
  it('repetir a exportação acaba em 429 (teto por usuário e por hora)', async () => {
    const token = await s.token('quem-exporta-em-laco')
    const headers = { authorization: `Bearer ${token}`, 'x-forwarded-for': '198.51.100.1' }
    const em = await primeiro429(10, '/api/me/exportar', headers)
    expect(em, 'a exportação nunca foi barrada').toBeGreaterThan(0)
    /* O titular legítimo exporta uma vez; o teto deixa margem para repetir se o download falhar. */
    expect(em, 'o teto é generoso o bastante para o uso legítimo').toBeGreaterThan(3)
  }, 60_000)

  it('o balde da exportação é por usuário: outra conta exporta normalmente', async () => {
    const token = await s.token('outra-conta-que-exporta')
    const r = await s.chamar('GET', '/api/me/exportar', {
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '198.51.100.1' },
    })
    expect(r.status).toBe(200)
  })
})

describe('leituras autenticadas', () => {
  it('um laço de leituras da mesma conta encontra teto', async () => {
    const token = await s.token('quem-le-em-laco')
    const headers = { authorization: `Bearer ${token}`, 'x-forwarded-for': '198.51.100.2' }
    const em = await primeiro429(400, '/api/settings', headers)
    expect(em, 'nenhuma leitura autenticada foi barrada').toBeGreaterThan(0)
    expect(em, 'o teto não pode atrapalhar a navegação normal').toBeGreaterThan(200)
  }, 120_000)

  it('a busca de imagens tem balde próprio e curto (chamada de saída por requisição)', async () => {
    const token = await s.token('quem-busca-imagem-em-laco')
    const headers = { authorization: `Bearer ${token}`, 'x-forwarded-for': '198.51.100.3' }
    /* `q` vazio responde sem ir ao Openverse — o teste mede o limitador, não a rede. */
    await noComecoDeUmMinuto()
    const em = await primeiro429(100, '/api/images/search?q=', headers)
    expect(em, 'a busca de imagens nunca foi barrada').toBeGreaterThan(0)
    expect(em).toBeLessThanOrEqual(61)
  }, 90_000)
})

describe('rotas públicas de leitura', () => {
  it('GET /api/rank/:jogo tem balde por IP', async () => {
    const em = await primeiro429(200, '/api/rank/termo', { 'x-forwarded-for': '198.51.100.4' })
    expect(em, 'o placar público nunca foi barrado').toBeGreaterThan(0)
    // Outro IP não é afetado pelo balde de quem martelou.
    const r = await s.chamar('GET', '/api/rank/termo', { headers: { 'x-forwarded-for': '198.51.100.5' } })
    expect(r.status).toBe(200)
  }, 60_000)

  it('GET /api/ready reaproveita o veredicto por alguns segundos (não sonda a cada chamada)', async () => {
    const a = (await (await s.get('/api/ready')).json()) as { at: number }
    const b = (await (await s.get('/api/ready')).json()) as { at: number }
    expect(b.at, 'a segunda chamada refez as sondas em vez de reaproveitar').toBe(a.at)
  })
})

describe('parser de query', () => {
  /**
   * O `qs` (parser "extended", o padrão do Express 4) tem dois avisos abertos de negação de serviço
   * (GHSA-x5fp-wj9c-mxmx e GHSA-4mjr-xmp4-gh2g) e roda ANTES do auth, em toda requisição. Nenhuma rota usa
   * a sintaxe aninhada (`a[b]=`) — o parser simples do Node (`querystring`) atende tudo e tira o
   * `qs` do caminho pré-autenticação.
   */
  it('a sintaxe aninhada não vira objeto', async () => {
    const r = await s.chamar('GET', '/api/rank/termo?limite[$gt]=1', { headers: { 'x-forwarded-for': '198.51.100.6' } })
    expect(r.status).toBe(200)
    const { criarApp } = await s.load('../../server/http/app')
    expect(criarApp({}).get('query parser')).toBe('simple')
  })
})
