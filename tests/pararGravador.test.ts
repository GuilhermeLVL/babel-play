/**
 * PARAR O GRAVADOR TEM PRAZO (relato do dono, 2026-09-28: "encerrar trava").
 *
 * `MediaRecorder.stop()` entrega o último pedaço no `onstop`, e o encerramento esperava por ele
 * sem prazo nenhum: um `onstop` que não chega (faixa morta, aba em segundo plano, navegador que
 * engole o evento) segurava o fim da captura para sempre. Com prazo, o que já chegou em pedaços
 * (o gravador entrega a cada segundo) vira o áudio — perde-se no máximo o último segundo.
 */
import { describe, expect, it, vi } from 'vitest'

import { pararGravador,PRAZO_PARA_PARAR_O_GRAVADOR_MS } from '../src/gateway/capture/pararGravador'

function gravadorFalso(comportamento: 'para' | 'trava' | 'lanca') {
  const r = {
    state: 'recording' as RecordingState,
    onstop: null as null | (() => void),
    stop: vi.fn(() => {
      if (comportamento === 'lanca') throw new Error('InvalidStateError')
      r.state = 'inactive'
      if (comportamento === 'para') setTimeout(() => r.onstop?.(), 1)
    }),
  }
  return r
}

describe('pararGravador', () => {
  it('o onstop chega: devolve os pedaços num Blob do tipo gravado', async () => {
    const pedacos = [new Blob(['a']), new Blob(['b'])]
    const blob = await pararGravador(gravadorFalso('para') as unknown as MediaRecorder, pedacos, 'audio/webm', 1000)
    expect(blob?.size).toBe(2)
    expect(blob?.type).toBe('audio/webm')
  })

  it('o onstop NÃO chega: no prazo, devolve o que já foi entregue em vez de esperar para sempre', async () => {
    const t0 = Date.now()
    const blob = await pararGravador(gravadorFalso('trava') as unknown as MediaRecorder, [new Blob(['abc'])], 'audio/ogg', 40)
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(blob?.size).toBe(3)
  })

  it('stop lança ou não há pedaço: null, sem travar', async () => {
    expect(await pararGravador(gravadorFalso('lanca') as unknown as MediaRecorder, [], '', 40)).toBeNull()
    expect(await pararGravador(gravadorFalso('trava') as unknown as MediaRecorder, [], '', 20)).toBeNull()
  })

  it('o prazo padrão é de 5 s', () => {
    expect(PRAZO_PARA_PARAR_O_GRAVADOR_MS).toBe(5000)
  })
})
