// @vitest-environment jsdom
/**
 * O PRIMEIRO CONTATO com a voz no aparelho, do lado do app: a "Automática" lê com a Supertonic quando o modelo já está
 * aqui (`vozNoAparelhoLe`), o convite só aparece nas condições certas (`conviteDaVozNoAparelho`), "Agora não" vale 30
 * dias, e o cartão (`ConviteDaVozNoAparelho`) baixa sem bloquear, troca a escolha e nunca deixa silêncio na falha.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PRAZO_DO_CONVITE_MS } from '../src/core/harness/vozNoAparelho'
import { REVISAO_DO_SUPERTONIC } from '../src/core/voz/supertonic'

const sinais = vi.hoisted(() => ({
  flag: true,
  protegido: false,
  tipo: 'desktop-com-gpu' as string,
  poucaMemoria: false,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130',
  toques: 0,
}))

vi.mock('../src/lib/flagsCache', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flagsCache')>()),
  flagLigada: (k: string) => (k === 'voz_no_aparelho' ? sinais.flag : false),
}))
vi.mock('../src/lib/protecaoDoMenor', async (orig) => ({
  ...(await orig<typeof import('../src/lib/protecaoDoMenor')>()),
  perfilProtegido: () => sinais.protegido,
}))
vi.mock('../src/lib/dispositivo/perfil', async (orig) => ({
  ...(await orig<typeof import('../src/lib/dispositivo/perfil')>()),
  perfilDoDispositivo: () => ({
    tipo: sinais.tipo,
    poucaMemoria: sinais.poucaMemoria,
    sinais: { memoriaGb: 8, webGpu: true, isolado: true, userAgent: sinais.userAgent, toques: sinais.toques },
  }),
}))

const vna = await import('../src/lib/voz/vozNoAparelho')
const { setVoicePref } = await import('../src/lib/tts')

const modeloPronto = () => localStorage.setItem('frasy.vozNoAparelho.modelo', REVISAO_DO_SUPERTONIC)

beforeEach(() => {
  localStorage.clear()
  Object.assign(sinais, {
    flag: true,
    protegido: false,
    tipo: 'desktop-com-gpu',
    poucaMemoria: false,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130',
    toques: 0,
  })
  vi.stubEnv('VITE_VOZ_MODELO_URL', 'http://localhost:3185/assets')
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { getDirectory: async () => ({}) },
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('vozNoAparelhoLe (a "Automática" com o modelo pronto)', () => {
  it('Automática + modelo pronto: a Supertonic lê (e a porta a chama de pronta)', () => {
    modeloPronto()
    expect(vna.vozNoAparelhoLe('pt')).toBe(true)
    expect(vna.vozNoAparelhoLe('en-US')).toBe(true)
  })
  it('sem o modelo: a voz do sistema', () => {
    expect(vna.vozNoAparelhoLe('pt')).toBe(false)
  })
  it('a pessoa escolheu uma voz do sistema: ela vence', () => {
    modeloPronto()
    setVoicePref('pt', 'Luciana')
    expect(vna.vozNoAparelhoLe('pt')).toBe(false)
  })
  it('perfil protegido e celular: nunca', () => {
    modeloPronto()
    sinais.protegido = true
    expect(vna.vozNoAparelhoLe('pt')).toBe(false)
    sinais.protegido = false
    sinais.tipo = 'celular-bom'
    sinais.poucaMemoria = true
    expect(vna.vozNoAparelhoLe('pt')).toBe(false)
  })
  it('idioma fora do motor: nunca', () => {
    modeloPronto()
    expect(vna.vozNoAparelhoLe('ja')).toBe(false)
  })
  it('sem a raiz dos pesos configurada: nunca', () => {
    modeloPronto()
    vi.stubEnv('VITE_VOZ_MODELO_URL', '')
    expect(vna.vozNoAparelhoLe('pt')).toBe(false)
  })
})

describe('conviteDaVozNoAparelho', () => {
  it('desktop capaz, sem modelo, sem áudio gravado: convida', () => {
    expect(vna.conviteDaVozNoAparelho('en', false)).toBe(true)
  })
  it('áudio gravado: nunca', () => {
    expect(vna.conviteDaVozNoAparelho('pt', true)).toBe(false)
  })
  it('perfil protegido, celular, iOS, flag desligada: nunca', () => {
    sinais.protegido = true
    expect(vna.conviteDaVozNoAparelho('pt', false)).toBe(false)
    sinais.protegido = false
    sinais.tipo = 'celular-bom'
    sinais.poucaMemoria = true
    expect(vna.conviteDaVozNoAparelho('pt', false)).toBe(false)
    sinais.tipo = 'desktop-com-gpu'
    sinais.poucaMemoria = false
    sinais.userAgent = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'
    expect(vna.conviteDaVozNoAparelho('pt', false)).toBe(false)
    sinais.userAgent = 'Mozilla/5.0 (Macintosh)'
    sinais.flag = false
    expect(vna.conviteDaVozNoAparelho('pt', false)).toBe(false)
  })
  it('"Agora não" persiste 30 dias neste aparelho', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
    vna.recusarConviteDaVozNoAparelho()
    expect(vna.conviteDaVozNoAparelho('pt', false)).toBe(false)
    vi.setSystemTime(Date.now() + PRAZO_DO_CONVITE_MS - 60_000)
    expect(vna.conviteDaVozNoAparelho('pt', false)).toBe(false)
    vi.setSystemTime(Date.now() + 60_000)
    expect(vna.conviteDaVozNoAparelho('pt', false)).toBe(true)
  })
  it('sem localStorage: não quebra (o convite simplesmente aparece)', () => {
    const espiao = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio')
    })
    expect(() => vna.recusarConviteDaVozNoAparelho()).not.toThrow()
    espiao.mockRestore()
  })
})

describe('o cartão do convite', () => {
  async function montar() {
    const { default: Convite } = await import('../src/components/views/leitor/ConviteDaVozNoAparelho')
    const aoFicarPronta = vi.fn()
    render(<Convite idioma="pt" aoFicarPronta={aoFicarPronta} />)
    return { aoFicarPronta }
  }

  it('é uma região rotulada, não modal, e não rouba o foco', async () => {
    const antes = document.activeElement
    await montar()
    const regiao = screen.getByRole('region', { name: 'Quer uma voz mais natural?' })
    expect(regiao.getAttribute('aria-modal')).toBeNull()
    expect(document.activeElement).toBe(antes)
    expect(screen.getByText(/Baixa uma vez \(≈ \d+ MB\), fica só neste aparelho/)).toBeTruthy()
    expect(regiao.querySelector('[aria-live="polite"]')).toBeTruthy()
  })

  it('"Agora não": o cartão some e a recusa fica guardada', async () => {
    await montar()
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(screen.queryByTestId('convite-voz-no-aparelho')).toBeNull()
    expect(Number(localStorage.getItem('frasy.vozNoAparelho.conviteRecusadoEm'))).toBeGreaterThan(0)
  })

  it('"Baixar e usar": progresso e cancelar; pronto, a voz vira a escolha do idioma e o narrador é avisado', async () => {
    let terminar!: (ok: boolean) => void
    const baixar = vi.spyOn(vna, 'baixarVozNoAparelho').mockImplementation(
      () =>
        new Promise((r) => {
          terminar = r
        }),
    )
    const aquecer = vi.spyOn(vna, 'aquecerVozNoAparelho').mockResolvedValue()
    const { aoFicarPronta } = await montar()
    fireEvent.click(screen.getByRole('button', { name: 'Baixar e usar' }))
    expect(screen.getByTestId('convite-voz-no-aparelho').dataset.fase).toBe('baixando')
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy()
    expect(screen.getByLabelText('Baixando a voz de alta qualidade')).toBeTruthy()
    await act(async () => terminar(true))
    expect(aquecer).toHaveBeenCalled()
    expect(aoFicarPronta).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('babel_voice_prefs') ?? '{}').pt).toBe(vna.VOZ_NO_APARELHO)
    expect(screen.getByTestId('convite-voz-resultado').textContent).toBe('Pronto: a próxima frase já sai na voz nova.')
    baixar.mockRestore()
    aquecer.mockRestore()
  })

  it('falha no download: diz o fato e a saída, sem trocar a voz', async () => {
    const baixar = vi.spyOn(vna, 'baixarVozNoAparelho').mockImplementation(async () => false)
    const estado = vi.spyOn(vna, 'estadoDaVozNoAparelho').mockReturnValue({ fase: 'erro', recebidos: 0, total: 0 })
    const { aoFicarPronta } = await montar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Baixar e usar' }))
    })
    expect(screen.getByTestId('convite-voz-resultado').textContent).toBe(
      'A leitura continua com a voz do sistema. Tente baixar de novo em Voz e modo.',
    )
    expect(aoFicarPronta).not.toHaveBeenCalled()
    expect(localStorage.getItem('babel_voice_prefs')).toBeNull()
    baixar.mockRestore()
    estado.mockRestore()
  })

  it('o modelo não abre depois do download (aquecer falha): a mesma mensagem, a voz não troca', async () => {
    const baixar = vi.spyOn(vna, 'baixarVozNoAparelho').mockResolvedValue(true)
    const aquecer = vi.spyOn(vna, 'aquecerVozNoAparelho').mockRejectedValue(new Error('sem espaço'))
    const { aoFicarPronta } = await montar()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Baixar e usar' }))
    })
    expect(screen.getByTestId('convite-voz-no-aparelho').dataset.fase).toBe('erro')
    expect(aoFicarPronta).not.toHaveBeenCalled()
    baixar.mockRestore()
    aquecer.mockRestore()
  })
})
