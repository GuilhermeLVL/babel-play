/**
 * TRADUÇÃO INCREMENTAL na legenda (V3 `traducao_incremental`, tarefa 4.2): com `{ incremental, textoConfirmado }` o
 * parcial traduz SÓ o prefixo confirmado, como parcial (local, nunca nuvem), com mask-k; o final fica intocado e
 * substitui. Sem a opção, nada muda.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ managedCloudLlm: true }) }))

import type { GatewayDaCaptura, SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { criarTraducaoDaFala } from '../src/lib/captura/traducaoDaFala'
import { OrdemDasTraducoes } from '../src/lib/ordemDaTraducao'
import { PerfilAdaptativoDeIdioma } from '../src/lib/perfilDeIdioma'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))

type Opcoes = { parcial?: boolean; nuvemPrimeiro?: boolean; escalarSeRuim?: boolean }

function montar(traduzir: (texto: string, o: Opcoes) => Promise<{ text: string; engine: string }>) {
  let segs: SpeechSegment[] = [
    {
      id: 'a',
      speakerId: 'user',
      source: 'mic',
      timestamp: '00:00',
      originalText: 'onde fica a estação de trem aqui perto',
      translatedText: '…',
      isPartial: true,
      words: [],
    },
  ]
  const translate = vi.fn((texto: string, _o: string | null, _t: string, o: Opcoes) => traduzir(texto, o))
  const traducao = criarTraducaoDaFala({
    gateway: { mt: { translate } } as unknown as GatewayDaCaptura,
    ordemMtRef: ref(new OrdemDasTraducoes()),
    sourceLangRef: ref('pt'),
    targetLangRef: ref('en'),
    idiomaObservadoRef: ref(''),
    perfilIdiomaRef: ref(new PerfilAdaptativoDeIdioma()),
    speechSegmentsRef: {
      get current() {
        return segs
      },
    },
    translationCacheRef: ref(new Map<string, string>()),
    mtFailNotifiedRef: ref(false),
    altTargetNotifiedRef: ref(false),
    degradacaoAvisadaRef: ref(false),
    setSpeechSegments: (u) => {
      segs = typeof u === 'function' ? u(segs) : u
    },
    setFeedbackMsg: () => undefined,
    memoriaPersistente: null,
  })
  return { traducao, translate, seg: () => segs[0] }
}

const INC = (textoConfirmado: string) => ({ falada: true, incremental: true, textoConfirmado })

describe('tradução incremental do parcial', () => {
  it('traduz só o confirmado, como parcial (sem nuvem, sem escalar) e mostra com mask-k', async () => {
    const m = montar(async () => ({ text: 'where is the train station', engine: 'opus-mt-local' }))
    await m.traducao.translateSegment(
      'a',
      'texto inteiro que NÃO deve ir',
      'pt',
      'en',
      INC('onde fica a estação de trem'),
    )
    await esperar()
    const [texto, , , o] = m.translate.mock.calls[0]
    expect(texto).toBe('onde fica a estação de trem')
    expect(o.parcial).toBe(true)
    expect(o.escalarSeRuim).toBe(false)
    expect(m.seg().translatedText).toBe('Where is the')
  })

  it('o prefixo cresce: a tela avança; um prefixo que traduz mais curto não regride', async () => {
    const respostas = ['where is the train station', 'where is the train station near here', 'where is']
    const m = montar(async () => ({ text: respostas.shift() as string, engine: 'opus-mt-local' }))
    await m.traducao.translateSegment('a', '', 'pt', 'en', INC('onde fica a estação de trem'))
    await esperar()
    expect(m.seg().translatedText).toBe('Where is the')
    await m.traducao.translateSegment('a', '', 'pt', 'en', INC('onde fica a estação de trem aqui perto'))
    await esperar()
    expect(m.seg().translatedText).toBe('Where is the train station')
    await m.traducao.translateSegment('a', '', 'pt', 'en', INC('onde fica a estação de trem aqui perto agora'))
    await esperar()
    expect(m.seg().translatedText).toBe('Where is the train station')
  })

  it('motor local não carregado (o gateway devolve vazio): o parcial fica sem tradução, sem degradar', async () => {
    const m = montar(async () => ({ text: '', engine: '' }))
    await m.traducao.translateSegment('a', '', 'pt', 'en', INC('onde fica a estação de trem'))
    await esperar()
    expect(m.seg().translatedText).toBe('…')
    expect(m.seg().semTraducao).toBeUndefined()
  })

  it('motor ainda carregando (erro do motor): sem tradução e sem pendência de final', async () => {
    const m = montar(async () => {
      throw Object.assign(new Error('carregando'), { name: 'MotorAindaCarregando' })
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await m.traducao.translateSegment('a', '', 'pt', 'en', INC('onde fica a estação de trem'))
    await esperar()
    expect(m.seg().translatedText).toBe('…')
    expect(m.seg().semTraducao).toBeUndefined()
  })

  it('textoConfirmado vazio: nada é pedido', async () => {
    const m = montar(async () => ({ text: 'x', engine: 'opus-mt-local' }))
    await m.traducao.translateSegment('a', 'onde fica', 'pt', 'en', INC('  '))
    expect(m.translate).not.toHaveBeenCalled()
  })

  it('o final (sem a opção) é a tradução de sempre e substitui a provisória', async () => {
    const m = montar(async (_t, o) =>
      o.parcial
        ? { text: 'where is the train station', engine: 'opus-mt-local' }
        : { text: 'where is the train station around here', engine: 'server-llm-mt' },
    )
    await m.traducao.translateSegment('a', '', 'pt', 'en', INC('onde fica a estação de trem'))
    await esperar()
    // o pipeline passa a parcial para `traducaoProvisoria` e volta o balão a "…" quando o final chega
    await m.traducao.translateSegment('a', 'onde fica a estação de trem aqui perto', 'pt', 'en', { falada: true })
    await esperar()
    const [texto, , , o] = m.translate.mock.calls[1]
    expect(texto).toBe('onde fica a estação de trem aqui perto')
    expect(o.parcial).toBe(false)
    expect(m.seg().translatedText).toBe('Where is the train station around here')
    expect(m.seg().traducaoProvisoria).toBeUndefined()
  })

  it('sem a opção, o parcial é o de hoje: texto inteiro, sem máscara', async () => {
    const m = montar(async () => ({ text: 'where is the train station', engine: 'opus-mt-local' }))
    await m.traducao.translateSegment('a', 'onde fica a estação de trem', 'pt', 'en', {
      falada: true,
      descartarSeOcupado: true,
    })
    await esperar()
    expect(m.translate.mock.calls[0][0]).toBe('onde fica a estação de trem')
    expect(m.seg().translatedText).toBe('Where is the train station')
  })
})
