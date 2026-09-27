/**
 * AVISO ANTES DE BAIXAR: quanto falta baixar (só o que NÃO está no navegador) contra o limite do
 * perfil (0 com economia de dados ou rede abaixo de 4g; 100 MB no celular/Quest; nenhum no desktop).
 */
import { describe, expect, it } from 'vitest'

import { mbQueFaltaBaixar, precisaConfirmarDownload } from '../src/lib/dispositivo/avisoDeDownload'

describe('mbQueFaltaBaixar', () => {
  it('soma só os modelos que não estão completos no cache', () => {
    const modelos = [{ id: 'a', mbEstimado: 80 }, { id: 'b', mbEstimado: 113 }, { id: 'c' }]
    expect(mbQueFaltaBaixar(modelos, new Set(['b']))).toBe(80)
    expect(mbQueFaltaBaixar(modelos, new Set(['a', 'b']))).toBe(0)
  })
})

describe('precisaConfirmarDownload', () => {
  it('desktop (limite null) nunca pergunta', () => {
    expect(precisaConfirmarDownload(null, 900, false)).toBe(false)
  })
  it('economia de dados (limite 0) pergunta para qualquer download', () => {
    expect(precisaConfirmarDownload(0, 32, false)).toBe(true)
  })
  it('nada a baixar: não pergunta nem com limite 0', () => {
    expect(precisaConfirmarDownload(0, 0, false)).toBe(false)
  })
  it('celular/Quest: pergunta acima de 100 MB', () => {
    expect(precisaConfirmarDownload(100, 80, false)).toBe(false)
    expect(precisaConfirmarDownload(100, 193, false)).toBe(true)
  })
  it('já confirmado nesta tela: não pergunta de novo', () => {
    expect(precisaConfirmarDownload(0, 193, true)).toBe(false)
  })
})
