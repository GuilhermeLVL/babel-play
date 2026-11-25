// @vitest-environment jsdom
/**
 * A CENA DO CARTÃO (openspec `cartao-com-captura-de-tela`): trava de privacidade (flag + perfil protegido), armazém local,
 * cobertura opaca, quadro da faixa com constraints sempre devolvidas e ausência de rota de servidor para imagem de cartão.
 */
import 'fake-indexeddb/auto'

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { tirarQuadroDaFaixa } from '../src/gateway/capture/quadroDaTela'
import {
  abrirCenaDoCartao,
  apagarCenaDoCartao,
  armazemDeCenas,
  cenaDoCartaoAtiva,
  cobrirNoCanvas,
  guardarCenaDoCartao,
  MAIOR_CENA_BYTES,
} from '../src/lib/cartoes/cenaDoCartao'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'

const protegido = vi.hoisted(() => ({ valor: false }))
vi.mock('../src/lib/protecaoDoMenor', () => ({ perfilProtegido: () => protegido.valor }))

const imagem = (n: number) => new Blob([new Uint8Array(n).fill(9)], { type: 'image/webp' })
const ligar = (ligada: boolean) => definirEstadoDasFlags({ cartao_com_cena: { ligada } } as never)

beforeEach(async () => {
  protegido.valor = false
  ligar(true)
  await armazemDeCenas().apagarTudo()
})

describe('a trava de privacidade', () => {
  it('flag desligada: nada ativa, nada grava, nada abre', async () => {
    ligar(false)
    expect(cenaDoCartaoAtiva()).toBe(false)
    expect(await guardarCenaDoCartao('c1', imagem(100))).toBe(false)
    expect(await abrirCenaDoCartao('c1')).toBeNull()
  })

  it('perfil protegido (menor ou idade não declarada): nada ativa, nada grava', async () => {
    protegido.valor = true
    expect(cenaDoCartaoAtiva()).toBe(false)
    expect(await guardarCenaDoCartao('c1', imagem(100))).toBe(false)
    expect((await armazemDeCenas().uso()).clipes).toBe(0)
  })

  it('adulto com a flag ligada: guarda, abre e apaga; guardado antes de virar protegido não abre', async () => {
    expect(cenaDoCartaoAtiva()).toBe(true)
    expect(await guardarCenaDoCartao('c1', imagem(100))).toBe(true)
    expect((await abrirCenaDoCartao('c1'))?.size).toBe(100)
    protegido.valor = true
    expect(await abrirCenaDoCartao('c1')).toBeNull()
    await apagarCenaDoCartao('c1')
    protegido.valor = false
    expect(await abrirCenaDoCartao('c1')).toBeNull()
  })

  it('recusa imagem grande demais e apagarTudo (troca de conta) limpa', async () => {
    expect(await guardarCenaDoCartao('c1', imagem(MAIOR_CENA_BYTES + 1))).toBe(false)
    await guardarCenaDoCartao('c2', imagem(10))
    await armazemDeCenas().apagarTudo()
    expect(await armazemDeCenas().uso()).toEqual({ clipes: 0, bytes: 0 })
  })
})

describe('a cobertura', () => {
  it('pinta preto opaco nas coordenadas certas do canvas', () => {
    const chamadas: Array<[number, number, number, number]> = []
    const ctx = {
      save: () => {},
      restore: () => {},
      fillStyle: '',
      globalAlpha: 0.5,
      fillRect: (...a: [number, number, number, number]) => chamadas.push(a),
    }
    const canvas = { width: 400, height: 200, getContext: () => ctx } as unknown as HTMLCanvasElement
    cobrirNoCanvas(canvas, [{ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }])
    expect(chamadas).toEqual([[100, 100, 200, 50]])
    expect(ctx.fillStyle).toBe('#000')
    expect(ctx.globalAlpha).toBe(1)
  })

  it('limita o retângulo às bordas do quadro', () => {
    const chamadas: Array<[number, number, number, number]> = []
    const ctx = {
      save() {},
      restore() {},
      fillStyle: '',
      globalAlpha: 1,
      fillRect: (...a: [number, number, number, number]) => chamadas.push(a),
    }
    const canvas = { width: 100, height: 100, getContext: () => ctx } as unknown as HTMLCanvasElement
    cobrirNoCanvas(canvas, [{ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }])
    expect(chamadas).toEqual([[90, 90, 10, 10]])
  })
})

describe('o quadro da faixa', () => {
  const faixa = (readyState: 'live' | 'ended' = 'live') => {
    const aplicadas: unknown[] = []
    return {
      aplicadas,
      trilha: {
        readyState,
        applyConstraints: async (c: unknown) => void aplicadas.push(c),
      } as unknown as MediaStreamTrack,
    }
  }
  const minimas = { frameRate: { max: 1 }, width: { max: 640 }, height: { max: 360 } }

  it('sem faixa ou faixa encerrada: null, e nenhuma constraint é mexida', async () => {
    const f = faixa('ended')
    expect(await tirarQuadroDaFaixa(undefined, minimas, async () => null)).toBeNull()
    expect(await tirarQuadroDaFaixa(f.trilha, minimas, async () => null)).toBeNull()
    expect(f.aplicadas).toEqual([])
  })

  it('sobe a resolução, captura e volta ao mínimo', async () => {
    const f = faixa()
    const canvas = {} as HTMLCanvasElement
    expect(await tirarQuadroDaFaixa(f.trilha, minimas, async () => canvas)).toBe(canvas)
    expect(f.aplicadas).toHaveLength(2)
    expect(f.aplicadas[1]).toEqual(minimas)
  })

  it('volta ao mínimo MESMO se o desenho falhar', async () => {
    const f = faixa()
    const r = await tirarQuadroDaFaixa(f.trilha, minimas, async () => {
      throw new Error('desenho falhou')
    })
    expect(r).toBeNull()
    expect(f.aplicadas.at(-1)).toEqual(minimas)
  })
})

describe('retenção zero no servidor', () => {
  it('nenhuma rota do servidor aceita imagem de cartão', () => {
    const achados: string[] = []
    const varrer = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = path.join(dir, n)
        if (statSync(p).isDirectory()) varrer(p)
        else if (
          /\.(ts|js)$/.test(n) &&
          /image\/(webp|jpeg|png)|multer|cartao_com_cena|cena_do_cartao/i.test(readFileSync(p, 'utf8'))
        )
          achados.push(p)
      }
    }
    varrer(path.resolve('server/routes'))
    expect(achados).toEqual([])
  })
})
