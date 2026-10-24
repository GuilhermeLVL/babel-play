// @vitest-environment jsdom
/**
 * PERFIL PROTEGIDO × APARELHO | NUVEM. A nuvem só fica trancada quando o perfil é protegido SEM o
 * responsável (a regra de `perfilQueTranca`, na política de rota). Protegido COM o responsável e plano com
 * nuvem: as duas opções funcionam e o lado marcado é o real. E o protegido nunca vê oferta de plano.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ exigida: true }))
vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  get authRequired() {
    return auth.exigida
  },
  carregarSupabase: async () => null,
  getAccessToken: async () => 'token-de-teste',
}))
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
import { decidirRota } from '../src/core/rota/politicaDeRota'
import { getSttQuality } from '../src/gateway/sttRouter'
import { seloDaFala } from '../src/lib/captura/seloDaFala'
import { ladoDoProcessamento } from '../src/lib/escolhaDoProcessamento'
import { definirIdentidade } from '../src/lib/identidade'
import { definirProtecao, type EstadoDeProtecao } from '../src/lib/protecaoDoMenor'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

beforeAll(prepararDialogoNoJsdom)

const menor17: EstadoDeProtecao = {
  nascimentoInformado: true,
  faixa: '16-17',
  protegido: true,
  exigeResponsavel: false,
  exigeConsentimentoEspecifico: false,
  vinculo: { estado: 'nenhum' },
  restrita: false,
}
const semResponsavel = () => definirProtecao(menor17)
const comResponsavel = () =>
  definirProtecao({ ...menor17, vinculo: { estado: 'aceito' } as EstadoDeProtecao['vinculo'] })

beforeEach(() => {
  localStorage.clear()
  servidor.patch.mockClear()
  consentimento.nuvem = true
  auth.exigida = true
  definirIdentidade('conta')
})
afterEach(() => {
  cleanup()
  definirProtecao(null)
})

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
      selo: seloDaFala(
        decidirRota({
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
            perfilProtegido: true,
            responsavelAutorizou: false,
            nuvemDisponivel: true,
            nuvemPausada: false,
            semRede: false,
            edicaoEstatica: false,
            nuvemDoSite: false,
            preferencia: { qualidade: 'auto', microfone: 'modelo' },
          },
        }),
      ),
      qualidade: getSttQuality(),
      aoEscolherQualidade: nada,
      tipoDoAparelho: 'desktop-sem-gpu',
      /* `protegido` vem do app real (`ambienteReal`) e o responsável, da proteção: só o plano é nosso. */
      ambiente: {
        capacidades: { managedCloudStt: true, sttAoVivo: false },
        aVenda: [],
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

describe('protegido SEM o responsável', () => {
  it('a nuvem está trancada, o lado é o aparelho e escolher a nuvem não faz nada', async () => {
    semResponsavel()
    expect(ladoDoProcessamento(true)).toBe('aparelho')
    render(captura())
    const p = await abrirPainel()
    const nuvem = p.getByRole('radio', { name: /Nuvem/ })
    expect(nuvem.getAttribute('aria-disabled')).toBe('true')
    expect(p.getByRole('radio', { name: /Aparelho/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('painel-de-processamento').textContent).toContain(
      'A nuvem não está disponível neste perfil.',
    )
    fireEvent.click(nuvem)
    await act(async () => undefined)
    expect(getSttQuality()).not.toBe('cloud')
    expect(servidor.patch).not.toHaveBeenCalled()
  })
})

describe('protegido COM o responsável e plano com nuvem', () => {
  it('as duas opções funcionam e o lado marcado é o real', async () => {
    comResponsavel()
    localStorage.setItem('babel.sttQuality', 'cloud')
    expect(ladoDoProcessamento(true)).toBe('nuvem')
    render(captura())
    const p = await abrirPainel()
    expect(p.getByRole('radio', { name: /Nuvem/ }).getAttribute('aria-disabled')).toBeNull()
    expect(p.getByRole('radio', { name: /Nuvem/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('painel-de-processamento').textContent).not.toContain('não está disponível neste perfil')

    fireEvent.click(p.getByRole('radio', { name: /Aparelho/ }))
    await waitFor(() => expect(getSttQuality()).toBe('accurate'))
    expect(ladoDoProcessamento(true)).toBe('aparelho')
    await waitFor(() => expect(p.getByRole('radio', { name: /Aparelho/ }).getAttribute('aria-checked')).toBe('true'))

    fireEvent.click(p.getByRole('radio', { name: /Nuvem/ }))
    await waitFor(() => expect(getSttQuality()).toBe('cloud'))
    expect(ladoDoProcessamento(true)).toBe('nuvem')
    await waitFor(() => expect(p.getByRole('radio', { name: /Nuvem/ }).getAttribute('aria-checked')).toBe('true'))
  })
})

describe('Ajustes: o protegido não vê oferta de plano', () => {
  it('sem "Premium" e sem "plano", só a frase neutra (perfil sem nuvem no plano)', () => {
    semResponsavel()
    render(<AiEnginePanel bloqueados={['cloud-quality']} />)
    const botao = screen.getByRole('button', { name: /Usar a sua chave/ })
    expect(botao.textContent).not.toMatch(/Premium/)
    expect(botao.textContent).not.toMatch(/plano/i)
    expect(botao.textContent).toContain('A nuvem não está disponível neste perfil.')
    expect(botao.hasAttribute('disabled')).toBe(true)
  })

  it('quem não é protegido continua vendo a oferta', () => {
    auth.exigida = false
    render(<AiEnginePanel bloqueados={['cloud-quality']} />)
    const botao = screen.getByRole('button', { name: /Usar a sua chave/ })
    expect(botao.textContent).toMatch(/Premium/)
  })
})
