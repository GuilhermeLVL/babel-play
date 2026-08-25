// @vitest-environment jsdom
/**
 * O BURACO QUE ESTE TESTE FECHA.
 *
 * `tests/contrastePaletas.test.ts` lê os tokens LITERAIS de `src/index.css` e valida WCAG 4.5:1 nas
 * 14 combinações tema×modo. É um bom teste e não pega nada do que está aqui: ele é cego para
 * componentes. Um `text-white` escrito num `.tsx` passa por ele intocado — e `text-white` é
 * exatamente o defeito que o projeto já cometeu duas vezes, registrado em `index.css`:
 *
 *  - `btn-solid` com `color: white` sumia no accent branco do vercel-dark;
 *  - `bg-ink text-white` era branco sobre branco no modo escuro, porque `--ink` lá é CLARO.
 *
 * Os sete temas trocam TOKENS, não classes. Uma cor literal num primitivo — que por definição
 * aparece em muitas telas — vira texto invisível em algum tema, e ninguém descobre até alguém
 * abrir aquele tema naquela tela.
 *
 * A varredura é ESTÁTICA (lê os arquivos) e não por renderização, porque renderizar só cobre as
 * variantes que o teste lembrou de montar. O arquivo inteiro cobre todas.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import Abas, { PainelDeAba } from '../src/components/ui/Abas'
import Segmentado from '../src/components/ui/Segmentado'
import Barra from '../src/components/ui/Barra'
import Ladrilho from '../src/components/ui/Ladrilho'
import Vazio from '../src/components/ui/Vazio'

const DIR = join(__dirname, '..', 'src', 'components', 'ui')

/**
 * Cada padrão vem com o motivo, porque a mensagem de falha é o que a próxima pessoa vai ler.
 * Tons fixos do Tailwind (`slate`, `gray`, `zinc`…) entram junto: eles não são literais de cor, mas
 * são igualmente imunes à troca de tema — `bg-gray-800` continua cinza-escuro no tema claro.
 */
const PROIBIDOS: Array<{ re: RegExp; porque: string }> = [
  { re: /\btext-white\b/, porque: 'some no accent branco do vercel-dark; use text-*-contrast' },
  { re: /\btext-black\b/, porque: 'ilegível no modo escuro; use text-ink' },
  { re: /\bbg-white\b/, porque: 'não acompanha o tema; use bg-surface ou bg-canvas' },
  { re: /\bbg-black\b/, porque: 'não acompanha o tema; use bg-canvas' },
  { re: /\b(?:text|bg|border)-(?:slate|gray|zinc|neutral|stone|red|blue|green|yellow|amber|emerald|indigo|violet|purple|pink)-\d{2,3}\b/, porque: 'tom fixo do Tailwind ignora os 7 temas; use os tokens semânticos' },
  { re: /#[0-9a-fA-F]{3,8}\b/, porque: 'hex literal; a cor tem de vir de um token' },
  { re: /\brgba?\(/, porque: 'cor literal; a cor tem de vir de um token' },
]

/**
 * A cor cheia (`text-accent`) sobre superfície dá 1,82:1 — medido, registrado em `index.css:1097`.
 * O par correto é fundo `-soft` com texto `-ink`. Aqui isso vira regra: dentro de uma mesma string
 * de classes, um `bg-*-soft` obriga o texto irmão a ser `-ink`.
 */
const SEMANTICAS = ['accent', 'good', 'warn', 'rare', 'error'] as const

function arquivosDeUi(): string[] {
  return readdirSync(DIR).filter((f) => f.endsWith('.tsx'))
}

describe('primitivos de UI — só tokens, nunca cor literal', () => {
  it('nenhum arquivo usa cor fora do sistema de tokens', () => {
    const achados: string[] = []

    for (const arquivo of arquivosDeUi()) {
      const linhas = readFileSync(join(DIR, arquivo), 'utf8').split('\n')

      linhas.forEach((linha, i) => {
        // Comentários explicam os defeitos passados CITANDO as classes proibidas. Puni-los faria o
        // teste exigir que a documentação mentisse sobre o que ela documenta.
        const semComentario = linha.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
        if (/^\s*\*/.test(linha)) return

        for (const { re, porque } of PROIBIDOS) {
          if (re.test(semComentario)) {
            achados.push(`${arquivo}:${i + 1} — ${re.source} (${porque})\n    ${linha.trim()}`)
          }
        }
      })
    }

    expect(achados, `cor fora do sistema de tokens:\n\n${achados.join('\n')}\n`).toEqual([])
  })

  it('fundo -soft sempre anda com texto -ink', () => {
    const achados: string[] = []

    for (const arquivo of arquivosDeUi()) {
      const fonte = readFileSync(join(DIR, arquivo), 'utf8')

      for (const cor of SEMANTICAS) {
        // Procura a cor cheia como TEXTO (`text-accent` sem sufixo) na mesma string que um fundo soft.
        const cheiaComoTexto = new RegExp(`bg-${cor}-soft[^'"\`]*\\btext-${cor}\\b(?!-)`)
        if (cheiaComoTexto.test(fonte)) {
          achados.push(`${arquivo} — bg-${cor}-soft com text-${cor} (1,82:1; use text-${cor}-ink)`)
        }
      }
    }

    expect(achados, achados.join('\n')).toEqual([])
  })
})

describe('Abas — o contrato de acessibilidade que as versões à mão não tinham', () => {
  afterEach(cleanup)

  const ITENS = [
    { id: 'a', rotulo: 'Idiomas' },
    { id: 'b', rotulo: 'Aparência' },
    { id: 'c', rotulo: 'Conta' },
  ]

  it('declara tablist/tab e marca a selecionada', () => {
    render(<Abas itens={ITENS} ativo="b" aoTrocar={() => {}} rotuloDoGrupo="Seções" />)

    expect(screen.getByRole('tablist', { name: 'Seções' })).toBeTruthy()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Aparência')
  })

  it('só a aba ativa entra na ordem de tabulação', () => {
    render(<Abas itens={ITENS} ativo="b" aoTrocar={() => {}} rotuloDoGrupo="Seções" />)

    const tabuláveis = screen.getAllByRole('tab').filter((t) => t.getAttribute('tabindex') === '0')
    expect(tabuláveis).toHaveLength(1)
    expect(tabuláveis[0].textContent).toContain('Aparência')
  })

  it('seta para a direita avança, e da última volta para a primeira', () => {
    const trocas: string[] = []
    render(<Abas itens={ITENS} ativo="c" aoTrocar={(id) => trocas.push(id)} rotuloDoGrupo="Seções" />)

    fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key: 'ArrowRight' })
    expect(trocas).toEqual(['a'])
  })

  it('o painel só renderiza o conteúdo da aba ativa', () => {
    render(
      <>
        <PainelDeAba id="a" ativo="b">conteúdo A</PainelDeAba>
        <PainelDeAba id="b" ativo="b">conteúdo B</PainelDeAba>
      </>,
    )

    expect(screen.queryByText('conteúdo A')).toBeNull()
    expect(screen.getByRole('tabpanel').textContent).toBe('conteúdo B')
  })
})

describe('Segmentado — opção sem itens não fica clicável, e diz por quê', () => {
  afterEach(cleanup)

  it('bloqueia a opção com motivo e a expõe no title', () => {
    render(
      <Segmentado
        rotuloDoGrupo="Nível"
        opcoes={[
          { id: 'facil', rotulo: 'Fácil', contagem: 12 },
          { id: 'dificil', rotulo: 'Difícil', contagem: 2, motivoBloqueio: 'só 2; este jogo precisa de 4' },
        ]}
        valor={['facil']}
        aoTrocar={() => {}}
        multiplo
      />,
    )

    const bloqueada = screen.getByRole('button', { name: /Difícil/ })
    expect(bloqueada.hasAttribute('disabled')).toBe(true)
    expect(bloqueada.getAttribute('title')).toBe('só 2; este jogo precisa de 4')
  })

  it('clique numa opção bloqueada não dispara nada', () => {
    let chamou = 0
    render(
      <Segmentado
        rotuloDoGrupo="Nível"
        opcoes={[{ id: 'x', rotulo: 'Vazia', contagem: 0, motivoBloqueio: 'nenhuma palavra aqui' }]}
        valor={[]}
        aoTrocar={() => { chamou++ }}
        multiplo
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Vazia/ }))
    expect(chamou).toBe(0)
  })

  it('a contagem 0 aparece — é justamente a informação que trava a opção', () => {
    render(
      <Segmentado
        rotuloDoGrupo="Nível"
        opcoes={[{ id: 'x', rotulo: 'Difícil', contagem: 0, motivoBloqueio: 'nenhuma' }]}
        valor={[]}
        aoTrocar={() => {}}
        multiplo
      />,
    )

    expect(screen.getByRole('button', { name: /Difícil/ }).textContent).toContain('0')
  })

  it('exclusivo usa radiogroup; múltiplo usa aria-pressed', () => {
    const { unmount } = render(
      <Segmentado
        rotuloDoGrupo="Fonte"
        opcoes={[{ id: 'a', rotulo: 'A' }, { id: 'b', rotulo: 'B' }]}
        valor={['a']}
        aoTrocar={() => {}}
      />,
    )
    expect(screen.getByRole('radiogroup', { name: 'Fonte' })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    unmount()

    render(
      <Segmentado
        rotuloDoGrupo="Nível"
        opcoes={[{ id: 'a', rotulo: 'A' }]}
        valor={['a']}
        aoTrocar={() => {}}
        multiplo
      />,
    )
    expect(screen.getByRole('button', { name: 'A' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('Barra — o percentual é saneado, não propagado', () => {
  afterEach(cleanup)

  /**
   * `Infinity` cai para 0, não para 100 — e a escolha é deliberada. 140 é uma conta que passou do
   * fim (XP creditado depois da subida de nível): "cheia" é a leitura certa. `Infinity` e `NaN` são
   * contas QUEBRADAS (divisão por zero num baralho vazio), e desenhar a barra cheia a partir de uma
   * conta quebrada anuncia "terminado" para quem não terminou nada. Entre errar para menos e errar
   * afirmando conclusão, o produto erra para menos.
   */
  it.each([
    ['NaN', NaN, 0],
    ['acima de 100', 140, 100],
    ['negativo', -20, 0],
    ['Infinity', Infinity, 0],
  ])('%s vira um valor desenhável', (_caso, entrada, esperado) => {
    render(<Barra pct={entrada} rotuloAcessivel="Progresso" />)
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(String(esperado))
  })

  it('o valor anunciado é o mesmo que a faixa desenha', () => {
    const { container } = render(<Barra pct={37.4} rotuloAcessivel="Progresso" />)
    const faixa = container.querySelector('[role="progressbar"] > div') as HTMLElement
    expect(faixa.style.width).toBe('37.4%')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('37')
  })
})

describe('Ladrilho — não inventa zero', () => {
  afterEach(cleanup)

  it('dado ausente vira esqueleto, nunca 0', () => {
    const { container } = render(<Ladrilho valor={null} rotulo="palavras" />)
    expect(container.textContent).not.toContain('0')
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  it('zero de verdade é exibido', () => {
    const { container } = render(<Ladrilho valor={0} rotulo="palavras" />)
    expect(container.textContent).toContain('0')
    expect(container.querySelector('.animate-pulse')).toBeNull()
  })

  it('a nota de base acompanha o número', () => {
    render(<Ladrilho valor={58} rotulo="de cada 100" nota="sobre as 149 que você já revisou" />)
    expect(screen.getByText(/149 que você já revisou/)).toBeTruthy()
  })
})

describe('Vazio — diz a causa e oferece a saída', () => {
  afterEach(cleanup)

  it('renderiza explicação e ação', () => {
    let clicou = false
    render(
      <Vazio
        titulo="Falta 1 palavra para abrir"
        explicacao="precisa de 4 · você tem 3 do inglês"
        acao={{ rotulo: 'Gravar agora', aoClicar: () => { clicou = true } }}
      />,
    )

    expect(screen.getByText(/precisa de 4/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Gravar agora' }))
    expect(clicou).toBe(true)
  })
})
