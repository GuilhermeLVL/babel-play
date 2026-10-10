// @vitest-environment jsdom
/**
 * A RESPOSTA AO APONTAR NO HEADSET (`src/lib/dispositivo/respostaAoApontar.ts`): o controle vibra quando
 * o ponteiro ENTRA num alvo, não repete no mesmo alvo, respeita a preferência e os desabilitados, e cai
 * num tique sonoro onde não há motor.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
/* O pulso e o tique são do headset; no computador (desenho novo) fica só o brilho que segue o ponteiro. */
const aparelho = vi.hoisted(() => ({ tipo: 'quest' }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }) }
})

import { guardarVibracaoDoQuest, lerVibracaoDoQuest } from '../src/lib/dispositivo/preferenciasDoQuest'
import { alvoSobOPonteiro, instalarRespostaAoApontar, provarVibracao } from '../src/lib/dispositivo/respostaAoApontar'
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

/* Auditoria de desempenho de 10/10/2026, G9: a posição do ponteiro era gravada em todo botão apontado, e
   só os alvos com o brilho a leem. */
describe('a posição do ponteiro dentro do alvo (`--mx`, `--my`)', () => {
  let quadros: Array<() => void> = []
  const rodar = () => {
    const fila = quadros
    quadros = []
    fila.forEach((f) => f())
  }
  const mover = (alvo: Element, x: number, y: number) =>
    alvo.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }))

  beforeEach(() => {
    quadros = []
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => quadros.push(f))
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
    porControles([])
    document.querySelector('main')!.insertAdjacentHTML(
      'beforeend',
      '<button id="cartao" class="q-tile">Jogar</button><button id="linha" class="q-linha">Linha</button>',
    )
    for (const id of ['cartao', 'linha', 'a'])
      el(id).getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 }) as DOMRect
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('é gravada no cartão e na linha (quem tem o brilho), uma vez por quadro, em px inteiros', () => {
    ponteiro('pointerover', el('cartao'))
    mover(el('cartao'), 60.4, 45.6)
    mover(el('cartao'), 90, 70)
    expect(quadros).toHaveLength(1)
    rodar()
    expect(el('cartao').style.getPropertyValue('--mx')).toBe('50px')
    expect(el('cartao').style.getPropertyValue('--my')).toBe('26px')
    ponteiro('pointerover', el('linha'))
    mover(el('linha'), 110, 30)
    rodar()
    expect(el('linha').style.getPropertyValue('--mx')).toBe('100px')
  })

  it('num botão comum, que não lê a posição, nada é gravado e nenhum quadro é pedido', () => {
    ponteiro('pointerover', el('a'))
    mover(el('a'), 60, 45)
    expect(quadros).toHaveLength(0)
    expect(el('a').style.getPropertyValue('--mx')).toBe('')
  })

  it('quem lê a posição no CSS está na lista de quem a recebe', () => {
    /* Os três leitores de `var(--mx)` num `::after`: o cartão e a linha (`quest.css`) e o `.jogo.clicavel`. */
    const css = readFileSync(join(__dirname, '../src/styles/quest.css'), 'utf8')
    expect(css).toMatch(/:is\(\.q-tile, \.q-linha\):not\(\.apagado, :disabled\)::after \{[^}]*var\(--mx, 50%\)/)
    el('cartao').className = 'jogo clicavel'
    ponteiro('pointerover', el('cartao'))
    mover(el('cartao'), 30, 40)
    expect(quadros).toHaveLength(1)
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
