// @vitest-environment jsdom
/**
 * A SOMBRA DO ROTEADOR ADAPTATIVO NA CAPTURA (`roteador-adaptativo-em-sombra`, 3.2, 3.4, 3.6): com a flag
 * `roteador_adaptativo_sombra` ligada a rota real é a MESMA; desligada, nada é carregado nem calculado; o campo `roteador` do
 * lote `v: 2` só sai com `rum_latencia` + a flag + perfil não protegido e passa no validador do servidor, só com lista
 * fechada e baldes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { validarRelatorioDeCaptura } from '../server/routes/metricasCaptura'
import { FLAG_ROTEADOR_ADAPTATIVO_SOMBRA, FLAG_RUM_LATENCIA } from '../src/core/planos'
import { MOTIVOS_DA_ROTA, paraRotaDoStt, type PedidoDeRota } from '../src/core/rota/politicaDeRota'
import { decidirRota } from '../src/core/rota/politicaDeRota'
import { MAX_LINHAS_DO_ROTEADOR } from '../src/core/rota/sombraDoRoteador'

const flags = vi.hoisted(() => ({ ligadas: new Set<string>() }))
const cargas = vi.hoisted(() => ({ sombra: 0 }))
vi.mock('../src/lib/flagsCache', () => ({ flagLigada: (c: string) => flags.ligadas.has(c) }))
vi.mock('../src/lib/flags', () => ({ flagLigada: (c: string) => flags.ligadas.has(c) }))
vi.mock('../src/lib/captura/sombraDaRota', async (original) => {
  cargas.sombra++
  return await original()
})
vi.mock('../src/data/api', () => ({ apiFetch: vi.fn(async () => new Response('{}', { status: 202 })) }))
const estado = { identidade: 'conta', metricas: true, restrita: false, protegido: false }
vi.mock('../src/lib/identidade', () => ({ estadoDeIdentidade: () => estado.identidade }))
vi.mock('../src/lib/preferencias', () => ({
  lerPreferencias: () => ({ consentimentos: { metricas: estado.metricas } }),
}))
vi.mock('../src/lib/protecaoDoMenor', () => ({
  estadoDaProtecao: () => ({ restrita: estado.restrita }),
  perfilProtegido: () => estado.protegido,
}))
vi.mock('../src/lib/dispositivo/perfil', () => ({ perfilDoDispositivo: () => ({ tipo: 'celular-fraco' }) }))
vi.mock('../src/lib/langConfig', () => ({ fetchLangConfig: async () => ({ studying: 'pt-BR' }) }))

import { apiFetch } from '../src/data/api'
import { iniciarTelemetriaDeCaptura, pararTelemetriaDeCaptura } from '../src/gateway/capture/telemetriaDeCaptura'
import { prepararSombraDoRoteador } from '../src/lib/captura/conferenciaDaRota'

const api = apiFetch as unknown as ReturnType<typeof vi.fn>

const semTeto = { trechosNoMesS: null, trechosNoDiaS: null, aoVivoNoMesS: null, aoVivoNoDiaS: null }
const pedidoBase = (): PedidoDeRota => ({
  tarefa: 'stt-final',
  fonte: 'sistema',
  idioma: 'pt',
  aparelho: {
    tipo: 'celular-fraco',
    leve: true,
    travando: false,
    gpuProvada: false,
    economiaDeDados: false,
    smallNaGpu: false,
    whisperNaGpu: false,
    shaderF16: false,
    navegador: { fala: false, falaNoAparelho: null, bipaAoReligar: false, tradutor: false },
    modelos: { opusMt: true, bergamot: false, llmLocal: false },
  },
  plano: {
    nuvemPorTrechos: true,
    precisaoPorPadrao: false,
    nuvemAoVivo: false,
    traducaoNaNuvem: true,
    nuance: false,
    vozNeural: false,
    restante: semTeto,
  },
  estado: {
    consentimentos: { nuvem: true, navegador: false },
    perfilPrivado: false,
    perfilProtegido: false,
    responsavelAutorizou: false,
    nuvemDisponivel: true,
    nuvemPausada: false,
    semRede: false,
    edicaoEstatica: false,
    nuvemDoSite: false,
    preferencia: { qualidade: 'auto', microfone: 'modelo' },
  },
})

/** Falas locais sob pressão (RTF alto, fila): a sombra sobe de degrau, e a rota real não muda. */
const falaSobPressao = { engine: 'whisper-local', rtf: 1.4, fila: 3, confianca: 0.5 }

beforeEach(() => {
  vi.useFakeTimers()
  api.mockClear()
  cargas.sombra = 0
  flags.ligadas = new Set([FLAG_RUM_LATENCIA, FLAG_ROTEADOR_ADAPTATIVO_SOMBRA])
  Object.assign(estado, { identidade: 'conta', metricas: true, restrita: false, protegido: false })
})
afterEach(() => {
  pararTelemetriaDeCaptura()
  vi.useRealTimers()
})

describe('flag desligada: nada é carregado, calculado ou registrado', () => {
  it('prepararSombraDoRoteador devolve null e o módulo da sombra não é importado', async () => {
    flags.ligadas.delete(FLAG_ROTEADOR_ADAPTATIVO_SOMBRA)
    expect(await prepararSombraDoRoteador(pedidoBase())).toBeNull()
    expect(cargas.sombra).toBe(0)
  })

  it('com a flag ligada o módulo carrega (e só então)', async () => {
    expect(cargas.sombra).toBe(0)
    expect(await prepararSombraDoRoteador(pedidoBase())).toBeTypeOf('function')
    expect(cargas.sombra).toBe(1)
  })
})

describe('em sombra a rota real nunca muda', () => {
  const variantes: [string, (p: PedidoDeRota) => void][] = [
    ['padrão', () => {}],
    ['aparelho primeiro', (p) => void (p.estado.aparelhoPrimeiro = true)],
    ['sem consentimento', (p) => void (p.estado.consentimentos.nuvem = false)],
    ['protegido', (p) => void (p.estado.perfilProtegido = true)],
    ['inglês', (p) => void (p.idioma = 'en')],
  ]

  it.each(variantes)('rota com a flag ligada × desligada: %s', async (_nome, mexer) => {
    const pedido = pedidoBase()
    mexer(pedido)
    // Desligada: a decisão (e a rota do gateway que sai dela) de hoje.
    flags.ligadas.delete(FLAG_ROTEADOR_ADAPTATIVO_SOMBRA)
    const antes = decidirRota(structuredClone(pedido))
    const rotaAntes = paraRotaDoStt(antes)
    // Ligada: a sombra recebe 300 falas sob pressão para o MESMO pedido.
    flags.ligadas.add(FLAG_ROTEADOR_ADAPTATIVO_SOMBRA)
    const alimentar = await prepararSombraDoRoteador(pedido)
    expect(alimentar).toBeTypeOf('function')
    for (let i = 0; i < 300; i++) expect(alimentar?.(falaSobPressao)).toBeUndefined()
    const depois = decidirRota(structuredClone(pedido))
    expect(depois).toEqual(antes)
    expect(paraRotaDoStt(depois)).toEqual(rotaAntes)
  })

  it('a sombra não altera o pedido que recebeu', async () => {
    const pedido = pedidoBase()
    const copia = structuredClone(pedido)
    const alimentar = await prepararSombraDoRoteador(pedido)
    for (let i = 0; i < 50; i++) alimentar?.(falaSobPressao)
    expect(pedido).toEqual(copia)
  })

  it('o registro local para a bancada tem só lista fechada e baldes, na ordem das falas', async () => {
    const alimentar = await prepararSombraDoRoteador(pedidoBase())
    const lido = () => (window as unknown as { __roteadorSombra: () => Record<string, unknown>[] }).__roteadorSombra()
    for (let i = 0; i < 5; i++) alimentar?.(falaSobPressao)
    const novas = lido().slice(-5)
    expect(novas.length).toBe(5)
    for (const f of novas) {
      expect(Object.keys(f).sort()).toEqual(['efetiva', 'fila', 'i', 'motivo', 'rtf', 'tomaria'])
      expect(MOTIVOS_DA_ROTA).toContain(f.motivo)
    }
    expect(novas.map((f) => f.i)).toEqual([...novas.map((f) => f.i)].sort((a, b) => (a as number) - (b as number)))
    expect(JSON.stringify(novas)).not.toMatch(/1\.4|0\.5|texto/)
  })

  it('o que lançar dentro da sombra morre lá', async () => {
    const alimentar = await prepararSombraDoRoteador(pedidoBase())
    expect(() => alimentar?.({ engine: undefined, rtf: Number.NaN, fila: -5, confianca: null })).not.toThrow()
  })
})

// ───────────────────────────── telemetria ─────────────────────────────

/** Alimenta a sombra com falas (a drenagem é do envio) e devolve o corpo do primeiro lote enviado em 60 s. */
async function lote(): Promise<Record<string, any> | null> {
  iniciarTelemetriaDeCaptura()
  await vi.advanceTimersByTimeAsync(0)
  const alimentar = await prepararSombraDoRoteador(pedidoBase())
  for (let i = 0; i < 12; i++) alimentar?.(falaSobPressao)
  for (let i = 0; i < 6; i++) alimentar?.({ engine: 'whisper-local', rtf: 0.3, fila: 0, confianca: 0.95 })
  await vi.advanceTimersByTimeAsync(60_000)
  return api.mock.calls.length ? JSON.parse(api.mock.calls[0][1].body as string) : null
}

describe('campo `roteador` do lote v: 2 — a grade de quem pode', () => {
  const grade: { nome: string; mexer: () => void; roteador: boolean }[] = [
    { nome: 'tudo ligado, adulto com conta', mexer: () => {}, roteador: true },
    {
      nome: 'flag da sombra desligada',
      mexer: () => flags.ligadas.delete(FLAG_ROTEADOR_ADAPTATIVO_SOMBRA),
      roteador: false,
    },
    { nome: 'rum_latencia desligada', mexer: () => flags.ligadas.delete(FLAG_RUM_LATENCIA), roteador: false },
    { nome: 'perfil protegido', mexer: () => void (estado.protegido = true), roteador: false },
    { nome: 'sem consentimento de métricas', mexer: () => void (estado.metricas = false), roteador: false },
    { nome: 'sem conta', mexer: () => void (estado.identidade = 'anonimo'), roteador: false },
    { nome: 'conta restrita', mexer: () => void (estado.restrita = true), roteador: false },
  ]
  for (const c of grade) {
    it(c.nome, async () => {
      c.mexer()
      const corpo = await lote()
      expect(corpo?.roteador !== undefined).toBe(c.roteador)
      if (c.roteador) expect(corpo?.v).toBe(2)
      else expect(corpo ?? {}).not.toHaveProperty('roteador')
    })
  }

  it('perfil protegido: os números morrem em memória (o lote seguinte, já permitido, não os carrega)', async () => {
    estado.protegido = true
    expect(await lote()).toBeNull()
    api.mockClear()
    estado.protegido = false
    await vi.advanceTimersByTimeAsync(60_000)
    const alimentar = await prepararSombraDoRoteador(pedidoBase())
    alimentar?.({ engine: 'whisper-local', rtf: 0.3, fila: 0, confianca: 0.95 })
    await vi.advanceTimersByTimeAsync(60_000)
    const corpo = JSON.parse(api.mock.calls[0][1].body as string)
    expect(corpo.roteador.linhas.reduce((a: number, l: { n: number }) => a + l.n, 0)).toBe(1)
  })
})

describe('campo `roteador` — contrato com o servidor', () => {
  it('passa no validador, só com chaves, listas fechadas e baldes (sem texto, id, hora ou valor bruto)', async () => {
    const corpo = await lote()
    expect(corpo?.v).toBe(2)
    expect(Object.keys(corpo!.roteador).sort()).toEqual(['idioma', 'linhas', 'trocas'])
    expect(corpo!.roteador.idioma).toBe('pt-BR')
    for (const l of corpo!.roteador.linhas) {
      expect(Object.keys(l).sort()).toEqual(['efetiva', 'fila', 'motivo', 'n', 'rtf', 'tomaria'])
      expect(MOTIVOS_DA_ROTA).toContain(l.motivo)
      expect(Number.isInteger(l.rtf) && l.rtf >= 0 && l.rtf <= 3).toBe(true)
      expect(Number.isInteger(l.fila) && l.fila >= 0 && l.fila <= 2).toBe(true)
    }
    const r = validarRelatorioDeCaptura(corpo)
    expect(r).not.toBeNull()
    expect(r?.campo?.roteador?.linhas.length).toBe(corpo!.roteador.linhas.length)
    expect(r?.campo?.roteador?.idioma).toBe('pt')
    // as 18 falas estão todas contadas, e as de pressão sobem de degrau (a decisão que a sombra tomaria)
    expect(r!.campo!.roteador!.linhas.reduce((a, l) => a + l.n, 0)).toBe(18)
    expect(r!.campo!.roteador!.linhas.some((l) => l.tomaria !== 'manter')).toBe(true)
    expect(r!.campo!.roteador!.trocas).toBeGreaterThan(0)
    expect(JSON.stringify(corpo)).not.toMatch(/1\.4|0\.95|0\.5|texto|userAgent/)
  })

  const linha = { tomaria: 'manter', efetiva: 'modelo-no-aparelho', motivo: 'aparelho-da-conta', rtf: 0, fila: 0, n: 1 }
  const com = (roteador: unknown) => validarRelatorioDeCaptura({ v: 2, classe: 'quest', roteador })

  it('o servidor recusa o que sai das listas fechadas ou dos baldes', () => {
    const ok = { idioma: 'pt', trocas: 0, linhas: [linha] }
    expect(com(ok)).not.toBeNull()
    for (const ruim of [
      { ...ok, linhas: [{ ...linha, tomaria: 'x' }] },
      { ...ok, linhas: [{ ...linha, efetiva: 'x' }] },
      { ...ok, linhas: [{ ...linha, motivo: 'x' }] },
      { ...ok, linhas: [{ ...linha, rtf: 4 }] },
      { ...ok, linhas: [{ ...linha, fila: 3 }] },
      { ...ok, linhas: [{ ...linha, n: 'a' }] },
      { ...ok, trocas: 'a' },
      { ...ok, linhas: 'a' },
      { ...ok, linhas: Array(MAX_LINHAS_DO_ROTEADOR + 1).fill(linha) },
      null,
      [],
    ])
      expect(com(ruim)).toBeNull()
  })

  it('contagens grampeadas em 0..200 e idioma saneado; chave extra não passa para o resultado', () => {
    const r = com({ idioma: 'klingon', trocas: 9999, linhas: [{ ...linha, n: 5000, texto: 'oi', sessaoId: 'abc' }] })!
    expect(r.campo?.roteador).toEqual({ idioma: 'outro', trocas: 200, linhas: [{ ...linha, n: 200 }] })
    expect(JSON.stringify(r)).not.toMatch(/oi"|abc/)
  })

  it('v: 2 sem `roteador` continua valendo (campo opcional)', () => {
    expect(validarRelatorioDeCaptura({ v: 2, classe: 'quest' })?.campo?.roteador).toBeUndefined()
  })
})
