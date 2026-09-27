/**
 * `/api/health` E `/api/ready` SÃO PERGUNTAS DIFERENTES — e quem lê cada uma toma decisão oposta.
 *
 *   `health` (liveness)  → "o processo está vivo e o boot terminou?" Quem lê decide REINICIAR.
 *   `ready`  (readiness) → "o processo consegue ATENDER agora?" Quem lê decide TIRAR DO
 *                          BALANCEADOR, sem matar nada.
 *
 * Até esta fase só existia o `health`, e ele vinha respondendo as duas por acidente. O custo disso
 * é simétrico e ruim dos dois lados: uma dependência fora do ar derrubando o `health` faz o
 * orquestrador reiniciar um processo perfeitamente vivo (e reiniciar não conserta banco caído, só
 * troca uma instância degradada por uma instância fria); e um `health` que ignora a dependência
 * mantém no balanceador uma réplica que responde 500 em toda rota.
 *
 * O QUE ESTE TESTE TRAVA, além das duas formas de resposta:
 *
 *   - o CONTRATO do `/api/health` ficou intocado. Ele está congelado em
 *     `tests/caracterizacao/__snapshots__/health.get.json` e é consumido pelo `HEALTHCHECK` e pelo
 *     vigia `uptime.yml`; mexer nele mudaria o comportamento de quem já o lê;
 *   - as duas rotas são PÚBLICAS (antes do `authMiddleware`): probe de orquestrador não tem token;
 *   - provedores de IA ficam FORA do ready. É a decisão que mais importa aqui: uma instabilidade
 *     na Groq/Gemini tiraria TODAS as réplicas do balanceador ao mesmo tempo, virando "o site
 *     caiu" o que é "a tradução caiu".
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste

beforeAll(async () => {
  s = await subirApp({ modo: 'publico' })
})

afterAll(async () => {
  await s.encerrar()
})

/* O ready guarda o veredicto por alguns segundos (auditoria de segurança 2026-09-26, ver
   `server/routes/health.ts`). Estes casos MUDAM o estado de uma dependência entre uma chamada e a
   outra — cada um precisa de um veredicto novo. */
beforeEach(async () => {
  const { esquecerVereditoDeProntidao } = await s.load('../../server/routes/health')
  esquecerVereditoDeProntidao()
})

describe('GET /api/ready', () => {
  it('200 e público — sem token, com o banco migrado pelo harness', async () => {
    const r = await s.get('/api/ready')
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as Record<string, unknown>
    expect(corpo.status).toBe('pronto')
    expect(corpo.db).toBe('up')
    expect(corpo.boot).toBe('ok')
    expect(typeof corpo.at).toBe('number')
  })

  it('responde a pergunta das MIGRAÇÕES, que é a que o `SELECT 1` não vê', async () => {
    // Código novo sobre banco velho é o modo de falha do deploy contínuo: `sessions` existe, o
    // `SELECT 1` passa, e a coluna que o código novo lê não está lá.
    const corpo = (await (await s.get('/api/ready')).json()) as Record<string, unknown>
    expect(corpo.migracoes).toBe('aplicadas')
  })

  it('sem S3/R2 configurado, o armazenamento se declara `nao-configurado` e não reprova', async () => {
    const corpo = (await (await s.get('/api/ready')).json()) as Record<string, unknown>
    expect(corpo.armazenamento).toBe('nao-configurado')
  })

  it('carrega o x-request-id, como toda resposta do servidor', async () => {
    expect((await s.get('/api/ready')).headers.get('x-request-id')).toBeTruthy()
  })

  it('não vaza detalhe de infra: nenhum caminho, driver ou endpoint no corpo', async () => {
    // A rota é pública. `armazenamento: 'indisponivel'` nomeia a DEPENDÊNCIA; a causa vai para o
    // log, correlata pelo requestId.
    const texto = await (await s.get('/api/ready')).text()
    expect(texto).not.toMatch(/libsql|sqlite|https?:\/\/|[A-Za-z]:\\|\/tmp\//)
  })
})

/**
 * ADR 0009: com UMA máquina só, o R2 fora do ar tirava o serviço inteiro do roteamento (o Fly lê
 * o `/api/ready`). O armazenamento externo é uma dependência DEGRADÁVEL, como a IA: o upload de
 * áudio responde 503 sozinho, e o resto do app segue. O ready continua 200, mas diz no corpo o
 * que está degradado — e o log (warn) e a métrica avisam quem opera.
 */
describe('GET /api/ready com o R2 configurado', () => {
  const CHAVES_S3 = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const
  let r2: Server
  let respostaDoR2 = 403

  beforeAll(async () => {
    r2 = createServer((_req, res) => {
      res.statusCode = respostaDoR2
      res.end()
    })
    await new Promise<void>((ok) => r2.listen(0, '127.0.0.1', () => ok()))
    const endereco = r2.address()
    process.env.S3_ENDPOINT = `http://127.0.0.1:${typeof endereco === 'object' && endereco ? endereco.port : 0}`
    process.env.S3_BUCKET = 'midia'
    process.env.S3_ACCESS_KEY_ID = 'chave'
    process.env.S3_SECRET_ACCESS_KEY = 'segredo'
  })

  afterAll(async () => {
    for (const k of CHAVES_S3) delete process.env[k]
    await new Promise<void>((ok) => r2.close(() => ok()))
  })

  it('R2 respondendo: 200 e `armazenamento: ok`', async () => {
    respostaDoR2 = 404 // HEAD numa chave que ninguém grava: o caso normal
    const r = await s.get('/api/ready')
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as Record<string, unknown>
    expect(corpo.status).toBe('pronto')
    expect(corpo.armazenamento).toBe('ok')
  })

  it('R2 recusando: continua 200, o corpo diz `degradado` e nomeia a dependência, e o log é warn', async () => {
    respostaDoR2 = 403
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const erros = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const r = await s.get('/api/ready')
      expect(r.status).toBe(200)
      const corpo = (await r.json()) as Record<string, unknown>
      expect(corpo.status).toBe('degradado')
      expect(corpo.armazenamento).toBe('indisponivel')
      expect(corpo.db).toBe('up')
      const eventoEm = (chamadas: unknown[][]) =>
        chamadas.map((c) => String(c[0])).find((l) => l.includes('"ready_armazenamento_indisponivel"'))
      // warn e não error: é degradação prevista, não queda — o Sentry não deve acordar ninguém por ela.
      expect(eventoEm(avisos.mock.calls)).toBeTruthy()
      expect(eventoEm(erros.mock.calls)).toBeUndefined()
    } finally {
      avisos.mockRestore()
      erros.mockRestore()
    }
  })
})

describe('GET /api/health continua sendo a outra pergunta', () => {
  it('200 e público, com o contrato de sempre', async () => {
    const r = await s.get('/api/health')
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as Record<string, unknown>
    // As chaves congeladas no snapshot de caracterização. `migracoes` e `armazenamento` NÃO entram
    // aqui: quem consome o health decide reiniciar, e isso não é motivo para reiniciar. `versao`
    // (P0-7b) entrou como campo informativo: diz qual build está no ar, e não decide nada.
    expect(Object.keys(corpo).sort()).toEqual(['at', 'boot', 'db', 'status', 'versao'])
  })
})

describe('migracoesAplicadas: o veredicto, incluindo o caso em que ele NÃO sabe', () => {
  it('`aplicadas` quando o journal e o banco batem', async () => {
    const { migracoesAplicadas } = await s.load('../../server/db/manutencao')
    expect(await migracoesAplicadas()).toBe('aplicadas')
  })

  it('`desconhecida` sem a pasta de migrações — a réplica que serve e não migra (P1-N1)', async () => {
    // Topologia legítima e já documentada em `aplicarMigrations()`: um nó migra, os outros só
    // servem, sem a pasta no disco. Reprovar ali tiraria do balanceador uma instância que atende.
    const vazio = mkdtempSync(join(tmpdir(), 'sem-migracoes-'))
    const antes = process.env.MIGRATIONS_DIR
    process.env.MIGRATIONS_DIR = vazio
    try {
      const { migracoesAplicadas } = await s.load('../../server/db/manutencao')
      expect(await migracoesAplicadas()).toBe('desconhecida')
    } finally {
      if (antes === undefined) delete process.env.MIGRATIONS_DIR
      else process.env.MIGRATIONS_DIR = antes
      rmSync(vazio, { recursive: true, force: true })
    }
  })
})
