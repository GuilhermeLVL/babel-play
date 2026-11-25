/**
 * O ADAPTADOR LOCAL DA PRÉ-TRADUÇÃO nunca chama nuvem (openspec `pre-traducao-de-legendas`, D2).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ehMotorCarregando } from '../src/core/robustness'
import { preTraduzirLegenda } from '../src/core/traducao/preTraducaoDeLegendas'
import type { MtOptions, MtResult, TranslationProvider } from '../src/gateway/capabilities'
import { MOTORES_LOCAIS_DE_PRE_TRADUCAO, tradutorLocalDaPreTraducao } from '../src/gateway/preTraducaoLocal'

function falso(
  id: string,
  extra: Partial<TranslationProvider> & { engine?: string; pronto?: boolean } = {},
): TranslationProvider & { translate: ReturnType<typeof vi.fn> } {
  const translate = vi.fn(
    async (t: string, _s: string | null, _g: string, _o?: MtOptions): Promise<MtResult> => ({
      text: `T:${t}`,
      engine: extra.engine ?? id,
    }),
  )
  return {
    id,
    runtime: 'browser',
    cost: 'free',
    label: id,
    supports: () => extra.pronto ?? true,
    translate,
    ...extra,
  } as TranslationProvider & { translate: ReturnType<typeof vi.fn> }
}

afterEach(() => vi.restoreAllMocks())

describe('tradutorLocalDaPreTraducao', () => {
  it('só os dois motores locais existem na lista', () => {
    expect([...MOTORES_LOCAIS_DE_PRE_TRADUCAO].sort()).toEqual(['bergamot-local', 'opus-mt-local'])
  })

  it.each(['mymemory', 'server-llm-mt', 'chrome-translator', 'openai-compatible'])(
    'recusa o provedor %s na criação, sem traduzir nada',
    (id) => {
      const p = falso(id)
      expect(() => tradutorLocalDaPreTraducao(p, 'en', 'pt')).toThrow(/motor local/)
      expect(p.translate).not.toHaveBeenCalled()
    },
  )

  it('descarta a resposta de um motor que não é local (a fala vira falha, o texto não entra)', async () => {
    const p = falso('opus-mt-local', { engine: 'server-llm-mt' })
    const t = tradutorLocalDaPreTraducao(p, 'en', 'pt')
    await expect(t.traduzir('hi')).rejects.toThrow(/não local/)
    const r = await preTraduzirLegenda({ falas: ['hi'], traduzir: t.traduzir })
    expect(r.falas[0]?.traducao).toBeNull()
    expect(r.progresso.falhas).toBe(1)
  })

  it('não manda nuvemPrimeiro nem escalarSeRuim', async () => {
    const p = falso('bergamot-local')
    await tradutorLocalDaPreTraducao(p, 'pt', 'en').traduzir('oi')
    const opts = p.translate.mock.calls[0]?.[3] as MtOptions | undefined
    expect(opts?.nuvemPrimeiro).toBeUndefined()
    expect(opts?.escalarSeRuim).toBeUndefined()
    expect(p.translate).toHaveBeenCalledWith('oi', 'pt', 'en')
  })

  it('nunca toca a rede: fetch e XHR não são chamados em uma legenda inteira', async () => {
    const fetchEspiao = vi.fn()
    vi.stubGlobal('fetch', fetchEspiao)
    const p = falso('opus-mt-local')
    const r = await preTraduzirLegenda({
      falas: ['a', 'b', 'c'],
      traduzir: tradutorLocalDaPreTraducao(p, 'en', 'pt').traduzir,
    })
    vi.unstubAllGlobals()
    expect(r.estado).toBe('concluida')
    expect(fetchEspiao).not.toHaveBeenCalled()
  })

  it('par ainda baixando: MotorAindaCarregando (o núcleo para em aguardando-motor)', async () => {
    const p = falso('opus-mt-local', { pronto: false, carregando: () => true })
    const t = tradutorLocalDaPreTraducao(p, 'en', 'pt')
    expect(t.pronto()).toBe(false)
    await expect(t.traduzir('hi')).rejects.toSatisfy(ehMotorCarregando)
    const r = await preTraduzirLegenda({ falas: ['hi'], traduzir: t.traduzir })
    expect(r.estado).toBe('aguardando-motor')
    expect(p.translate).not.toHaveBeenCalled()
  })

  it('par sem motor local: erro simples, sem traduzir', async () => {
    const p = falso('opus-mt-local', { pronto: false, carregando: () => false })
    await expect(tradutorLocalDaPreTraducao(p, 'zz', 'pt').traduzir('hi')).rejects.toThrow(/não suporta/)
    expect(p.translate).not.toHaveBeenCalled()
  })

  it('aquecer só repassa ao preload do motor (o aviso do download é da tela)', () => {
    const preload = vi.fn()
    const p = falso('opus-mt-local', { preload })
    tradutorLocalDaPreTraducao(p, 'en', 'pt').aquecer()
    expect(preload).toHaveBeenCalledWith('en', 'pt', undefined)
  })
})
