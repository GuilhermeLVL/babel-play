// @vitest-environment jsdom
/**
 * O AVISO DO FIM DA CAPTURA TEM SAÍDA (relato do dono, 2026-09-28: "fico preso na tela").
 *
 * Antes do teto, e depois de uma recusa, a tela mostra o motivo e saídas que funcionam na edição
 * em que a pessoa está: na estática não existe "Criar conta"; nas duas dá para apagar uma gravação
 * antiga ali mesmo. A captura recusada tem "Tentar de novo", "Baixar" e "Descartar", e descartar
 * pede confirmação — é a única saída que perde alguma coisa.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CapturaNaoSalva from '../src/components/views/captura/CapturaNaoSalva'
import type { Recording } from '../src/types'

const gravacoes: Recording[] = [
  { id: 'g1', title: 'Aula antiga', date: 'Ontem', durationStr: '1:00', wordCount: 10, type: 'audio', tags: [], status: 'Processado' },
]

const base = { gravacoes, teto: 20, aoApagarGravacao: vi.fn(async () => true) }

afterEach(() => cleanup())

describe('antes de gravar, no teto', () => {
  it('edição estática: o limite de 20, apagar uma antiga, e nenhum "Criar conta"', async () => {
    render(<CapturaNaoSalva {...base} modo="teto" estatica aoCriarConta={vi.fn()} />)
    expect(screen.getByText(/guarda até 20 gravações/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Criar conta/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Apagar uma gravação antiga/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    fireEvent.click(screen.getByRole('button', { name: /Apagar de vez/ }))
    expect(base.aoApagarGravacao).toHaveBeenCalledWith('g1')
  })

  it('edição completa sem conta: "Criar conta (grátis)" chama o login', () => {
    const aoCriarConta = vi.fn()
    render(<CapturaNaoSalva {...base} teto={5} modo="teto" estatica={false} aoCriarConta={aoCriarConta} />)
    expect(screen.getByText(/guardar 5 gravações/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Criar conta \(grátis\)/ }))
    expect(aoCriarConta).toHaveBeenCalled()
  })
})

describe('captura recusada', () => {
  const rascunho = {
    origemLocalId: 'c1', resumeId: null, titulo: 'Aula nova', capa: '', durationMs: 1000, sourceLang: 'en', targetLang: 'pt',
    parConfigurado: { sourceLang: 'pt', targetLang: 'en' }, utterances: [{ idx: 0, sourceText: 'oi' }], criadoEm: 1,
  }

  it('mostra o que o servidor disse e as três saídas; descartar pede confirmação', () => {
    const aoTentarDeNovo = vi.fn()
    const aoBaixar = vi.fn()
    const aoDescartar = vi.fn()
    render(
      <CapturaNaoSalva
        {...base}
        modo="naoSalva"
        estatica={false}
        rascunho={rascunho}
        falha={{ mensagem: 'banco ocupado', status: 503, teto: false }}
        aoTentarDeNovo={aoTentarDeNovo}
        aoBaixar={aoBaixar}
        aoDescartar={aoDescartar}
      />,
    )
    expect(screen.getByText('banco ocupado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }))
    fireEvent.click(screen.getByRole('button', { name: /Baixar esta sessão/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(aoDescartar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Descartar de vez/ }))
    expect([aoTentarDeNovo, aoBaixar, aoDescartar].map((f) => f.mock.calls.length)).toEqual([1, 1, 1])
    // Não é teto: apagar gravação antiga não resolve nada e não aparece.
    expect(screen.queryByRole('button', { name: /Apagar uma gravação antiga/ })).toBeNull()
  })

  it('recusa pelo teto: o texto do limite e o apagar uma antiga junto das saídas', () => {
    render(
      <CapturaNaoSalva
        {...base}
        modo="naoSalva"
        estatica
        rascunho={rascunho}
        falha={{ mensagem: 'x', status: 507, codigo: 'TETO_ANONIMO', teto: true }}
        aoTentarDeNovo={vi.fn()}
        aoBaixar={vi.fn()}
        aoDescartar={vi.fn()}
      />,
    )
    expect(screen.getByText(/guarda até 20 gravações/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Apagar uma gravação antiga/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Baixar esta sessão/ })).toBeTruthy()
  })
})
