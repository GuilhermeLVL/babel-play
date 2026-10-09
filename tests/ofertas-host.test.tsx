// @vitest-environment jsdom
/**
 * O HOST DAS OFERTAS E OS COMPONENTES (Fase 8) — o que a pessoa vê e o que é contado.
 *
 * Flag desligada só deixa passar os avisos funcionais; o modal fecha com Esc, com o X e com clique
 * fora, prende o foco na ação (`showModal` + `data-autofocus`) e tem rótulos; "não mostrar
 * novamente" é para sempre; durante uma rodada nada aparece e o pedido espera a rodada fechar; e
 * cada saída vira o evento certo de conversão.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import type { ConfigDeOfertas, GatilhoDeOferta } from '../src/core/ofertas'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

const estado = vi.hoisted(() => ({
  flag: false,
  config: { gatilhos: [] } as ConfigDeOfertas,
  plano: 'free' as string,
  pessoa: { protegido: false, podeTestar: false },
  eventos: [] as Array<{ evento: string; gatilho: string; componente: string }>,
}))

vi.mock('../src/lib/flags', () => ({
  useFlag: () => estado.flag,
  useConfigRemota: () => estado.config,
  ehConfigDeOfertas: () => true,
}))
vi.mock('../src/lib/ofertas/plano', () => ({ planoDaOferta: () => estado.plano, pessoaDaOferta: () => estado.pessoa }))
vi.mock('../src/lib/ofertas/cota', () => ({ verificarCota: async () => null }))
vi.mock('../src/lib/ofertas/instrumentacao', async (original) => {
  const real = await original<typeof import('../src/lib/ofertas/instrumentacao')>()
  return {
    ...real,
    registrarEventoDeOferta: (evento: string, r: { gatilho: string; componente: string }) =>
      estado.eventos.push({ evento, gatilho: r.gatilho, componente: r.componente }),
  }
})

const { default: HostDeOfertas } = await import('../src/components/ofertas/HostDeOfertas')
const { dispararOferta } = await import('../src/lib/ofertas/eventos')
const { consumirDestaqueEmPlanos } = await import('../src/lib/ofertas/destaque')
const { _esquecerOfertas } = await import('../src/lib/ofertas/historico')

const gatilho = (p: Partial<GatilhoDeOferta>): GatilhoDeOferta => ({
  id: 'conquista_modal',
  momento: 'conquista',
  componente: 'modal',
  titulo: { pt: 'Você está indo longe' },
  texto: { pt: 'Com o Premium a tradução de nuvem vem junto.' },
  cta: { pt: 'Ver planos' },
  maxPorDia: 1,
  maxPorSemana: 3,
  intervaloMinHoras: 12,
  planos: ['free'],
  ...p,
})

let aoEntrar: Mock<() => void>
let aoVerPlanos: Mock<() => void>

function montar() {
  aoEntrar = vi.fn<() => void>()
  aoVerPlanos = vi.fn<() => void>()
  return render(<HostDeOfertas aoEntrar={aoEntrar} aoVerPlanos={aoVerPlanos} />)
}

const disparar = (m: Parameters<typeof dispararOferta>[0]) => act(() => dispararOferta(m))

/* O cartão da oferta chega num pedaço à parte (`usePedacoDoQuest`): depois da primeira vez ele monta na
   hora, e é assim que os testes abaixo o encontram (e que "não aparece" quer dizer alguma coisa). */
beforeAll(async () => {
  const { default: CartaoDeOferta } = await import('../src/components/ofertas/CartaoDeOferta')
  const nada = () => {}
  render(
    <CartaoDeOferta
      tom="acento"
      icone={Sparkles}
      titulo=""
      texto=""
      cta=""
      aoAgir={nada}
      aoDispensar={nada}
      aoNaoMostrar={nada}
    />,
  )
  await act(async () => {
    await import('../src/components/ofertas/quest/CartaoDeOfertaDoQuest')
    await new Promise((r) => setTimeout(r, 0))
  })
  cleanup()
})

beforeEach(() => {
  prepararDialogoNoJsdom()
  localStorage.clear()
  sessionStorage.clear()
  _esquecerOfertas()
  // Sessão de uso aberta há 10 minutos: o teto dos 3 primeiros minutos já passou.
  sessionStorage.setItem('babel.ofertas.sessao', JSON.stringify({ inicio: Date.now() - 10 * 60_000, promocionais: 0 }))
  estado.flag = false
  estado.config = { gatilhos: [] }
  estado.plano = 'free'
  estado.pessoa = { protegido: false, podeTestar: false }
  estado.eventos = []
})
afterEach(() => {
  cleanup()
  document.body.removeAttribute('data-jogo-ativo')
  vi.useRealTimers()
})

describe('flag desligada', () => {
  it('oferta promocional não aparece', () => {
    estado.config = { gatilhos: [gatilho({})] }
    montar()
    disparar('conquista')
    disparar('modelo_premium')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByTestId('cartao-de-oferta')).toBeNull()
    expect(estado.eventos).toEqual([])
  })

  it('o aviso funcional de fim de cota aparece, discreto, e conta a exibição', () => {
    montar()
    disparar('fim_de_cota')
    const aviso = screen.getByTestId('cartao-de-oferta')
    /* Uma região ao lado do conteúdo, com nome: não interrompe nem prende o foco. */
    expect(aviso.getAttribute('role')).toBe('complementary')
    expect(aviso.textContent).toContain('A IA de nuvem do seu plano acabou neste mês')
    expect(screen.queryByRole('dialog')).toBeNull() // não é modal
    expect(estado.eventos).toEqual([
      { evento: 'oferta_exibida', gatilho: 'funcional_fim_de_cota', componente: 'aviso_cota' },
    ])
  })
})

describe('modal (flag ligada)', () => {
  beforeEach(() => {
    estado.flag = true
    estado.config = { gatilhos: [gatilho({})] }
  })

  it('tem nome acessível, rótulos nos botões e o foco começa na ação', () => {
    montar()
    disparar('conquista')
    const dialogo = screen.getByRole('dialog', { name: 'Você está indo longe' })
    expect(dialogo).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Não mostrar novamente' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ver planos' }))
    expect(dialogo.textContent).toMatch(/Sugerido: Premium · R\$ \d/)
  })

  it('Esc fecha e conta como dispensa', () => {
    montar()
    disparar('conquista')
    const d = screen.getByRole('dialog') as HTMLDialogElement
    act(() => {
      d.dispatchEvent(new Event('cancel'))
      d.close()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(estado.eventos.map((e) => e.evento)).toEqual(['oferta_exibida', 'oferta_dispensada'])
  })

  it('clique fora (no fundo) fecha; clique dentro não', () => {
    montar()
    disparar('conquista')
    fireEvent.click(screen.getByText('Com o Premium a tradução de nuvem vem junto.'))
    expect(screen.queryByRole('dialog')).not.toBeNull()
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(estado.eventos.at(-1)?.evento).toBe('oferta_dispensada')
  })

  it('"Não mostrar novamente" é para sempre (mesmo dias depois, com a frequência livre)', () => {
    montar()
    disparar('conquista')
    fireEvent.click(screen.getByRole('button', { name: 'Não mostrar novamente' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(estado.eventos.at(-1)?.evento).toBe('oferta_nao_mostrar')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 30 * 24 * 60 * 60_000)
    sessionStorage.setItem(
      'babel.ofertas.sessao',
      JSON.stringify({ inicio: Date.now() - 10 * 60_000, promocionais: 0 }),
    )
    disparar('conquista')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a ação conta o clique e abre Planos com o plano sugerido destacado', () => {
    montar()
    disparar('conquista')
    fireEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(aoVerPlanos).toHaveBeenCalledOnce()
    expect(consumirDestaqueEmPlanos()).toEqual({ plano: 'premium' })
    expect(estado.eventos.map((e) => e.evento)).toEqual(['oferta_exibida', 'oferta_clicada'])
  })

  it('no máximo uma promocional por sessão', () => {
    montar()
    disparar('conquista')
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    estado.config = { gatilhos: [gatilho({}), gatilho({ id: 'outro', momento: 'fim_de_sessao' })] }
    disparar('fim_de_sessao')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('tela ocupada', () => {
  it('durante uma rodada nada aparece; quando a rodada fecha, o pedido volta', () => {
    estado.flag = true
    estado.config = { gatilhos: [gatilho({ componente: 'banner' })] }
    document.body.setAttribute('data-jogo-ativo', '1')
    montar()
    disparar('conquista')
    expect(screen.queryByTestId('cartao-de-oferta')).toBeNull()
    document.body.removeAttribute('data-jogo-ativo')
    act(() => {
      window.dispatchEvent(new Event('babel:rodada-fechou'))
    })
    expect(screen.getByTestId('cartao-de-oferta')).toBeTruthy()
  })

  it('não aparece por cima de outro diálogo aberto (a celebração)', () => {
    estado.flag = true
    estado.config = { gatilhos: [gatilho({ componente: 'banner' })] }
    const outro = document.createElement('dialog')
    outro.setAttribute('open', '')
    document.body.appendChild(outro)
    montar()
    disparar('conquista')
    expect(screen.queryByTestId('cartao-de-oferta')).toBeNull()
    outro.remove()
  })
})

describe('banner e convidado', () => {
  it('convidado: o convite de conta leva ao login, não a um plano', () => {
    estado.flag = true
    estado.plano = 'convidado'
    estado.config = {
      gatilhos: [
        gatilho({
          id: 'criar_conta',
          momento: 'convidado_para_conta',
          componente: 'banner',
          planos: ['convidado'],
          cta: { pt: 'Criar conta' },
        }),
      ],
    }
    montar()
    // O contrato da Fase 7: o evento cru, sem importar nada daqui.
    act(() => {
      window.dispatchEvent(
        new CustomEvent('babel:oferta', { detail: { momento: 'convidado_para_conta', contexto: {} } }),
      )
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(aoEntrar).toHaveBeenCalledOnce()
    expect(aoVerPlanos).not.toHaveBeenCalled()
  })

  it('Esc com o foco no banner dispensa; o X tem rótulo', () => {
    montar()
    disparar('cota_proxima')
    const banner = screen.getByTestId('cartao-de-oferta')
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy()
    fireEvent.keyDown(banner, { key: 'Escape' })
    expect(screen.queryByTestId('cartao-de-oferta')).toBeNull()
    expect(estado.eventos.at(-1)).toMatchObject({ evento: 'oferta_dispensada', gatilho: 'funcional_cota_proxima' })
  })

  it('Premium vê o aviso de cota sem venda: a ação leva ao consumo do mês', () => {
    estado.plano = 'premium'
    montar()
    disparar('fim_de_cota')
    expect(screen.getByTestId('cartao-de-oferta').textContent).not.toMatch(/Sugerido/)
    fireEvent.click(screen.getByRole('button', { name: 'Ver consumo do mês' }))
    expect(consumirDestaqueEmPlanos()).toEqual({ aba: 'consumo' })
  })
})

describe('o pedido de conta de fora da árvore (pedirConta)', () => {
  it('abre o login do App, sem passar pelo motor e sem contar oferta', async () => {
    const { pedirConta } = await import('../src/lib/ofertas/eventos')
    montar()
    act(() => pedirConta())
    expect(aoEntrar).toHaveBeenCalledTimes(1)
    expect(estado.eventos).toEqual([])
  })
})

describe('C8 — o perfil protegido e o teste no host', () => {
  it('perfil protegido: a promocional não aparece; o aviso funcional aparece sem venda e leva ao consumo', () => {
    estado.flag = true
    estado.pessoa = { protegido: true, podeTestar: true }
    estado.config = {
      gatilhos: [
        gatilho({}),
        gatilho({ id: 'cota_acabou', momento: 'fim_de_cota', texto: { pt: 'Com o Premium você continua.' } }),
      ],
    }
    montar()
    disparar('conquista')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(estado.eventos).toEqual([])
    disparar('fim_de_cota')
    const aviso = screen.getByTestId('cartao-de-oferta')
    expect(aviso.textContent).toContain('A IA de nuvem do seu plano acabou neste mês')
    expect(aviso.textContent).not.toMatch(/Premium você continua|Sugerido/)
    fireEvent.click(screen.getByRole('button', { name: 'Ver consumo do mês' }))
    expect(consumirDestaqueEmPlanos()).toEqual({ aba: 'consumo' })
  })

  it('quem pode testar: o selo sugere o teste sem cartão, e a ação destaca o teste em Planos', () => {
    estado.flag = true
    estado.pessoa = { protegido: false, podeTestar: true }
    estado.config = { gatilhos: [gatilho({})] }
    montar()
    disparar('conquista')
    const dialogo = screen.getByRole('dialog')
    expect(dialogo.textContent).toMatch(/Sugerido: 14 dias de Premium grátis, sem cartão/)
    fireEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(consumirDestaqueEmPlanos()).toEqual({ plano: 'teste' })
  })
})
