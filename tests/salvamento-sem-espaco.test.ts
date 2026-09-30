// @vitest-environment jsdom
/**
 * O ESPAÇO CHEIO E O TETO DE PALAVRAS NÃO SOMEM EM SILÊNCIO (funil de 29/09).
 *
 *  - 507 `storage_quota_exceeded` ao gravar a sessão: a falha diz `cheio` (a tela mostra "Ver planos");
 *  - 507 no ÁUDIO da sessão: a sessão fica salva e a pessoa é avisada, com "Ver planos";
 *  - o teto de palavras sem conta (507 `TETO_ANONIMO` no vocabulário): o aviso tem "Criar conta" na
 *    edição completa e nenhuma ação na estática (lá não há conta a criar).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  criarSessaoEmLotes: vi.fn(),
  substituirFalasEmLotes: vi.fn(),
  updateSession: vi.fn(async () => null),
  patchSessionMeta: vi.fn(async () => null),
  uploadSessionAudio: vi.fn(async (..._a: unknown[]): Promise<string | null> => '/api/sessions/s1/audio'),
  bulkAddCards: vi.fn(async (cards: unknown[]) => ({ cards, skipped: [] }) as { cards: unknown[]; skipped: [] }),
}))
const avisos = vi.hoisted(() => ({
  warn: vi.fn((..._a: unknown[]) => 1),
  info: vi.fn((..._a: unknown[]) => 1),
  navegarPara: vi.fn(),
}))

vi.mock('../src/data/api', async (original) => {
  const real = await original<typeof import('../src/data/api')>()
  return { ...real, ...api }
})
vi.mock('../src/components/Toast', () => ({ toast: { warn: avisos.warn, info: avisos.info } }))
vi.mock('../src/lib/rotas', async (original) => {
  const real = await original<typeof import('../src/lib/rotas')>()
  return { ...real, navegarPara: avisos.navegarPara }
})

import { ErroDeSessao } from '../src/data/rotas/sessoes'
import type { RascunhoDaCaptura } from '../src/lib/captura/rascunhoDaCaptura'
import { salvarCaptura } from '../src/lib/captura/trabalhoDeSalvar'
import { EVENTO_PEDIR_CONTA } from '../src/lib/ofertas/eventos'

const REC = { id: 's1', title: 'Aula', date: 'Hoje', durationStr: '0:10', wordCount: 3, type: 'audio' as const, tags: [], status: 'Processado' as const }

let n = 0
function rascunho(): RascunhoDaCaptura {
  return {
    origemLocalId: `captura-espaco${++n}`,
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

const salvar = (audio?: Promise<Blob | null>) => {
  const r = rascunho()
  return salvarCaptura({
    origemLocalId: r.origemLocalId,
    titulo: r.titulo,
    preparar: async () => ({ rascunho: r }),
    audio,
    traduzir: async () => ({ text: 'x' }),
    aoSalvar: vi.fn(),
  })
}

type Acao = { label: string; onClick: () => void }
const acaoDoAviso = (texto: RegExp): Acao | undefined => {
  const chamada = avisos.warn.mock.calls.find((c) => texto.test(String(c[0])))
  expect(chamada, `aviso ${texto}`).toBeTruthy()
  return (chamada![1] as { action?: Acao } | undefined)?.action
}

beforeEach(() => {
  localStorage.clear()
  for (const f of [...Object.values(api), ...Object.values(avisos)]) f.mockClear()
  api.criarSessaoEmLotes.mockResolvedValue(REC)
})
afterEach(() => vi.unstubAllEnvs())

describe('armazenamento cheio', () => {
  it('507 ao gravar a sessão: a falha sai marcada como espaço cheio', async () => {
    api.criarSessaoEmLotes.mockRejectedValueOnce(
      new ErroDeSessao('armazenamento cheio: 500 MB de 500 MB usados.', 507, 'storage_quota_exceeded'),
    )
    const r = await salvar()
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.falha.cheio).toBe(true)
    expect(r.ok === false && r.falha.teto).toBe(false)
  })

  it('507 no áudio: a sessão fica salva e a pessoa é avisada, com "Ver planos"', async () => {
    api.uploadSessionAudio.mockImplementationOnce(async (...a: unknown[]) => {
      ;(a[2] as (r: { status: number; codigo?: string }) => void)({ status: 507, codigo: 'storage_quota_exceeded' })
      return null
    })
    const r = await salvar(Promise.resolve(new Blob(['x'], { type: 'audio/webm' })))
    expect(r.ok).toBe(true)
    const acao = acaoDoAviso(/O áudio desta sessão não coube no seu espaço/)
    expect(acao?.label).toBe('Ver planos')
    acao!.onClick()
    expect(avisos.navegarPara).toHaveBeenCalledWith({ view: 'planos' })
  })

  it('outra falha do áudio (rede, 5xx) não vira aviso de espaço', async () => {
    api.uploadSessionAudio.mockImplementationOnce(async (...a: unknown[]) => {
      ;(a[2] as (r: { status: number }) => void)({ status: 503 })
      return null
    })
    await salvar(Promise.resolve(new Blob(['x'])))
    expect(avisos.warn.mock.calls.some((c) => /não coube/.test(String(c[0])))).toBe(false)
  })
})

describe('teto de palavras sem conta', () => {
  const recusaDoTeto = () =>
    Object.assign(new Error('O limite de 80 palavras sem conta foi atingido.'), { status: 507, codigo: 'TETO_ANONIMO' })

  it('edição completa: o aviso tem "Criar conta", que pede o login', async () => {
    api.bulkAddCards.mockRejectedValueOnce(recusaDoTeto())
    const pediu = vi.fn()
    window.addEventListener(EVENTO_PEDIR_CONTA, pediu)
    const r = await salvar()
    window.removeEventListener(EVENTO_PEDIR_CONTA, pediu)
    expect(r.ok).toBe(true)
    const acao = acaoDoAviso(/O vocabulário não foi fichado/)
    expect(acao?.label).toBe('Criar conta')
    window.addEventListener(EVENTO_PEDIR_CONTA, pediu)
    acao!.onClick()
    window.removeEventListener(EVENTO_PEDIR_CONTA, pediu)
    expect(pediu).toHaveBeenCalledTimes(1)
  })

  it('edição estática: o mesmo aviso, sem ação (não há conta a criar)', async () => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
    api.bulkAddCards.mockRejectedValueOnce(recusaDoTeto())
    await salvar()
    expect(acaoDoAviso(/O vocabulário não foi fichado/)).toBeUndefined()
  })

  it('outra falha do vocabulário continua só no resumo, sem aviso extra', async () => {
    api.bulkAddCards.mockRejectedValueOnce(new Error('HTTP 500'))
    const r = await salvar()
    expect(r.ok && r.resumo).toMatch(/O vocabulário não foi fichado: HTTP 500/)
    expect(avisos.warn).not.toHaveBeenCalled()
  })
})
