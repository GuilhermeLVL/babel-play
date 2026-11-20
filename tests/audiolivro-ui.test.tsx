// @vitest-environment jsdom
/**
 * A TELA DO AUDIOLIVRO (F2): o chip "Voz sintetizada" (sempre que a frase sai do áudio gravado, sem fechar), a porta
 * que decide se o livro aberto tem áudio para ESTA pessoa (flag, catálogo, visibilidade: menor e livro a revisar não
 * fazem nenhuma requisição ao CDN) e o botão "Baixar este capítulo".
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/leitor/audiolivro/capituloOffline', () => ({
  tamanhoLegivel: (b: number) => `≈ ${Math.round(b / (1024 * 1024))} MB`,
  capituloBaixado: vi.fn(async () => false),
  baixarCapitulo: vi.fn(async (_url: string, aoProgredir?: (f: number) => void) => {
    aoProgredir?.(0.5)
    aoProgredir?.(1)
  }),
  apagarCapitulo: vi.fn(async () => {}),
}))

import BarraDoNarrador from '../src/components/views/leitor/BarraDoNarrador'
import BotaoBaixarCapitulo from '../src/components/views/leitor/BotaoBaixarCapitulo'
import ChipVozSintetizada from '../src/components/views/leitor/ChipVozSintetizada'
import { OPCOES_PADRAO_DA_NARRACAO } from '../src/core/leitura/estilosDeLeitura'
import type { AudioDoCatalogo } from '../src/core/livros/tipos'
import * as offline from '../src/lib/leitor/audiolivro/capituloOffline'
import { audiolivroDoLivro } from '../src/lib/leitor/audiolivroDoLivro'
import type { VistaDoNarrador } from '../src/lib/leitor/narrador'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const vista = (gravado: boolean): VistaDoNarrador => ({
  fase: 'tocando',
  indice: 3,
  total: 22,
  frase: 'Uma frase.',
  opcoes: OPCOES_PADRAO_DA_NARRACAO,
  sono: null,
  gravado,
})

const barra = (gravado: boolean) =>
  render(
    <BarraDoNarrador
      vista={vista(gravado)}
      narrador={null}
      ajustesAbertos={false}
      aoAlternar={() => {}}
      aoAjustes={() => {}}
      aoParar={() => {}}
    />,
  )

describe('o chip "Voz sintetizada"', () => {
  it('é um status acessível, sem botão de fechar', () => {
    render(<ChipVozSintetizada />)
    const chip = screen.getByRole('status', { name: 'Voz sintetizada' })
    expect(chip.textContent).toContain('Voz sintetizada')
    expect(chip.querySelector('button')).toBeNull()
  })

  it('aparece na barra sempre que a frase sai do áudio gravado, e só então', () => {
    barra(true)
    expect(screen.getByRole('status', { name: 'Voz sintetizada' })).toBeTruthy()
    cleanup()
    barra(false)
    expect(screen.queryByRole('status', { name: 'Voz sintetizada' })).toBeNull()
  })
})

describe('audiolivroDoLivro: quem ouve o áudio gravado', () => {
  const AUDIO: AudioDoCatalogo = { voz: 'F1', versao: 1, capitulos: 1, horas: 0.04 }
  const livro = { id: 'ws-pt-dom-casmurro', classificacao: '12', audio: AUDIO }
  const montar = (o: { flag?: boolean; teto?: string; origem?: string; livroId?: string; livros?: unknown[] } = {}) => {
    const fetchEspiado = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchEspiado)
    const catalogo = vi.fn(async () => ({ livros: (o.livros ?? [livro]) as never[] }))
    const abrir = vi.fn(async () => ({ ok: true }) as never)
    const p = audiolivroDoLivro({
      livroId: o.livroId ?? 'cat:ws-pt-dom-casmurro',
      origem: o.origem ?? 'catalogo',
      flagLigada: o.flag ?? true,
      teto: (o.teto ?? '18') as never,
      catalogo,
      abrir,
    })
    return { p, catalogo, abrir, fetchEspiado }
  }

  it('flag ligada, livro do catálogo com áudio, visível: abre o áudio do livro', async () => {
    const m = montar()
    expect(await m.p).toEqual({ ok: true })
    expect(m.abrir).toHaveBeenCalledWith('ws-pt-dom-casmurro', AUDIO)
  })

  it('perfil de menor / livro não visível: nada é aberto e nenhuma requisição sai', async () => {
    for (const caso of [{ teto: 'livre' }, { livros: [{ ...livro, classificacao: null }], teto: '16' }]) {
      const m = montar(caso)
      expect(await m.p).toBeNull()
      expect(m.abrir).not.toHaveBeenCalled()
      expect(m.fetchEspiado).not.toHaveBeenCalled()
    }
  })

  it('flag desligada ou livro da pessoa: nem o catálogo é lido', async () => {
    for (const caso of [{ flag: false }, { origem: 'usuario' }, { livroId: 'meu-123' }]) {
      const m = montar(caso)
      expect(await m.p).toBeNull()
      expect(m.catalogo).not.toHaveBeenCalled()
      expect(m.abrir).not.toHaveBeenCalled()
    }
  })

  it('livro sem áudio publicado, ou fora do catálogo: nada é aberto', async () => {
    for (const livros of [[{ ...livro, audio: undefined }], []]) {
      const m = montar({ livros })
      expect(await m.p).toBeNull()
      expect(m.abrir).not.toHaveBeenCalled()
    }
  })

  it('catálogo ou abertura que falham viram null (o narrador local lê)', async () => {
    const r = await audiolivroDoLivro({
      livroId: 'cat:ws-pt-dom-casmurro',
      origem: 'catalogo',
      flagLigada: true,
      teto: '18',
      catalogo: async () => {
        throw new Error('sem rede')
      },
      abrir: vi.fn(),
    })
    expect(r).toBeNull()
  })
})

describe('BotaoBaixarCapitulo', () => {
  it('mostra o tamanho antes, diz que fica só no aparelho, baixa com progresso e oferece apagar', async () => {
    render(<BotaoBaixarCapitulo url="https://cdn/1/01.opus" bytes={6 * 1024 * 1024} minutos={2} />)
    const botao = await screen.findByRole('button', { name: 'Baixar este capítulo (≈ 6 MB)' })
    expect(screen.getByText('Ele fica só neste aparelho e você apaga quando quiser.')).toBeTruthy()
    expect(botao.className.split(' ')).toContain('leitor-alvo') // alvo ≥ 44 px (leitor.css)
    const progresso = document.querySelector('[aria-live="polite"]')
    expect(progresso).toBeTruthy()
    fireEvent.click(botao)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apagar do aparelho' })).toBeTruthy())
    expect(offline.baixarCapitulo).toHaveBeenCalledWith('https://cdn/1/01.opus', expect.any(Function))
    expect(progresso!.textContent).toContain('Capítulo baixado')
    fireEvent.click(screen.getByRole('button', { name: 'Apagar do aparelho' }))
    await waitFor(() => expect(offline.apagarCapitulo).toHaveBeenCalledWith('https://cdn/1/01.opus'))
    await screen.findByRole('button', { name: 'Baixar este capítulo (≈ 6 MB)' })
  })
})
