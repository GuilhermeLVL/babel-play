// @vitest-environment jsdom
/**
 * APARELHO × NUVEM NUM LUGAR SÓ (Task 4, correção 1 — privacidade). Os Ajustes (`AiEnginePanel`) e o
 * painel de processamento da Captura chamam a MESMA escolha (`escolherProcessamento`) e leem o MESMO
 * lado. "Aparelho" garante o aparelho: a rota da próxima captura é local e a fala não tem consentimento
 * de nuvem, mesmo com o plano tendo nuvem e o consentimento dado em Privacidade.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/components/Toast', () => ({ toast: { info: vi.fn(), ok: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../src/lib/polimento/sentidos', () => ({ sentir: vi.fn(), vibrar: vi.fn() }))
const servidor = vi.hoisted(() => ({ patch: vi.fn(async (_p: Record<string, unknown>) => ({ ui: '{}' })) }))
vi.mock('../src/data/api', async (orig) => {
  const real = await orig<typeof import('../src/data/api')>()
  return { ...real, patchUiSettings: servidor.patch, fetchSettings: async () => ({ ui: '{}' }) }
})
const consentimento = vi.hoisted(() => ({ nuvem: true }))
vi.mock('../src/lib/consentimentoDeNuvem', async (orig) => {
  const real = await orig<typeof import('../src/lib/consentimentoDeNuvem')>()
  return { ...real, consentiuNuvem: () => consentimento.nuvem }
})

import AiEnginePanel from '../src/components/AiEnginePanel'
import CapturaDoPrototipo from '../src/components/views/captura/celular/CapturaDoPrototipo'
import { decidirRota, type PedidoDeRota } from '../src/core/rota/politicaDeRota'
import { getActiveProfile, getProviderMode } from '../src/gateway/activeProfile'
import { getSttQuality, routeStt } from '../src/gateway/sttRouter'
import { seloDaFala } from '../src/lib/captura/seloDaFala'
import {
  consentiuNuvemNaFala,
  escolherProcessamento,
  ladoDoProcessamento,
  soNoAparelho,
} from '../src/lib/escolhaDoProcessamento'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

beforeAll(prepararDialogoNoJsdom)
beforeEach(() => {
  localStorage.clear()
  servidor.patch.mockClear()
  consentimento.nuvem = true
})
afterEach(cleanup)

/** A rota que a PRÓXIMA captura toma, com a nuvem do plano respondendo. */
const rotaDaProxima = () =>
  routeStt({
    contentLang: 'pt',
    autoDetect: false,
    quality: getSttQuality(),
    hasWebGpu: false,
    cloudAvailable: true,
    profileId: getActiveProfile().id,
  })

const pedido: PedidoDeRota = {
  tarefa: 'stt-final',
  fonte: 'sistema',
  idioma: 'pt',
  aparelho: {
    tipo: 'desktop-sem-gpu',
    leve: false,
    travando: false,
    gpuProvada: false,
    economiaDeDados: false,
    smallNaGpu: false,
    whisperNaGpu: false,
    shaderF16: false,
    navegador: { fala: false, falaNoAparelho: null, bipaAoReligar: false, tradutor: false },
    modelos: { opusMt: true, bergamot: false, llmLocal: false },
  },
  plano: {
    nuvemPorTrechos: false,
    precisaoPorPadrao: false,
    nuvemAoVivo: false,
    traducaoNaNuvem: false,
    nuance: false,
    vozNeural: false,
    restante: { trechosNoMesS: null, trechosNoDiaS: null, aoVivoNoMesS: null, aoVivoNoDiaS: null },
  },
  estado: {
    consentimentos: { nuvem: true, navegador: false },
    perfilPrivado: false,
    perfilProtegido: false,
    responsavelAutorizou: false,
    nuvemDisponivel: true,
    nuvemPausada: false,
    semRede: false,
    edicaoEstatica: false,
    nuvemDoSite: false,
    preferencia: { qualidade: 'auto', microfone: 'modelo' },
  },
}

const nada = () => undefined
const captura = () => (
  <CapturaDoPrototipo
    gravando={false}
    temFalas={false}
    abrindo={false}
    tempo="00:00"
    par="Inglês → Português (BR)"
    parCurto="EN → PT"
    modelo="Modelo local"
    micLigado
    micAbrindo={false}
    aoAlternarMic={nada}
    podeIniciar
    aoIniciar={nada}
    aoParar={nada}
    aoAbrirIdiomas={nada}
    aoAbrirModelo={nada}
    aoAbrirAjustes={nada}
    aoAbrirAjuda={nada}
    letra={{ menor: nada, maior: nada, noMinimo: false, noMaximo: false }}
    legenda={<div />}
    niveis={{
      selo: seloDaFala(decidirRota(pedido)),
      qualidade: getSttQuality(),
      aoEscolherQualidade: nada,
      tipoDoAparelho: 'desktop-sem-gpu',
      ambiente: {
        capacidades: { managedCloudStt: true, sttAoVivo: false },
        protegido: false,
        semPlanos: false,
        aVenda: [],
        consentiuNuvem: true,
        carregarUso: async () => null,
      },
    }}
  />
)
const abrirPainel = async () => {
  fireEvent.click(screen.getByTestId('chip-de-estado'))
  await act(async () => undefined)
  return within(screen.getByTestId('painel-de-processamento'))
}

describe('Aparelho nos Ajustes', () => {
  it('a próxima captura é local, a fala fica sem nuvem, e o painel da Captura marca Aparelho', async () => {
    localStorage.setItem('babel.sttQuality', 'cloud')
    localStorage.setItem('babel.providerMode', 'cloud')
    localStorage.setItem('babel.activeProfileId', 'cloud-quality')
    localStorage.setItem('babel.credentialId', 'chave-1')
    expect(rotaDaProxima().preferCloud).toBe(true)
    expect(ladoDoProcessamento(true)).toBe('nuvem')

    render(<AiEnginePanel />)
    fireEvent.click(screen.getByRole('button', { name: /Rodar no seu aparelho/ }))
    await waitFor(() => expect(servidor.patch).toHaveBeenCalled())

    expect(getProviderMode()).toBe('local')
    expect(getSttQuality()).toBe('accurate')
    expect(rotaDaProxima().preferCloud).toBe(false)
    expect(soNoAparelho()).toBe(true)
    /* O consentimento de Privacidade continua dado; a fala da Captura não o usa. */
    expect(consentiuNuvemNaFala()).toBe(false)
    expect(servidor.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({ providerMode: 'local', sttQuality: 'accurate', credencialDaNuvem: 'chave-1' }),
    )
    expect(screen.getByRole('button', { name: /Rodar no seu aparelho/ }).getAttribute('aria-pressed')).toBe('true')
    cleanup()

    render(captura())
    const p = await abrirPainel()
    expect(p.getByRole('radio', { name: /Aparelho/ }).getAttribute('aria-checked')).toBe('true')
    expect(p.getByRole('radio', { name: /Nuvem/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('quem já tinha o modelo rápido fica com ele', async () => {
    localStorage.setItem('babel.sttQuality', 'fast')
    await escolherProcessamento('aparelho')
    expect(getSttQuality()).toBe('fast')
  })
})

describe('Nuvem na Captura', () => {
  it('a próxima captura vai à nuvem e os Ajustes marcam a nuvem', async () => {
    localStorage.setItem('babel.sttQuality', 'accurate')
    expect(rotaDaProxima().preferCloud).toBe(false)
    expect(ladoDoProcessamento(true)).toBe('aparelho')

    render(captura())
    const p = await abrirPainel()
    fireEvent.click(p.getByRole('radio', { name: /Nuvem/ }))
    await waitFor(() => expect(getSttQuality()).toBe('cloud'))
    await waitFor(() => expect(servidor.patch).toHaveBeenCalledWith(expect.objectContaining({ sttQuality: 'cloud' })))

    expect(rotaDaProxima().preferCloud).toBe(true)
    expect(soNoAparelho()).toBe(false)
    expect(consentiuNuvemNaFala()).toBe(true)
    /* Sem chave própria, o modo continua local: a nuvem é a do plano. */
    expect(getProviderMode()).toBe('local')
    expect(p.getByRole('radio', { name: /Nuvem/ }).getAttribute('aria-checked')).toBe('true')
    cleanup()

    render(<AiEnginePanel />)
    expect(screen.getByRole('button', { name: /Usar a sua chave/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Rodar no seu aparelho/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('com a chave lembrada, a nuvem usa a chave (o mesmo efeito dos Ajustes)', async () => {
    localStorage.setItem('babel.credentialId', 'chave-2')
    const r = await escolherProcessamento('nuvem')
    expect(r.semChave).toBe(false)
    expect(getProviderMode()).toBe('cloud')
    expect(getActiveProfile().id).toBe('cloud-quality')
  })
})

describe('o lado marcado', () => {
  it('sem nuvem no plano é sempre o aparelho; no automático, a nuvem só com o consentimento', () => {
    expect(ladoDoProcessamento(false)).toBe('aparelho')
    expect(ladoDoProcessamento(true)).toBe('nuvem')
    consentimento.nuvem = false
    expect(ladoDoProcessamento(true)).toBe('aparelho')
  })
})
