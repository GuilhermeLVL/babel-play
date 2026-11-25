// @vitest-environment jsdom
/**
 * A prática de pronúncia nos três ramos (openspec `sombra-sem-web-speech` 2.1, 3.1 a 3.3 e a conformidade da decisão 12):
 * Web Speech só com `rapidoDoMicPermitido`; sem ele, o local com a flag; sem a flag, a gravação sem nota.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SombraDaFala from '../src/components/views/analise/SombraDaFala'

const estado = vi.hoisted(() => ({
  webSpeech: true,
  permitido: true,
  flag: true,
  semFala: false,
  texto: 'hello world',
}))
const preparar = vi.hoisted(() => vi.fn(async () => undefined))
const fetchEspiao = vi.hoisted(() => vi.fn())

vi.mock('../src/lib/dispositivo/recursos', () => ({
  recursosDoAparelho: () => ({ reconhecimentoDoNavegador: estado.webSpeech }),
}))
vi.mock('../src/lib/dispositivo/perfil', () => ({
  perfilDoDispositivo: () => ({ tipo: 'desktop-sem-gpu', poucaMemoria: false, sinais: { economiaDeDados: false } }),
}))
vi.mock('../src/lib/dispositivo/telaNovaDoQuest', () => ({ noHeadset: () => false }))
vi.mock('../src/lib/consentimentoDeNuvem', () => ({ rapidoDoMicPermitido: () => estado.permitido }))
vi.mock('../src/lib/flags', () => ({ useFlag: () => estado.flag }))
vi.mock('../src/components/Toast', () => ({ toast: { warn: vi.fn(), error: vi.fn() } }))
vi.mock('../src/lib/fala/transcritorDaSombra', () => ({ prepararSombraLocal: preparar, liberarSombraLocal: vi.fn() }))
vi.mock('../src/lib/fala/ouvirFraseNoAparelho', () => ({
  ouvirUmaFrase: async () => ({
    parar: async () => ({ texto: estado.semFala ? '' : estado.texto, duracaoMs: 1500, semFala: estado.semFala }),
    cancelar: vi.fn(),
  }),
}))

beforeEach(() => {
  Object.assign(estado, { webSpeech: true, permitido: true, flag: true, semFala: false, texto: 'hello world' })
  preparar.mockClear()
  fetchEspiao.mockClear()
  vi.stubGlobal('fetch', fetchEspiao)
  localStorage.clear()
  // Microfone e gravador falsos: o ramo local grava também o áudio de "Ouvir minha gravação".
  const trilha = { stop: vi.fn() }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [trilha] }) },
  })
  class Gravador {
    state = 'inactive'
    mimeType = 'audio/webm'
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    stream = { getTracks: () => [trilha] }
    start() {
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      this.onstop?.()
    }
  }
  vi.stubGlobal('MediaRecorder', Gravador)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const montar = () => render(<SombraDaFala texto="hello world" idioma="en-US" aoOuvirOriginal={() => undefined} />)

describe('SombraDaFala: ramo do motor', () => {
  it('adulto com Web Speech: a prática de sempre (sem aviso de download)', () => {
    montar()
    expect(screen.getByText('Prática ativa de pronúncia (shadowing)')).toBeTruthy()
    expect(screen.queryByTestId('sombra-local')).toBeNull()
    expect(screen.queryByTestId('sombra-sem-reconhecimento')).toBeNull()
  })

  it('CONFORMIDADE: perfil protegido sem o responsável não usa o Web Speech (mesmo com a flag desligada)', () => {
    estado.permitido = false
    estado.flag = false
    montar()
    expect(screen.queryByText('Prática ativa de pronúncia (shadowing)')).toBeNull()
    expect(screen.getByTestId('sombra-sem-reconhecimento')).toBeTruthy()
    expect(screen.getByTestId('nota-indisponivel').textContent).toContain('autorização')
  })

  it('sem Web Speech e sem a flag: o ramo sem nota de hoje', () => {
    estado.webSpeech = false
    estado.flag = false
    montar()
    expect(screen.getByTestId('sombra-sem-reconhecimento')).toBeTruthy()
    expect(screen.getByTestId('nota-indisponivel')).toBeTruthy()
  })

  it('sem Web Speech e idioma fora do local: continua sem nota', () => {
    estado.webSpeech = false
    render(<SombraDaFala texto="olá" idioma="pt-BR" />)
    expect(screen.getByTestId('sombra-sem-reconhecimento')).toBeTruthy()
  })
})

describe('SombraDaFala: ramo local', () => {
  it('protegido com a flag: grava, para, compara e mostra a nota como palpite', async () => {
    estado.permitido = false
    montar()
    expect(screen.getByTestId('sombra-local')).toBeTruthy()
    fireEvent.click(screen.getByText('Gravar a minha voz'))
    // 3.2: sem aceitar, nenhuma requisição e nenhum modelo preparado
    expect(screen.getByTestId('sombra-local-aviso').textContent).toContain('67 MB')
    expect(preparar).not.toHaveBeenCalled()
    expect(fetchEspiao).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Baixar e continuar'))
    await waitFor(() => expect(screen.getByText('Parar')).toBeTruthy())
    expect(preparar).toHaveBeenCalledWith('local-moonshine-base', expect.any(Function))
    fireEvent.click(screen.getByText('Parar'))
    const nota = await screen.findByTestId('nota-local')
    expect(nota.textContent).toContain('100')
    expect(nota.textContent).toContain('palpite')
    // 3.3: com a nota, o texto "não está disponível" não aparece
    expect(screen.queryByTestId('nota-indisponivel')).toBeNull()
    expect(fetchEspiao).not.toHaveBeenCalled()
  })

  it('já aceitou antes: não pergunta de novo', async () => {
    estado.webSpeech = false
    localStorage.setItem('babel.sombraLocal.aceitou.local-moonshine-base', '1')
    montar()
    fireEvent.click(screen.getByText('Gravar a minha voz'))
    await waitFor(() => expect(screen.getByText('Parar')).toBeTruthy())
    expect(screen.queryByTestId('sombra-local-aviso')).toBeNull()
  })

  it('"Agora não" volta ao começo sem baixar', () => {
    estado.webSpeech = false
    montar()
    fireEvent.click(screen.getByText('Gravar a minha voz'))
    fireEvent.click(screen.getByText('Agora não'))
    expect(screen.getByText('Gravar a minha voz')).toBeTruthy()
    expect(preparar).not.toHaveBeenCalled()
  })

  it('semFala: diz que não ouviu a voz, sem inventar nota', async () => {
    estado.webSpeech = false
    estado.semFala = true
    localStorage.setItem('babel.sombraLocal.aceitou.local-moonshine-base', '1')
    montar()
    fireEvent.click(screen.getByText('Gravar a minha voz'))
    await waitFor(() => expect(screen.getByText('Parar')).toBeTruthy())
    fireEvent.click(screen.getByText('Parar'))
    expect((await screen.findByTestId('sem-fala')).textContent).toContain('Não deu para ouvir')
    expect(screen.queryByTestId('nota-local')).toBeNull()
  })
})
