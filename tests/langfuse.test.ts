/**
 * O CLIENTE DO LANGFUSE (`server/lib/langfuse.ts`) — telemetria de custo e latência da IA SEM SDK.
 *
 * O que estes casos prendem é o que tornaria a telemetria perigosa ou inútil se quebrasse:
 *   - DESLIGADO sem chaves e sem arquivo: nada sai, nada fica na memória;
 *   - LOTE: junta até 50 eventos ou 5 s, e manda UM POST no formato OTLP/JSON que o Langfuse v4
 *     aceita (`/api/public/otel/v1/traces`, Basic auth, `x-langfuse-ingestion-version: 4`);
 *   - FILA LIMITADA: acima de 1.000 eventos o mais velho sai e a perda é CONTADA;
 *   - NUNCA LANÇA: rede fora, 500, arquivo sem permissão — tudo vira contador, nunca exceção;
 *   - UMA retentativa, não uma tempestade;
 *   - PRIVACIDADE POR PADRÃO: texto de entrada/saída não sai sem `LANGFUSE_CONTEUDO=1`, e produção
 *     RECUSA essa variável; o id do usuário vira pseudônimo estável e não reversível.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ClienteLangfuse, type DadosDoRastro, opcoesDoAmbiente, paraOtlp, pseudonimo } from '../server/lib/langfuse'

function rastro(extra: Partial<DadosDoRastro> = {}): DadosDoRastro {
  return {
    id: 'a'.repeat(32),
    nome: 'mt-fala',
    inicio: 1_700_000_000_000,
    fim: 1_700_000_000_900,
    usuario: 'u_abc',
    tags: ['mt-fala', 'pro'],
    metadados: { plano: 'pro', feature: 'mt-fala', statusHttp: 200 },
    geracoes: [
      {
        id: 'b'.repeat(16),
        nome: 'mt-fala',
        inicio: 1_700_000_000_100,
        fim: 1_700_000_000_800,
        provedor: 'groq',
        modelo: 'openai/gpt-oss-120b',
        status: 'ok',
        tentativa: 1,
        uso: { input: 120, output: 40 },
        custoUsd: 0.000042,
        metadados: { rotulo: 'llm-primario' },
        entrada: 'TEXTO SECRETO DO USUARIO',
        saida: 'TRADUCAO SECRETA',
      },
    ],
    ...extra,
  }
}

interface Envio {
  url: string
  init: RequestInit
  corpo: any
}

function buscaFalsa(status = 200) {
  const envios: Envio[] = []
  const buscar = vi.fn(async (url: any, init: any) => {
    envios.push({ url: String(url), init, corpo: JSON.parse(String(init.body)) })
    return new Response('{}', { status })
  })
  return { envios, buscar: buscar as unknown as typeof fetch }
}

const clientes: ClienteLangfuse[] = []
function cliente(o: ConstructorParameters<typeof ClienteLangfuse>[0]): ClienteLangfuse {
  const c = new ClienteLangfuse({ intervaloMs: 0, ...o })
  clientes.push(c)
  return c
}
afterEach(async () => {
  for (const c of clientes.splice(0)) await c.encerrar()
})

const CHAVES = { chavePublica: 'pk-lf-teste', chaveSecreta: 'sk-lf-teste' }

describe('ClienteLangfuse — desligado', () => {
  it('sem chaves e sem arquivo fica DESLIGADO: enviar não enfileira e não chama a rede', async () => {
    const { buscar } = buscaFalsa()
    const c = cliente({ buscar })
    expect(c.ligado).toBe(false)
    c.enviar(rastro())
    expect(c.pendentes()).toBe(0)
    await c.descarregar()
    expect(buscar).not.toHaveBeenCalled()
  })

  it('opcoesDoAmbiente: sem LANGFUSE_* não liga nada; a base padrão é a nuvem da UE', () => {
    const o = opcoesDoAmbiente({})
    expect(o.chavePublica).toBeUndefined()
    expect(o.baseUrl).toBe('https://cloud.langfuse.com')
    expect(o.conteudo).toBe(false)
  })

  it('só UMA das chaves não liga a rede (meia configuração seria 401 em loop)', () => {
    const { buscar } = buscaFalsa()
    expect(cliente({ chavePublica: 'pk', buscar }).ligado).toBe(false)
  })
})

describe('ClienteLangfuse — lote e envio', () => {
  it('descarregar manda UM POST OTLP/JSON autenticado, com o cabeçalho da ingestão v4', async () => {
    const { envios, buscar } = buscaFalsa()
    const c = cliente({ ...CHAVES, baseUrl: 'https://cloud.langfuse.com/', buscar })
    c.enviar(rastro())
    expect(c.pendentes()).toBe(2) // o rastro + a geração
    await c.descarregar()
    expect(envios).toHaveLength(1)
    const e = envios[0]
    expect(e.url).toBe('https://cloud.langfuse.com/api/public/otel/v1/traces')
    const h = e.init.headers as Record<string, string>
    expect(h.authorization).toBe('Basic ' + Buffer.from('pk-lf-teste:sk-lf-teste').toString('base64'))
    expect(h['x-langfuse-ingestion-version']).toBe('4')
    expect(h['content-type']).toBe('application/json')
    const spans = e.corpo.resourceSpans[0].scopeSpans[0].spans
    expect(spans).toHaveLength(2)
    expect(c.pendentes()).toBe(0)
  })

  it('50 eventos disparam o envio sem esperar o relógio', async () => {
    const { envios, buscar } = buscaFalsa()
    const c = cliente({ ...CHAVES, buscar })
    for (let i = 0; i < 25; i++) c.enviar(rastro()) // 25 × (rastro + geração) = 50
    await c.aguardarEnvio()
    expect(envios).toHaveLength(1)
    expect(envios[0].corpo.resourceSpans[0].scopeSpans[0].spans).toHaveLength(50)
  })

  it('o relógio de 5 s descarrega o que ficou abaixo do lote', async () => {
    vi.useFakeTimers()
    try {
      const { envios, buscar } = buscaFalsa()
      const c = cliente({ ...CHAVES, buscar, intervaloMs: 5_000 })
      c.enviar(rastro())
      expect(envios).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(5_000)
      await c.aguardarEnvio()
      expect(envios).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fila LIMITADA: acima do teto o mais velho sai e a perda é contada', async () => {
    const { buscar } = buscaFalsa()
    const c = cliente({ ...CHAVES, buscar, filaMaxima: 10, loteMaximo: 1_000 })
    for (let i = 0; i < 8; i++) c.enviar(rastro()) // 16 eventos numa fila de 10
    expect(c.pendentes()).toBe(10)
    expect(c.descartados).toBe(6)
  })

  it('rede fora: UMA retentativa, depois desiste sem lançar e conta a falha', async () => {
    const buscar = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const c = cliente({ ...CHAVES, buscar })
    c.enviar(rastro())
    await expect(c.descarregar()).resolves.toBeUndefined()
    expect(buscar).toHaveBeenCalledTimes(2)
    expect(c.falhas).toBe(2)
  })

  it('HTTP 500: UMA retentativa; a segunda dando certo não conta perda', async () => {
    let n = 0
    const buscar = vi.fn(async () => new Response('', { status: n++ === 0 ? 500 : 207 })) as unknown as typeof fetch
    const c = cliente({ ...CHAVES, buscar })
    c.enviar(rastro())
    await c.descarregar()
    expect(buscar).toHaveBeenCalledTimes(2)
    expect(c.falhas).toBe(1)
    expect(c.pendentes()).toBe(0)
  })

  it('enviar nunca lança, nem com dados absurdos', () => {
    const c = cliente({ ...CHAVES, buscar: buscaFalsa().buscar })
    expect(() => c.enviar({ ...rastro(), geracoes: undefined as any })).not.toThrow()
  })
})

describe('ClienteLangfuse — o formato que o Langfuse entende', () => {
  it('rastro vira span RAIZ com usuário, sessão, tags e metadados; a geração é FILHA dele', () => {
    const corpo = paraOtlp(
      [
        { tipo: 'trace-create', corpo: rastro({ sessao: 's_1' }) },
        { tipo: 'generation-create', corpo: { ...rastro().geracoes[0], traceId: 'a'.repeat(32) } },
      ] as any,
      { ambiente: 'production', conteudo: false },
    )
    const [raiz, geracao] = corpo.resourceSpans[0].scopeSpans[0].spans
    const attrs = (s: any) => Object.fromEntries(s.attributes.map((a: any) => [a.key, a.value]))
    const r = attrs(raiz)
    expect(raiz.traceId).toBe('a'.repeat(32))
    expect(raiz.parentSpanId).toBeUndefined()
    expect(r['langfuse.user.id']).toEqual({ stringValue: 'u_abc' })
    expect(r['langfuse.session.id']).toEqual({ stringValue: 's_1' })
    expect(r['langfuse.trace.name']).toEqual({ stringValue: 'mt-fala' })
    expect(r['langfuse.trace.metadata.plano']).toEqual({ stringValue: 'pro' })
    expect(r['langfuse.trace.tags'].arrayValue.values).toEqual([{ stringValue: 'mt-fala' }, { stringValue: 'pro' }])
    expect(r['langfuse.environment']).toEqual({ stringValue: 'production' })

    const g = attrs(geracao)
    expect(geracao.traceId).toBe('a'.repeat(32))
    expect(geracao.parentSpanId).toBe(raiz.spanId)
    expect(g['langfuse.observation.type']).toEqual({ stringValue: 'generation' })
    expect(g['langfuse.observation.model.name']).toEqual({ stringValue: 'openai/gpt-oss-120b' })
    expect(JSON.parse(g['langfuse.observation.usage_details'].stringValue)).toEqual({ input: 120, output: 40 })
    expect(JSON.parse(g['langfuse.observation.cost_details'].stringValue)).toEqual({ total: 0.000042 })
    expect(g['langfuse.observation.metadata.provedor']).toEqual({ stringValue: 'groq' })
    expect(g['langfuse.observation.metadata.status']).toEqual({ stringValue: 'ok' })
    expect(geracao.startTimeUnixNano).toBe(String(1_700_000_000_100n * 1_000_000n))
  })

  it('429 vira nível WARNING com o status na mensagem — o sinal de subir o tier do provedor', () => {
    const g = { ...rastro().geracoes[0], status: '429' as const, traceId: 'a'.repeat(32) }
    const corpo = paraOtlp([{ tipo: 'generation-create', corpo: g }] as any, { conteudo: false })
    const span = corpo.resourceSpans[0].scopeSpans[0].spans[0]
    const a = Object.fromEntries(span.attributes.map((x: any) => [x.key, x.value]))
    expect(a['langfuse.observation.level']).toEqual({ stringValue: 'WARNING' })
    expect(a['langfuse.observation.status_message'].stringValue).toContain('429')
  })
})

describe('privacidade por padrão', () => {
  it('SEM LANGFUSE_CONTEUDO nenhum texto de entrada ou saída sai — nem na rede, nem no arquivo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lf-'))
    try {
      const arquivo = join(dir, 'ia.jsonl')
      const { envios, buscar } = buscaFalsa()
      const c = cliente({ ...CHAVES, buscar, arquivo })
      c.enviar(rastro())
      await c.descarregar()
      expect(JSON.stringify(envios[0].corpo)).not.toContain('SECRETO')
      expect(JSON.stringify(envios[0].corpo)).not.toContain('SECRETA')
      expect(readFileSync(arquivo, 'utf8')).not.toMatch(/SECRET[OA]/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('COM conteúdo ligado (só dev), o texto vai como input/output da geração', async () => {
    const { envios, buscar } = buscaFalsa()
    const c = cliente({ ...CHAVES, buscar, conteudo: true })
    c.enviar(rastro())
    await c.descarregar()
    expect(JSON.stringify(envios[0].corpo)).toContain('TEXTO SECRETO DO USUARIO')
  })

  it('produção RECUSA LANGFUSE_CONTEUDO=1 (menores usam o app; LGPD art. 14)', () => {
    expect(opcoesDoAmbiente({ LANGFUSE_CONTEUDO: '1', NODE_ENV: 'development' }).conteudo).toBe(true)
    const avisos: string[] = []
    const o = opcoesDoAmbiente({ LANGFUSE_CONTEUDO: '1', NODE_ENV: 'production' }, (m) => avisos.push(m))
    expect(o.conteudo).toBe(false)
    expect(avisos).toHaveLength(1)
  })

  it('pseudônimo: estável para o mesmo usuário, diferente entre usuários, e sem o id em claro', () => {
    const sal = 'sal-do-servidor'
    const a1 = pseudonimo(sal, 'user-123@exemplo.com')
    const a2 = pseudonimo(sal, 'user-123@exemplo.com')
    const b = pseudonimo(sal, 'user-456')
    expect(a1).toBe(a2)
    expect(a1).not.toBe(b)
    expect(a1).not.toContain('user-123')
    expect(a1).toMatch(/^u_[0-9a-f]{24}$/)
  })

  it('pseudônimo NÃO é reversível sem o sal: outro sal dá outro valor (não é um hash puro do id)', async () => {
    const { createHash } = await import('node:crypto')
    const id = 'user-123'
    const semSal = createHash('sha256').update(id).digest('hex').slice(0, 24)
    expect(pseudonimo('sal-a', id)).not.toBe('u_' + semSal)
    expect(pseudonimo('sal-a', id)).not.toBe(pseudonimo('sal-b', id))
  })
})

describe('sink de arquivo (análise local antes de o projeto Langfuse existir)', () => {
  it('funciona SEM chaves: grava um evento por linha, no formato de ingestão do Langfuse', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lf-'))
    try {
      const arquivo = join(dir, 'ia.jsonl')
      const c = cliente({ arquivo })
      expect(c.ligado).toBe(true)
      c.enviar(rastro())
      await c.descarregar()
      const linhas = readFileSync(arquivo, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l))
      expect(linhas.map((l) => l.type)).toEqual(['trace-create', 'generation-create'])
      expect(linhas[0].body).toMatchObject({ id: 'a'.repeat(32), userId: 'u_abc', name: 'mt-fala' })
      expect(linhas[1].body).toMatchObject({
        traceId: 'a'.repeat(32),
        model: 'openai/gpt-oss-120b',
        usageDetails: { input: 120, output: 40 },
        costDetails: { total: 0.000042 },
      })
      expect(linhas[1].body.metadata).toMatchObject({ provedor: 'groq', status: 'ok' })
      expect(typeof linhas[0].timestamp).toBe('string')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('arquivo impossível de gravar não lança', async () => {
    const c = cliente({ arquivo: join(tmpdir(), 'nao-existe-' + Date.now(), 'x', 'y.jsonl') })
    c.enviar(rastro())
    await expect(c.descarregar()).resolves.toBeUndefined()
  })
})
