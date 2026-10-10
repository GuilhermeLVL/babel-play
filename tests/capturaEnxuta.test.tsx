// @vitest-environment jsdom
/**
 * CAPTURAR NA TELA ENXUTA (protótipo `telas-enxutas`, `enxuto.js:39-205`): no computador e no celular,
 * uma fileira em cima — o idioma, UM chip de estado, o microfone e os ajustes — e a faixa de baixo com o
 * tempo, Iniciar e as Legendas flutuantes.
 *
 *  · o chip de estado junta o chip do modelo, a marca e o seletor de nível, e o TEXTO segue o selo da
 *    fala (a regra de ouro: nunca "no aparelho" se o áudio saiu);
 *  · tocar nele abre "Como isto funciona", que passa a ter a escolha do nível, a linha do modelo (abre o
 *    painel do modelo), as horas de nuvem e a "Ajuda da captura";
 *  · A− e A+ só quando há texto na tela; o atalho de idioma repetido sai;
 *  · gravando, o Pausar ao lado do Encerrar;
 *  · no headset a tela fica como era.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const avisos = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('../src/components/Toast', () => ({
  toast: { info: avisos.info, ok: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('../src/lib/polimento/sentidos', () => ({ sentir: vi.fn(), vibrar: vi.fn() }))
const aparelho = vi.hoisted(() => ({ tipo: 'desktop-com-gpu' as 'quest' | 'desktop-com-gpu' }))
vi.mock('../src/lib/dispositivo/perfil', async (orig) => {
  const real = await orig<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }) }
})

import CapturaDoPrototipo from '../src/components/views/captura/celular/CapturaDoPrototipo'
import type { AmbienteDosNiveis, NiveisDaCaptura } from '../src/components/views/captura/niveis/useNiveisDaCaptura'
import type { PlanoPago } from '../src/core/planos'
import { decidirRota, type PedidoDeRota } from '../src/core/rota/politicaDeRota'
import type { SttQuality } from '../src/gateway/sttRouter'
import { estadoDoChip } from '../src/lib/captura/estadoDaCaptura'
import type { Medidor } from '../src/lib/captura/nivelDeServico'
import { type SeloDaFala, seloDaFala } from '../src/lib/captura/seloDaFala'
import type { UsoDoMes } from '../src/lib/uso'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

interface Gravada {
  quem: string
  d: number
  atraso: number
}
let animacoes: Gravada[] = []
const animarDeVerdade = Element.prototype.animate

beforeAll(prepararDialogoNoJsdom)
beforeEach(() => {
  avisos.info.mockClear()
  aparelho.tipo = 'desktop-com-gpu'
  localStorage.clear()
  animacoes = []
})
afterEach(() => {
  cleanup()
  Element.prototype.animate = animarDeVerdade
  delete document.documentElement.dataset.px
  document.body.className = ''
})

/** Liga a camada de movimento e grava cada animação (como `tests/polimentoCaptura.test.tsx`). */
function gravarAnimacoes() {
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
  Element.prototype.animate = function (this: Element, _q: Keyframe[], o: KeyframeAnimationOptions) {
    animacoes.push({
      quem: `${this.tagName.toLowerCase()}.${String(this.getAttribute('class') ?? '')}`,
      d: Number(o.duration),
      atraso: Number(o.delay),
    })
    return { finished: Promise.resolve(), cancel: () => undefined } as unknown as Animation
  } as unknown as typeof Element.prototype.animate
}

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
const PREVISTO_NO_APARELHO = decidirRota(pedido(false))
const PREVISTO_NA_NUVEM = decidirRota(pedido(true))

const usoDe = (usado: number, teto: number): UsoDoMes => ({
  plano: 'premium',
  janela: '2026-10',
  chamadas: { usado: 0, teto: 0 },
  segundosDeAudio: { usado, teto },
  porNivel: {
    trechos: { usado, teto, restante: Math.max(0, teto - usado) },
    aovivo: { usado: 0, teto: 0, restante: 0 },
  },
  tokensDeLlm: { usado: 0, teto: 0 },
})

const GRATIS = { managedCloudStt: false, sttAoVivo: false }
const COM_NUVEM = { managedCloudStt: true, sttAoVivo: false }
const TODOS_A_VENDA: PlanoPago[] = ['essencial', 'premium', 'aovivo']

const nada = () => undefined
type Props = React.ComponentProps<typeof CapturaDoPrototipo>

function niveisDe(o: {
  selo?: SeloDaFala | null
  qualidade?: SttQuality
  ambiente?: Partial<AmbienteDosNiveis>
  aoEscolherQualidade?: (q: SttQuality) => void
}): NiveisDaCaptura {
  return {
    selo: o.selo === undefined ? seloDaFala(PREVISTO_NO_APARELHO) : o.selo,
    qualidade: o.qualidade ?? 'auto',
    aoEscolherQualidade: o.aoEscolherQualidade ?? nada,
    tipoDoAparelho: 'desktop-sem-gpu',
    aoVerPlanos: nada,
    ambiente: {
      capacidades: GRATIS,
      protegido: false,
      semPlanos: false,
      aVenda: TODOS_A_VENDA,
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

const chip = () => screen.getByTestId('chip-de-estado')
const faixa = (v: Element) => [...v.querySelectorAll('.q-faixa > *')].map((x) => x.textContent?.trim())
const abrirFolha = () => {
  fireEvent.click(chip())
  return within(screen.getByTestId('como-isto-funciona'))
}

describe('a captura enxuta, pronta (enxuto.js:67-84)', () => {
  it('uma fileira em cima: idioma, chip de estado, microfone e ajustes; nada de modelo, marca, ajuda ou seletor', () => {
    const { container } = render(<CapturaDoPrototipo {...base} />)
    const v = container.firstElementChild as HTMLElement
    expect([...v.querySelectorAll('.px-vivo-topo > *')].map((x) => x.className)).toEqual([
      'q-chip',
      'q-chip ex-estado',
      'q-espaco',
      'q-ctl',
      'q-ctl',
    ])
    expect(v.querySelector('.px-vivo-topo > .q-chip')?.getAttribute('data-px-vivo')).toBe('capturar:Detectar')
    expect(v.querySelector('.pl-linha')).toBeNull()
    expect(v.querySelector('.pl-onde')).toBeNull()
    expect(v.querySelector('.pl-niveis')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ajuda' })).toBeNull()
    expect(screen.queryByText('Modelo local · 589 MB')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Microfone ativo' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ajustes da captura' })).toBeTruthy()
  })

  it('a faixa de baixo tem o tempo, Iniciar e as Legendas flutuantes; A−, A+ e o atalho de idioma saem', () => {
    const { container } = render(<CapturaDoPrototipo {...base} />)
    expect(faixa(container)).toEqual(['00:00', 'Iniciar captura', 'Legendas flutuantes', ''])
    expect(screen.queryByRole('button', { name: 'Diminuir a letra' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Aumentar a letra' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Idiomas da sessão' })).toBeNull()
    expect(screen.queryByTestId('pausar-captura')).toBeNull()
  })

  it('A− e A+ aparecem quando há texto na tela (parada com falas, ou gravando) e mexem na letra', () => {
    const menor = vi.fn()
    const maior = vi.fn()
    const letra = { menor, maior, noMinimo: false, noMaximo: false }
    const { container } = render(<CapturaDoPrototipo {...base} temFalas letra={letra} />)
    expect(faixa(container)).toEqual(['00:00', 'Iniciar captura', 'Legendas flutuantes', '', 'A−', 'A+'])
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir a letra' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar a letra' }))
    expect([menor.mock.calls.length, maior.mock.calls.length]).toEqual([1, 1])
    expect(screen.queryByRole('button', { name: 'Idiomas da sessão' })).toBeNull()
  })

  it('o idioma continua a um toque, no chip de cima', () => {
    const aoAbrirIdiomas = vi.fn()
    render(<CapturaDoPrototipo {...base} aoAbrirIdiomas={aoAbrirIdiomas} />)
    fireEvent.click(screen.getByRole('button', { name: /Inglês → Português/ }))
    expect(aoAbrirIdiomas).toHaveBeenCalledTimes(1)
  })

  it('entra no tempo do protótipo: o chip de estado a 180 ms e o resto da fileira onde estava', () => {
    gravarAnimacoes()
    render(<CapturaDoPrototipo {...base} />)
    const cascata = animacoes.filter((a) => a.d === 480)
    /* idioma 120; [o chip do modelo, escondido no protótipo, 180]; espaço 240; microfone 300; ajustes 360;
       [a ajuda, escondida, 420]; título 480; texto 540. E o chip de estado, com a entrada dele. */
    expect(cascata.filter((a) => !a.quem.includes('ex-estado')).map((a) => a.atraso)).toEqual([
      120, 240, 300, 360, 480, 540,
    ])
    expect(cascata.filter((a) => a.quem.includes('ex-estado')).map((a) => a.atraso)).toEqual([180])
  })
})

describe('o chip de estado segue o selo da fala (enxuto.js:49-65)', () => {
  it('antes da primeira fala diz o que VAI acontecer; o motivo vai na dica', () => {
    render(<CapturaDoPrototipo {...base} />)
    expect(chip().querySelector('.ex-estado-txt')?.textContent).toBe(
      'Vai rodar no aparelho · seu áudio não vai sair daqui',
    )
    expect(chip().querySelector('.ex-estado-txt b')?.textContent).toBe('Vai rodar no aparelho')
    expect(chip().dataset.tom).toBe('')
    expect(chip().getAttribute('aria-haspopup')).toBe('dialog')
    expect(chip().getAttribute('aria-label')).toBe(
      'Vai rodar no aparelho, seu áudio não vai sair daqui. Abrir o nível, o modelo e as horas de nuvem',
    )
    expect(chip().getAttribute('title')).toBeTruthy()
  })

  it('TROCA quando o motor da última fala muda, e nunca diz "no aparelho" se o áudio saiu', () => {
    const com = (selo: SeloDaFala | null) => (
      <CapturaDoPrototipo {...base} temFalas niveis={niveisDe({ selo, ambiente: { capacidades: COM_NUVEM } })} />
    )
    const { rerender } = render(com(seloDaFala(PREVISTO_NA_NUVEM, 'groq-whisper')))
    expect(chip().textContent).toBe('Nuvem do Babel · o áudio vai para o nosso servidor')
    expect(chip().dataset.tom).toBe('nuvem')
    rerender(com(seloDaFala(PREVISTO_NA_NUVEM, 'whisper-local')))
    expect(chip().textContent).toBe('No aparelho · transcrita aqui, depois de tentar a nuvem')
    expect(chip().dataset.tom).toBe('alerta')
    /* Previsto o aparelho, atendeu a nuvem: o chip diz a nuvem. */
    rerender(com(seloDaFala(PREVISTO_NO_APARELHO, 'groq-whisper')))
    expect(chip().textContent).toContain('Nuvem do Babel')
    expect(chip().textContent).not.toMatch(/no aparelho/i)
  })

  it('na nuvem com horas contadas, o chip resume o medidor: "restam … neste mês"', async () => {
    const carregarUso = vi.fn(async () => usoDe(23400, 72000))
    render(
      <CapturaDoPrototipo
        {...base}
        niveis={niveisDe({
          selo: seloDaFala(PREVISTO_NA_NUVEM),
          ambiente: { capacidades: COM_NUVEM, carregarUso },
        })}
      />,
    )
    expect(await screen.findByText(/restam 13 h 30 neste mês/)).toBeTruthy()
    expect(chip().querySelector('b')?.textContent).toBe('Vai pela Nuvem do Babel')
  })

  it('sem selo (nada a afirmar) o chip continua sendo a porta da folha', () => {
    render(<CapturaDoPrototipo {...base} niveis={niveisDe({ selo: null })} />)
    expect(chip().textContent).toBe('Como isto funciona')
    expect(abrirFolha().getByText('Escolha o nível')).toBeTruthy()
  })

  it('gravando, diz o que está acontecendo de verdade: "Legendando", onde, e o par de idiomas', () => {
    const com = (selo: SeloDaFala | null) => (
      <CapturaDoPrototipo
        {...base}
        gravando
        temFalas
        niveis={niveisDe({ selo, ambiente: { capacidades: COM_NUVEM } })}
      />
    )
    const { rerender } = render(com(seloDaFala(PREVISTO_NO_APARELHO, 'whisper-local')))
    expect(chip().textContent).toBe('Legendando · no aparelho · inglês → português (BR)')
    rerender(com(seloDaFala(PREVISTO_NA_NUVEM, 'groq-whisper')))
    expect(chip().textContent).toBe('Legendando · na nuvem (Precisão) · inglês → português (BR)')
    /* A nuvem foi tentada antes: o chip não promete que o áudio ficou. */
    rerender(com(seloDaFala(PREVISTO_NA_NUVEM, 'whisper-local')))
    expect(chip().textContent).toBe('Legendando · no aparelho, depois de tentar a nuvem · inglês → português (BR)')
    /* Nenhuma fala atendida ainda: o previsto, dito como previsto. */
    rerender(com(seloDaFala(PREVISTO_NO_APARELHO)))
    expect(chip().textContent).toBe('Legendando · vai rodar no aparelho · inglês → português (BR)')
  })

  it('no celular o par vai em siglas', () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('max-width: 720px'),
    })) as unknown as typeof window.matchMedia
    render(
      <CapturaDoPrototipo
        {...base}
        gravando
        temFalas
        niveis={niveisDe({ selo: seloDaFala(PREVISTO_NO_APARELHO, 'whisper-local') })}
      />,
    )
    expect(chip().textContent).toBe('Legendando · no aparelho · EN → PT')
    Reflect.deleteProperty(window, 'matchMedia')
  })
})

describe('estadoDoChip (puro)', () => {
  const t = (chave: string, vars?: Record<string, string | number>) =>
    chave.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''))
  const medidor = (resta: number, acabou = false): Medidor => ({
    nivel: 'precisao',
    usado: 1200 - resta,
    total: 1200,
    resta,
    pct: Math.round(((1200 - resta) / 1200) * 100),
    acabou,
  })
  const parado = { gravando: false, pausada: false, emUso: 'precisao' as const, par: 'inglês → português' }

  it('com as horas esgotadas ou a rota mudada, fica o detalhe do selo (o medidor não fala por ele)', () => {
    const naNuvem = seloDaFala(PREVISTO_NA_NUVEM, 'groq-whisper')
    expect(estadoDoChip({ ...parado, selo: naNuvem, medidores: [medidor(810)] }, t).resto).toBe(
      'restam 13 h 30 neste mês',
    )
    expect(estadoDoChip({ ...parado, selo: naNuvem, medidores: [medidor(0, true)] }, t).resto).toBe(
      'o áudio vai para o nosso servidor',
    )
    const mudou = seloDaFala(PREVISTO_NO_APARELHO, 'groq-whisper')
    expect(mudou?.mudou).toBe(true)
    expect(estadoDoChip({ ...parado, selo: mudou, medidores: [medidor(810)] }, t).resto).toBe(
      'o áudio vai para o nosso servidor',
    )
    /* No aparelho o medidor não entra: as horas são da nuvem. */
    const aqui = seloDaFala(PREVISTO_NO_APARELHO, 'whisper-local')
    expect(estadoDoChip({ ...parado, selo: aqui, medidores: [medidor(810)], emUso: 'aparelho' }, t)).toEqual({
      forte: 'No aparelho',
      resto: 'seu áudio não sai daqui',
    })
  })

  it('pausada vence tudo: "Pausado · nada está sendo ouvido"', () => {
    const selo = seloDaFala(PREVISTO_NA_NUVEM, 'groq-whisper')
    expect(estadoDoChip({ ...parado, selo, medidores: [], gravando: true, pausada: true }, t)).toEqual({
      forte: 'Pausado',
      resto: 'nada está sendo ouvido',
    })
    /* Pausada só existe gravando: parada, o chip volta ao selo. */
    expect(estadoDoChip({ ...parado, selo, medidores: [], pausada: true }, t).forte).toBe('Nuvem do Babel')
  })
})

describe('a folha "Como isto funciona" guarda o que saiu da tela (enxuto.js:163-205)', () => {
  it('"Escolha o nível": o nível sem cadeado é escolhido ali mesmo, e grava a preferência de sempre', () => {
    const gravar = vi.fn()
    render(
      <CapturaDoPrototipo
        {...base}
        niveis={niveisDe({ ambiente: { capacidades: COM_NUVEM }, aoEscolherQualidade: gravar })}
      />,
    )
    const como = abrirFolha()
    expect(como.getByText('Escolha o nível')).toBeTruthy()
    expect(como.queryByText('Os três níveis')).toBeNull()
    expect(como.getAllByRole('radio').map((r) => r.getAttribute('data-pl-nivel'))).toEqual([
      'aparelho',
      'precisao',
      'aovivo',
    ])
    fireEvent.click(como.getByRole('radio', { name: /Precisão/ }))
    expect(gravar).toHaveBeenCalledWith('cloud')
    fireEvent.click(como.getByRole('radio', { name: /No aparelho/ }))
    expect(gravar).toHaveBeenLastCalledWith('accurate')
    /* A folha continua aberta: o nível troca com ela à vista. */
    expect(screen.getByTestId('como-isto-funciona')).toBeTruthy()
  })

  it('o nível com cadeado fecha esta folha e abre a dele', () => {
    render(<CapturaDoPrototipo {...base} />)
    fireEvent.click(abrirFolha().getByRole('radio', { name: /Precisão/ }))
    expect(screen.queryByTestId('como-isto-funciona')).toBeNull()
    expect(screen.getByTestId('folha-do-cadeado')).toBeTruthy()
  })

  it('"Neste aparelho": a linha do modelo abre o painel do modelo, e a nota de rodapé sai', () => {
    const aoAbrirModelo = vi.fn()
    render(<CapturaDoPrototipo {...base} aoAbrirModelo={aoAbrirModelo} />)
    const como = abrirFolha()
    expect(como.getByText('Neste aparelho')).toBeTruthy()
    const linha = como.getByRole('button', { name: /Modelo local · 589 MB/ })
    expect(linha.className).toBe('q-linha')
    expect(linha.getAttribute('data-ex-f')).toBe('modelo')
    expect(linha.closest('.q-lista.ex-lista-da-folha')).not.toBeNull()
    expect(como.queryByRole('button', { name: 'Ver o modelo' })).toBeNull()
    fireEvent.click(linha)
    expect(screen.queryByTestId('como-isto-funciona')).toBeNull()
    expect(aoAbrirModelo).toHaveBeenCalledTimes(1)
  })

  it('a "Ajuda da captura" mora na folha e abre a ajuda de sempre', () => {
    const aoAbrirAjuda = vi.fn()
    render(<CapturaDoPrototipo {...base} aoAbrirAjuda={aoAbrirAjuda} />)
    const ajuda = abrirFolha().getByRole('button', { name: /Ajuda da captura/ })
    expect(ajuda.getAttribute('data-ex-f')).toBe('ajuda')
    fireEvent.click(ajuda)
    expect(screen.queryByTestId('como-isto-funciona')).toBeNull()
    expect(aoAbrirAjuda).toHaveBeenCalledTimes(1)
  })

  it('na nuvem a linha do modelo não aparece (quem transcreve não é o modelo local); a ajuda fica', () => {
    render(
      <CapturaDoPrototipo
        {...base}
        temFalas
        niveis={niveisDe({
          selo: seloDaFala(PREVISTO_NA_NUVEM, 'groq-whisper'),
          ambiente: { capacidades: COM_NUVEM },
        })}
      />,
    )
    const como = abrirFolha()
    expect(como.queryByRole('button', { name: /Modelo local/ })).toBeNull()
    expect(como.getByRole('button', { name: /Ajuda da captura/ })).toBeTruthy()
  })

  it('sem nuvem no plano, "Nuvem deste mês" diz que não há, com as horas dos planos à venda', () => {
    render(<CapturaDoPrototipo {...base} />)
    const como = abrirFolha()
    expect(como.getByText('Nuvem deste mês')).toBeTruthy()
    const nota = screen.getByTestId('como-isto-funciona').querySelector('.ex-sem-nuvem')
    expect(nota?.className).toBe('pj-como-ajudas ex-sem-nuvem')
    expect(nota?.textContent).toBe(
      'O seu plano não tem horas de nuvem: a legenda roda no aparelho, sem limite. O Essencial tem 5 h por mês; o Premium, 20 h.',
    )
  })

  it('sem oferta (perfil protegido, edição estática) a folha não fala de planos', () => {
    for (const ambiente of [{ protegido: true }, { semPlanos: true }]) {
      render(<CapturaDoPrototipo {...base} niveis={niveisDe({ ambiente })} />)
      abrirFolha()
      expect(screen.getByTestId('como-isto-funciona').querySelector('.ex-sem-nuvem')).toBeNull()
      cleanup()
    }
  })

  it('com horas contadas, a barra completa continua na folha', async () => {
    const carregarUso = vi.fn(async () => usoDe(23400, 72000))
    render(
      <CapturaDoPrototipo
        {...base}
        niveis={niveisDe({ selo: seloDaFala(PREVISTO_NA_NUVEM), ambiente: { capacidades: COM_NUVEM, carregarUso } })}
      />,
    )
    await screen.findByText(/restam 13 h 30 neste mês/)
    const como = abrirFolha()
    expect(como.getByRole('progressbar')).toBeTruthy()
    expect(screen.getByTestId('como-isto-funciona').querySelector('.ex-sem-nuvem')).toBeNull()
  })
})

describe('gravando: o Pausar ao lado do Encerrar (enxuto.js:66, 82, 125-139)', () => {
  it('entra depois do Encerrar, alterna e diz o estado', () => {
    const aoAlternar = vi.fn()
    const pausa = (pausada: boolean) => ({ pausada, aoAlternar })
    const { container, rerender } = render(<CapturaDoPrototipo {...base} gravando temFalas pausa={pausa(false)} />)
    expect(faixa(container)).toEqual(['00:00', 'Encerrar', 'Pausar', 'Legendas flutuantes', '', 'A−', 'A+'])
    const botao = screen.getByTestId('pausar-captura')
    expect(botao.className).toBe('q-ctl q-fica ex-pausar')
    expect(botao.previousElementSibling?.getAttribute('data-px')).toBe('encerrar')
    expect(botao.getAttribute('aria-pressed')).toBe('false')
    expect(botao.getAttribute('aria-label')).toBe('Pausar a captura')
    expect(container.firstElementChild?.classList.contains('ex-pausado')).toBe(false)
    fireEvent.click(botao)
    expect(aoAlternar).toHaveBeenCalledTimes(1)

    rerender(<CapturaDoPrototipo {...base} gravando temFalas pausa={pausa(true)} />)
    expect(botao.getAttribute('aria-pressed')).toBe('true')
    expect(botao.getAttribute('aria-label')).toBe('Retomar a captura')
    expect(botao.querySelector('.ex-pausar-t')?.textContent).toBe('Retomar')
    expect(container.firstElementChild?.classList.contains('ex-pausado')).toBe(true)
    expect(chip().textContent).toBe('Pausado · nada está sendo ouvido')
  })

  it('parada não há o que pausar; e sem a função (headset) o botão não existe', () => {
    const pausa = { pausada: false, aoAlternar: nada }
    const { rerender } = render(<CapturaDoPrototipo {...base} temFalas pausa={pausa} />)
    expect(screen.queryByTestId('pausar-captura')).toBeNull()
    rerender(<CapturaDoPrototipo {...base} gravando temFalas />)
    expect(screen.queryByTestId('pausar-captura')).toBeNull()
  })
})

describe('onde a tela enxuta não vale', () => {
  it('no headset a captura fica como era: modelo, marca, ajuda, seletor e a letra na faixa', () => {
    aparelho.tipo = 'quest'
    const { container } = render(<CapturaDoPrototipo {...base} noQuest aoFlutuante={undefined} />)
    expect(screen.queryByTestId('chip-de-estado')).toBeNull()
    expect(screen.getByTestId('fileira-do-nivel')).toBeTruthy()
    expect(screen.getAllByTestId('marca-de-onde').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Ajuda' })).toBeTruthy()
    expect(faixa(container)).toEqual(['00:00', 'Iniciar captura', '', 'A−', 'A+', 'EN → PT'])
  })

  it('a chave de prova do desenvolvimento ("Telas: Atual") mostra a arrumação de antes no computador', () => {
    localStorage.setItem('babel.px.telasDeProva', 'atual')
    render(<CapturaDoPrototipo {...base} />)
    expect(screen.queryByTestId('chip-de-estado')).toBeNull()
    expect(screen.getByTestId('fileira-do-nivel')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Idiomas da sessão' })).toBeTruthy()
  })
})
