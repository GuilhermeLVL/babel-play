/**
 * O CONTROLE DO MODO INTÉRPRETE (E3 da Fase E): a cola entre a máquina de estados (`interprete.ts`),
 * a fila de fala (`filaDeFala.ts`) e o microfone da captura. Sem tela: o que se prova aqui é o que a
 * tela executa quando alguém toca, fala e ouve.
 *   - tocar destrava a voz (iPhone) e abre o microfone no idioma do lado;
 *   - o fim da fala fecha o microfone; a tradução do final é lida no idioma de QUEM OUVE;
 *   - a tradução que chega antes do fim da fala (cache) não se perde;
 *   - sem tradução, a conversa volta a "parado" sem voz;
 *   - a fila vazia é o fim da voz; o tempo até a voz é registrado por motor;
 *   - tocar enquanto a voz fala corta a voz (barge-in);
 *   - Repetir lê de novo; sair para tudo e desliga a fila.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { criarControleDoInterprete } from '../src/lib/captura/controleDoInterprete'
import type { SpeakOptions, TtsEngine } from '../src/lib/tts'

interface Fala {
  texto: string
  opts: SpeakOptions
}

/** Um motor de voz falso: começa na hora; o fim vem quando o teste manda. */
function motorFalso() {
  const falas: Fala[] = []
  let atual: Fala | null = null
  const motor: TtsEngine = {
    speak(texto, opts) {
      atual = { texto, opts: opts! }
      falas.push(atual)
      opts?.onStart?.()
    },
    cancel: vi.fn(() => {
      atual = null
    }),
    isSpeaking: () => atual !== null,
  }
  const terminar = () => {
    const f = atual
    atual = null
    f?.opts.onEnd?.()
  }
  return { motor, falas, terminar }
}

let relogio = 0
beforeEach(() => {
  relogio = 1000
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

function montar(extra: Partial<Parameters<typeof criarControleDoInterprete>[0]> = {}) {
  const voz = motorFalso()
  const abrir = vi.fn()
  const fechar = vi.fn()
  const destravar = vi.fn()
  const registrar = vi.fn()
  const estados: string[] = []
  const controle = criarControleDoInterprete({
    idiomas: () => ({ meu: 'pt-BR', outro: 'en-US' }),
    microfone: { abrir, fechar },
    motor: () => voz.motor,
    nomeDoMotor: () => 'voz-do-aparelho',
    destravarVoz: destravar,
    registrarTempo: registrar,
    agora: () => relogio,
    aoMudar: (e) => estados.push(e.fase),
    ...extra,
  })
  return { controle, voz, abrir, fechar, destravar, registrar, estados }
}

const traduzida = (segId: string, traducao: string) => ({
  segId,
  original: 'x',
  resultado: 'traduzida' as const,
  traducao,
  de: 'pt',
  para: 'en',
  aproximada: false,
  falada: true,
})

describe('criarControleDoInterprete', () => {
  it('tocar destrava a voz e abre o microfone no idioma do lado', () => {
    const { controle, abrir, destravar } = montar()
    controle.tocar('outro')
    expect(destravar).toHaveBeenCalledTimes(1)
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(controle.direcao()).toEqual({ lado: 'outro', fala: 'en-US', de: 'en', para: 'pt' })
    expect(controle.estado().fase).toBe('ouvindo')
  })

  it('o ciclo inteiro: fim da fala fecha o microfone, a tradução é lida no idioma de quem ouve', () => {
    const { controle, voz, fechar, registrar } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's1', source: 'mic', lado: 'meu' })
    expect(fechar).toHaveBeenCalledTimes(1)
    expect(controle.estado().fase).toBe('traduzindo')
    relogio += 1200
    controle.aoTraduzirFinal(traduzida('s1', 'good morning'))
    expect(voz.falas).toHaveLength(1)
    expect(voz.falas[0].texto).toBe('good morning')
    expect(voz.falas[0].opts.lang).toBe('en-US')
    expect(controle.estado().fase).toBe('falando')
    expect(controle.estado().falando).toMatchObject({ id: 's1', lado: 'meu' })
    expect(registrar).toHaveBeenCalledWith(1200, 'voz-do-aparelho')
    voz.terminar()
    expect(controle.estado().fase).toBe('parado')
    expect(controle.estado().falando).toBeNull()
  })

  it('a fala do outro lado é lida no meu idioma', () => {
    const { controle, voz } = montar()
    controle.tocar('outro')
    controle.aoFimDaFala({ segId: 's2', source: 'mic', lado: 'outro' })
    controle.aoTraduzirFinal({ ...traduzida('s2', 'bom dia'), de: 'en', para: 'pt' })
    expect(voz.falas[0].opts.lang).toBe('pt-BR')
  })

  it('a tradução que chega ANTES do fim da fala (cache) é lida quando o fim chega', () => {
    const { controle, voz } = montar()
    controle.tocar('meu')
    controle.aoTraduzirFinal(traduzida('s3', 'hello'))
    expect(voz.falas).toHaveLength(0)
    controle.aoFimDaFala({ segId: 's3', source: 'mic', lado: 'meu' })
    expect(voz.falas.map((f) => f.texto)).toEqual(['hello'])
  })

  it('sem tradução, volta a parado sem voz', () => {
    const { controle, voz } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's4', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal({ ...traduzida('s4', ''), resultado: 'sem-traducao' })
    expect(voz.falas).toHaveLength(0)
    expect(controle.estado().fase).toBe('parado')
  })

  it('ignora finais que não são da fala (o som do computador)', () => {
    const { controle, voz } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's5', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal({ ...traduzida('s5', 'hi'), falada: false })
    expect(voz.falas).toHaveLength(0)
  })

  it('barge-in: tocar enquanto a voz fala corta a voz e abre o microfone de quem tocou', () => {
    const { controle, voz, abrir } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's6', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal(traduzida('s6', 'good night'))
    expect(controle.estado().fase).toBe('falando')
    controle.tocar('outro')
    expect(voz.motor.cancel).toHaveBeenCalled()
    expect(abrir).toHaveBeenCalledTimes(2)
    expect(controle.estado()).toMatchObject({ fase: 'ouvindo', lado: 'outro' })
  })

  it('Repetir lê de novo; sem nada a repetir, não fica preso em "falando"', async () => {
    const { controle, voz } = montar()
    controle.repetir()
    await Promise.resolve()
    expect(controle.estado().fase).toBe('parado')
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's7', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal(traduzida('s7', 'thanks'))
    voz.terminar()
    controle.repetir()
    expect(voz.falas.map((f) => f.texto)).toEqual(['thanks', 'thanks'])
    expect(controle.estado().fase).toBe('falando')
    voz.terminar()
    expect(controle.estado().fase).toBe('parado')
  })

  it('Parar voz corta e volta a parado', () => {
    const { controle, voz } = montar()
    controle.tocar('meu')
    controle.aoFimDaFala({ segId: 's8', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal(traduzida('s8', 'wait'))
    controle.pararVoz()
    expect(voz.motor.cancel).toHaveBeenCalled()
    expect(controle.estado().fase).toBe('parado')
  })

  it('trocar os lados inverte a direção', () => {
    const { controle } = montar()
    controle.trocarLados()
    expect(controle.estado().trocados).toBe(true)
    controle.tocar('meu')
    expect(controle.direcao()).toMatchObject({ lado: 'meu', fala: 'en-US', para: 'pt' })
  })

  it('sair fecha o microfone, para a voz e desliga: nada mais é lido', () => {
    const { controle, voz, fechar } = montar()
    controle.tocar('meu')
    controle.sair()
    expect(fechar).toHaveBeenCalled()
    controle.aoFimDaFala({ segId: 's9', source: 'mic', lado: 'meu' })
    controle.aoTraduzirFinal(traduzida('s9', 'bye'))
    expect(voz.falas).toHaveLength(0)
  })

  it('o microfone que falha ao abrir avisa e volta a parado', async () => {
    const aoFalhar = vi.fn()
    const { controle } = montar({
      microfone: { abrir: () => Promise.reject(new Error('negado')), fechar: vi.fn() },
      aoFalharMicrofone: aoFalhar,
    })
    controle.tocar('meu')
    await vi.runAllTimersAsync()
    expect(aoFalhar).toHaveBeenCalledTimes(1)
    expect(controle.estado().fase).toBe('parado')
  })
})

describe('a falha que chega DEPOIS do toque (o reconhecedor recusou o idioma)', () => {
  it('devolve a conversa a "parado", fecha o microfone e deixa tocar de novo', () => {
    const m = montar()
    m.controle.tocar('outro')
    expect(m.controle.estado().fase).toBe('ouvindo')
    m.controle.microfoneFalhou()
    expect(m.controle.estado().fase).toBe('parado')
    expect(m.fechar).toHaveBeenCalled()
    m.controle.tocar('outro')
    expect(m.controle.estado().fase).toBe('ouvindo')
    expect(m.abrir).toHaveBeenCalledTimes(2)
  })

  it('fora de "ouvindo" (a voz já lê a tradução) não mexe em nada', () => {
    const m = montar()
    m.controle.microfoneFalhou()
    expect(m.controle.estado().fase).toBe('parado')
    expect(m.fechar).not.toHaveBeenCalled()
  })
})

describe('os idiomas da conversa, para o motor do microfone', () => {
  it('são os dois lados em BCP-47, na ordem meu → outro', () => {
    const m = montar({ idiomas: () => ({ meu: 'pt', outro: 'en-US' }) })
    expect(m.controle.idiomasDaConversa()).toEqual(['pt-BR', 'en-US'])
  })
})
