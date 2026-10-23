// @vitest-environment jsdom
/**
 * O SELO COMPACTO E O PAINEL DE PROCESSAMENTO DA CAPTURA (plano 2026-10-23, Task 4).
 *
 *  · o selo do topo é só o ícone (aparelho: Cpu; nuvem: Cloud), com o texto inteiro de antes no
 *    `aria-label` e no `title`;
 *  · ao toque abre o painel (computador: popover ancorado; celular: a folha de baixo): "Processamento"
 *    e onde roda, o segmentado Aparelho | Nuvem, quem transcreve e quem traduz, as cotas do mês e o
 *    rodapé (Modelos no aparelho, Uso e plano, Como isto funciona);
 *  · Esc e o clique fora fecham, e o foco volta ao selo;
 *  · o segmentado chama a MESMA função da aba Processamento dos Ajustes (`AiEnginePanel`);
 *  · perfil protegido: a nuvem tem cadeado e uma frase só, sem oferta;
 *  · sem resposta de `/api/me/uso`, o painel abre sem as cotas.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const avisos = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('../src/components/Toast', () => ({
  toast: { info: avisos.info, ok: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../src/lib/polimento/sentidos', () => ({ sentir: vi.fn(), vibrar: vi.fn() }))
const escolha = vi.hoisted(() => ({
  aparelho: vi.fn(async () => true),
  nuvem: vi.fn(async () => 'sem-chave' as 'ok' | 'sem-chave' | 'falhou'),
}))
vi.mock('../src/lib/escolhaDoProcessamento', async (orig) => {
  const real = await orig<typeof import('../src/lib/escolhaDoProcessamento')>()
  return { ...real, escolherAparelho: escolha.aparelho, escolherNuvem: escolha.nuvem }
})

import AiEnginePanel from '../src/components/AiEnginePanel'
import CapturaDoPrototipo from '../src/components/views/captura/celular/CapturaDoPrototipo'
import type { AmbienteDosNiveis, NiveisDaCaptura } from '../src/components/views/captura/niveis/useNiveisDaCaptura'
import { decidirRota, type PedidoDeRota } from '../src/core/rota/politicaDeRota'
import type { SttQuality } from '../src/gateway/sttRouter'
import { cotasDoUso, linhaDaTraducao, linhaDaTranscricao } from '../src/lib/captura/painelDoProcessamento'
import { type SeloDaFala, seloDaFala } from '../src/lib/captura/seloDaFala'
import type { UsoDoMes } from '../src/lib/uso'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

beforeAll(prepararDialogoNoJsdom)
beforeEach(() => {
  avisos.info.mockClear()
  escolha.aparelho.mockClear()
  escolha.nuvem.mockClear()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'matchMedia')
})

const pedido = (nuvem: boolean): PedidoDeRota => ({
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
    nuvemPorTrechos: nuvem,
    precisaoPorPadrao: nuvem,
    nuvemAoVivo: false,
    traducaoNaNuvem: nuvem,
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
})
const NO_APARELHO = decidirRota(pedido(false))
const NA_NUVEM = decidirRota(pedido(true))

const usoDe = (usado: number, teto: number, alivio?: UsoDoMes['alivio']): UsoDoMes => ({
  plano: 'premium',
  janela: '2026-10',
  chamadas: { usado: 0, teto: 0 },
  segundosDeAudio: { usado, teto },
  porNivel: {
    trechos: { usado, teto, restante: Math.max(0, teto - usado) },
    aovivo: { usado: 0, teto: 0, restante: 0 },
  },
  tokensDeLlm: { usado: 0, teto: 0 },
  alivio,
})

const GRATIS = { managedCloudStt: false, sttAoVivo: false }
const COM_NUVEM = { managedCloudStt: true, sttAoVivo: false }
const nada = () => undefined
type Props = React.ComponentProps<typeof CapturaDoPrototipo>

function niveisDe(o: {
  selo?: SeloDaFala | null
  qualidade?: SttQuality
  ambiente?: Partial<AmbienteDosNiveis>
  aoEscolherQualidade?: (q: SttQuality) => void
  aoVerPlanos?: NiveisDaCaptura['aoVerPlanos']
  aoVerModelosNoAparelho?: () => void
}): NiveisDaCaptura {
  return {
    selo: o.selo === undefined ? seloDaFala(NO_APARELHO) : o.selo,
    qualidade: o.qualidade ?? 'auto',
    aoEscolherQualidade: o.aoEscolherQualidade ?? nada,
    tipoDoAparelho: 'desktop-sem-gpu',
    aoVerPlanos: 'aoVerPlanos' in o ? o.aoVerPlanos : nada,
    processamento: {
      transcricao: { nome: 'Equilibrado', onde: 'aparelho' },
      traducao: { nome: 'Bergamot', onde: 'aparelho' },
      aoVerModelosNoAparelho: o.aoVerModelosNoAparelho ?? nada,
    },
    ambiente: {
      capacidades: GRATIS,
      protegido: false,
      semPlanos: false,
      aVenda: ['essencial', 'premium'],
      consentiuNuvem: true,
      carregarUso: async () => null,
      ...o.ambiente,
    },
  }
}

const base: Props = {
  gravando: false,
  temFalas: false,
  abrindo: false,
  tempo: '00:00',
  par: 'Inglês → Português (BR)',
  parCurto: 'EN → PT',
  modelo: 'Modelo local · 589 MB',
  micLigado: true,
  micAbrindo: false,
  aoAlternarMic: nada,
  podeIniciar: true,
  aoIniciar: nada,
  aoParar: nada,
  aoAbrirIdiomas: nada,
  aoAbrirModelo: nada,
  aoAbrirAjustes: nada,
  aoAbrirAjuda: nada,
  aoFlutuante: nada,
  letra: { menor: nada, maior: nada, noMinimo: false, noMaximo: false },
  legenda: <div data-testid="legenda" />,
  niveis: niveisDe({}),
}

const selo = () => screen.getByTestId('chip-de-estado')
const painel = () => within(screen.getByTestId('painel-de-processamento'))
const abrir = async () => {
  fireEvent.click(selo())
  /* As cotas chegam numa promessa: espera o painel assentar. */
  await act(async () => undefined)
  return painel()
}
const noCelular = () => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('max-width: 720px'),
    addEventListener: nada,
    removeEventListener: nada,
  })) as unknown as typeof window.matchMedia
}

describe('o selo compacto', () => {
  it('é só o ícone, com o texto inteiro de antes no aria-label e no title', () => {
    render(<CapturaDoPrototipo {...base} />)
    expect(selo().textContent).toBe('')
    expect(selo().querySelector('svg')).toBeTruthy()
    expect(selo().getAttribute('aria-haspopup')).toBe('dialog')
    expect(selo().getAttribute('aria-expanded')).toBe('false')
    expect(selo().getAttribute('aria-label')).toBe(
      'Vai rodar no aparelho · seu áudio não vai sair daqui. Abrir o painel de processamento',
    )
    expect(selo().getAttribute('title')).toBe('Vai rodar no aparelho · seu áudio não vai sair daqui')
  })

  it('o ícone diz onde: Cpu no aparelho, nuvem na nuvem', () => {
    const { rerender } = render(<CapturaDoPrototipo {...base} />)
    expect(selo().querySelector('svg')?.getAttribute('class')).toMatch(/lucide-cpu/)
    rerender(
      <CapturaDoPrototipo
        {...base}
        temFalas
        niveis={niveisDe({ selo: seloDaFala(NA_NUVEM, 'groq-whisper'), ambiente: { capacidades: COM_NUVEM } })}
      />,
    )
    expect(selo().querySelector('svg')?.getAttribute('class')).toMatch(/lucide-cloud/)
    expect(selo().getAttribute('aria-label')).toMatch(/^Nuvem do Frasy · o áudio vai para o nosso servidor\./)
  })

  it('gravando, o aria-label diz o que está acontecendo, como a pílula dizia', () => {
    render(
      <CapturaDoPrototipo
        {...base}
        gravando
        temFalas
        niveis={niveisDe({ selo: seloDaFala(NO_APARELHO, 'whisper-local') })}
      />,
    )
    expect(selo().getAttribute('title')).toBe('Legendando · no aparelho · inglês → português (BR)')
  })

  it('o medidor da nuvem saiu do topo', () => {
    render(<CapturaDoPrototipo {...base} niveis={niveisDe({ ambiente: { capacidades: COM_NUVEM } })} />)
    expect(screen.queryByTestId('medidor-de-nuvem')).toBeNull()
  })
})

describe('abrir e fechar (computador: popover)', () => {
  it('abre pelo clique, com o cabeçalho, o segmentado, as linhas e o rodapé', async () => {
    render(<CapturaDoPrototipo {...base} />)
    const p = await abrir()
    expect(screen.getByRole('dialog', { name: 'Processamento' })).toBeTruthy()
    expect(selo().getAttribute('aria-expanded')).toBe('true')
    expect(p.getByText('no aparelho', { selector: '.pp-onde' })).toBeTruthy()
    const seg = p.getByRole('radiogroup', { name: 'Onde a fala é processada' })
    expect(
      within(seg)
        .getByRole('radio', { name: /Aparelho/ })
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(within(seg).getByRole('radio', { name: /Nuvem/ }).getAttribute('aria-checked')).toBe('false')
    expect(p.getByRole('button', { name: /Transcrição.*Equilibrado · no aparelho/ })).toBeTruthy()
    expect(p.getByRole('button', { name: /Tradução.*Bergamot · no aparelho/ })).toBeTruthy()
    expect(p.getByRole('button', { name: 'Modelos no aparelho' })).toBeTruthy()
    expect(p.getByRole('button', { name: 'Uso e plano' })).toBeTruthy()
    expect(p.getByRole('button', { name: 'Como isto funciona' })).toBeTruthy()
  })

  it('o segundo clique no selo fecha', async () => {
    render(<CapturaDoPrototipo {...base} />)
    await abrir()
    fireEvent.click(selo())
    expect(screen.queryByTestId('painel-de-processamento')).toBeNull()
  })

  it('Esc fecha e o foco volta ao selo', async () => {
    render(<CapturaDoPrototipo {...base} />)
    const p = await abrir()
    p.getByRole('button', { name: 'Uso e plano' }).focus()
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(screen.queryByTestId('painel-de-processamento')).toBeNull()
    expect(document.activeElement).toBe(selo())
  })

  it('o clique fora fecha e o foco volta ao selo', async () => {
    render(<CapturaDoPrototipo {...base} />)
    await abrir()
    fireEvent.pointerDown(screen.getByText('Pronto para legendar'))
    expect(screen.queryByTestId('painel-de-processamento')).toBeNull()
    expect(document.activeElement).toBe(selo())
  })

  it('o clique dentro não fecha', async () => {
    render(<CapturaDoPrototipo {...base} />)
    const p = await abrir()
    fireEvent.pointerDown(p.getByText('Processamento'))
    expect(screen.getByTestId('painel-de-processamento')).toBeTruthy()
  })
})

describe('no celular, a folha de baixo', () => {
  it('o painel abre numa folha (um <dialog> modal) e não como popover', async () => {
    noCelular()
    render(<CapturaDoPrototipo {...base} />)
    await abrir()
    const folha = screen.getByTestId('painel-de-processamento').closest('dialog')
    expect(folha?.className).toMatch(/folha-de-baixo/)
    expect(folha?.open).toBe(true)
  })
})

describe('o segmentado Aparelho | Nuvem', () => {
  it('Nuvem chama a mesma função dos Ajustes e grava a preferência de nuvem', async () => {
    const gravar = vi.fn()
    render(
      <CapturaDoPrototipo
        {...base}
        niveis={niveisDe({ ambiente: { capacidades: COM_NUVEM }, aoEscolherQualidade: gravar })}
      />,
    )
    const p = await abrir()
    fireEvent.click(p.getByRole('radio', { name: /Nuvem/ }))
    await waitFor(() => expect(escolha.nuvem).toHaveBeenCalledTimes(1))
    expect(gravar).toHaveBeenCalledWith('cloud')
  })

  it('Aparelho chama a mesma função dos Ajustes e grava o modelo local', async () => {
    const gravar = vi.fn()
    render(
      <CapturaDoPrototipo
        {...base}
        temFalas
        niveis={niveisDe({
          selo: seloDaFala(NA_NUVEM, 'groq-whisper'),
          qualidade: 'cloud',
          ambiente: { capacidades: COM_NUVEM },
          aoEscolherQualidade: gravar,
        })}
      />,
    )
    const p = await abrir()
    fireEvent.click(p.getByRole('radio', { name: /Aparelho/ }))
    await waitFor(() => expect(escolha.aparelho).toHaveBeenCalledTimes(1))
    expect(gravar).toHaveBeenCalledWith('accurate')
  })

  it('a aba Processamento dos Ajustes chama as MESMAS funções', async () => {
    localStorage.setItem('babel.activeProfileId', 'cloud-quality')
    const { unmount } = render(<AiEnginePanel />)
    fireEvent.click(screen.getByRole('button', { name: /Rodar no seu aparelho/ }))
    await waitFor(() => expect(escolha.aparelho).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /Usar a sua chave/ }))
    await waitFor(() => expect(escolha.nuvem).toHaveBeenCalledTimes(1))
    unmount()
  })

  it('no Grátis a Nuvem tem cadeado e uma frase que diz o que continua funcionando', async () => {
    render(<CapturaDoPrototipo {...base} />)
    const p = await abrir()
    const nuvem = p.getByRole('radio', { name: /Nuvem/ })
    expect(nuvem.getAttribute('aria-disabled')).toBe('true')
    expect(nuvem.querySelector('.lucide-lock')).toBeTruthy()
    expect(p.getByText('O seu plano não tem horas de nuvem: a legenda roda no aparelho, sem limite.')).toBeTruthy()
    fireEvent.click(nuvem)
    expect(escolha.nuvem).not.toHaveBeenCalled()
  })

  it('perfil protegido: cadeado, só "A nuvem não está disponível neste perfil.", e nada de planos', async () => {
    render(
      <CapturaDoPrototipo
        {...base}
        niveis={niveisDe({ ambiente: { protegido: true, capacidades: COM_NUVEM }, aoVerPlanos: undefined })}
      />,
    )
    const p = await abrir()
    const nuvem = p.getByRole('radio', { name: /Nuvem/ })
    expect(nuvem.getAttribute('aria-disabled')).toBe('true')
    expect(p.getByText('A nuvem não está disponível neste perfil.')).toBeTruthy()
    const texto = screen.getByTestId('painel-de-processamento').textContent ?? ''
    expect(texto).not.toMatch(/plano|assin|premium|essencial|R\$/i)
    expect(p.queryByRole('button', { name: 'Uso e plano' })).toBeNull()
  })
})

describe('as cotas', () => {
  it('com teto: "Nuvem neste mês" com percentual e barra', async () => {
    const carregarUso = vi.fn(async () => usoDe(18000, 72000))
    render(<CapturaDoPrototipo {...base} niveis={niveisDe({ ambiente: { capacidades: COM_NUVEM, carregarUso } })} />)
    const p = await abrir()
    const linha = await p.findByTestId('cota-nuvem')
    expect(within(linha).getByText('Nuvem neste mês')).toBeTruthy()
    expect(within(linha).getByText('25%')).toBeTruthy()
    expect(within(linha).getByText('5 h de 20 h')).toBeTruthy()
    expect(within(linha).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25')
  })

  it('a reserva para aparelho fraco (franquia de alívio do Grátis)', async () => {
    const carregarUso = vi.fn(async () => ({
      ...usoDe(0, 0),
      alivio: {
        disponivel: true,
        motivo: null,
        restanteSegundos: 1200,
        segundosDeAudio: { usado: 600, teto: 1800 },
        tokensDeLlm: { usado: 0, teto: 0 },
      },
    }))
    render(<CapturaDoPrototipo {...base} niveis={niveisDe({ ambiente: { carregarUso } })} />)
    const p = await abrir()
    const linha = await p.findByTestId('cota-alivio')
    expect(within(linha).getByText('Reserva para aparelho fraco')).toBeTruthy()
    expect(within(linha).getByText('33%')).toBeTruthy()
    expect(p.queryByTestId('cota-nuvem')).toBeNull()
  })

  it('sem resposta do servidor (sem rede): o painel abre sem a seção de cotas e sem erro', async () => {
    const carregarUso = vi.fn(async () => null)
    render(<CapturaDoPrototipo {...base} niveis={niveisDe({ ambiente: { capacidades: COM_NUVEM, carregarUso } })} />)
    const p = await abrir()
    await waitFor(() => expect(carregarUso).toHaveBeenCalled())
    expect(p.queryByTestId('cotas-do-painel')).toBeNull()
    expect(p.getByRole('radiogroup', { name: 'Onde a fala é processada' })).toBeTruthy()
  })
})

describe('os destinos', () => {
  it('Transcrição e Tradução abrem o diálogo do modelo', async () => {
    const aoAbrirModelo = vi.fn()
    render(<CapturaDoPrototipo {...base} aoAbrirModelo={aoAbrirModelo} />)
    fireEvent.click((await abrir()).getByRole('button', { name: /Transcrição/ }))
    expect(aoAbrirModelo).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('painel-de-processamento')).toBeNull()
    fireEvent.click((await abrir()).getByRole('button', { name: /Tradução/ }))
    expect(aoAbrirModelo).toHaveBeenCalledTimes(2)
  })

  it('"Modelos no aparelho" leva a Ajustes → Processamento; "Uso e plano", aos Planos', async () => {
    const aoVerModelosNoAparelho = vi.fn()
    const aoVerPlanos = vi.fn()
    render(<CapturaDoPrototipo {...base} niveis={niveisDe({ aoVerModelosNoAparelho, aoVerPlanos })} />)
    fireEvent.click((await abrir()).getByRole('button', { name: 'Modelos no aparelho' }))
    expect(aoVerModelosNoAparelho).toHaveBeenCalledTimes(1)
    fireEvent.click((await abrir()).getByRole('button', { name: 'Uso e plano' }))
    expect(aoVerPlanos).toHaveBeenCalledWith(null)
  })

  it('"Como isto funciona" abre a folha de sempre', async () => {
    render(<CapturaDoPrototipo {...base} />)
    fireEvent.click((await abrir()).getByRole('button', { name: 'Como isto funciona' }))
    expect(screen.queryByTestId('painel-de-processamento')).toBeNull()
    expect(screen.getByTestId('como-isto-funciona')).toBeTruthy()
  })
})

describe('o que o painel diz (puro)', () => {
  it('a transcrição pelo nome do catálogo, a nuvem e o navegador pelo nome deles', () => {
    expect(linhaDaTranscricao({ selo: seloDaFala(NO_APARELHO), idDoModelo: 'onnx-community/whisper-base' })).toEqual({
      nome: 'Equilibrado',
      onde: 'aparelho',
    })
    expect(linhaDaTranscricao({ selo: seloDaFala(NO_APARELHO), idDoModelo: 'parakeet-tdt-0.6b-v3' }).nome).toBe(
      'Preciso',
    )
    expect(
      linhaDaTranscricao({ selo: seloDaFala(NA_NUVEM, 'groq-whisper'), idDoModelo: 'onnx-community/whisper-base' }),
    ).toEqual({
      nome: 'Nuvem do Frasy',
      onde: 'nuvem',
    })
    expect(linhaDaTranscricao({ selo: seloDaFala(NO_APARELHO), noNavegador: true }).nome).toBe(
      'Reconhecimento do navegador',
    )
    expect(linhaDaTranscricao({ selo: null, idDoModelo: 'desconhecido' }).nome).toBe('Modelo local')
  })

  it('a tradução: o tradutor do navegador antes; depois o Bergamot ou o opus-mt', () => {
    expect(linhaDaTraducao({ nativo: true, ids: ['bergamot/es-en'] })?.nome).toBe('Tradutor do navegador')
    expect(linhaDaTraducao({ nativo: false, ids: ['bergamot/es-en'] })?.nome).toBe('Bergamot')
    expect(linhaDaTraducao({ nativo: false, ids: ['Xenova/opus-mt-en-ROMANCE'] })?.nome).toBe('opus-mt')
    expect(linhaDaTraducao({ nativo: false, ids: [] })).toBeNull()
  })

  it('cotas: só com teto, e a reserva some quando depende do responsável', () => {
    expect(cotasDoUso(null)).toEqual([])
    expect(cotasDoUso(usoDe(0, 0))).toEqual([])
    const alivio = (motivo: string | null) => ({
      disponivel: motivo === null,
      motivo,
      restanteSegundos: 0,
      segundosDeAudio: { usado: 0, teto: 1800 },
      tokensDeLlm: { usado: 0, teto: 0 },
    })
    expect(cotasDoUso(usoDe(0, 0, alivio(null))).map((c) => c.qual)).toEqual(['alivio'])
    expect(cotasDoUso(usoDe(0, 0, alivio('alivio_exige_responsavel')))).toEqual([])
    expect(cotasDoUso(usoDe(0, 0, alivio('alivio_desligado')))).toEqual([])
    expect(cotasDoUso(usoDe(72000, 72000))[0]).toMatchObject({ qual: 'nuvem', pct: 100, acabou: true })
  })
})
