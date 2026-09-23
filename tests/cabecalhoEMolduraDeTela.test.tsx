// @vitest-environment jsdom
/**
 * Os moldes da Fundação (Tela, CabecalhoDeTela, TituloDeSecao, IconeEmBloco) valem pela ESTRUTURA:
 * um só `h1` por tela, sobrancelha acima dele, "voltar" como botão de verdade (teclado e leitor de
 * tela), títulos de seção no nível pedido e o ícone decorativo fora da árvore de acessibilidade.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CabecalhoDeTela from '../src/components/ui/CabecalhoDeTela'
import IconeEmBloco from '../src/components/ui/IconeEmBloco'
import Tela from '../src/components/ui/Tela'
import TituloDeSecao from '../src/components/ui/TituloDeSecao'

afterEach(cleanup)

describe('Tela', () => {
  it('limita a largura conforme o molde', () => {
    const { container, rerender } = render(<Tela largura="larga">x</Tela>)
    expect(container.querySelector('.max-w-6xl')).not.toBeNull()
    rerender(<Tela largura="estreita">x</Tela>)
    expect(container.querySelector('.max-w-4xl')).not.toBeNull()
  })
})

describe('CabecalhoDeTela', () => {
  it('tem um único h1, com sobrancelha e subtítulo', () => {
    render(<CabecalhoDeTela icone={Sparkles} sobrancelha="Seu estudo" titulo="Início" sub="Apoio" />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Início')
    expect(screen.getByText('Seu estudo')).toBeTruthy()
    expect(screen.getByText('Apoio')).toBeTruthy()
  })

  it('sem sobrancelha nem voltar, fica só o título', () => {
    const { container } = render(<CabecalhoDeTela titulo="Início" />)
    expect(container.querySelector('.label-mono')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('"voltar" é um botão que chama a ação', () => {
    const aoClicar = vi.fn()
    render(<CabecalhoDeTela titulo="Sessão" voltar={{ rotulo: 'Biblioteca', aoClicar }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Biblioteca' }))
    expect(aoClicar).toHaveBeenCalledOnce()
  })

  it('mostra ações e abas', () => {
    render(<CabecalhoDeTela titulo="T" acoes={<button>Nova</button>} abas={<nav>abas</nav>} />)
    expect(screen.getByRole('button', { name: 'Nova' })).toBeTruthy()
    expect(screen.getByText('abas')).toBeTruthy()
  })
})

describe('TituloDeSecao', () => {
  it('usa h2 por padrão e h3 quando pedido', () => {
    const { rerender } = render(<TituloDeSecao titulo="Métricas" desc="Descrição" />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Métricas')
    expect(screen.getByText('Descrição')).toBeTruthy()
    rerender(<TituloDeSecao titulo="Métricas" nivel="h3" direita={<button>Ver</button>} />)
    expect(screen.getByRole('heading', { level: 3 })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver' })).toBeTruthy()
  })
})

describe('IconeEmBloco', () => {
  it('é decorativo e aplica o tom', () => {
    const { container } = render(<IconeEmBloco icone={Sparkles} tom="good" tamanho="lg" />)
    const bloco = container.firstElementChild as HTMLElement
    expect(bloco.getAttribute('aria-hidden')).toBe('true')
    expect(bloco.className).toContain('bg-good-soft')
    expect(bloco.className).toContain('w-12')
  })
})
