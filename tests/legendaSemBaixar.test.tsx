// @vitest-environment jsdom
/**
 * "LEGENDA SEM BAIXAR NADA: ESCOLHA O IDIOMA DO VÍDEO" (plano "Grátis sem travar", A9a).
 *
 * No desktop fraco, o Chrome com o pacote do idioma transcreve o áudio da aba NO aparelho (Web Speech
 * com `processLocally`) — zero bytes de Whisper e quase nada da nossa CPU. Mas a detecção automática
 * (ligada de fábrica) bloqueia esse caminho: a Web Speech precisa de UM idioma, e quem a deixava
 * ligada caía no Whisper local (centenas de MB e CPU alta). A oferta aparece antes de começar, só
 * quando escolher o idioma leva MESMO ao reconhecimento do navegador, e escolhe num toque.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import React, { Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import LegendaSemBaixar from '../src/components/views/captura/LegendaSemBaixar'
import { desktopFraco, oferecerLegendaSemBaixar, useMotorComIdiomaEscolhido } from '../src/lib/captura/legendaSemBaixar'
import type { DecisaoDoMotorDoSistema } from '../src/lib/captura/webSpeechDoSistema'
import { classificarDispositivo, type SinaisDoDispositivo } from '../src/lib/dispositivo/perfil'

afterEach(cleanup)

const desktop: SinaisDoDispositivo = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36',
  nucleos: 8,
  memoriaGb: 8,
  isolado: true,
  capturaDeTela: true,
  ponteiroGrosso: false,
  toques: 0,
  temXr: false,
  economiaDeDados: false,
  tipoDeRede: '4g',
  movimentoReduzido: false,
  memoriaDaAbaMb: 4096,
  webGpu: true,
}

/** A sonda guardada de uma GPU de verdade (adaptador real, benchmark com folga). */
const sondaComGpuReal = {
  sinais: { webGpu: { reserva: false, shaderF16: true, limites: null } },
  benchmark: { pontuacaoWasm: 1, pontuacaoWebgpu: 4 },
} as never

describe('desktopFraco — o perfil que o chip atende', () => {
  it('desktop sem GPU (a rota fica no Whisper base no WASM): fraco', () => {
    expect(desktopFraco(classificarDispositivo({ ...desktop, webGpu: false }), null, false)).toBe(true)
  })

  it('desktop modesto (modo leve automático): fraco', () => {
    const perfil = classificarDispositivo({ ...desktop, webGpu: false, nucleos: 2 })
    expect(perfil.leve).toBe(true)
    expect(desktopFraco(perfil, null, false)).toBe(true)
  })

  it('desktop com a GPU provada pela sonda (o small roda em tempo real): não é fraco', () => {
    expect(desktopFraco(classificarDispositivo(desktop), sondaComGpuReal, true)).toBe(false)
  })

  it('adaptador de software (o de reserva): fraco — a GPU não conta', () => {
    const sondaDeSoftware = { sinais: { webGpu: { reserva: true, shaderF16: false, limites: null } } } as never
    expect(desktopFraco(classificarDispositivo(desktop), sondaDeSoftware, true)).toBe(true)
  })

  it('celular e Quest: nunca (o celular não tem o áudio do sistema, e o bipe do Android fica como está)', () => {
    const celular = classificarDispositivo({
      ...desktop,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/150.0.0.0 Mobile Safari/537.36',
      capturaDeTela: false,
      ponteiroGrosso: true,
      toques: 5,
      webGpu: false,
    })
    expect(celular.tipo.startsWith('celular')).toBe(true)
    expect(desktopFraco(celular, null, false)).toBe(false)
    const quest = classificarDispositivo({
      ...desktop,
      userAgent: 'OculusBrowser Quest 3',
      capturaDeTela: false,
      temXr: true,
    })
    expect(desktopFraco(quest, null, false)).toBe(false)
  })
})

const noNavegador: DecisaoDoMotorDoSistema = { motor: 'web-speech-local', motivo: 'no-aparelho' }
const base = {
  desktopFraco: true,
  soOSomDoComputador: true,
  detectarIdioma: true,
  gravando: false,
  dispensada: false,
  comIdiomaEscolhido: noNavegador,
}

describe('oferecerLegendaSemBaixar', () => {
  it('desktop fraco, só o som do computador, detecção ligada e o navegador transcreveria: oferece', () => {
    expect(oferecerLegendaSemBaixar(base)).toBe(true)
  })

  it.each([
    ['o idioma já escolhido (a captura já vai ao navegador)', { detectarIdioma: false }],
    ['gravando (a oferta é do início)', { gravando: true }],
    ['dispensada nesta tela', { dispensada: true }],
    ['desktop forte', { desktopFraco: false }],
    ['com o microfone (conversa: não é só o idioma do vídeo que decide)', { soOSomDoComputador: false }],
    ['a decisão ainda não voltou', { comIdiomaEscolhido: null }],
    [
      'o navegador não tem o pacote do idioma',
      { comIdiomaEscolhido: { motor: 'pipeline', motivo: 'idioma-indisponivel' } as DecisaoDoMotorDoSistema },
    ],
    [
      'quem paga vai à nuvem (a reserva local baixaria)',
      { comIdiomaEscolhido: { motor: 'pipeline', motivo: 'nuvem-primeiro' } as DecisaoDoMotorDoSistema },
    ],
    [
      'o teste em execução já falhou neste aparelho',
      { comIdiomaEscolhido: { motor: 'pipeline', motivo: 'falhou-antes' } as DecisaoDoMotorDoSistema },
    ],
  ])('não oferece: %s', (_nome, mudanca) => {
    expect(oferecerLegendaSemBaixar({ ...base, ...mudanca })).toBe(false)
  })
})

describe('useMotorComIdiomaEscolhido — a mesma decisão do clique, perguntada só quando pode mudar algo', () => {
  it('inativo: não pergunta nada', () => {
    const decidir = vi.fn(async () => noNavegador)
    const { result } = renderHook(() =>
      useMotorComIdiomaEscolhido({ ativo: false, idioma: 'en-US', qualidade: 'auto', decidir }),
    )
    expect(result.current).toBeNull()
    expect(decidir).not.toHaveBeenCalled()
  })

  it('ativo: devolve a decisão; o idioma mudou → pergunta de novo', async () => {
    const decidir = vi.fn(async () => noNavegador)
    const { result, rerender } = renderHook(
      ({ idioma }) => useMotorComIdiomaEscolhido({ ativo: true, idioma, qualidade: 'auto', decidir }),
      { initialProps: { idioma: 'en-US' } },
    )
    await waitFor(() => expect(result.current).toEqual(noNavegador))
    rerender({ idioma: 'es-ES' })
    expect(result.current).toBeNull() // o idioma novo ainda não respondeu: nada de oferta velha
    await waitFor(() => expect(decidir).toHaveBeenCalledTimes(2))
  })

  it('a decisão que rejeita: fica sem oferta (null), sem lançar', async () => {
    const decidir = vi.fn(async (): Promise<DecisaoDoMotorDoSistema> => {
      throw new Error('quebrou')
    })
    const { result } = renderHook(() =>
      useMotorComIdiomaEscolhido({ ativo: true, idioma: 'en-US', qualidade: 'auto', decidir }),
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current).toBeNull()
  })
})

describe('<LegendaSemBaixar>', () => {
  function montar(tradutorBaixa = false) {
    const props = {
      idioma: 'en-US',
      tradutorBaixa,
      aoEscolherIdioma: vi.fn(),
      aoEscolherOutro: vi.fn(),
      aoFechar: vi.fn(),
    }
    render(
      <Suspense fallback={null}>
        <LegendaSemBaixar {...props} />
      </Suspense>,
    )
    return props
  }

  it('diz a oferta e escolhe o idioma do vídeo num toque', () => {
    const p = montar()
    expect(screen.getByTestId('legenda-sem-baixar').textContent).toMatch(
      /Legenda sem baixar nada: escolha o idioma do vídeo/,
    )
    fireEvent.click(screen.getByRole('button', { name: /English|Inglês/ }))
    expect(p.aoEscolherIdioma).toHaveBeenCalledTimes(1)
  })

  it('"Outro idioma" leva à escolha do idioma; o X dispensa', () => {
    const p = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Outro idioma' }))
    expect(p.aoEscolherOutro).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(p.aoFechar).toHaveBeenCalledTimes(1)
  })

  it('com o tradutor a baixar, não promete "nada": a transcrição é que não baixa', () => {
    montar(true)
    const texto = screen.getByTestId('legenda-sem-baixar').textContent ?? ''
    expect(texto).not.toMatch(/Legenda sem baixar nada/)
    expect(texto).toMatch(/Transcrição sem baixar nada: escolha o idioma do vídeo/)
  })
})
