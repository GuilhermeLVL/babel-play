/**
 * A IMAGEM DE CAPA DA PESSOA (regras puras): tipo pelos bytes (nunca pelo nome), tetos, recorte 2:3 e LRU.
 */
import { describe, expect, it } from 'vitest'

import {
  capasQueSaem,
  planoDeDesenho,
  TETO_DA_IMAGEM_DE_ORIGEM,
  tipoPelosBytes,
  validarImagemDeOrigem,
} from '../src/core/livros/imagemDeCapa'

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)])
const texto = (s: string) => new TextEncoder().encode(s)

describe('tipo pelos bytes', () => {
  it('reconhece JPEG, PNG, GIF e WebP', () => {
    expect(tipoPelosBytes(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(tipoPelosBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(tipoPelosBytes(texto('GIF89a......'))).toBe('image/gif')
    expect(tipoPelosBytes(texto('RIFF....WEBPVP8 '))).toBe('image/webp')
  })

  it('recusa SVG, HTML, PDF e RIFF que não é WebP', () => {
    expect(tipoPelosBytes(texto('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(tipoPelosBytes(texto('<?xml version="1.0"?><svg/>'))).toBeNull()
    expect(tipoPelosBytes(texto('<!doctype html><script>'))).toBeNull()
    expect(tipoPelosBytes(texto('%PDF-1.7'))).toBeNull()
    expect(tipoPelosBytes(texto('RIFF....WAVEfmt '))).toBeNull()
    expect(tipoPelosBytes(new Uint8Array())).toBeNull()
  })
})

describe('validarImagemDeOrigem', () => {
  const jpeg = bytes(0xff, 0xd8, 0xff)
  it('aceita imagem pequena de tipo conhecido', () => {
    expect(validarImagemDeOrigem(50_000, jpeg)).toEqual({ ok: true, tipo: 'image/jpeg' })
  })
  it('recusa vazio, grande demais e tipo desconhecido, nessa ordem', () => {
    expect(validarImagemDeOrigem(0, jpeg)).toEqual({ ok: false, motivo: 'vazia' })
    expect(validarImagemDeOrigem(TETO_DA_IMAGEM_DE_ORIGEM + 1, jpeg)).toEqual({ ok: false, motivo: 'grande' })
    expect(validarImagemDeOrigem(1000, texto('<svg/>'))).toEqual({ ok: false, motivo: 'tipo' })
  })
  it('o teto vale em cheio: exatamente 10 MB ainda passa', () => {
    expect(validarImagemDeOrigem(TETO_DA_IMAGEM_DE_ORIGEM, jpeg).ok).toBe(true)
  })
})

describe('planoDeDesenho (2:3)', () => {
  it('preencher: recorta o centro de uma imagem larga', () => {
    const p = planoDeDesenho(1200, 600, 'preencher')
    expect(p.sh).toBe(600)
    expect(p.sw).toBeCloseTo(400)
    expect(p.sx).toBeCloseTo(400)
    expect(p).toMatchObject({ dx: 0, dy: 0, dw: 300, dh: 450 })
  })
  it('preencher: recorta cima e baixo de uma imagem alta', () => {
    const p = planoDeDesenho(300, 900, 'preencher')
    expect(p.sw).toBe(300)
    expect(p.sh).toBeCloseTo(450)
    expect(p.sy).toBeCloseTo(225)
  })
  it('preencher: uma imagem já 2:3 não perde nada', () => {
    expect(planoDeDesenho(600, 900)).toMatchObject({ sx: 0, sy: 0, sw: 600, sh: 900 })
  })
  it('inteira: mostra tudo, centralizado, com faixas', () => {
    const p = planoDeDesenho(1200, 600, 'inteira')
    expect(p).toMatchObject({ sx: 0, sy: 0, sw: 1200, sh: 600, dw: 300, dh: 150, dx: 0 })
    expect(p.dy).toBeCloseTo(150)
  })
})

describe('capasQueSaem (LRU)', () => {
  const meta = (id: string, usadoEm: number, tamanho = 10) => ({ id, usadoEm, tamanho })
  it('não tira ninguém abaixo dos tetos', () => {
    expect(capasQueSaem([meta('a', 1)], meta('b', 2), { quantidade: 5, bytes: 100 })).toEqual([])
  })
  it('passou da quantidade: sai a usada há mais tempo', () => {
    const guardadas = [meta('novo-demais', 9), meta('velha', 1), meta('meio', 5)]
    expect(capasQueSaem(guardadas, meta('nova', 10), { quantidade: 3, bytes: 1000 })).toEqual(['velha'])
  })
  it('passou dos bytes: sai o bastante para caber', () => {
    const guardadas = [meta('a', 1, 40), meta('b', 2, 40), meta('c', 3, 40)]
    expect(capasQueSaem(guardadas, meta('d', 4, 50), { quantidade: 10, bytes: 100 })).toEqual(['a', 'b'])
  })
  it('regravar a mesma capa não conta duas vezes', () => {
    expect(capasQueSaem([meta('a', 1, 90)], meta('a', 2, 90), { quantidade: 5, bytes: 100 })).toEqual([])
  })
})
