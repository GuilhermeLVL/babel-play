/**
 * O CONTADOR ANÔNIMO, LADO DO NAVEGADOR (change `modelos-confiaveis-e-offline`, 5.1): um `sendBeacon` por tipo de
 * falha por página, só com `{ tipo, aparelho, modelo }` de listas fechadas, e nada quando a pessoa desligou as
 * métricas anônimas ou é um perfil de menor restrito.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ metricas: true as boolean, restrita: false }))
vi.mock('../src/lib/preferencias', () => ({
  lerPreferencias: () => ({ consentimentos: { metricas: estado.metricas } }),
}))
vi.mock('../src/lib/protecaoDoMenor', () => ({ estadoDaProtecao: () => ({ restrita: estado.restrita }) }))
vi.mock('../src/lib/dispositivo/perfil', () => ({ perfilDoDispositivo: () => ({ tipo: 'celular-fraco' }) }))

import { _zerarContadorDeFalhas, contarFalha, contarFalhaDoErro } from '../src/lib/falhas/contadorDeFalhas'

const beacon = vi.fn((_url: string, _corpo: Blob) => true)

beforeEach(() => {
  estado.metricas = true
  estado.restrita = false
  beacon.mockClear()
  _zerarContadorDeFalhas()
  vi.stubGlobal('navigator', { sendBeacon: beacon, onLine: true })
})
afterEach(() => vi.unstubAllGlobals())

const corpoEnviado = async (i = 0) => JSON.parse(await (beacon.mock.calls[i][1] as Blob).text())

describe('contarFalha', () => {
  it('manda só tipo, aparelho e a família do modelo, para a sub-rota anônima', async () => {
    contarFalha('modelo-corrompido', '[falha:modelo-corrompido] onnx-community/moonshine-tiny-ONNX: protobuf')
    expect(beacon).toHaveBeenCalledWith('/api/erros-do-cliente/falha', expect.any(Blob))
    expect(await corpoEnviado()).toEqual({
      tipo: 'modelo-corrompido',
      aparelho: 'celular-fraco',
      modelo: 'moonshine-tiny',
    })
  })

  it('no máximo 1 envio por tipo por página', () => {
    contarFalha('sem-internet')
    contarFalha('sem-internet')
    contarFalha('download-interrompido')
    expect(beacon).toHaveBeenCalledTimes(2)
  })

  it('métricas anônimas desligadas, ou menor restrito: nada sai', () => {
    estado.metricas = false
    contarFalha('sem-internet')
    estado.metricas = true
    estado.restrita = true
    contarFalha('worker-indisponivel')
    expect(beacon).not.toHaveBeenCalled()
  })

  it('contarFalhaDoErro classifica; o desconhecido não conta', async () => {
    contarFalhaDoErro(new Error('xyz'))
    expect(beacon).not.toHaveBeenCalled()
    contarFalhaDoErro(new TypeError('Failed to fetch'))
    expect(await corpoEnviado()).toMatchObject({ tipo: 'download-interrompido', modelo: 'nenhum' })
  })
})
