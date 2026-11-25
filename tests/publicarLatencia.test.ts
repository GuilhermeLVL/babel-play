/**
 * AS DUAS FONTES E O SCRIPT DE PUBLICAÇÃO (openspec `latencia-publicada-por-aparelho`, tarefas 1.2 e 1.3): respostas
 * "gravadas" do Prometheus e do Analytics Engine (montadas a partir dos mesmos lotes sintéticos) têm de dar o MESMO
 * `latencia.json`; o dry-run não grava; o contrato é validado antes de gravar.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fonteDeArquivo,
  fonteDoAnalyticsEngine,
  fonteDoPrometheus,
  indiceDoLimite,
  sqlDoAnalyticsEngine,
} from '../scripts/producao/latencia/fontes.mjs'
import { gerarLatencia, principal, resumo } from '../scripts/producao/publicar-latencia.mjs'
import { type AmostraDeCelula, LIMITES_DOS_BALDES_MS, N_BALDES_DA_LATENCIA } from '../src/core/latencia/agregarLatencia'
import { validarLatencia } from '../src/core/latencia/contratoDaLatencia'
import { simularCelula } from './harness/simuladorDeLatencia'

const HOJE = new Date('2026-11-25T12:00:00Z')

function amostras(): AmostraDeCelula[] {
  const out: AmostraDeCelula[] = []
  let s = 1
  for (const [classe, idioma, falas] of [
    ['celular-bom', 'en', 2400],
    ['celular-bom', 'pt', 150],
    ['quest', 'es', 800],
    ['desktop-com-gpu', 'en', 5000],
  ] as const) {
    const sim = simularCelula(classe, idioma, falas, s++)
    const baldes = Array.from({ length: N_BALDES_DA_LATENCIA }, () => 0)
    let n = 0
    let falhas = 0
    for (const l of sim.lotes) {
      l.fimDaFalaAteLegenda.baldes.forEach((q, i) => (baldes[i] = (baldes[i] ?? 0) + q))
      n += l.fimDaFalaAteLegenda.n
      falhas += l.fimDaFalaAteLegenda.falhas
    }
    out.push({ classe, idioma, baldes, falas: n, falhas })
  }
  return out
}

/** Como o Prometheus responde: histograma CUMULATIVO por `le` e dois contadores. */
function respostasDoPrometheus(a: AmostraDeCelula[]) {
  const vetor = (result: unknown[]) => ({
    ok: true,
    status: 200,
    json: async () => ({ status: 'success', data: { result } }),
  })
  const buckets = a.flatMap((c) => {
    let cum = 0
    return [...LIMITES_DOS_BALDES_MS.map(String), '+Inf'].map((le, i) => {
      cum += c.baldes[i]!
      /* o `increase` do Prometheus devolve decimais por causa da extrapolação */
      return { metric: { classe: c.classe, idioma: c.idioma, le }, value: [0, String(cum + 0.3)] }
    })
  })
  return (url: string) => {
    const q = new URL(url).searchParams.get('query')!
    if (q.includes('_bucket')) return vetor(buckets)
    const campo = q.includes('falhas') ? 'falhas' : 'falas'
    return vetor(a.map((c) => ({ metric: { classe: c.classe, idioma: c.idioma }, value: [0, String(c[campo] + 0.2)] })))
  }
}

/** Como o SQL do Analytics Engine responde: uma linha por balde não vazio mais as linhas de falas/falhas. */
function respostaDoAnalyticsEngine(a: AmostraDeCelula[]) {
  const data = a.flatMap((c) => [
    ...c.baldes.flatMap((q, i) =>
      q > 0
        ? [
            {
              classe: c.classe,
              idioma: c.idioma,
              tipo: 'balde',
              limite_ms: LIMITES_DOS_BALDES_MS[i] ?? 30000,
              q: String(q),
            },
          ]
        : [],
    ),
    { classe: c.classe, idioma: c.idioma, tipo: 'falas', limite_ms: 0, q: String(c.falas) },
    { classe: c.classe, idioma: c.idioma, tipo: 'falhas', limite_ms: 0, q: String(c.falhas) },
  ])
  return { ok: true, status: 200, json: async () => ({ data }) }
}

describe('as duas fontes produzem o mesmo latencia.json', () => {
  const a = amostras()
  const CONTA = 'a'.repeat(32)

  it('Prometheus e Analytics Engine batem com o agregado direto das amostras', async () => {
    const direto = await gerarLatencia({ fonte: fonteDeArquivo({ amostras: a }), hoje: HOJE })
    const prom = await gerarLatencia({
      fonte: fonteDoPrometheus({
        base: 'http://prom:9090',
        buscar: (async (u: string) => respostasDoPrometheus(a)(u)) as never,
      }),
      hoje: HOJE,
    })
    const ae = await gerarLatencia({
      fonte: fonteDoAnalyticsEngine({
        conta: CONTA,
        token: 't',
        buscar: (async () => respostaDoAnalyticsEngine(a)) as never,
      }),
      hoje: HOJE,
    })
    expect(prom).toEqual(direto)
    expect(ae).toEqual(direto)
    /* a célula pt com 150 falas ficou insuficiente nas três; a linha da classe somada (`todos`) passa. */
    expect(direto.celulas.find((c) => c.classe === 'celular-bom' && c.idioma === 'pt')?.estado).toBe('insuficiente')
    expect(direto.celulas.find((c) => c.classe === 'celular-bom' && c.idioma === 'todos')?.estado).toBe('ok')
  })

  it('o Analytics Engine manda o token só no cabeçalho, o SQL do runbook e rejeita conta inválida', async () => {
    const buscar = vi.fn(async () => respostaDoAnalyticsEngine(a))
    await fonteDoAnalyticsEngine({
      conta: CONTA,
      token: 'segredo',
      buscar: buscar as never,
      dataset: 'frasy_metricas_staging',
    }).ler({ janelaDias: 28 })
    const [url, init] = buscar.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }]
    expect(url).toContain(`/accounts/${CONTA}/analytics_engine/sql`)
    expect(init.headers.authorization).toBe('Bearer segredo')
    expect(init.body).not.toContain('segredo')
    expect(init.body).toContain("blob1 = 'captura_latencia'")
    expect(init.body).toContain("INTERVAL '28' DAY")
    expect(init.body).toContain('frasy_metricas_staging')
    await expect(fonteDoAnalyticsEngine({ conta: 'x', token: 't' }).ler({ janelaDias: 28 })).rejects.toThrow(
      /CLOUDFLARE_ACCOUNT_ID/,
    )
    expect(() => sqlDoAnalyticsEngine({ dataset: "x'; DROP", janelaDias: 28 })).toThrow()
  })

  it('erro HTTP e resposta fora do formato viram exceção sem vazar o token', async () => {
    await expect(
      fonteDoAnalyticsEngine({
        conta: CONTA,
        token: 'segredo',
        buscar: (async () => ({ ok: false, status: 403 })) as never,
      }).ler({ janelaDias: 28 }),
    ).rejects.toThrow('Analytics Engine respondeu 403')
    await expect(
      fonteDoPrometheus({
        base: 'http://p',
        buscar: (async () => ({ ok: true, json: async () => ({ status: 'error' }) })) as never,
      }).ler({ janelaDias: 28 }),
    ).rejects.toThrow(/fora do formato/)
  })

  it('indiceDoLimite: limites exatos, "acima de 10 s" e o que não é balde', () => {
    expect(indiceDoLimite(250)).toBe(0)
    expect(indiceDoLimite(10000)).toBe(7)
    expect(indiceDoLimite(30000)).toBe(8)
    expect(indiceDoLimite(777)).toBe(-1)
    expect(indiceDoLimite(0)).toBe(-1)
  })
})

describe('script de publicação', () => {
  const pastas: string[] = []
  afterEach(() => {
    for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true })
  })
  const pasta = () => {
    const p = mkdtempSync(path.join(tmpdir(), 'latencia-'))
    pastas.push(p)
    return p
  }
  const saida = () => ({ log: vi.fn(), error: vi.fn() })

  it('--dry-run valida e resume, sem gravar', async () => {
    const dir = pasta()
    const entrada = path.join(dir, 'dump.json')
    writeFileSync(entrada, JSON.stringify(amostras()))
    const s = saida()
    const alvo = path.join(dir, 'latencia.json')
    expect(await principal(['--fonte', 'arquivo', '--entrada', entrada, '--saida', alvo, '--dry-run'], {}, s)).toBe(0)
    expect(existsSync(alvo)).toBe(false)
    const texto = s.log.mock.calls.map((c) => c[0]).join('\n')
    expect(texto).toContain('celular-bom x en: n=')
    expect(texto).toContain('celular-bom x pt: n=150 insuficiente')
    expect(texto).toContain('--dry-run')
  })

  it('sem --dry-run grava um arquivo que o contrato aceita; sem dados grava celulas vazio', async () => {
    const dir = pasta()
    const entrada = path.join(dir, 'dump.json')
    writeFileSync(entrada, JSON.stringify(amostras()))
    const alvo = path.join(dir, 'sub', 'latencia.json')
    expect(await principal(['--fonte', 'arquivo', '--entrada', entrada, '--saida', alvo], {}, saida())).toBe(0)
    const gravado = validarLatencia(JSON.parse(readFileSync(alvo, 'utf8')))
    expect(gravado).not.toBeNull()
    expect(resumo(gravado!)).toContain('células ok (das 15)')

    writeFileSync(entrada, '[]')
    const vazio = path.join(dir, 'vazio.json')
    expect(await principal(['--fonte', 'arquivo', '--entrada', entrada, '--saida', vazio], {}, saida())).toBe(0)
    expect(JSON.parse(readFileSync(vazio, 'utf8')).celulas).toEqual([])
  })

  it('uso errado sai com 2 e fonte quebrada com 1', async () => {
    expect(await principal([], {}, saida())).toBe(2)
    expect(await principal(['--fonte', 'arquivo'], {}, saida())).toBe(2)
    expect(await principal(['--fonte', 'prometheus', '--janela', '0'], {}, saida())).toBe(2)
    const s = saida()
    expect(await principal(['--fonte', 'analytics-engine', '--dry-run'], {}, s)).toBe(1)
    expect(s.error.mock.calls[0]![0]).toContain('CLOUDFLARE_ACCOUNT_ID')
  })
})
