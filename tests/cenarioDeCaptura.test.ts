/**
 * O CENÁRIO É DERIVADO DAS FONTES (spec entrega-honesta).
 *
 * Os três cartões de cenário saíram da tela de captura: eles ligavam microfone e som do sistema
 * por baixo, sem dizer. O risco da remoção era real — `applyScenario` era o ÚNICO escritor de
 * `micEnabled`/`systemEnabled`, e quem tivesse "Gravar Minha Voz" salvo ficaria sem caminho de
 * volta para a captura de sistema. Estes testes prendem a ida e a volta.
 */
import { describe, it, expect } from 'vitest'
import { cenarioDasFontes, fontesDoCenario, type CenarioDeCaptura } from '../src/lib/cenarioDeCaptura'

describe('cenarioDasFontes', () => {
  it('as duas fontes = conversa (é o único cenário que diariza e mostra Falantes)', () => {
    expect(cenarioDasFontes(true, true)).toBe('conversation')
  })

  it('só o sistema = mídia; só o microfone = voz', () => {
    expect(cenarioDasFontes(false, true)).toBe('media')
    expect(cenarioDasFontes(true, false)).toBe('mic')
  })

  it('nenhuma fonte cai em mídia — o cenário que NÃO pede microfone', () => {
    // Estado impossível na prática (o botão Iniciar exige uma fonte). O que importa aqui é que
    // ele nunca resolva para um cenário que peça permissão de microfone.
    expect(cenarioDasFontes(false, false)).toBe('media')
  })
})

describe('ida e volta com o cenário salvo', () => {
  const cenarios: CenarioDeCaptura[] = ['media', 'conversation', 'mic']

  /* O som do sistema deixou de ser escolha: a tela não tem mais interruptor de fonte, só o
     mudo/ativo do microfone. Logo `fontesDoCenario` liga o sistema SEMPRE, e a ida e volta
     idêntica vale para os cenários que já ligavam o sistema. */
  it('restaurar "media" e "conversation" devolve as fontes que os produzem', () => {
    for (const c of ['media', 'conversation'] as CenarioDeCaptura[]) {
      const { mic, sistema } = fontesDoCenario(c)
      expect(cenarioDasFontes(mic, sistema), c).toBe(c)
    }
  })

  it('um "mic" salvo de antes normaliza para conversa em vez de ficar sem som do sistema', () => {
    const { mic, sistema } = fontesDoCenario('mic')
    expect(sistema).toBe(true)
    expect(mic).toBe(true)
    expect(cenarioDasFontes(mic, sistema)).toBe('conversation')
  })

  it('todo cenário salvo liga o som do sistema — ninguém fica sem caminho de volta', () => {
    for (const c of cenarios) {
      const { sistema } = fontesDoCenario(c)
      expect(sistema, c).toBe(true)
    }
  })
})
