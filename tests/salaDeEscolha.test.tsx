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

function montar(escolha: Partial<EscolhaDaPratica> = {}) {
  const aoConfirmar = vi.fn()
  const aoFechar = vi.fn()
  render(
    <SalaDeEscolha
      escolhaAtual={{ origem: 'gravacoes', escopo: 'todas', lang: 'en', ...escolha }}
      idiomas={IDIOMAS}
      gravacoes={GRAVACOES}
      trilhaDe={trilhaDe}
      ageProfile="pro"
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

  it('abre com o foco no botão de jogar — Enter resolve sem tocar em mais nada', () => {
    const { aoConfirmar } = montar({ lang: 'en', origem: 'gravacoes', escopo: 'todas' })
    /* O foco no botão é o que faz `Enter` bastar. Em jsdom o `Enter` nativo não vira clique
       (é comportamento do navegador, não do DOM), então o que dá para provar aqui é o foco —
       e que acionar o elemento focado confirma. */
    const jogar = screen.getByRole('button', { name: /^jogar/i })
    expect(document.activeElement).toBe(jogar)
    fireEvent.click(document.activeElement!)
    expect(aoConfirmar).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en', origem: 'gravacoes', escopo: 'todas' }),
    )
  })

  it('confirma a escolha GUARDADA, e não um padrão — é o que faz dela um clique só', () => {
    const { aoConfirmar } = montar({ origem: 'gravacoes', escopo: 'uma', sessionId: 's2' })
    fireEvent.click(screen.getByRole('button', { name: /^jogar/i }))
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
    fireEvent.click(screen.getByRole('button', { name: /^jogar/i }))

    expect(aoConfirmar).toHaveBeenCalledWith(
      expect.objectContaining({ origem: 'gravacoes', escopo: 'uma', sessionId: 's2' }),
    )
  })
})
