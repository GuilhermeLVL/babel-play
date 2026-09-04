// @vitest-environment jsdom
/**
 * A SALA DE ESCOLHA — o menu que abre ao entrar em Jogar.
 *
 * A decisão de produto foi explícita e contra a minha recomendação: **a sala abre toda vez** que
 * se entra na tela. Ela só sobrevive a isso se for UM CLIQUE — última escolha pré-selecionada,
 * foco no botão, Enter resolve. Uma sala que exigisse preencher um formulário a cada visita seria
 * atrito novo no lugar do antigo.
 *
 * O que este arquivo trava:
 *  · fechar sem escolher NÃO muda nada (a sala não é um funil de mão única);
 *  · a trilha aparece SEMPRE, desabilitada **com o motivo** — escondê-la foi a causa literal do
 *    "faltou a parte de dar trilha";
 *  · idioma sem nada jogável vem bloqueado com o motivo, em vez de levar a uma tela vazia;
 *  · trocar o idioma na sala consulta a trilha DO IDIOMA SELECIONADO, não a do aplicado.
 *
 * "Não reabre ao voltar da partida" NÃO se prova aqui: essa garantia vive na montagem do `Play`
 * (`useState(!embutido)`, e `App.tsx` não mantém a view viva) e é o passo de Playwright do plano.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import SalaDeEscolha from '../src/components/minigames/SalaDeEscolha'
import type { EscolhaDaPratica } from '../src/core/minigames/source'
import type { AgeProfileType } from '../src/lib/profile'

afterEach(cleanup)

const IDIOMAS = [
  { lang: 'en', total: 1151, jogaveis: 621 },
  { lang: 'pt', total: 993, jogaveis: 0 },
]
const GRAVACOES = [
  { id: 's1', title: 'Reunião de segunda' },
  { id: 's2', title: 'Podcast de terça' },
]
/** Só existe trilha de inglês — é o estado real do projeto (`data/trilha/en.json`). */
const trilhaDe = (lang: string) =>
  lang === 'en' ? { niveis: ['A1', 'A2', 'B1'] as never[], total: 2784 } : { niveis: [], total: 0 }

function montar(escolha: Partial<EscolhaDaPratica> = {}, ageProfile: AgeProfileType = 'pro') {
  const aoConfirmar = vi.fn()
  const aoFechar = vi.fn()
  render(
    <SalaDeEscolha
      escolhaAtual={{ origem: 'gravacoes', escopo: 'todas', lang: 'en', ...escolha }}
      idiomas={IDIOMAS}
      dificeis={0}
      gravacoes={GRAVACOES}
      trilhaDe={trilhaDe}
      ageProfile={ageProfile}
      aoConfirmar={aoConfirmar}
      aoFechar={aoFechar}
    />,
  )
  return { aoConfirmar, aoFechar }
}

describe('a sala é um clique', () => {
  it('é um diálogo modal de verdade', () => {
    montar()
    const d = screen.getByRole('dialog')
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(d.getAttribute('aria-labelledby')).toBeTruthy()
  })

  it('abre com o foco no botão de confirmar — Enter resolve sem tocar em mais nada', () => {
    const { aoConfirmar } = montar({ lang: 'en', origem: 'gravacoes', escopo: 'todas' })
    /* O foco no botão é o que faz `Enter` bastar. Em jsdom o `Enter` nativo não vira clique
       (é comportamento do navegador, não do DOM), então o que dá para provar aqui é o foco —
       e que acionar o elemento focado confirma. */
    const confirmar = screen.getByRole('button', { name: /usar estas/i })
    expect(document.activeElement).toBe(confirmar)
    fireEvent.click(document.activeElement!)
    expect(aoConfirmar).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en', origem: 'gravacoes', escopo: 'todas' }),
    )
  })

  it('confirma a escolha GUARDADA, e não um padrão — é o que faz dela um clique só', () => {
    const { aoConfirmar } = montar({ origem: 'gravacoes', escopo: 'uma', sessionId: 's2' })
    fireEvent.click(screen.getByRole('button', { name: /usar estas/i }))
    expect(aoConfirmar).toHaveBeenCalledWith(expect.objectContaining({ escopo: 'uma', sessionId: 's2' }))
  })
})

describe('fechar sem escolher não muda nada', () => {
  it('Esc fecha e NÃO confirma', () => {
    const { aoConfirmar, aoFechar } = montar()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(aoFechar).toHaveBeenCalled()
    expect(aoConfirmar).not.toHaveBeenCalled()
  })

  it('o X fecha e NÃO confirma', () => {
    const { aoConfirmar, aoFechar } = montar()
    fireEvent.click(screen.getByRole('button', { name: /fechar sem mudar nada/i }))
    expect(aoFechar).toHaveBeenCalled()
    expect(aoConfirmar).not.toHaveBeenCalled()
  })

  it('mexer na sala e depois fechar continua sem confirmar — o estado local morre com ela', () => {
    const { aoConfirmar, aoFechar } = montar()
    fireEvent.click(screen.getByRole('radio', { name: /trilha/i }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(aoFechar).toHaveBeenCalled()
    expect(aoConfirmar).not.toHaveBeenCalled()
  })
})

describe('a trilha aparece sempre — com o motivo quando não dá', () => {
  it('em inglês, clicável e com o tamanho', () => {
    montar({ lang: 'en' })
    expect((screen.getByRole('radio', { name: /trilha/i }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByText('2784')).toBeTruthy()
  })

  it('em português, desabilitada — mas VISÍVEL e dizendo por quê', () => {
    montar({ lang: 'pt' })
    const trilha = screen.getByRole('radio', { name: /trilha/i })
    expect((trilha as HTMLButtonElement).disabled).toBe(true)
    expect(trilha.getAttribute('title')).toMatch(/ainda não existe trilha em português/i)
  })

  it('trocar o idioma NA SALA reavalia a trilha do idioma SELECIONADO', () => {
    /* O defeito que isto trava: a sala consultava o idioma APLICADO. Escolher inglês deixava a
       Trilha bloqueada com a frase "ainda não existe trilha em português" — recusando exatamente
       o que a pessoa acabou de pedir. */
    montar({ lang: 'pt' })
    expect((screen.getByRole('radio', { name: /trilha/i }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: /inglês/i }))
    expect((screen.getByRole('radio', { name: /trilha/i }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('os números são de material JOGÁVEL', () => {
  it('idioma sem nenhuma tradução vem bloqueado com o motivo, e não leva a uma tela vazia', () => {
    montar({ lang: 'en' })
    const pt = screen.getByRole('radio', { name: /português/i })
    expect((pt as HTMLButtonElement).disabled).toBe(true)
    expect(pt.getAttribute('title')).toMatch(/nenhuma com tradução/i)
  })

  it('"uma gravação" fica bloqueada com o motivo quando não há gravação nenhuma', () => {
    cleanup()
    render(
      <SalaDeEscolha
        escolhaAtual={{ origem: 'gravacoes', escopo: 'todas', lang: 'en' }}
        idiomas={IDIOMAS}
        dificeis={0}
        gravacoes={[]}
        trilhaDe={trilhaDe}
        ageProfile="pro"
        aoConfirmar={vi.fn()}
        aoFechar={vi.fn()}
      />,
    )
    const uma = screen.getByRole('radio', { name: /uma gravação/i })
    expect((uma as HTMLButtonElement).disabled).toBe(true)
    expect(uma.getAttribute('title')).toMatch(/ainda não tem gravações/i)
  })
})

describe('escolher uma gravação específica', () => {
  it('a lista só aparece depois de pedir "uma", e a escolha viaja na confirmação', () => {
    const { aoConfirmar } = montar()
    expect(screen.queryByRole('button', { name: /podcast de terça/i })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: /uma gravação/i }))
    fireEvent.click(screen.getByRole('button', { name: /podcast de terça/i }))
    fireEvent.click(screen.getByRole('button', { name: /usar estas/i }))

    expect(aoConfirmar).toHaveBeenCalledWith(
      expect.objectContaining({ origem: 'gravacoes', escopo: 'uma', sessionId: 's2' }),
    )
  })
})

describe('o botão primário diz o que faz', () => {
  /**
   * Ele se chamava "Jogar" e trazia um ícone de play, mas `confirmar` só emite `aoConfirmar`:
   * do outro lado, `aplicarEscolha` troca idioma e fonte e devolve a pessoa ao lobby, com nove
   * cartas para escolher. Prometer play e entregar troca de fonte era a quebra de promessa mais
   * cara da tela, porque acontecia no único gesto forte dela (achado F02).
   *
   * Não vira play de verdade porque a rodada é montada de `jogaveis`, derivado da fonte NOVA —
   * que só existe no render seguinte. Quem quer um clique até a partida usa o lobby.
   */
  it('não promete jogar, já que só aplica a escolha', () => {
    montar()
    expect(screen.queryByRole('button', { name: /^jogar$/i })).toBeNull()
    expect(screen.getByRole('button', { name: /usar estas/i })).toBeTruthy()
  })

  it('o perfil kids também não promete play', () => {
    montar({}, 'kids')
    // A asserção positiva importa: sem ela o teste passaria mesmo que a sala nem tivesse
    // renderizado o botão, que é como a primeira versão dele passou por acidente.
    expect(screen.getByRole('button', { name: /usar estas!/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^bora!?$/i })).toBeNull()
  })
})

describe('o rótulo da etapa segue a escala da trilha', () => {
  const porFrequencia = () => ({
    niveis: ['A1', 'A2'] as never[],
    total: 5727,
    porNivel: { A1: 955, A2: 955 },
    escala: 'frequencia' as const,
  })

  it('trilha por frequência não escreve A1 na tela', () => {
    render(
      <SalaDeEscolha
        escolhaAtual={{ origem: 'trilha', escopo: 'todas', lang: 'es' }}
        idiomas={[{ lang: 'es', total: 10, jogaveis: 10 }]}
        dificeis={0}
        gravacoes={[]}
        trilhaDe={porFrequencia}
        ageProfile="pro"
        aoConfirmar={vi.fn()}
        aoFechar={vi.fn()}
      />,
    )
    expect(screen.getByText(/Faixa de frequência da trilha/)).toBeTruthy()
    expect(screen.getByText(/não níveis do CEFR/)).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /^A1/ })).toBeNull()
  })

  it('trilha CEFR continua dizendo Nível e A1', () => {
    montar({ origem: 'trilha' })
    expect(screen.getByText(/Nível da trilha/)).toBeTruthy()
    expect(screen.queryByText(/não níveis do CEFR/)).toBeNull()
  })
})

describe('a tabela de cobertura por idioma', () => {
  it('vem recolhida e diz o que cada idioma tem', () => {
    montar()
    const resumo = screen.getByText('O que cada idioma tem hoje')
    expect(resumo.closest('details')?.open).toBe(false)
    fireEvent.click(resumo)
    expect(screen.getByText('Trilha por nível')).toBeTruthy()
    expect(screen.getAllByText('Só o seu conteúdo').length).toBeGreaterThan(0)
  })
})
