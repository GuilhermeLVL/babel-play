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

const rotas = vi.hoisted(() => ({ navegarPara: vi.fn() }))
vi.mock('../src/lib/rotas', async (original) => {
  const real = await original<typeof import('../src/lib/rotas')>()
  return { ...real, navegarPara: rotas.navegarPara }
})

import CapturaNaoSalva from '../src/components/views/captura/CapturaNaoSalva'
import type { Recording } from '../src/types'

const gravacoes: Recording[] = [
  { id: 'g1', title: 'Aula antiga', date: 'Ontem', durationStr: '1:00', wordCount: 10, type: 'audio', tags: [], status: 'Processado' },
]

const base = { gravacoes, teto: 20, aoApagarGravacao: vi.fn(async () => true) }

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  rotas.navegarPara.mockClear()
})

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

describe('espaço de armazenamento cheio (507 storage_quota_exceeded)', () => {
  const rascunho = {
    origemLocalId: 'c2', resumeId: null, titulo: 'Aula cheia', capa: '', durationMs: 1000, sourceLang: 'en', targetLang: 'pt',
    parConfigurado: { sourceLang: 'pt', targetLang: 'en' }, utterances: [{ idx: 0, sourceText: 'oi' }], criadoEm: 1,
  }

  it('diz que o espaço acabou e "Ver planos" leva a Planos', () => {
    render(
      <CapturaNaoSalva
        {...base}
        modo="naoSalva"
        estatica={false}
        rascunho={rascunho}
        falha={{ mensagem: 'armazenamento cheio: 500 MB de 500 MB usados.', status: 507, codigo: 'storage_quota_exceeded', teto: false, cheio: true }}
        aoTentarDeNovo={vi.fn()}
        aoBaixar={vi.fn()}
        aoDescartar={vi.fn()}
      />,
    )
    expect(screen.getByText(/seu espaço de armazenamento está cheio/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Ver planos/ }))
    expect(rotas.navegarPara).toHaveBeenCalledWith({ view: 'planos' })
  })

  it('outra recusa não mostra "Ver planos"', () => {
    render(
      <CapturaNaoSalva {...base} modo="naoSalva" estatica={false} rascunho={rascunho} falha={{ mensagem: 'x', status: 503, teto: false }} />,
    )
    expect(screen.queryByRole('button', { name: /Ver planos/ })).toBeNull()
  })
})

describe('edição estática no teto: a saída para a versão completa (VITE_URL_APP_COMPLETO)', () => {
  it('com a URL: link primário para criar a conta na versão completa, em nova aba e sem opener', () => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
    vi.stubEnv('VITE_URL_APP_COMPLETO', 'https://app.exemplo.com.br')
    render(<CapturaNaoSalva {...base} modo="teto" estatica />)
    const link = screen.getByRole('link', { name: /Criar conta na versão completa/ })
    expect(link.getAttribute('href')).toBe('https://app.exemplo.com.br')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('sem a URL: nada novo (o comportamento de antes)', () => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
    render(<CapturaNaoSalva {...base} modo="teto" estatica />)
    expect(screen.queryByRole('link', { name: /versão completa/ })).toBeNull()
  })

  it('na edição completa a URL não muda nada (lá o botão é o login)', () => {
    vi.stubEnv('VITE_URL_APP_COMPLETO', 'https://app.exemplo.com.br')
    render(<CapturaNaoSalva {...base} modo="teto" estatica={false} aoCriarConta={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /versão completa/ })).toBeNull()
  })
})
