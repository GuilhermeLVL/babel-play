// @vitest-environment jsdom
/**
 * A RESPOSTA AO APONTAR NO HEADSET (`src/lib/dispositivo/respostaAoApontar.ts`): o controle vibra quando
 * o ponteiro ENTRA num alvo, não repete no mesmo alvo, respeita a preferência e os desabilitados, e cai
 * num tique sonoro onde não há motor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
/* O pulso e o tique são do headset; no computador (desenho novo) fica só o brilho que segue o ponteiro. */
const aparelho = vi.hoisted(() => ({ tipo: 'quest' }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }) }
})

import { alvoSobOPonteiro, instalarRespostaAoApontar, provarVibracao } from '../src/lib/dispositivo/respostaAoApontar'
import { guardarVibracaoDoQuest, lerVibracaoDoQuest } from '../src/lib/dispositivo/preferenciasDoQuest'
import { play } from '../src/lib/soundFx'

type Efeito = { duration: number; strongMagnitude: number; weakMagnitude: number }

function controleFalso(index = 0, pressionado = false) {
  const playEffect = vi.fn(async (_tipo: string, _efeito: Efeito) => 'complete')
  return {
    controle: { index, buttons: [{ pressed: pressionado }], vibrationActuator: { playEffect } },
    playEffect,
  }
}

const porControles = (lista: unknown[]) =>
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => lista })

/** O jsdom não tem `PointerEvent`: um `MouseEvent` com o nome certo basta para o listener. */
const ponteiro = (tipo: string, alvo: Element) => alvo.dispatchEvent(new MouseEvent(tipo, { bubbles: true }))

let desinstalar: () => void
let relogio = 0

beforeEach(() => {
  document.body.innerHTML = `
    <main>
      <button id="a">A</button>
      <button id="b"><svg id="icone"></svg>B</button>
      <button id="c" disabled>C</button>
      <button id="d" aria-disabled="true">D</button>
      <p id="texto">texto</p>
    </main>`
  localStorage.clear()
  relogio = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => relogio)
  desinstalar = instalarRespostaAoApontar()
})

afterEach(() => {
  desinstalar()
  vi.restoreAllMocks()
  vi.mocked(play).mockClear()
})

const el = (id: string) => document.getElementById(id)!
const passar = (ms: number) => {
  relogio += ms
}

describe('alvoSobOPonteiro', () => {
  it('sobe do ícone ao botão; texto, desabilitado e aria-disabled não são alvo', () => {
    expect(alvoSobOPonteiro(el('icone'))).toBe(el('b'))
    expect(alvoSobOPonteiro(el('texto'))).toBeNull()
    expect(alvoSobOPonteiro(el('c'))).toBeNull()
    expect(alvoSobOPonteiro(el('d'))).toBeNull()
  })
})

describe('ao apontar', () => {
  it('vibra ao ENTRAR num alvo, uma vez; mexer dentro dele não repete', () => {
    const { controle, playEffect } = controleFalso()
    porControles([controle])
    ponteiro('pointerover', el('b'))
    passar(200)
    ponteiro('pointerover', el('icone')) // ainda dentro do mesmo botão
    expect(playEffect).toHaveBeenCalledTimes(1)
    expect(playEffect.mock.calls[0][0]).toBe('dual-rumble')
    expect(play).not.toHaveBeenCalled()
  })

  it('outro alvo vibra de novo, mas não antes do intervalo (o raio treme na borda)', () => {
    const { controle, playEffect } = controleFalso()
    porControles([controle])
    ponteiro('pointerover', el('a'))
    passar(20)
    ponteiro('pointerover', el('b'))
    expect(playEffect).toHaveBeenCalledTimes(1)
    passar(200)
    ponteiro('pointerover', el('a'))
    expect(playEffect).toHaveBeenCalledTimes(2)
  })

  it('forte de fábrica; suave pulsa mais fraco; desligada não pulsa nem toca', () => {
    const { controle, playEffect } = controleFalso()
    porControles([controle])
    expect(lerVibracaoDoQuest()).toBe('forte')
    ponteiro('pointerover', el('a'))
    const forte = playEffect.mock.calls[0][1].strongMagnitude
    guardarVibracaoDoQuest('suave')
    passar(200)
    ponteiro('pointerover', el('b'))
    expect(playEffect.mock.calls[1][1].strongMagnitude).toBeLessThan(forte)
    guardarVibracaoDoQuest('desligada')
    passar(200)
    ponteiro('pointerover', el('a'))
    expect(playEffect).toHaveBeenCalledTimes(2)
    expect(play).not.toHaveBeenCalled()
  })

  it('no computador (desenho novo) não pulsa nem toca: com mouse a pessoa vê o ponteiro', () => {
    desinstalar()
    aparelho.tipo = 'desktop-com-gpu'
    desinstalar = instalarRespostaAoApontar()
    aparelho.tipo = 'quest'
    const { controle, playEffect } = controleFalso()
    porControles([controle])
    ponteiro('pointerover', el('a'))
    ponteiro('pointerdown', el('a'))
    porControles([])
    passar(200)
    ponteiro('pointerover', el('b'))
    expect(playEffect).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
  })

  it('texto e alvo desabilitado não respondem', () => {
    const { controle, playEffect } = controleFalso()
    porControles([controle])
    ponteiro('pointerover', el('texto'))
    ponteiro('pointerover', el('c'))
    expect(playEffect).not.toHaveBeenCalled()
  })

  it('sem controle com motor à vista: o tique sonoro faz o papel', () => {
    porControles([])
    ponteiro('pointerover', el('a'))
    expect(play).toHaveBeenCalledWith('apontar')
  })

  it('o clique pulsa mais forte, e só no controle que apertou o gatilho', () => {
    const esquerdo = controleFalso(0, false)
    const direito = controleFalso(1, true)
    porControles([esquerdo.controle, direito.controle])
    ponteiro('pointerover', el('a')) // antes do primeiro clique: os dois
    expect(esquerdo.playEffect).toHaveBeenCalledTimes(1)
    expect(direito.playEffect).toHaveBeenCalledTimes(1)
    ponteiro('pointerdown', el('a'))
    expect(direito.playEffect).toHaveBeenCalledTimes(2)
    expect(esquerdo.playEffect).toHaveBeenCalledTimes(1)
    expect(direito.playEffect.mock.calls[1][1].duration).toBeGreaterThan(direito.playEffect.mock.calls[0][1].duration)
    passar(200)
    ponteiro('pointerover', el('b')) // agora só a mão que aponta
    expect(direito.playEffect).toHaveBeenCalledTimes(3)
    expect(esquerdo.playEffect).toHaveBeenCalledTimes(1)
  })
})

describe('provarVibracao', () => {
  it('conta os controles, os que têm motor, e diz se o pedido saiu', () => {
    const { controle } = controleFalso()
    porControles([controle, { index: 1, buttons: [] }, null])
    expect(provarVibracao('forte')).toEqual({ controles: 2, comMotor: 1, pediu: true })
    porControles([])
    expect(provarVibracao('suave')).toEqual({ controles: 0, comMotor: 0, pediu: false })
  })
})
