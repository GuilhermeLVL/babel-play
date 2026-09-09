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
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste

beforeAll(async () => {
  s = await subirApp({ modo: 'publico' })
})

afterAll(async () => {
  await s.encerrar()
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

describe('GET /api/health continua sendo a outra pergunta', () => {
  it('200 e público, com o contrato de sempre', async () => {
    const r = await s.get('/api/health')
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as Record<string, unknown>
    // As chaves congeladas no snapshot de caracterização. `migracoes` e `armazenamento` NÃO entram
    // aqui: quem consome o health decide reiniciar, e isso não é motivo para reiniciar.
    expect(Object.keys(corpo).sort()).toEqual(['at', 'boot', 'db', 'status'])
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
