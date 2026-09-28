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
  it('small → base → tiny; em inglês, base → Moonshine base → tiny', () => {
    expect(escadaDeModelos(WHISPER_MODELS.small, false)).toEqual([WHISPER_MODELS.base, WHISPER_MODELS.tiny])
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
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false }) // base → tiny: 1 modelo menor
    const e = efeitos()
    for (let passo = 0; passo < 3; passo++) {
      s.agora += 20_000
      for (let i = 0; i < 3; i++) r.aoFinal(LENTO, e)
    }
    expect(e.trocarModelo).toHaveBeenCalledWith(WHISPER_MODELS.tiny)
    expect(e.oferecerNativoOuNuvem).toHaveBeenCalledTimes(1)
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
