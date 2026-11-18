// @vitest-environment jsdom
/**
 * A TELA DA LEITURA ATIVA, peça por peça (specs `leitura-ativa-acesso`, `leitura-ativa-acervo`,
 * `leitura-ativa-voz-alta` e `leitura-ativa-perguntas-e-pratica`): o portão da flag, o catálogo (conta nova sem
 * número, histórico com "Você já sabe", filtro vazio, lido no fim), o aviso do microfone, as três saídas de uma
 * pergunta e o resumo sem nota. O ouvido local tem o teste dele (`leitura-ativa-ouvinte.test.ts`); o fluxo inteiro
 * com a voz simulada é o e2e `tests/e2e/leitura-ativa.e2e.ts`.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FichaDeTexto } from '../src/core/leitura/fichaDeTexto'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'

const servidor = vi.hoisted(() => ({ flags: {} as Record<string, { ligada: boolean }> }))
vi.mock('../src/lib/flags', async (orig) => ({
  ...(await orig<typeof import('../src/lib/flags')>()),
  carregarFlags: async () => servidor.flags,
  iniciarAtualizacaoDeFlags: () => () => {},
}))

const { default: PortaoDaLeituraAtiva } = await import('../src/components/views/leituraAtiva/PortaoDaLeituraAtiva')
const { default: Catalogo } = await import('../src/components/views/leituraAtiva/Catalogo')
const { default: AvisoDoMicrofone } = await import('../src/components/views/leituraAtiva/AvisoDoMicrofone')
const { default: PerguntaDoTexto } = await import('../src/components/views/leituraAtiva/PerguntaDoTexto')
const { default: ResumoDaLeitura } = await import('../src/components/views/leituraAtiva/ResumoDaLeitura')

afterEach(() => {
  cleanup()
  definirEstadoDasFlags(null)
  servidor.flags = {}
})

describe('o portão da flag leitura_ativa', () => {
  it('desligada: nada da tela monta e a pessoa vai ao início', async () => {
    definirEstadoDasFlags({})
    const aoNegar = vi.fn()
    render(
      <PortaoDaLeituraAtiva aoNegar={aoNegar}>
        <p>tela da leitura</p>
      </PortaoDaLeituraAtiva>,
    )
    expect(screen.queryByText('tela da leitura')).toBeNull()
    await act(async () => {})
    expect(aoNegar).toHaveBeenCalledTimes(1)
  })

  it('ligada: a tela monta e ninguém é mandado embora', async () => {
    definirEstadoDasFlags({ leitura_ativa: { ligada: true } })
    const aoNegar = vi.fn()
    render(
      <PortaoDaLeituraAtiva aoNegar={aoNegar}>
        <p>tela da leitura</p>
      </PortaoDaLeituraAtiva>,
    )
    expect(screen.getByText('tela da leitura')).toBeTruthy()
    await act(async () => {})
    expect(aoNegar).not.toHaveBeenCalled()
  })

  it('cache velho desligado, servidor ligado: não manda embora', async () => {
    definirEstadoDasFlags({})
    servidor.flags = { leitura_ativa: { ligada: true } }
    const aoNegar = vi.fn()
    render(
      <PortaoDaLeituraAtiva aoNegar={aoNegar}>
        <p>tela</p>
      </PortaoDaLeituraAtiva>,
    )
    await act(async () => {})
    expect(aoNegar).not.toHaveBeenCalled()
  })
})

const ficha = (id: string, nivel: FichaDeTexto['nivel'], categoria: string, titulo = id): FichaDeTexto => ({
  id,
  titulo,
  nivel,
  categoria,
  texto: 'Lia likes apples.',
  palavrasAlvo: ['apple'],
  perguntas: [],
  tarefaDeEscrita: { reescrever: 'r', opinar: 'o' },
  licenca: 'original Frasy (CC BY 4.0)',
  autoria: 'Equipe Frasy, com apoio de IA',
})

const FICHAS = [
  ficha('a1-mercado', 'A1', 'Dia a dia', 'At the Market'),
  ficha('a1-gato', 'A1', 'Histórias', 'The Cat'),
  ficha('a1-camelo', 'A1', 'Mundo', 'Camels'),
  ficha('a2-onibus', 'A2', 'Dia a dia', 'The Wrong Bus'),
  ficha('b1-trem', 'B1', 'Dia a dia', 'The Train'),
]

const conhecimento = (sessoes: number, temConta = true) => ({
  conhecidas: new Set<string>(),
  sessoes,
  temConta,
  noCaderno: () => false,
})

describe('o catálogo', () => {
  it('conta nova: só o nível, sem "Você já sabe", e a seção "Comece por aqui" com textos de A1', () => {
    render(
      <Catalogo
        fichas={FICHAS}
        cobertura={new Map(FICHAS.map((f) => [f.id, 96]))}
        conhecimento={conhecimento(1)}
        lidos={new Set()}
        aoAbrir={() => {}}
      />,
    )
    const tela = screen.getByTestId('leitura-ativa-catalogo')
    expect(tela.textContent).not.toContain('Você já sabe')
    expect(tela.textContent).toContain('Nível 1 · A1')
    const comece = screen.getByRole('region', { name: 'Comece por aqui' })
    expect(
      within(comece)
        .getAllByRole('button')
        .map((b) => b.getAttribute('data-texto')),
    ).toEqual(['a1-mercado', 'a1-gato', 'a1-camelo'])
  })

  it('com histórico: "Você já sabe 96%" e "Bom desafio", na seção "Para você agora"', () => {
    render(
      <Catalogo
        fichas={FICHAS}
        cobertura={new Map(FICHAS.map((f) => [f.id, f.id === 'a2-onibus' ? 96 : 99]))}
        conhecimento={conhecimento(5)}
        lidos={new Set()}
        aoAbrir={() => {}}
      />,
    )
    const para = screen.getByRole('region', { name: 'Para você agora' })
    expect(para.textContent).toContain('Você já sabe 96%')
    expect(para.textContent).toContain('Bom desafio')
  })

  it('sem conta: nenhuma porcentagem, e o convite para o Frasy lembrar das palavras', () => {
    render(
      <Catalogo
        fichas={FICHAS}
        cobertura={new Map(FICHAS.map((f) => [f.id, 96]))}
        conhecimento={conhecimento(9, false)}
        lidos={new Set()}
        aoAbrir={() => {}}
      />,
    )
    const tela = screen.getByTestId('leitura-ativa-catalogo')
    expect(tela.textContent).not.toContain('%')
    expect(tela.textContent).toContain('Entre para o Frasy lembrar das palavras que você já sabe.')
  })

  it('filtro sem resultado: a mensagem e "Limpar filtros"', () => {
    render(
      <Catalogo
        fichas={FICHAS}
        cobertura={new Map()}
        conhecimento={conhecimento(1)}
        lidos={new Set()}
        aoAbrir={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Nível 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Histórias' }))
    expect(screen.getByText('Nenhum texto com esses filtros.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.queryByText('Nenhum texto com esses filtros.')).toBeNull()
  })

  it('texto lido: "Lido ✓", no fim da lista e fora das sugestões', () => {
    render(
      <Catalogo
        fichas={FICHAS}
        cobertura={new Map()}
        conhecimento={conhecimento(1)}
        lidos={new Set(['a1-mercado'])}
        aoAbrir={() => {}}
      />,
    )
    const todos = screen.getByRole('region', { name: 'Todos os textos' })
    const ids = within(todos)
      .getAllByRole('button')
      .map((b) => b.getAttribute('data-texto'))
    expect(ids.at(-1)).toBe('a1-mercado')
    expect(within(todos).getAllByRole('button').at(-1)!.textContent).toContain('Lido ✓')
    const comece = screen.getByRole('region', { name: 'Comece por aqui' })
    expect(comece.textContent).not.toContain('At the Market')
  })

  it('o selo de origem aparece em cada cartão', () => {
    render(
      <Catalogo
        fichas={FICHAS}
        cobertura={new Map()}
        conhecimento={conhecimento(1)}
        lidos={new Set()}
        aoAbrir={() => {}}
      />,
    )
    expect(screen.getAllByText('Criado com IA e revisado por pessoas').length).toBeGreaterThanOrEqual(FICHAS.length)
  })
})

describe('o aviso do microfone', () => {
  it('adulto: o texto de que a voz fica no aparelho; "Agora não" não liga nada', () => {
    const aoLigar = vi.fn()
    const aoRecusar = vi.fn()
    render(<AvisoDoMicrofone protegido={false} aoLigar={aoLigar} aoRecusar={aoRecusar} />)
    const d = screen.getByRole('dialog', { name: 'O Frasy vai ouvir você ler' })
    expect(d.textContent).toContain('Sua voz fica só neste aparelho. Nada é gravado nem enviado.')
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(aoRecusar).toHaveBeenCalled()
    expect(aoLigar).not.toHaveBeenCalled()
  })

  it('perfil protegido: a versão infantil', () => {
    render(<AvisoDoMicrofone protegido aoLigar={() => {}} aoRecusar={() => {}} />)
    expect(screen.getByRole('dialog').textContent).toContain('Você pode desligar o microfone quando quiser.')
  })
})

const PERGUNTA = {
  pergunta: 'Where do Lia and her dad go?',
  traducao: 'Aonde a Lia e o pai dela vão?',
  opcoes: ['To school', 'To the market', 'To the park'],
  correta: 1,
  explicacao: 'O texto diz que vão ao mercado.',
}

describe('uma pergunta', () => {
  it('acerto de primeira: "Isso!" e "Continuar", conta como primeira', () => {
    const fim = vi.fn()
    render(<PerguntaDoTexto pergunta={PERGUNTA} numero={1} total={3} bilingue={false} aoTerminar={fim} />)
    fireEvent.click(screen.getByRole('button', { name: 'To the market' }))
    expect(screen.getByText('Isso!')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(fim).toHaveBeenCalledWith('primeira')
  })

  it('erro: a opção some e a segunda tentativa fica liberada', () => {
    const fim = vi.fn()
    render(<PerguntaDoTexto pergunta={PERGUNTA} numero={1} total={3} bilingue={false} aoTerminar={fim} />)
    fireEvent.click(screen.getByRole('button', { name: 'To school' }))
    expect(screen.queryByRole('button', { name: 'To school' })).toBeNull()
    expect(screen.getByText('Quase. Releia o texto e tente de novo.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'To the market' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(fim).toHaveBeenCalledWith('segunda')
  })

  it('erro duas vezes: a resposta certa com a explicação, sem "errado"', () => {
    const fim = vi.fn()
    const { container } = render(
      <PerguntaDoTexto pergunta={PERGUNTA} numero={1} total={3} bilingue={false} aoTerminar={fim} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'To school' }))
    fireEvent.click(screen.getByRole('button', { name: 'To the park' }))
    expect(container.textContent).toContain('A resposta era: “To the market”.')
    expect(container.textContent).toContain('O texto diz que vão ao mercado.')
    expect(container.textContent).not.toMatch(/errad|errou/i)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(fim).toHaveBeenCalledWith('nenhuma')
  })

  it('"Ver em português" mostra o enunciado traduzido; no Nível 1 ele já vem junto; "Pular" sempre à vista', () => {
    const fim = vi.fn()
    render(<PerguntaDoTexto pergunta={PERGUNTA} numero={1} total={3} bilingue={false} aoTerminar={fim} />)
    expect(screen.queryByText('Aonde a Lia e o pai dela vão?')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver em português' }))
    expect(screen.getByText('Aonde a Lia e o pai dela vão?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }))
    expect(fim).toHaveBeenCalledWith('pulada')
    cleanup()
    render(<PerguntaDoTexto pergunta={PERGUNTA} numero={1} total={3} bilingue aoTerminar={() => {}} />)
    expect(screen.getByText('Aonde a Lia e o pai dela vão?')).toBeTruthy()
  })
})

const FATOS = {
  frasesLidas: 9,
  totalDeFrases: 9,
  ms: 45_000,
  estrelas: 7,
  certas: 2,
  totalDePerguntas: 3,
  palavrasPorMinuto: 96,
}

describe('o resumo', () => {
  it('adulto em voz alta: fatos, "cerca de 96 palavras por minuto", sem porcentagem', () => {
    const { container } = render(
      <ResumoDaLeitura
        titulo="At the Market"
        fatos={FATOS}
        palavras={[{ palavra: 'six', motivo: 'pulada', marcada: true }]}
        temConta
        aoPraticar={async () => 1}
        aoLerOutro={() => {}}
        aoLerDeNovo={() => {}}
      />,
    )
    expect(container.textContent).toContain('9 de 9 frases · 45 s · ★ 7 estrelas · 2 de 3 perguntas')
    expect(container.textContent).toContain('cerca de 96 palavras por minuto')
    expect(container.textContent).not.toContain('%')
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  })

  it('menor (sem palavras/min) e sem conta: sem velocidade, o aviso e nenhum botão de salvar', () => {
    const aoPraticar = vi.fn(async () => 0)
    const { container } = render(
      <ResumoDaLeitura
        titulo="At the Market"
        fatos={{ ...FATOS, palavrasPorMinuto: null }}
        palavras={[{ palavra: 'six', motivo: 'pulada', marcada: true }]}
        temConta={false}
        aoPraticar={aoPraticar}
        aoLerOutro={() => {}}
        aoLerDeNovo={() => {}}
      />,
    )
    expect(container.textContent).not.toContain('palavras por minuto')
    expect(container.textContent).toContain('Entre para guardar estas palavras e ganhar XP.')
    expect(screen.queryByRole('button', { name: 'Praticar estas palavras' })).toBeNull()
    expect(container.textContent).not.toMatch(/plano/i)
  })

  it('lista vazia: "Nenhuma palavra para praticar. Você leu tudo com clareza!"', () => {
    render(
      <ResumoDaLeitura
        titulo="At the Market"
        fatos={FATOS}
        palavras={[]}
        temConta
        aoPraticar={async () => 0}
        aoLerOutro={() => {}}
        aoLerDeNovo={() => {}}
      />,
    )
    expect(screen.getByText('Nenhuma palavra para praticar. Você leu tudo com clareza!')).toBeTruthy()
  })

  it('desmarcar tira a palavra do que vai para a revisão', async () => {
    const aoPraticar = vi.fn(async (l: string[]) => l.length)
    render(
      <ResumoDaLeitura
        titulo="At the Market"
        fatos={FATOS}
        palavras={[
          { palavra: 'six', motivo: 'pulada', marcada: true },
          { palavra: 'borrow', motivo: 'tocada', marcada: true },
        ]}
        temConta
        aoPraticar={aoPraticar}
        aoLerOutro={() => {}}
        aoLerDeNovo={() => {}}
      />,
    )
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Praticar estas palavras' }))
    })
    expect(aoPraticar).toHaveBeenCalledWith(['six'])
    expect(screen.getByRole('status').textContent).toContain('Pronto! 1 palavra está na sua revisão.')
  })
})

void React
