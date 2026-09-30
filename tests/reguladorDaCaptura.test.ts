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

/** Um vigia do main thread falso: o bloqueio que ele "mediu" e as janelas que lhe pediram. */
function vigiaFalso(bloqueioMs = 0, suportado = true) {
  const v = {
    bloqueioMs,
    janelas: [] as number[],
    suportado,
    bloqueioRecenteMs(janelaMs: number) {
      v.janelas.push(janelaMs)
      return v.bloqueioMs
    },
    guardados: () => 0,
    parar: () => undefined,
  }
  return v
}

describe('aoParcial — a latência do parcial alimenta o regulador (Grátis sem travar)', () => {
  it('3 parciais lentos (> 1,5 s) cortam os parciais; rápidos, não', () => {
    const { s, sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais, vigia: vigiaFalso() })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    const e = efeitos()
    for (let i = 0; i < 5; i++) {
      s.agora += 500
      r.aoParcial(900, e)
    }
    expect(r.parciaisCortados).toBe(false)
    const acoes = [0, 1, 2].flatMap(() => {
      s.agora += 500
      return r.aoParcial(2_000, e)
    })
    expect(acoes).toEqual(['cortar-parciais'])
    expect(r.parciaisCortados).toBe(true)
    expect(e.trocarModelo).not.toHaveBeenCalled()
  })

  it('o parcial com a aba escondida não pausa nada (quem sabe se é "só ouvir" é o final)', () => {
    const { sinais } = ambiente({ visivel: false })
    const r = criarReguladorDaCaptura({ sinais, vigia: vigiaFalso() })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    expect(r.aoParcial(300, efeitos())).toEqual([])
    expect(r.parciaisDoMicPausados).toBe(false)
  })

  it('a falha registrada fica para o final (o parcial não a consome)', () => {
    const { sinais } = ambiente()
    const r = criarReguladorDaCaptura({ sinais, vigia: vigiaFalso() })
    r.reiniciar({ modelo: WHISPER_MODELS.small, soIngles: false })
    const e = efeitos()
    r.registrarFalha('oom', WHISPER_MODELS.small)
    r.aoParcial(300, e)
    expect(e.proibirModelo).not.toHaveBeenCalled()
    r.aoFinal(FOLGA, e)
    expect(e.proibirModelo).toHaveBeenCalledWith(WHISPER_MODELS.small, 'oom')
  })
})

describe('o vigia do main thread no regulador', () => {
  it('tela travada (≥ 400 ms na janela de 10 s) corta os parciais já no primeiro final', () => {
    const { s, sinais } = ambiente({ agora: 20_000 })
    const vigia = vigiaFalso(450)
    const r = criarReguladorDaCaptura({ sinais, vigia })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    s.agora = 30_000
    expect(r.aoFinal(FOLGA, efeitos())).toEqual(['cortar-parciais'])
    expect(vigia.janelas).toEqual([10_000])
  })

  it('o parcial também pergunta ao vigia (é ele que chega mais vezes)', () => {
    const { s, sinais } = ambiente({ agora: 20_000 })
    const r = criarReguladorDaCaptura({ sinais, vigia: vigiaFalso(600) })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    s.agora = 30_000
    expect(r.aoParcial(300, efeitos())).toEqual(['cortar-parciais'])
  })

  /* O QUE A TELA SOFREU ANTES DA CAPTURA NÃO É DA CAPTURA (A6c). Montar a tela, escolher os idiomas, o
     pré-aquecimento: nada disso é o STT nem os parciais, e cortá-los não o cura. Na bancada, os quadros
     de React de 2–3 s antes do "Iniciar" caíam na janela do 1º parcial e somavam ~400 ms. */
  it('a janela começa no `reiniciar` da sessão: o bloqueio de antes dela não conta', () => {
    const { s, sinais } = ambiente({ agora: 30_000 })
    const vigia = vigiaFalso(0)
    const r = criarReguladorDaCaptura({ sinais, vigia })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    s.agora = 33_000
    r.aoParcial(300, efeitos())
    s.agora = 45_000
    r.aoFinal(FOLGA, efeitos())
    expect(vigia.janelas).toEqual([3_000, 10_000])
  })

  it('cada decisão vai ao console com o motivo (a bancada separa a tela travada da pressão da CPU)', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const { s, sinais } = ambiente({ agora: 30_000 })
      const r = criarReguladorDaCaptura({ sinais, vigia: vigiaFalso(500) })
      r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
      s.agora = 40_000
      r.aoParcial(300, efeitos())
      const linhas = log.mock.calls.map((c) => c.join(' '))
      expect(linhas).toContainEqual(expect.stringMatching(/\[cap\] regulador: cortar-parciais ← travamento/))
    } finally {
      log.mockRestore()
    }
  })

  it('travamento DEPOIS de a sessão começar continua cortando os parciais', () => {
    const { s, sinais } = ambiente({ agora: 30_000 })
    const vigia = vigiaFalso(0)
    const r = criarReguladorDaCaptura({ sinais, vigia })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    s.agora = 36_000
    expect(r.aoParcial(300, efeitos())).toEqual([])
    vigia.bloqueioMs = 500 // a tela travou de verdade durante a fala
    s.agora = 38_000
    expect(r.aoParcial(300, efeitos())).toEqual(['cortar-parciais'])
    expect(vigia.janelas).toEqual([6_000, 8_000])
  })

  it('depois de um degrau, só conta o bloqueio de DEPOIS dele (o de antes é o que o degrau veio curar)', () => {
    const { s, sinais } = ambiente({ agora: 20_000 })
    const vigia = vigiaFalso(450)
    const r = criarReguladorDaCaptura({ sinais, vigia })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    s.agora = 30_000
    r.aoFinal(FOLGA, efeitos()) // desce em 30 s
    s.agora = 34_000
    r.aoFinal(FOLGA, efeitos())
    expect(vigia.janelas).toEqual([10_000, 4_000])
  })

  it('navegador sem LoAF/longtask: nenhum sinal de travamento (e o resto segue)', () => {
    const { sinais } = ambiente()
    const vigia = vigiaFalso(5_000, false)
    const r = criarReguladorDaCaptura({ sinais, vigia })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    expect(r.aoFinal(FOLGA, efeitos())).toEqual([])
    expect(vigia.janelas).toEqual([])
  })
})

describe('config por aparelho — lida a cada medida', () => {
  it('uma função de config vale na hora: o aparelho que virou leve desce com 2 finais lentos', () => {
    const { sinais } = ambiente()
    let leve = false
    const r = criarReguladorDaCaptura({
      sinais,
      vigia: vigiaFalso(),
      config: () => (leve ? { trechosParaDescer: 2 } : {}),
    })
    r.reiniciar({ modelo: WHISPER_MODELS.base, soIngles: false })
    leve = true
    r.aoFinal(LENTO, efeitos())
    r.aoFinal(LENTO, efeitos())
    expect(r.parciaisCortados).toBe(true)
  })
})
