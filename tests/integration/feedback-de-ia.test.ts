/**
 * O FEEDBACK DE IA — `POST /api/ai/feedback` (Fase B do plano de qualidade da IA paga, item 4).
 *
 * O que se prova:
 *   - avaliação válida → 202, conta em `ia_feedback_total{funcao, nota, motivo}` e vira NOTA no Langfuse
 *     (`score-create`, 1/0) presa a um rastro próprio, com função, modelo, nível e motivo — e SEM id de usuário,
 *     sessão ou conteúdo;
 *   - enum inválido → 400; texto livre (qualquer chave fora do contrato) → 400, e nada é contado nem enviado;
 *   - menor e convidado avaliam igual (só listas fechadas: não há texto a consentir);
 *   - o modelo fora do registro vira `outro` (o rótulo nunca é o texto que chegou);
 *   - na rede, as notas vão a `/api/public/ingestion` e os rastros ao OTLP, cada um no seu endpoint.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let feedback: typeof import('../../server/ai/feedback')
let lf: typeof import('../../server/lib/langfuse')
let metricas: typeof import('../../server/http/metricas')
let prom: typeof import('prom-client')
let dir: string
let arquivo: string

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), r)
  return r
}

function enviar(body: unknown, extras: Record<string, unknown> = {}) {
  const res = mockRes()
  feedback.registrarFeedback({ userId: 'usuario-feedback', body, requestId: 'r-fb', ...extras } as any, res)
  return res
}

async function eventos(): Promise<any[]> {
  await lf.langfuse().descarregar()
  let texto: string
  try {
    texto = readFileSync(arquivo, 'utf8')
  } catch {
    return []
  }
  return texto
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

const valor = async (prefixo: string) => {
  const linha = (await prom.register.metrics()).split('\n').find((l) => l.startsWith(prefixo))
  return linha === undefined ? undefined : Number(linha.slice(linha.lastIndexOf(' ') + 1))
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  feedback = await h.load('../../server/ai/feedback')
  lf = await h.load('../../server/lib/langfuse')
  metricas = await h.load('../../server/http/metricas')
  prom = await import('prom-client')
})
afterAll(async () => {
  lf.redefinirLangfuse()
  metricas.esquecerMetricas()
  await h.cleanup()
})
beforeEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = mkdtempSync(join(tmpdir(), 'feedback-'))
  arquivo = join(dir, 'ia.jsonl')
  lf.redefinirLangfuse({ arquivo, intervaloMs: 0, ambiente: 'test' })
  metricas.esquecerMetricas()
  metricas.handlerDeMetricas()
})

describe('POST /api/ai/feedback', () => {
  it('202: conta a métrica e manda a nota ao Langfuse, sem usuário, sessão nem conteúdo', async () => {
    const res = enviar({
      funcao: 'explicacao',
      nota: 'down',
      motivo: 'errado',
      nivel: 'nuance',
      modelo: 'x/desconhecido',
    })
    expect(res.statusCode).toBe(202)
    expect(res.body).toEqual({ ok: true })
    expect(await valor('ia_feedback_total{funcao="explicacao",nota="down",motivo="errado"}')).toBe(1)

    const evs = await eventos()
    const rastro = evs.find((e) => e.type === 'trace-create')
    const nota = evs.find((e) => e.type === 'score-create')
    expect(rastro.body.name).toBe('feedback-ia')
    expect(rastro.body.userId).toBeUndefined()
    expect(rastro.body.sessionId).toBeUndefined()
    expect(nota.body).toMatchObject({
      traceId: rastro.body.id,
      name: 'feedback-explicacao',
      value: 0,
      dataType: 'NUMERIC',
      metadata: { funcao: 'explicacao', nota: 'down', motivo: 'errado', nivel: 'nuance', modelo: 'outro' },
    })
    // O horário vai ARREDONDADO ao minuto: não dá para casar a nota com o rastro da explicação pelo instante.
    for (const iso of [rastro.timestamp, rastro.body.timestamp, nota.timestamp])
      expect(Date.parse(iso) % 60_000).toBe(0)
    expect(rastro.body.metadata.latenciaMs).toBe(0)
    const tudo = JSON.stringify(evs)
    expect(tudo).not.toContain('usuario-feedback')
    expect(tudo).not.toContain('x/desconhecido')
  })

  it('👍 vale 1 e não leva motivo (nem como série)', async () => {
    expect(enviar({ funcao: 'tutor', nota: 'up', motivo: 'errado' }).statusCode).toBe(202)
    expect(await valor('ia_feedback_total{funcao="tutor",nota="up",motivo="nenhum"}')).toBe(1)
    const nota = (await eventos()).find((e) => e.type === 'score-create')
    expect(nota.body.value).toBe(1)
    expect(nota.body.metadata.motivo).toBeUndefined()
    expect(nota.body.metadata.modelo).toBe('desconhecido')
  })

  it('enum inválido → 400; texto livre (chave fora do contrato) → 400; nada contado nem enviado', async () => {
    for (const corpo of [
      {},
      { funcao: 'traducao', nota: 'up' },
      { funcao: 'resumo', nota: 'meh' },
      { funcao: 'resumo', nota: 'down', motivo: 'não gostei da resposta' },
      { funcao: 'resumo', nota: 'down', nivel: 'turbo' },
      { funcao: 'resumo', nota: 'down', modelo: 'tem espaço e texto livre' },
      { funcao: 'resumo', nota: 'down', comentario: 'achei confuso' },
      { funcao: 'resumo', nota: 'down', texto: 'see you later', traducao: 'até mais' },
    ]) {
      expect(enviar(corpo).statusCode, JSON.stringify(corpo)).toBe(400)
    }
    expect(await valor('ia_feedback_total')).toBeUndefined()
    expect(await eventos()).toHaveLength(0)
  })

  it('menor e convidado avaliam com as mesmas listas fechadas', async () => {
    expect(enviar({ funcao: 'nuance', nota: 'down', motivo: 'confuso' }, { userId: 'menor-14' }).statusCode).toBe(202)
    expect(
      enviar({ funcao: 'tutor', nota: 'down', motivo: 'nao_ajudou' }, { userId: 'anon-1', convidado: true }).statusCode,
    ).toBe(202)
    const notas = (await eventos()).filter((e) => e.type === 'score-create')
    expect(notas.map((n) => n.body.metadata.convidado)).toEqual([false, true])
    // E o menor que tenta mandar texto recebe o mesmo 400 de todo mundo.
    expect(enviar({ funcao: 'nuance', nota: 'down', comentario: 'oi' }, { userId: 'menor-14' }).statusCode).toBe(400)
  })

  it('na rede: as notas vão à ingestão de scores, os rastros ao OTLP', async () => {
    const pedidos: Array<{ url: string; corpo: any }> = []
    lf.redefinirLangfuse({
      chavePublica: 'pk',
      chaveSecreta: 'sk',
      baseUrl: 'https://langfuse.exemplo',
      intervaloMs: 0,
      ambiente: 'test',
      buscar: (async (url: string, init: any) => {
        pedidos.push({ url, corpo: JSON.parse(init.body) })
        return new Response('{}', { status: 200 })
      }) as any,
    })
    enviar({ funcao: 'alternativas', nota: 'down', motivo: 'idioma_errado' })
    await lf.langfuse().descarregar()
    const ingestao = pedidos.find((p) => p.url === 'https://langfuse.exemplo/api/public/ingestion')
    const otlp = pedidos.find((p) => p.url === 'https://langfuse.exemplo/api/public/otel/v1/traces')
    expect(ingestao?.corpo.batch).toHaveLength(1)
    expect(ingestao?.corpo.batch[0]).toMatchObject({ type: 'score-create', body: { value: 0, environment: 'test' } })
    expect(otlp?.corpo.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1)
  })
})
