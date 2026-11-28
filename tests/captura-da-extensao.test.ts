/**
 * O RECEPTOR DA EXTENSÃO (`src/lib/captura/daExtensao.ts`, openspec `captura-em-um-clique` 3.1 a 3.3): origem errada,
 * mensagem malformada, extensão ausente, quadro perdido, e as garantias de privacidade (sem rede, sem eval).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import {
  AMOSTRAS_POR_QUADRO,
  mensagemDoApp,
  mensagemErro,
  mensagemParou,
  mensagemPcm,
  mensagemPronta,
} from '../extensao/contrato.js'
import {
  criarReceptor,
  type EstadoDaExtensao,
  type JanelaDoReceptor,
  type MensagemRecebida,
  type QuadroDaExtensao,
} from '../src/lib/captura/daExtensao'
import { abertaPelaExtensao } from '../src/lib/captura/fonteDaAbertura'

const ORIGEM = 'https://frasy.com.br'

function janelaFalsa() {
  const ouvintes = new Set<(e: MensagemRecebida) => void>()
  const postadas: Array<{ m: unknown; alvo: string }> = []
  const janela: JanelaDoReceptor = {
    location: { origin: ORIGEM },
    addEventListener: (_t, f) => void ouvintes.add(f),
    removeEventListener: (_t, f) => void ouvintes.delete(f),
    postMessage: (m, alvo) => void postadas.push({ m, alvo }),
  }
  /** Entrega uma mensagem como o navegador entregaria: por padrão, da própria janela e da origem dela. */
  const entregar = (data: unknown, extra: Partial<MensagemRecebida> = {}) => {
    for (const f of [...ouvintes]) f({ data, origin: ORIGEM, source: janela, ...extra })
  }
  return { janela, ouvintes, postadas, entregar }
}

function montar(esperaMs = 2000) {
  const f = janelaFalsa()
  const estados: EstadoDaExtensao[] = []
  const quadros: Array<{ q: QuadroDaExtensao; perdidos: number }> = []
  let prazo: (() => void) | null = null
  const r = criarReceptor({
    janela: f.janela,
    esperaMs,
    aoMudarEstado: (e) => estados.push(e),
    agendar: (fn) => {
      prazo = fn
      return 1
    },
    cancelar: () => {
      prazo = null
    },
  })
  r.consumir((q, perdidos) => quadros.push({ q, perdidos }))
  const quadro = (seq: number) => mensagemPcm(new Int16Array(AMOSTRAS_POR_QUADRO).fill(16384), seq, seq * 100)
  return { ...f, r, estados, quadros, quadro, dispararPrazo: () => prazo?.() }
}

describe('quem pode falar com o receptor', () => {
  it('ignora mensagem de origem diferente, mesmo com forma perfeita', () => {
    const t = montar()
    t.r.conectar()
    t.entregar(mensagemPronta(), { origin: 'https://evil.example' })
    t.entregar(mensagemPronta(), { origin: `${ORIGEM}.evil.example` })
    t.entregar(mensagemPronta(), { origin: 'null' })
    expect(t.r.estado()).toBe('aguardando')
  })

  it('ignora mensagem que não veio da própria janela (iframe, outra janela)', () => {
    const t = montar()
    t.r.conectar()
    t.entregar(mensagemPronta(), { source: {} })
    t.entregar(mensagemPronta(), { source: null })
    expect(t.r.estado()).toBe('aguardando')
  })

  it('aceita da própria janela e da origem exata', () => {
    const t = montar()
    t.r.conectar()
    t.entregar(mensagemPronta())
    expect(t.r.estado()).toBe('conectada')
  })

  it('o pedido vai só para a origem da página, nunca para "*"', () => {
    const t = montar()
    t.r.conectar()
    expect(t.postadas).toEqual([{ m: mensagemDoApp('pedir'), alvo: ORIGEM }])
    t.r.parar()
    expect(t.postadas.at(-1)).toEqual({ m: mensagemDoApp('parar'), alvo: ORIGEM })
    expect(t.postadas.every((p) => p.alvo !== '*')).toBe(true)
  })
})

describe('mensagem malformada', () => {
  it('descarta lixo sem lançar e conta o que se diz da extensão e vem torto', () => {
    const t = montar()
    t.r.conectar()
    t.entregar(mensagemPronta())
    for (const lixo of [
      null,
      undefined,
      'texto',
      42,
      [],
      {},
      { fonte: 'frasy-extensao' },
      { ...t.quadro(1), versao: 99 },
      { ...t.quadro(1), tipo: 'executar' },
      { ...t.quadro(1), sr: 44100 },
      { ...t.quadro(1), seq: -1 },
      { ...t.quadro(1), seq: 1.5 },
      { ...t.quadro(1), pcm: 7 },
      { ...t.quadro(1), pcm: 'x'.repeat(20000) },
    ]) {
      expect(() => t.entregar(lixo)).not.toThrow()
    }
    expect(t.quadros).toHaveLength(0)
    expect(t.r.recusadas()).toBeGreaterThan(0)
    expect(t.r.estado()).toBe('conectada')
  })

  it('base64 inválido ou quadro grande demais não chega ao consumidor', () => {
    const t = montar()
    t.r.conectar()
    t.entregar(mensagemPronta())
    t.entregar({ ...t.quadro(1), pcm: '***não-é-base64***' })
    t.entregar({ ...t.quadro(2), pcm: btoa('\0'.repeat(8000)) }) // 4.000 amostras, acima do teto
    t.entregar({ ...t.quadro(3), pcm: btoa('') + 'AA==' }) // 1 byte: nenhuma amostra inteira
    expect(t.quadros).toHaveLength(0)
  })

  it('o conteúdo da mensagem nunca vira código: um campo com script é só um campo ignorado', () => {
    const t = montar()
    const g = globalThis as unknown as { __pwned?: boolean }
    t.r.conectar()
    t.entregar({
      ...mensagemPronta(),
      extra: "globalThis.__pwned = true; </script><img src=x onerror='globalThis.__pwned=true'>",
    })
    t.entregar({ ...t.quadro(1), codigo: 'globalThis.__pwned = true' })
    expect(g.__pwned).toBeUndefined()
    expect(t.quadros).toHaveLength(1)
  })
})

describe('quadros', () => {
  it('entrega Float32 em [-1, 1) e conta o quadro perdido pela seq', () => {
    const t = montar()
    t.r.conectar()
    t.entregar(mensagemPronta())
    t.entregar(t.quadro(1))
    t.entregar(t.quadro(4)) // 2 e 3 faltaram
    expect(t.quadros.map((x) => [x.q.seq, x.perdidos])).toEqual([
      [1, 0],
      [4, 2],
    ])
    expect(t.quadros[0].q.pcm).toHaveLength(AMOSTRAS_POR_QUADRO)
    expect(t.quadros[0].q.pcm[0]).toBeCloseTo(0.5, 3)
    expect(t.r.perdidos()).toBe(2)
  })

  it('descarta quadro repetido ou antigo', () => {
    const t = montar()
    t.r.conectar()
    t.entregar(mensagemPronta())
    t.entregar(t.quadro(5))
    t.entregar(t.quadro(5))
    t.entregar(t.quadro(3))
    expect(t.quadros).toHaveLength(1)
  })

  it('antes do "pronta" ou sem consumidor, o quadro é descartado (retenção zero)', () => {
    const t = montar()
    t.r.conectar()
    t.entregar(t.quadro(1)) // ainda aguardando
    t.entregar(mensagemPronta())
    t.r.consumir(null)
    t.entregar(t.quadro(2))
    expect(t.quadros).toHaveLength(0)
  })

  it('"pronta" com taxa ou tamanho de quadro diferentes do contrato é recusada', () => {
    const t = montar()
    t.r.conectar()
    t.entregar({ ...mensagemPronta(), amostrasPorQuadro: 99999 })
    expect(t.r.estado()).toBe('aguardando')
    expect(t.r.recusadas()).toBe(1)
  })
})

describe('extensão ausente', () => {
  it('sem resposta no prazo, o estado vira "ausente" (a tela cai no seletor)', () => {
    const t = montar()
    t.r.conectar()
    t.dispararPrazo()
    expect(t.r.estado()).toBe('ausente')
    expect(t.estados).toEqual(['ausente'])
  })

  it('a ponte avisando "parou" antes do "pronta" também é ausente; depois do "pronta" é parada', () => {
    const a = montar()
    a.r.conectar()
    a.entregar(mensagemParou())
    expect(a.r.estado()).toBe('ausente')
    const b = montar()
    b.r.conectar()
    b.entregar(mensagemPronta())
    b.entregar(mensagemParou())
    expect(b.r.estado()).toBe('parada')
  })

  it('erro da extensão: ausente antes de conectar, erro depois', () => {
    const a = montar()
    a.r.conectar()
    a.entregar(mensagemErro('NotAllowedError'))
    expect(a.r.estado()).toBe('ausente')
    const b = montar()
    b.r.conectar()
    b.entregar(mensagemPronta())
    b.entregar(mensagemErro('NotAllowedError'))
    expect(b.r.estado()).toBe('erro')
  })

  it('o "pronta" a tempo cancela o prazo', () => {
    const t = montar()
    t.r.conectar()
    t.entregar(mensagemPronta())
    t.dispararPrazo()
    expect(t.r.estado()).toBe('conectada')
  })
})

describe('sem ?fonte=extensao nada muda (3.3)', () => {
  it('só o parâmetro exato ativa', () => {
    expect(abertaPelaExtensao('?fonte=extensao')).toBe(true)
    expect(abertaPelaExtensao('?x=1&fonte=extensao')).toBe(true)
    expect(abertaPelaExtensao('')).toBe(false)
    expect(abertaPelaExtensao('?fonte=outra')).toBe(false)
    expect(abertaPelaExtensao('?fonte=extensao2')).toBe(false)
  })

  it('criar o receptor não registra ouvinte: só o `conectar` registra, e o `parar` tira', () => {
    const t = montar()
    expect(t.ouvintes.size).toBe(0)
    t.r.conectar()
    t.r.conectar() // idempotente
    expect(t.ouvintes.size).toBe(1)
    t.r.parar()
    expect(t.ouvintes.size).toBe(0)
    const antes = t.quadros.length
    t.entregar(mensagemPronta())
    expect(t.quadros.length).toBe(antes)
  })

  it('o gancho só carrega o receptor com a flag E o parâmetro (import sob demanda)', () => {
    const src = readFileSync('src/lib/captura/useCapturaDaExtensao.ts', 'utf8')
    expect(src).toMatch(/import\('\.\/daExtensao'\)/)
    expect(src).not.toMatch(/^import (?!type\b).* from '\.\/daExtensao'/m)
  })
})

describe('privacidade e segurança do arquivo do receptor', () => {
  const fontes = ['src/lib/captura/daExtensao.ts', 'src/lib/captura/useCapturaDaExtensao.ts']
  it('sem rede, sem eval, sem HTML, sem armazenamento', () => {
    for (const f of fontes) {
      const src = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|apiFetch/)
      expect(src, f).not.toMatch(/\beval\s*\(|new Function|innerHTML|dangerouslySetInnerHTML|document\.write/)
      expect(src, f).not.toMatch(/localStorage|sessionStorage|indexedDB/)
      expect(src, f).not.toMatch(/postMessage\([^)]*['"]\*['"]/)
    }
  })

  it('o ouvinte confere source e origin antes de olhar o conteúdo', () => {
    const src = readFileSync('src/lib/captura/daExtensao.ts', 'utf8')
    const i = src.indexOf('e.source !== janela')
    const j = src.indexOf('e.origin !== janela.location.origin')
    const k = src.indexOf('validarDaExtensao(e.data)')
    expect(i).toBeGreaterThan(0)
    expect(j).toBeGreaterThan(i)
    expect(k).toBeGreaterThan(j)
  })
})

describe('consumidor que lança', () => {
  it('o erro do consumidor não derruba o ouvinte do navegador', () => {
    const t = montar()
    t.r.conectar()
    t.entregar(mensagemPronta())
    const falha = vi.fn(() => {
      throw new Error('x')
    })
    t.r.consumir(falha)
    expect(() => t.entregar(t.quadro(1))).not.toThrow()
    expect(falha).toHaveBeenCalled()
  })
})
