/**
 * A FALA QUE ACABA SEM TEXTO NÃO PRENDE O INTÉRPRETE (auditoria de 10/10/2026).
 *
 * O RELATO DO DONO: "eu estava no inglês e no meio da conversa botei no mandarim e percebi que teve
 * uma trava". O fim da fala (o VAD fechou) leva a conversa a "Traduzindo…" e fecha o microfone; quem
 * a tira de lá é a tradução do final. Só que o final pode não ter texto — o decode não achou fala, o
 * filtro de alucinação o descartou (era o caso de TODA fala em chinês, ver `alucinacao.ts`), ou o
 * motor falhou — e aí ninguém avisava: a tela ficava em "Traduzindo…" para sempre, e no automático o
 * microfone não reabria. O pipeline agora avisa o fim SEM TEXTO (`FimDaFala.semTexto`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { criarControleDoInterprete } from '../src/lib/captura/controleDoInterprete'
import type { TtsEngine } from '../src/lib/tts'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function montar(idiomas = { meu: 'pt-BR', outro: 'zh-CN' }) {
  const abrir = vi.fn()
  const fechar = vi.fn()
  const lidas: string[] = []
  const motor: TtsEngine = {
    speak: (texto, opts) => {
      lidas.push(texto)
      opts?.onStart?.()
    },
    cancel: () => {},
  }
  const controle = criarControleDoInterprete({
    idiomas: () => idiomas,
    microfone: { abrir, fechar },
    motor: () => motor,
    nomeDoMotor: () => 'voz-do-aparelho',
    registrarTempo: () => {},
    registrarEtapa: () => {},
    etapasDaFala: () => undefined,
  })
  return { controle, abrir, fechar, lidas }
}

describe('o final sem texto devolve a vez à conversa', () => {
  it('por toque: de "traduzindo" volta a "parado", e o lado pode tocar de novo', () => {
    const { controle, abrir } = montar()
    controle.tocar('outro')
    controle.aoFimDaFala({ segId: 'mic-1', source: 'mic', lado: 'outro' })
    expect(controle.estado().fase).toBe('traduzindo')

    controle.aoFimDaFala({ segId: 'mic-1', source: 'mic', lado: 'outro', semTexto: true })
    expect(controle.estado().fase).toBe('parado')
    expect(controle.estado().pendentes).toEqual([])

    controle.tocar('outro')
    expect(controle.estado().fase).toBe('ouvindo')
    expect(abrir).toHaveBeenCalledTimes(2)
  })

  it('no automático: o microfone reabre sozinho, sem ninguém tocar', () => {
    const { controle, abrir } = montar()
    controle.ouvir()
    controle.aoFimDaFala({ segId: 'mic-1', source: 'mic' })
    expect(controle.estado().fase).toBe('traduzindo')

    controle.aoFimDaFala({ segId: 'mic-1', source: 'mic', semTexto: true })
    expect(controle.estado().fase).toBe('ouvindo')
    expect(controle.estado().automatico).toBe(true)
    expect(abrir).toHaveBeenCalledTimes(2)
  })

  it('a fala sem texto que nem tinha sido anunciada não muda nada', () => {
    const { controle } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 'mic-9', source: 'mic', lado: 'meu', semTexto: true })
    expect(controle.estado().fase).toBe('ouvindo')
  })

  it('com outra fala do mesmo turno à espera, a conversa segue esperando a tradução dela', () => {
    const { controle, lidas } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 'mic-1', source: 'mic', lado: 'meu' })
    controle.aoFimDaFala({ segId: 'mic-2', source: 'mic', lado: 'meu' })
    controle.aoFimDaFala({ segId: 'mic-1', source: 'mic', lado: 'meu', semTexto: true })
    expect(controle.estado().fase).toBe('traduzindo')
    expect(controle.estado().pendentes).toEqual(['mic-2'])

    controle.aoTraduzirFinal({
      segId: 'mic-2',
      resultado: 'traduzida',
      traducao: '大家早上好',
      falada: true,
    } as Parameters<typeof controle.aoTraduzirFinal>[0])
    expect(lidas).toEqual(['大家早上好'])
  })
})
