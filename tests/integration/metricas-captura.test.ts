/**
 * `POST /api/metricas/captura` — a telemetria ANÔNIMA de qualidade da captura.
 *
 * O servidor sabia quanto o PROVEDOR demorava; não sabia quanto o USUÁRIO esperava. Latência do
 * primeiro parcial, do texto final, da tradução e o fator de tempo real do Whisper local só existem
 * no navegador. O cliente manda um lote pequeno e agregado; o servidor valida, sanea e observa em
 * histogramas do Prometheus — sem guardar nada, e sem identidade: nem com sessão aberta o id do
 * usuário vai a lugar algum.
 *
 * Sobe no modo PÚBLICO de propósito: é lá que "sem token" tem de continuar funcionando (204, e não
 * o 401 do resto de `/api`), e é lá que o limitador por IP está montado.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { validarRelatorioDeCaptura } from '../../server/routes/metricasCaptura'
import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

const valido = () => ({
  v: 1,
  sttFinalMs: [850, 1200],
  primeiroParcialMs: [300],
  mtMs: [640],
  rtf: [0.4, 0.6],
  descartesAlucinacao: 2,
  fallbacks: { 'whisper-local': 1 },
  motorStt: 'whisper-local',
  motorMt: 'server-llm-mt',
})

describe('validarRelatorioDeCaptura (o contrato do corpo)', () => {
  it('aceita o corpo do contrato', () => {
    expect(validarRelatorioDeCaptura(valido())).toMatchObject({ motorStt: 'whisper-local', descartesAlucinacao: 2 })
  })

  it('recusa versão desconhecida, campo faltando e tipo errado', () => {
    expect(validarRelatorioDeCaptura({ ...valido(), v: 2 })).toBeNull()
    const { mtMs: _fora, ...semMt } = valido()
    expect(validarRelatorioDeCaptura(semMt)).toBeNull()
    expect(validarRelatorioDeCaptura({ ...valido(), rtf: ['1'] })).toBeNull()
    expect(validarRelatorioDeCaptura({ ...valido(), fallbacks: [1] })).toBeNull()
    expect(validarRelatorioDeCaptura(null)).toBeNull()
    expect(validarRelatorioDeCaptura('texto')).toBeNull()
  })

  it('recusa lista com mais de 200 itens', () => {
    expect(validarRelatorioDeCaptura({ ...valido(), sttFinalMs: Array(201).fill(1) })).toBeNull()
    expect(validarRelatorioDeCaptura({ ...valido(), sttFinalMs: Array(200).fill(1) })).not.toBeNull()
  })

  it('números fora da faixa são GRAMPEADOS, não recusados (ms 0..120000, rtf 0..50)', () => {
    const r = validarRelatorioDeCaptura({ ...valido(), sttFinalMs: [-5, 999_999], rtf: [-1, 80] })!
    expect(r.sttFinalMs).toEqual([0, 120_000])
    expect(r.rtf).toEqual([0, 50])
  })

  it('motor fora do alfabeto vira "outro" — a label nunca é texto livre do cliente', () => {
    const r = validarRelatorioDeCaptura({
      ...valido(),
      motorStt: 'Whisper Local!',
      motorMt: 'x'.repeat(41),
      fallbacks: { 'groq-stt': 1, '<script>': 3 },
    })!
    expect(r.motorStt).toBe('outro')
    expect(r.motorMt).toBe('outro')
    expect(r.fallbacks).toEqual({ 'groq-stt': 1, outro: 3 })
  })

  it('contadores negativos ou fracionários não viram série estranha', () => {
    const r = validarRelatorioDeCaptura({ ...valido(), descartesAlucinacao: -3, fallbacks: { a: 2.7 } })!
    expect(r.descartesAlucinacao).toBe(0)
    expect(r.fallbacks).toEqual({ a: 2 })
  })
})

describe('POST /api/metricas/captura na montagem real (modo público)', () => {
  let s: AppDeTeste
  const salvos: Record<string, string | undefined> = {}

  beforeAll(async () => {
    for (const k of ['METRICS_ENABLED', 'METRICS_TOKEN']) salvos[k] = process.env[k]
    process.env.METRICS_ENABLED = '1'
    delete process.env.METRICS_TOKEN
    s = await subirApp({ modo: 'publico' })
  }, 60_000)
  afterAll(async () => {
    await s.encerrar()
    const { esquecerMetricas } = await import('../../server/http/metricas')
    esquecerMetricas()
    for (const [k, v] of Object.entries(salvos)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('sem token: 204 (não o 401 do resto de /api), e o scrape mostra os histogramas', async () => {
    const r = await s.post('/api/metricas/captura', valido())
    expect(r.status).toBe(204)
    const corpo = await (await s.get('/metrics')).text()
    expect(corpo).toMatch(/captura_stt_final_ms_count\{motor="whisper-local"\} 2/)
    expect(corpo).toMatch(/captura_mt_ms_count\{motor="server-llm-mt"\} 1/)
    expect(corpo).toMatch(/captura_rtf_count\{motor="whisper-local"\} 2/)
    expect(corpo).toMatch(/captura_descartes_alucinacao_total 2/)
    expect(corpo).toMatch(/captura_fallback_total\{motor="whisper-local"\} 1/)
  })

  it('corpo fora do contrato: 400', async () => {
    const r = await s.post('/api/metricas/captura', { ...valido(), v: 9 })
    expect(r.status).toBe(400)
  })

  it('corpo acima de 8 KB: 413, antes de qualquer parse', async () => {
    const r = await s.chamar('POST', '/api/metricas/captura', {
      raw: JSON.stringify({ ...valido(), lixo: 'x'.repeat(9_000) }),
      headers: { 'content-type': 'application/json' },
    })
    expect(r.status).toBe(413)
  })

  it('com sessão aberta também responde 204 — e a rota não lê identidade nenhuma', async () => {
    const token = await s.token('usuario-telemetria')
    const r = await s.post('/api/metricas/captura', valido(), token)
    expect(r.status).toBe(204)
  })
})
