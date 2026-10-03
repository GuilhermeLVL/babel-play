/**
 * O ESPELHO DO VAD PREVÊ A JANELA DO FINAL (auditoria de latência 2026-09-26, item 4).
 *
 * A prova que importa: rodando o `FrameProcessor` DE VERDADE do `@ricky0123/vad-web` com uma
 * sequência de probabilidades, o áudio que ele entrega no fim da fala COMEÇA exatamente pela janela
 * especulativa do espelho — amostra a amostra. É o que permite usar o decode especulativo como final.
 */
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { ehPrefixo, EspelhoDoVad } from '../src/gateway/capture/espelhoDoVad'

const exigir = createRequire(import.meta.url)
const { FrameProcessor } = exigir('@ricky0123/vad-web/dist/frame-processor.js')

const OPCOES = {
  positiveSpeechThreshold: 0.5,
  negativeSpeechThreshold: 0.35,
  redemptionMs: 800,
  preSpeechPadMs: 300,
  minSpeechMs: 400,
  submitUserSpeechOnPause: true,
}
const QUADRO = 1536

/** Roda o FrameProcessor real e o espelho lado a lado sobre `probs`; devolve o que cada um viu. */
async function rodar(probs: number[]) {
  let i = 0
  const fp = new FrameProcessor(
    async () => ({ isSpeech: probs[i], notSpeech: 1 - probs[i] }),
    () => {},
    OPCOES,
    QUADRO / 16,
  )
  fp.resume()
  const espelho = new EspelhoDoVad({ ...OPCOES, especulativoMs: 450 })
  const finais: Float32Array[] = []
  const especulativas: Float32Array[] = []
  const cancelamentos: number[] = []
  for (i = 0; i < probs.length; i++) {
    // Cada quadro tem valores únicos: qualquer desalinhamento aparece na comparação.
    const frame = Float32Array.from({ length: QUADRO }, (_, k) => i + k / QUADRO)
    await fp.process(
      frame,
      (ev: { msg: string; probs?: { isSpeech: number }; frame?: Float32Array; audio?: Float32Array }) => {
        if (ev.msg === 'FRAME_PROCESSED') {
          const e = espelho.quadro(ev.probs!.isSpeech, ev.frame!)
          if (e === 'especular') especulativas.push(espelho.janela())
          if (e === 'cancelar') cancelamentos.push(i)
        }
        if (ev.msg === 'SPEECH_END') {
          finais.push(ev.audio!)
          espelho.reiniciar()
        }
        if (ev.msg === 'VAD_MISFIRE') espelho.reiniciar()
      },
    )
  }
  return { finais, especulativas, cancelamentos }
}

const silencio = (n: number) => Array(n).fill(0.05)
const fala = (n: number) => Array(n).fill(0.9)

describe('EspelhoDoVad contra o FrameProcessor real', () => {
  it('fala e silêncio: a janela especulativa é o COMEÇO do áudio final, e sai 4 quadros antes', async () => {
    const { finais, especulativas } = await rodar([...silencio(10), ...fala(20), ...silencio(12)])
    expect(finais).toHaveLength(1)
    expect(especulativas).toHaveLength(1)
    expect(ehPrefixo(especulativas[0], finais[0])).toBe(true)
    // 800 ms = 8 quadros de redenção; 450 ms = 4: o final tem 4 quadros de silêncio a mais.
    expect(finais[0].length - especulativas[0].length).toBe(4 * QUADRO)
  })

  it('a fala volta depois da janela especulativa: cancela, e a próxima pausa especula de novo', async () => {
    const { finais, especulativas, cancelamentos } = await rodar([
      ...silencio(5),
      ...fala(10),
      ...silencio(5), // 5 quadros: passa dos 4 (especula), não chega aos 8
      ...fala(8),
      ...silencio(10),
    ])
    expect(cancelamentos).toHaveLength(1)
    expect(especulativas).toHaveLength(2)
    expect(finais).toHaveLength(1)
    expect(ehPrefixo(especulativas[0], finais[0])).toBe(true) // a velha também é prefixo — por isso o cancelamento
    expect(ehPrefixo(especulativas[1], finais[0])).toBe(true)
    expect(finais[0].length - especulativas[1].length).toBe(4 * QUADRO)
  })

  it('quadros entre os limiares (0,35–0,5) não contam nem zeram a redenção — igual à biblioteca', async () => {
    const { finais, especulativas } = await rodar([
      ...silencio(4),
      ...fala(12),
      0.05,
      0.4,
      0.05,
      0.45,
      0.05,
      0.05,
      ...silencio(8),
    ])
    expect(finais).toHaveLength(1)
    expect(ehPrefixo(especulativas[0], finais[0])).toBe(true)
  })

  it('ruído curto (misfire): o espelho recomeça junto', async () => {
    const { finais, especulativas } = await rodar([
      ...silencio(3),
      ...fala(2),
      ...silencio(10),
      ...fala(12),
      ...silencio(10),
    ])
    expect(finais).toHaveLength(1)
    expect(ehPrefixo(especulativas.at(-1)!, finais[0])).toBe(true)
  })
})

describe('ehPrefixo', () => {
  it('compara amostra a amostra', () => {
    expect(ehPrefixo(new Float32Array([1, 2]), new Float32Array([1, 2, 3]))).toBe(true)
    expect(ehPrefixo(new Float32Array([1, 3]), new Float32Array([1, 2, 3]))).toBe(false)
    expect(ehPrefixo(new Float32Array([]), new Float32Array([1]))).toBe(false)
  })
})

describe('EspelhoDoVad: consulta do modelo de turno e pausas da pessoa (fim de fala inteligente)', () => {
  const frame = () => new Float32Array(QUADRO)
  function criar(consultaMs: () => number) {
    const consultas: number[] = []
    const pausas: number[] = []
    const espelho = new EspelhoDoVad({
      ...OPCOES,
      especulativoMs: 450,
      consultaMs,
      aoConsultar: () => consultas.push(espelho.silencioMs),
      aoVoltarDaPausa: (ms) => pausas.push(ms),
    })
    const alimentar = (probs: number[]) => probs.forEach((p) => espelho.quadro(p, frame()))
    return { espelho, consultas, pausas, alimentar }
  }

  it('consulta UMA vez por pausa, quando o silêncio chega ao piso (300 ms = 3 quadros de 96 ms)', () => {
    const { consultas, alimentar } = criar(() => 300)
    alimentar([...fala(10), ...silencio(6)])
    expect(consultas).toEqual([3 * 96])
  })

  it('uma segunda pausa na mesma fala consulta de novo', () => {
    const { consultas, alimentar } = criar(() => 300)
    alimentar([...fala(6), ...silencio(4), ...fala(5), ...silencio(4)])
    expect(consultas).toHaveLength(2)
  })

  it('lê o piso a cada pausa (função), porque ele anda com a pessoa', () => {
    let piso = 300
    const { consultas, alimentar } = criar(() => piso)
    alimentar([...fala(6), ...silencio(5)])
    piso = 600 // 6 quadros
    alimentar([...fala(5), ...silencio(7)])
    expect(consultas).toEqual([3 * 96, 6 * 96])
  })

  it('não consulta fora de fala (silêncio puro) nem quando o piso alcança a redenção', () => {
    const a = criar(() => 300)
    a.alimentar(silencio(20))
    expect(a.consultas).toHaveLength(0)
    const b = criar(() => 800) // 8 quadros = a redenção: o VAD fecha antes
    b.alimentar([...fala(6), ...silencio(12)])
    expect(b.consultas).toHaveLength(0)
  })

  it('avisa a duração da pausa que terminou com a pessoa voltando a falar', () => {
    const { pausas, alimentar } = criar(() => 300)
    alimentar([...silencio(3), ...fala(6), ...silencio(5), ...fala(4)])
    // O silêncio antes da 1ª fala e o do fim (redenção) não são pausas da pessoa; a do meio é: 5 quadros.
    expect(pausas).toEqual([5 * 96])
    alimentar([...silencio(10), ...fala(3)])
    expect(pausas).toEqual([5 * 96])
  })

  it('sem os callbacks, o comportamento de antes (nada quebra)', () => {
    const espelho = new EspelhoDoVad({ ...OPCOES, especulativoMs: 450 })
    for (const p of [...fala(5), ...silencio(6), ...fala(2)]) espelho.quadro(p, frame())
    expect(espelho.silencioMs).toBe(0)
  })
})
