// @vitest-environment jsdom
/**
 * AS REGRAS DE PREFERÊNCIA DO SISTEMA (`aplicarAcess`, `src/lib/polimento/base.ts`; `prototipo.js:26-33`).
 *
 * Quem ligou as animações no app vê a camada como foi desenhada: as regras `prefers-reduced-motion` do
 * app inteiro e as de transparência e contraste da camada deixam de seguir o sistema. O que este arquivo
 * trava, além disso, é o conserto da auditoria de desempenho de 10/10/2026 (G12): cada folha de estilo é
 * percorrida UMA vez; a folha que chega depois é percorrida sozinha, e as outras só têm as regras já
 * achadas acertadas.
 *
 * As folhas são de mentira (o jsdom não aplica `@media`): cada uma conta quantas vezes foi percorrida.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aplicarAcess } from '../src/lib/polimento/base'

class RegraDeMidia {
  media: { mediaText: string }
  constructor(
    texto: string,
    public cssRules: unknown[] = [],
    public cssText = '',
  ) {
    this.media = { mediaText: texto }
  }
}

interface Folha {
  cssRules: unknown[]
  percorrida: number
}
/** Uma folha que conta cada vez que alguém anda pelas regras dela. */
function folha(regras: unknown[]): Folha {
  const f = { percorrida: 0 } as Folha
  const lista = new Proxy(regras, {
    get(alvo, chave, quem) {
      if (chave === Symbol.iterator) f.percorrida++
      return Reflect.get(alvo, chave, quem)
    },
  })
  Object.defineProperty(f, 'cssRules', { get: () => lista })
  return f
}

let folhas: Folha[] = []
const reduz = () => new RegraDeMidia('(prefers-reduced-motion: reduce)')
const semPreferencia = () => new RegraDeMidia('(prefers-reduced-motion: no-preference)')
const transparenciaDaCamada = () =>
  new RegraDeMidia('(prefers-reduced-transparency: reduce)', [], "@media (…) { html[data-px='on'] .q-mais { } }")
const contrasteDeLeitura = () => new RegraDeMidia('(prefers-contrast: more)', [], '@media (…) { .texto { } }')

beforeEach(() => {
  folhas = []
  vi.stubGlobal('CSSMediaRule', RegraDeMidia)
  Object.defineProperty(document, 'styleSheets', { configurable: true, get: () => folhas })
  document.body.className = 'animations-on'
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete (document as unknown as Record<string, unknown>).styleSheets
  document.body.className = ''
})

describe('aplicarAcess', () => {
  it('com as animações ligadas no app: `reduce` deixa de valer, `no-preference` vale sempre, e só a transparência DA CAMADA sai', () => {
    const [a, b, c, d] = [reduz(), semPreferencia(), transparenciaDaCamada(), contrasteDeLeitura()]
    /* As folhas do app vêm dentro de `@layer`: uma regra de grupo que não é `@media`. */
    folhas = [folha([{ cssRules: [a, b] }, c, d])]
    aplicarAcess()
    expect(a.media.mediaText).toBe('not all')
    expect(b.media.mediaText).toBe('all')
    expect(c.media.mediaText).toBe('not all')
    expect(d.media.mediaText).toBe('(prefers-contrast: more)')
  })

  it('sem as animações ligadas de propósito, tudo volta a seguir o sistema, com o texto original', () => {
    const [a, b, c] = [reduz(), semPreferencia(), transparenciaDaCamada()]
    folhas = [folha([a, b, c])]
    aplicarAcess()
    document.body.className = ''
    aplicarAcess()
    expect(a.media.mediaText).toBe('(prefers-reduced-motion: reduce)')
    expect(b.media.mediaText).toBe('(prefers-reduced-motion: no-preference)')
    expect(c.media.mediaText).toBe('(prefers-reduced-transparency: reduce)')
    document.body.className = 'animations-on'
    aplicarAcess()
    expect(a.media.mediaText).toBe('not all')
    expect(b.media.mediaText).toBe('all')
  })

  it('cada folha é percorrida uma vez; a que chega depois é percorrida sozinha', () => {
    const primeira = folha([reduz(), { cssRules: [semPreferencia()] }])
    folhas = [primeira]
    aplicarAcess()
    const andou = primeira.percorrida
    expect(andou).toBeGreaterThan(0)
    aplicarAcess()
    aplicarAcess()
    expect(primeira.percorrida).toBe(andou)
    /* A tela nova trouxe a folha dela. */
    const nova = reduz()
    const segunda = folha([nova])
    folhas = [primeira, segunda]
    aplicarAcess()
    expect(primeira.percorrida).toBe(andou)
    expect(segunda.percorrida).toBe(1)
    expect(nova.media.mediaText).toBe('not all')
  })

  it('a folha que ganhou regras é percorrida de novo', () => {
    const regras: unknown[] = [reduz()]
    const f = folha(regras)
    folhas = [f]
    aplicarAcess()
    const andou = f.percorrida
    const chegou = semPreferencia()
    regras.push(chegou)
    aplicarAcess()
    expect(f.percorrida).toBeGreaterThan(andou)
    expect(chegou.media.mediaText).toBe('all')
  })

  it('não regrava a regra que já está como deve (cada escrita manda o navegador refazer o estilo)', () => {
    const a = reduz()
    folhas = [folha([a])]
    aplicarAcess()
    let escritas = 0
    let texto = a.media.mediaText
    Object.defineProperty(a.media, 'mediaText', { get: () => texto, set: (v: string) => void (escritas++, (texto = v)) })
    aplicarAcess()
    expect(escritas).toBe(0)
    document.body.className = ''
    aplicarAcess()
    expect(escritas).toBe(1)
  })

  it('folha de outra origem (ler as regras dá erro) é pulada', () => {
    const a = reduz()
    const proibida = {
      get cssRules(): never {
        throw new Error('SecurityError')
      },
    }
    folhas = [proibida as unknown as Folha, folha([a])]
    expect(() => aplicarAcess()).not.toThrow()
    expect(a.media.mediaText).toBe('not all')
  })
})
