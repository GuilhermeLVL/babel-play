// @vitest-environment jsdom
/**
 * O SALVAMENTO DA CAPTURA COMO TRABALHO DO MÓDULO (relato do dono, 2026-09-28: "encerrar demora,
 * trava e eu fico preso na tela").
 *
 * O que se trava aqui, sem tela:
 *  - o texto é salvo SEM esperar o áudio: o áudio que não chega no prazo não segura nada;
 *  - `aoSalvar` (a navegação do App) roda assim que as falas estão guardadas;
 *  - duas chamadas para a mesma captura são UM salvamento (clique duplo, "Salvar" repetido);
 *  - a recusa vira `falhou` com o texto e o código, e o rascunho fica guardado para tentar de novo;
 *  - o teto sem conta é reconhecido (`teto: true`);
 *  - repetir a partir do rascunho reusa o mesmo `origemLocalId` e apaga o rascunho no sucesso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  criarSessaoEmLotes: vi.fn(),
  substituirFalasEmLotes: vi.fn(),
  updateSession: vi.fn(async () => null),
  patchSessionMeta: vi.fn(async () => null),
  uploadSessionAudio: vi.fn(async () => '/api/sessions/s1/audio'),
  bulkAddCards: vi.fn(async (cards: unknown[]) => ({ cards, skipped: [] })),
}))

vi.mock('../src/data/api', async (original) => {
  const real = await original<typeof import('../src/data/api')>()
  return { ...real, ...api }
})

import { ErroDeSessao } from '../src/data/rotas/sessoes'
import { lerSalvamento } from '../src/lib/captura/estadoDoSalvamento'
import { lerRascunhos, type RascunhoDaCaptura } from '../src/lib/captura/rascunhoDaCaptura'
import { salvarCaptura, tentarDeNovo } from '../src/lib/captura/trabalhoDeSalvar'

const REC = { id: 's1', title: 'Aula', date: 'Hoje', durationStr: '0:10', wordCount: 3, type: 'audio' as const, tags: [], status: 'Processado' as const }

function rascunho(id = 'captura-aaaa0001'): RascunhoDaCaptura {
  return {
    origemLocalId: id,
    resumeId: null,
    titulo: 'Aula',
    capa: '',
    durationMs: 10_000,
    sourceLang: 'en',
    targetLang: 'pt-BR',
    parConfigurado: { sourceLang: 'pt-BR', targetLang: 'en' },
    utterances: [{ idx: 0, source: 'system', sourceLang: 'en', sourceText: 'good morning teacher', translatedText: 'bom dia' }],
    criadoEm: 1,
  }
}

const traduzir = vi.fn(async () => ({ text: 'x' }))

beforeEach(() => {
  localStorage.clear()
  for (const f of Object.values(api)) f.mockClear()
  api.criarSessaoEmLotes.mockResolvedValue(REC)
})
afterEach(() => vi.useRealTimers())

describe('salvarCaptura', () => {
  it('guarda o texto e navega sem esperar o áudio; o áudio que não chega no prazo é deixado', async () => {
    const aoSalvar = vi.fn()
    const audioQueNaoChega = new Promise<Blob | null>(() => {})
    const r = await salvarCaptura({
      origemLocalId: 'captura-aaaa0001',
      titulo: 'Aula',
      preparar: async () => ({ rascunho: rascunho() }),
      audio: audioQueNaoChega,
      prazoDoAudioMs: 30,
      traduzir,
      aoSalvar,
    })
    expect(r.ok).toBe(true)
    expect(aoSalvar).toHaveBeenCalledTimes(1)
    expect(api.criarSessaoEmLotes).toHaveBeenCalledWith(
      expect.objectContaining({ origemLocalId: 'captura-aaaa0001', kind: 'live', status: 'done', durationMs: 10_000 }),
      expect.any(Function),
    )
    expect(api.uploadSessionAudio).not.toHaveBeenCalled()
    expect(lerSalvamento()).toMatchObject({ fase: 'salvo', sessaoId: 's1' })
    expect(lerRascunhos()).toEqual([])
  })

  it('com áudio: sobe depois de navegar e avisa a gravação atualizada', async () => {
    const ordem: string[] = []
    const aoSalvar = vi.fn(() => ordem.push('navegou'))
    api.uploadSessionAudio.mockImplementationOnce(async () => {
      ordem.push('audio')
      return '/api/sessions/s1/audio'
    })
    const aoAtualizar = vi.fn()
    await salvarCaptura({
      origemLocalId: 'captura-aaaa0002',
      titulo: 'Aula',
      preparar: async () => ({ rascunho: rascunho('captura-aaaa0002') }),
      audio: Promise.resolve(new Blob(['a'], { type: 'audio/webm' })),
      traduzir,
      aoSalvar,
      aoAtualizar,
    })
    expect(ordem).toEqual(['navegou', 'audio'])
    expect(aoAtualizar).toHaveBeenCalledWith(expect.objectContaining({ id: 's1', audioUrl: '/api/sessions/s1/audio' }))
  })

  it('duas chamadas para a mesma captura são um salvamento só', async () => {
    const entrada = {
      origemLocalId: 'captura-aaaa0003',
      titulo: 'Aula',
      preparar: async () => ({ rascunho: rascunho('captura-aaaa0003') }),
      traduzir,
      aoSalvar: vi.fn(),
    }
    await Promise.all([salvarCaptura(entrada), salvarCaptura(entrada)])
    expect(api.criarSessaoEmLotes).toHaveBeenCalledTimes(1)
    expect(entrada.aoSalvar).toHaveBeenCalledTimes(1)
  })

  it('recusa do teto: falhou com o texto, teto=true, rascunho guardado e nada de navegar', async () => {
    api.criarSessaoEmLotes.mockRejectedValueOnce(
      new ErroDeSessao('Esta é a edição de demonstração: ela guarda até 20 gravações neste navegador.', 507, 'TETO_ANONIMO'),
    )
    const aoSalvar = vi.fn()
    const r = await salvarCaptura({
      origemLocalId: 'captura-aaaa0004',
      titulo: 'Aula',
      preparar: async () => ({ rascunho: rascunho('captura-aaaa0004') }),
      traduzir,
      aoSalvar,
    })
    expect(r.ok).toBe(false)
    expect(aoSalvar).not.toHaveBeenCalled()
    expect(lerSalvamento()).toMatchObject({
      fase: 'falhou',
      falha: { teto: true, status: 507, codigo: 'TETO_ANONIMO', mensagem: expect.stringContaining('20 gravações') },
    })
    expect(lerRascunhos().map((x) => x.origemLocalId)).toEqual(['captura-aaaa0004'])
  })

  it('tentar de novo reusa o mesmo origemLocalId e apaga o rascunho no sucesso', async () => {
    api.criarSessaoEmLotes.mockRejectedValueOnce(new ErroDeSessao('banco ocupado', 503))
    const base = { traduzir, aoSalvar: vi.fn() }
    await salvarCaptura({ ...base, origemLocalId: 'captura-aaaa0005', titulo: 'Aula', preparar: async () => ({ rascunho: rascunho('captura-aaaa0005') }) })
    const [guardado] = lerRascunhos()
    const r = await tentarDeNovo(guardado, base)
    expect(r.ok).toBe(true)
    const ids = api.criarSessaoEmLotes.mock.calls.map((c) => (c[0] as { origemLocalId: string }).origemLocalId)
    expect(ids).toEqual(['captura-aaaa0005', 'captura-aaaa0005'])
    expect(lerRascunhos()).toEqual([])
  })

  it('retomada: substitui as falas no MESMO id, sem criar sessão', async () => {
    api.substituirFalasEmLotes.mockResolvedValueOnce({ ...REC, id: 'antiga' })
    const aoSalvar = vi.fn()
    await salvarCaptura({
      origemLocalId: 'captura-aaaa0006',
      titulo: 'Aula',
      preparar: async () => ({ rascunho: { ...rascunho('captura-aaaa0006'), resumeId: 'antiga' } }),
      traduzir,
      aoSalvar,
    })
    expect(api.criarSessaoEmLotes).not.toHaveBeenCalled()
    expect(api.substituirFalasEmLotes).toHaveBeenCalledWith('antiga', expect.any(Array), expect.any(Function))
    expect(aoSalvar).toHaveBeenCalledWith(expect.objectContaining({ id: 'antiga' }))
  })

  it('o vocabulário é fichado a partir das falas e o número volta no estado', async () => {
    await salvarCaptura({
      origemLocalId: 'captura-aaaa0007',
      titulo: 'Aula',
      preparar: async () => ({ rascunho: rascunho('captura-aaaa0007') }),
      traduzir,
      aoSalvar: vi.fn(),
    })
    expect(api.bulkAddCards).toHaveBeenCalledTimes(1)
    const estado = lerSalvamento()
    expect(estado.fase === 'salvo' && estado.palavras).toBeGreaterThan(0)
  })
})
