// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import CapturaDoPrototipo from '../src/components/views/captura/celular/CapturaDoPrototipo'
import IdiomasDaSessao, { type Lado } from '../src/components/views/captura/IdiomasDaSessao'
import type { EntradaDoAquecimento } from '../src/core/harness/aquecerNaIntencao'
import { criarGanchoDaIntencao } from '../src/lib/captura/aquecerNaIntencao'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

/* `tiposDaFala` puxa o `@core` inteiro (e o sql.js do Anki, que o vitest não resolve); aqui só o `clog` importa. */
vi.mock('../src/lib/captura/tiposDaFala', () => ({ clog: vi.fn() }))

type Perfil = Omit<EntradaDoAquecimento, 'gatilho'>
const DESKTOP: Perfil = { poucaMemoria: false, leve: false, tipo: 'desktop-com-gpu', isolado: true }
const FRACO: Perfil = { poucaMemoria: true, leve: true, tipo: 'celular-fraco', isolado: false }
const SAFARI_MAC: Perfil = { poucaMemoria: true, leve: false, tipo: 'desktop-sem-gpu', isolado: false }

function montar(perfil: Perfil, ligada = true) {
  const preaquecer = vi.fn()
  const log = vi.fn()
  const g = criarGanchoDaIntencao({ preaquecer, flagLigada: () => ligada, perfil: () => perfil, log })
  return { g, preaquecer, log }
}

describe('gancho do aquecimento na intenção', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('200 ms de permanência dispara, em modo padrão (sem argumentos)', () => {
    const { g, preaquecer, log } = montar(DESKTOP)
    g.ponteiroEntrou()
    vi.advanceTimersByTime(199)
    expect(preaquecer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(preaquecer).toHaveBeenCalledTimes(1)
    expect(preaquecer).toHaveBeenCalledWith()
    expect(log.mock.calls[0]?.[0]).toMatch(/disparou/)
  })

  it('atravessar (sair antes de 200 ms) não dispara', () => {
    const { g, preaquecer } = montar(DESKTOP)
    g.ponteiroEntrou()
    vi.advanceTimersByTime(100)
    g.ponteiroSaiu()
    vi.advanceTimersByTime(1000)
    expect(preaquecer).not.toHaveBeenCalled()
  })

  it('foco e ponteiro seguidos contam um temporizador só', () => {
    const { g, preaquecer } = montar(DESKTOP)
    g.ponteiroEntrou()
    g.ponteiroEntrou()
    vi.advanceTimersByTime(500)
    expect(preaquecer).toHaveBeenCalledTimes(1)
  })

  it('sem a flag nenhum handler age (nem registra)', () => {
    const { g, preaquecer, log } = montar(DESKTOP, false)
    g.ponteiroEntrou()
    vi.advanceTimersByTime(1000)
    g.idiomasConfirmados()
    expect(preaquecer).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it('idiomas confirmados disparam na hora', () => {
    const { g, preaquecer } = montar(DESKTOP)
    g.idiomasConfirmados()
    expect(preaquecer).toHaveBeenCalledTimes(1)
  })

  it('pouca memória ignora o ponteiro (e registra o motivo), mas aceita os idiomas', () => {
    const { g, preaquecer, log } = montar({ ...FRACO, isolado: true })
    g.ponteiroEntrou()
    vi.advanceTimersByTime(300)
    expect(preaquecer).not.toHaveBeenCalled()
    expect(log.mock.calls[0]?.[0]).toMatch(/ignorou/)
    g.idiomasConfirmados()
    expect(preaquecer).toHaveBeenCalledTimes(1)
  })

  it('desktop sem isolamento (Safari no Mac) nunca aquece', () => {
    const { g, preaquecer } = montar(SAFARI_MAC)
    g.ponteiroEntrou()
    vi.advanceTimersByTime(300)
    g.idiomasConfirmados()
    expect(preaquecer).not.toHaveBeenCalled()
  })

  it('falha do pré-aquecimento não vaza como rejeição', async () => {
    const preaquecer = vi.fn().mockRejectedValue(new Error('x'))
    const g = criarGanchoDaIntencao({ preaquecer, flagLigada: () => true, perfil: () => DESKTOP, log: vi.fn() })
    g.idiomasConfirmados()
    await vi.advanceTimersByTimeAsync(0)
    expect(preaquecer).toHaveBeenCalled()
  })
})

describe('ligação nas telas', () => {
  beforeAll(prepararDialogoNoJsdom)
  afterEach(cleanup)

  function prototipo(intencao?: { entrou: () => void; saiu: () => void }) {
    return render(
      <CapturaDoPrototipo
        gravando={false}
        temFalas={false}
        abrindo={false}
        tempo="00:00"
        par="Inglês para Português"
        parCurto="EN → PT"
        modelo="Modelo local"
        micLigado={false}
        micAbrindo={false}
        aoAlternarMic={() => {}}
        podeIniciar
        aoIniciar={() => {}}
        aoParar={() => {}}
        aoAbrirIdiomas={() => {}}
        aoAbrirModelo={() => {}}
        aoAbrirAjustes={() => {}}
        aoAbrirAjuda={() => {}}
        letra={{ menor: () => {}, maior: () => {}, noMinimo: false, noMaximo: false }}
        legenda={null}
        intencao={intencao}
      />,
    )
  }

  it('"Iniciar": foco e ponteiro entram; saída e blur saem', () => {
    const entrou = vi.fn()
    const saiu = vi.fn()
    prototipo({ entrou, saiu })
    const botao = screen.getByTestId('iniciar-captura')
    fireEvent.pointerEnter(botao)
    fireEvent.focus(botao)
    expect(entrou).toHaveBeenCalledTimes(2)
    fireEvent.pointerLeave(botao)
    fireEvent.blur(botao)
    expect(saiu).toHaveBeenCalledTimes(2)
  })

  it('"Iniciar" sem a ligação não quebra', () => {
    prototipo()
    const botao = screen.getByTestId('iniciar-captura')
    expect(() => {
      fireEvent.pointerEnter(botao)
      fireEvent.blur(botao)
    }).not.toThrow()
  })

  it('"Usar estes idiomas" avisa a confirmação', () => {
    const aoConfirmar = vi.fn()
    const lado = (codigo: string): Lado => ({
      rotulo: 'Lado',
      codigo,
      auto: false,
      aceitaAuto: false,
      aoEscolher: vi.fn(),
    })
    render(
      <IdiomasDaSessao
        sub="x"
        lados={[lado('en-US'), lado('pt-BR')]}
        resumo="r"
        avisos={null}
        aoFechar={() => {}}
        aoConfirmar={aoConfirmar}
      />,
    )
    fireEvent.click(screen.getByText('Usar estes idiomas'))
    expect(aoConfirmar).toHaveBeenCalledTimes(1)
  })
})
