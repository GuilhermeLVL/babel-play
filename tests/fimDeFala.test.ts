/**
 * O CLIENTE DO MODELO DE TURNO (fim de fala inteligente): decide se a fala fecha AGORA ou espera o teto do
 * VAD. A regra de ouro: nunca travar a conversa. Modelo ausente, idioma fora da lista ou prazo estourado
 * deixam o VAD fixo de 800 ms valer (`fechar: false`, com o motivo); erro numa inferência fecha como
 * "completa" (o `fail open` do projeto de origem), e duas seguidas desligam o modelo na sessão.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  criarFimDeFala,
  IDIOMAS_APROVADOS,
  idiomasAprovados,
  LIMIAR_DE_FIM_DE_FALA,
  type WorkerDeFimDeFala,
} from '../src/gateway/capture/fimDeFala'

/** Um worker de mentira: responde como o real, com a probabilidade (ou o erro) que o teste mandar. */
function workerFalso(
  opcoes: { carrega?: boolean; p?: number | (() => number); erroNaInferencia?: boolean; mudo?: boolean } = {},
) {
  const recebidas: unknown[] = []
  const w: WorkerDeFimDeFala & { recebidas: unknown[]; terminado: boolean } = {
    recebidas,
    terminado: false,
    onmessage: null,
    onerror: null,
    postMessage(msg: any) {
      recebidas.push(msg)
      queueMicrotask(() => {
        if (opcoes.mudo && msg.tipo === 'consultar') return
        if (msg.tipo === 'carregar') {
          w.onmessage?.({
            data: opcoes.carrega === false ? { tipo: 'erro', mensagem: 'sem modelo' } : { tipo: 'pronto' },
          } as MessageEvent)
        } else if (msg.tipo === 'consultar') {
          const p = typeof opcoes.p === 'function' ? opcoes.p() : (opcoes.p ?? 0.9)
          w.onmessage?.({
            data: opcoes.erroNaInferencia
              ? { tipo: 'erro', id: msg.id, mensagem: 'boom' }
              : { tipo: 'resultado', id: msg.id, p },
          } as MessageEvent)
        }
      })
    },
    terminate() {
      w.terminado = true
    },
  }
  return w
}

const pcm = () => new Float32Array(16000)

describe('idiomas aprovados', () => {
  it('só os da lista medida valem; região e caixa não importam', () => {
    expect(IDIOMAS_APROVADOS.length).toBeGreaterThan(0)
    const um = IDIOMAS_APROVADOS[0]
    expect(idiomasAprovados([um.toUpperCase() + '-XX'])).toBe(true)
    expect(idiomasAprovados(['xx'])).toBe(false)
    expect(idiomasAprovados([um, 'xx'])).toBe(false) // TODOS os da conversa precisam estar na lista
    expect(idiomasAprovados([])).toBe(false)
  })
})

describe('criarFimDeFala', () => {
  it('p acima do limiar fecha agora; abaixo, espera', async () => {
    const alto = criarFimDeFala({ criarWorker: () => workerFalso({ p: LIMIAR_DE_FIM_DE_FALA + 0.01 }) })
    await alto.aquecer()
    expect(await alto.consultar(pcm(), [IDIOMAS_APROVADOS[0]])).toMatchObject({ fechar: true, motivo: 'modelo' })
    const baixo = criarFimDeFala({ criarWorker: () => workerFalso({ p: LIMIAR_DE_FIM_DE_FALA - 0.01 }) })
    await baixo.aquecer()
    expect(await baixo.consultar(pcm(), [IDIOMAS_APROVADOS[0]])).toMatchObject({ fechar: false, motivo: 'modelo' })
  })

  it('idioma fora da lista: nem consulta o modelo, o VAD fixo vale', async () => {
    const w = workerFalso()
    const f = criarFimDeFala({ criarWorker: () => w })
    const v = await f.consultar(pcm(), ['xx'])
    expect(v).toMatchObject({ fechar: false, motivo: 'idioma fora da lista' })
    expect(w.recebidas).toHaveLength(0)
  })

  it('modelo ausente (não carregou): o VAD fixo vale, e não tenta de novo a cada pausa', async () => {
    const w = workerFalso({ carrega: false })
    const criar = vi.fn(() => w)
    const f = criarFimDeFala({ criarWorker: criar })
    expect(await f.aquecer()).toBe(false)
    expect(await f.consultar(pcm(), [IDIOMAS_APROVADOS[0]])).toMatchObject({ fechar: false, motivo: 'modelo ausente' })
    expect(await f.consultar(pcm(), [IDIOMAS_APROVADOS[0]])).toMatchObject({ fechar: false, motivo: 'modelo ausente' })
    expect(criar).toHaveBeenCalledTimes(1)
  })

  it('consultar não espera o carregamento: sem aquecimento, o VAD fixo vale e o modelo começa a carregar', async () => {
    const w = workerFalso({ p: 0.99 })
    const f = criarFimDeFala({ criarWorker: () => w })
    expect(await f.consultar(pcm(), [IDIOMAS_APROVADOS[0]])).toMatchObject({ fechar: false, motivo: 'modelo ausente' })
    await f.aquecer()
    expect(await f.consultar(pcm(), [IDIOMAS_APROVADOS[0]])).toMatchObject({ fechar: true })
  })

  it('worker que não pode ser criado conta como modelo ausente', async () => {
    const f = criarFimDeFala({
      criarWorker: () => {
        throw new Error('sem Worker')
      },
    })
    expect(await f.consultar(pcm(), [IDIOMAS_APROVADOS[0]])).toMatchObject({ fechar: false, motivo: 'modelo ausente' })
  })

  it('erro na inferência: fecha como completa e a conversa segue; duas seguidas desligam o modelo', async () => {
    const f = criarFimDeFala({ criarWorker: () => workerFalso({ erroNaInferencia: true }) })
    await f.aquecer()
    const idioma = [IDIOMAS_APROVADOS[0]]
    expect(await f.consultar(pcm(), idioma)).toMatchObject({ fechar: true, motivo: 'falha na inferência' })
    expect(await f.consultar(pcm(), idioma)).toMatchObject({ fechar: true, motivo: 'falha na inferência' })
    // Desligado: volta ao VAD fixo.
    expect(await f.consultar(pcm(), idioma)).toMatchObject({ fechar: false, motivo: 'modelo desligado' })
  })

  it('uma inferência boa zera a contagem de falhas', async () => {
    let n = 0
    const w = workerFalso()
    const original = w.postMessage.bind(w)
    w.postMessage = (msg: any) => {
      if (msg.tipo === 'consultar' && ++n % 2 === 1) {
        w.recebidas.push(msg)
        queueMicrotask(() => w.onmessage?.({ data: { tipo: 'erro', id: msg.id, mensagem: 'x' } } as MessageEvent))
        return
      }
      original(msg)
    }
    const f = criarFimDeFala({ criarWorker: () => w })
    await f.aquecer()
    const idioma = [IDIOMAS_APROVADOS[0]]
    for (let i = 0; i < 6; i++) expect((await f.consultar(pcm(), idioma)).motivo).not.toBe('modelo desligado')
  })

  it('prazo estourado: o VAD fixo vale e a resposta atrasada é ignorada', async () => {
    vi.useFakeTimers()
    try {
      const f = criarFimDeFala({ criarWorker: () => workerFalso({ mudo: true }), prazoMs: 300 })
      await f.aquecer()
      const espera = f.consultar(pcm(), [IDIOMAS_APROVADOS[0]])
      await vi.advanceTimersByTimeAsync(3000)
      expect(await espera).toMatchObject({ fechar: false, motivo: 'prazo' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('só os últimos 8 s vão ao worker (e a cópia é transferida, não a original)', async () => {
    const w = workerFalso()
    const f = criarFimDeFala({ criarWorker: () => w })
    await f.aquecer()
    const longo = new Float32Array(16000 * 12).fill(0.1)
    await f.consultar(longo, [IDIOMAS_APROVADOS[0]])
    const msg = w.recebidas.find((m: any) => m.tipo === 'consultar') as any
    expect(msg.pcm.length).toBe(16000 * 8)
    expect(longo.length).toBe(16000 * 12)
  })

  it('fechar() encerra o worker', async () => {
    const w = workerFalso()
    const f = criarFimDeFala({ criarWorker: () => w })
    await f.aquecer()
    f.fechar()
    expect(w.terminado).toBe(true)
  })
})
