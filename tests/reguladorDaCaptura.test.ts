/**
 * O REGULADOR NA CAPTURA — a cola fina entre `regular()` (núcleo puro) e o pipeline de fala.
 *
 * Entradas falsas (RTF, fila, visibilidade, bateria, pressão, relógio) e efeitos espionados: o que se
 * prende aqui é a TRADUÇÃO das ações em efeitos — cortar parciais, descer um modelo na escada
 * small → base → tiny/Moonshine, proibir o modelo que estourou a GPU, oferecer nativo/nuvem, e pausar
 * SÓ os parciais do microfone com a aba escondida (a captura do sistema nunca pausa).
 */
import { describe, expect, it, vi } from 'vitest'

import { MOONSHINE_MODELS, WHISPER_MODELS } from '../src/gateway/sttRouter'
import { criarReguladorDaCaptura, escadaDeModelos, type SinaisDoAmbiente } from '../src/lib/captura/reguladorDaCaptura'

function ambiente(inicial: Partial<{ visivel: boolean; agora: number }> = {}) {
  const s = { visivel: inicial.visivel ?? true, agora: inicial.agora ?? 0, pressao: undefined as undefined | 'serious' }
  const sinais: SinaisDoAmbiente = {
    visivel: () => s.visivel,
    bateria: () => undefined,
    pressao: () => s.pressao,
    agoraMs: () => s.agora,
  }
  return { s, sinais }
}

function efeitos() {
  return { trocarModelo: vi.fn(), proibirModelo: vi.fn(), oferecerNativoOuNuvem: vi.fn() }
}

const LENTO = { rtf: 1.5, filaPendente: 0, latenciaMs: 1000, modoSoOuvir: true }
const FOLGA = { rtf: 0.2, filaPendente: 0, latenciaMs: 300, modoSoOuvir: true }

describe('escadaDeModelos', () => {
  it('small → base → tiny só na GPU; em inglês, base → Moonshine base → tiny', () => {
    expect(escadaDeModelos(WHISPER_MODELS.small, false, { gpu: true })).toEqual([
      WHISPER_MODELS.base,
      WHISPER_MODELS.tiny,
    ])
    // Sem GPU o português para no base: o tiny que sobraria é o q8 (41,6% de WER) ou o híbrido na CPU.
    expect(escadaDeModelos(WHISPER_MODELS.small, false)).toEqual([WHISPER_MODELS.base])
    expect(escadaDeModelos(WHISPER_MODELS.base, false)).toEqual([])
    expect(escadaDeModelos(WHISPER_MODELS.small, true)).toEqual([
      WHISPER_MODELS.base,
      MOONSHINE_MODELS.base,
      MOONSHINE_MODELS.tiny,
    ])
    expect(escadaDeModelos(MOONSHINE_MODELS.base, true)).toEqual([MOONSHINE_MODELS.tiny])
    expect(escadaDeModelos(WHISPER_MODELS.tiny, false)).toEqual([])
    expect(escadaDeModelos('modelo-desconhecido', false)).toEqual([])
  })
})

describe('criarReguladorDaCaptura', () => {
  it('RTF ruim por 3 trechos corta os parciais; depois desce um modelo', () => {
    const { s, sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({ modelo: WHISPER_MODELS.small, soIngles: false })
    const e = efeitos()
    for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    expect(r.parciaisCortados).toBe(true)
    expect(e.trocarModelo).not.toHaveBeenCalled()
    s.agora = 20_000 // passou o intervalo entre descidas
    for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    expect(e.trocarModelo).toHaveBeenCalledWith(WHISPER_MODELS.base)
    expect(r.modeloEmUso()).toBe(WHISPER_MODELS.base)
  })

  it('no fim da escada, oferece nativo/nuvem (sem troca silenciosa)', () => {
    const { s, sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    // Na GPU: base → tiny HÍBRIDO (1 modelo menor), nunca o tiny q8.
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false, backend: 'webgpu', dtype: 'hybrid' })
    const e = efeitos()
    for (let passo = 0; passo < 3; passo++) {
      s.agora += 20_000
      for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    }
    expect(e.trocarModelo).toHaveBeenCalledWith(WHISPER_MODELS.tiny, { dtype: 'hybrid', device: 'webgpu' })
    expect(e.oferecerNativoOuNuvem).toHaveBeenCalledTimes(1)
  })

  it('português no WASM (Quest base q8): NUNCA desce ao tiny — corta parciais e oferece nativo/nuvem', () => {
    const { s, sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false, backend: 'wasm', dtype: 'q8' })
    const e = efeitos()
    for (let passo = 0; passo < 3; passo++) {
      s.agora += 20_000
      for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    }
    expect(r.parciaisCortados).toBe(true)
    expect(e.trocarModelo).not.toHaveBeenCalled()
    expect(r.modeloEmUso()).toBe(WHISPER_MODELS.base)
    expect(e.oferecerNativoOuNuvem).toHaveBeenCalledTimes(1)
  })

  it('na GPU do Quest (hybrid-fp16) desce ao tiny no MESMO dtype e, com folga, volta ao base da rota', () => {
    const { s, sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false, backend: 'webgpu', dtype: 'hybrid-fp16' })
    const e = efeitos()
    for (let passo = 0; passo < 2; passo++) {
      s.agora += 20_000
      for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    }
    expect(e.trocarModelo).toHaveBeenLastCalledWith(WHISPER_MODELS.tiny, { dtype: 'hybrid-fp16', device: 'webgpu' })
    s.agora += 1_000
    r.aoFinal(FOLGA, e)
    s.agora += 61_000
    r.aoFinal(FOLGA, e)
    expect(e.trocarModelo).toHaveBeenLastCalledWith(WHISPER_MODELS.base, { dtype: 'hybrid-fp16', device: 'webgpu' })
  })

  it('Moonshine tiny em inglês continua valendo no WASM', () => {
    expect(escadaDeModelos(MOONSHINE_MODELS.base, true)).toEqual([MOONSHINE_MODELS.tiny])
  })

  it('prefere o degrau que JÁ está no aparelho (sem download no meio da sessão)', () => {
    const { s, sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    const emCache = (m: string) => m === MOONSHINE_MODELS.tiny
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: true, backend: 'wasm', dtype: 'q8', emCache })
    const e = efeitos()
    for (let passo = 0; passo < 2; passo++) {
      s.agora += 20_000
      for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    }
    // O Moonshine base (não baixado) é pulado: vai direto ao tiny, que já está no cache.
    expect(e.trocarModelo).toHaveBeenCalledTimes(1)
    expect(e.trocarModelo).toHaveBeenCalledWith(MOONSHINE_MODELS.tiny)
  })

  it('sem nenhum degrau no cache, a escada fica inteira (baixar é melhor que não acompanhar)', () => {
    const { s, sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: true, backend: 'wasm', dtype: 'q8', emCache: () => false })
    const e = efeitos()
    for (let passo = 0; passo < 2; passo++) {
      s.agora += 20_000
      for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    }
    expect(e.trocarModelo).toHaveBeenCalledWith(MOONSHINE_MODELS.base)
  })

  it('trocar-backend: o benchmark diz que a GPU é mais rápida e o WASM não acompanha → troca, e desfaz com folga', () => {
    const { s, sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({
      modelo: WHISPER_MODELS.base,
      soIngles: false,
      backend: 'wasm',
      dtype: 'q8',
      outro: { device: 'webgpu', dtype: 'hybrid-fp16' },
    })
    const e = efeitos()
    for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e) // cortar-parciais
    s.agora = 20_000
    const acoes = [0, 1, 2].flatMap(() => r.aoFinal(LENTO, e))
    expect(acoes).toContain('trocar-backend')
    expect(e.trocarModelo).toHaveBeenCalledWith(WHISPER_MODELS.base, { dtype: 'hybrid-fp16', device: 'webgpu' })
    // Na GPU, o português pode descer ao tiny (em hybrid-fp16).
    s.agora = 40_000
    for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    expect(e.trocarModelo).toHaveBeenLastCalledWith(WHISPER_MODELS.tiny, { dtype: 'hybrid-fp16', device: 'webgpu' })
  })

  it('trocar-backend não é oferecido quando o outro dtype não está no aparelho (evita download no meio)', () => {
    const { s, sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({
      modelo: WHISPER_MODELS.base,
      soIngles: false,
      backend: 'wasm',
      dtype: 'q8',
      outro: { device: 'webgpu', dtype: 'hybrid-fp16' },
      emCache: (_m, dtype) => dtype === 'q8',
    })
    const e = efeitos()
    const acoes: string[] = []
    for (let passo = 0; passo < 3; passo++) {
      s.agora += 20_000
      for (let i = 0; i < 3; i++) acoes.push(...r.aoFinal(LENTO, e))
    }
    expect(acoes).not.toContain('trocar-backend')
    expect(e.trocarModelo).not.toHaveBeenCalled()
  })

  it('folga de 60 s desfaz o último passo (sobe o modelo de volta)', () => {
    const { s, sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({ modelo: WHISPER_MODELS.small, soIngles: false })
    const e = efeitos()
    for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    s.agora = 20_000
    for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    expect(r.modeloEmUso()).toBe(WHISPER_MODELS.base)
    s.agora = 30_000
    r.aoFinal(FOLGA, e)
    s.agora = 95_000
    r.aoFinal(FOLGA, e)
    expect(e.trocarModelo).toHaveBeenLastCalledWith(WHISPER_MODELS.small)
    expect(r.modeloEmUso()).toBe(WHISPER_MODELS.small)
  })

  it('falha de GPU (device-lost) → proíbe o modelo que caiu no próximo trecho', () => {
    const { sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({ modelo: WHISPER_MODELS.small, soIngles: false })
    const e = efeitos()
    r.registrarFalha('device-lost', WHISPER_MODELS.small)
    r.aoFinal(FOLGA, e)
    expect(e.proibirModelo).toHaveBeenCalledWith(WHISPER_MODELS.small, 'device-lost')
    r.aoFinal(FOLGA, e)
    expect(e.proibirModelo).toHaveBeenCalledTimes(1) // a falha é consumida
  })

  it('aba escondida SEM captura do sistema pausa só os parciais do mic; visível retoma', () => {
    const { s, sinais } = ambiente({ visivel: false })
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    const e = efeitos()
    r.aoFinal({ ...FOLGA, modoSoOuvir: false }, e)
    expect(r.parciaisDoMicPausados).toBe(true)
    expect(r.parciaisCortados).toBe(false)
    s.visivel = true
    r.aoFinal({ ...FOLGA, modoSoOuvir: false }, e)
    expect(r.parciaisDoMicPausados).toBe(false)
  })

  it('aba escondida COM a captura do sistema (só ouvir) não pausa nada', () => {
    const { sinais } = ambiente({ visivel: false })
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    r.aoFinal(FOLGA, efeitos())
    expect(r.parciaisDoMicPausados).toBe(false)
  })

  it('pressão de CPU "serious" é gatilho agudo (desce sem esperar 3 trechos)', () => {
    const { s, sinais } = ambiente()
    s.pressao = 'serious'
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    r.aoFinal(FOLGA, efeitos())
    expect(r.parciaisCortados).toBe(true)
  })

  it('reiniciar zera o estado (sessão nova começa no máximo)', () => {
    const { sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    for (let i = 0; i < 3; i++) r.aoFinal(LENTO, efeitos())
    expect(r.parciaisCortados).toBe(true)
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    expect(r.parciaisCortados).toBe(false)
  })
})
