/**
 * MESMO IDIOMA = UMA LINHA SÓ, SEM CHAMAR A TRADUÇÃO.
 *
 * Relato do dono: vídeo em português, origem "Detectar", destino Português (BR). Quando a origem
 * (escolhida ou detectada) e o destino são o mesmo idioma BASE (`pt` == `pt-BR`), não há o que
 * traduzir: a MT não é chamada (poupa o custo) e o balão fica só com o original — sem segunda linha
 * e sem o marcador "…" de tradução a caminho.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ managedCloudLlm: false }) }))

import type { GatewayDaCaptura, SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { criarTraducaoDaFala, marcadorDeTraducao, origemDaFala } from '../src/lib/captura/traducaoDaFala'
import { OrdemDasTraducoes } from '../src/lib/ordemDaTraducao'
import { PerfilAdaptativoDeIdioma } from '../src/lib/perfilDeIdioma'

const ref = <T>(current: T) => ({ current })

function montar(opts: { sourceLang: string; targetLang: string; observado?: string }) {
  let segs: SpeechSegment[] = [
    {
      id: 's1',
      speakerId: 'system',
      source: 'system',
      timestamp: '0:00',
      originalText: 'x',
      translatedText: '…',
      words: [],
    },
  ]
  const translate = vi.fn(async (texto: string, _src: string | null, _tgt: string, _o?: unknown) => ({
    text: `[mt] ${texto}`,
    engine: 'opus-mt-local',
  }))
  const avisos: string[] = []
  const { translateSegment } = criarTraducaoDaFala({
    gateway: { mt: { translate } } as unknown as GatewayDaCaptura,
    ordemMtRef: ref(new OrdemDasTraducoes()),
    sourceLangRef: ref(opts.sourceLang),
    targetLangRef: ref(opts.targetLang),
    idiomaObservadoRef: ref(opts.observado ?? ''),
    perfilIdiomaRef: ref(new PerfilAdaptativoDeIdioma()),
    speechSegmentsRef: ref(segs),
    translationCacheRef: ref(new Map<string, string>()),
    mtFailNotifiedRef: ref(false),
    altTargetNotifiedRef: ref(false),
    degradacaoAvisadaRef: ref(false),
    setSpeechSegments: (u) => {
      segs = typeof u === 'function' ? u(segs) : u
    },
    setFeedbackMsg: (m) => avisos.push(m),
  })
  const traducao = () => segs[0].translatedText
  return { translateSegment, translate, traducao, avisos }
}

const esperarMicrotarefas = () => new Promise((r) => setTimeout(r, 0))

describe('translateSegment: mesmo idioma', () => {
  it('"Detectar" achou pt e o destino é pt-BR: não chama a MT e o balão fica com uma linha só', async () => {
    // Mídia: `targetLang` = idioma do conteúdo (oculto quando "Detectar"), `sourceLang` = "Traduzir para".
    const m = montar({ sourceLang: 'pt-BR', targetLang: 'en', observado: 'pt' })
    m.translateSegment('s1', 'Alguns cruzeiros mostram Berlim.', 'pt', 'pt')
    await esperarMicrotarefas()
    expect(m.translate).not.toHaveBeenCalled()
    expect(m.traducao()).toBe('')
  })

  it('mesmo idioma detectado nesta fala, perfil ainda ouvindo: também não traduz', async () => {
    const m = montar({ sourceLang: 'pt-BR', targetLang: 'en' })
    m.translateSegment('s1', 'Bom dia a todos.', 'pt', 'pt')
    await esperarMicrotarefas()
    expect(m.translate).not.toHaveBeenCalled()
    expect(m.traducao()).toBe('')
  })

  it('en → en (par fixo igual): não traduz', async () => {
    const m = montar({ sourceLang: 'en', targetLang: 'en-US' })
    m.translateSegment('s1', 'Hello there.', 'en-US', 'en')
    await esperarMicrotarefas()
    expect(m.translate).not.toHaveBeenCalled()
    expect(m.traducao()).toBe('')
  })

  it('en → pt traduz normalmente', async () => {
    const m = montar({ sourceLang: 'pt-BR', targetLang: 'en', observado: 'en' })
    m.translateSegment('s1', 'Hello there.', 'en', 'pt')
    await esperarMicrotarefas()
    expect(m.translate).toHaveBeenCalledWith('Hello there.', 'en', 'pt', expect.anything())
    expect(m.traducao()).toBe('[mt] Hello there.')
  })

  it('es → pt traduz normalmente', async () => {
    const m = montar({ sourceLang: 'pt-BR', targetLang: 'es', observado: 'es' })
    m.translateSegment('s1', 'Hola a todos.', 'es', 'pt')
    await esperarMicrotarefas()
    expect(m.translate).toHaveBeenCalledWith('Hola a todos.', 'es', 'pt', expect.anything())
  })

  it('SUA fala (mic) pt → en continua traduzida mesmo com o sistema observado em pt', async () => {
    // Regressão a evitar: o idioma observado é o do SISTEMA; a sua fala tem a própria origem.
    const m = montar({ sourceLang: 'pt-BR', targetLang: 'en', observado: 'pt' })
    m.translateSegment('s1', 'Tudo bem com vocês?', 'pt', 'en', { falada: true })
    await esperarMicrotarefas()
    expect(m.translate).toHaveBeenCalled()
    expect(m.translate.mock.calls[0][2]).toBe('en')
  })
})

describe('origem da fala e marcador de tradução', () => {
  it('sistema: o perfil convergido prevalece sobre a detecção isolada; mic: a própria fala', () => {
    expect(origemDaFala('en', 'pt', false)).toBe('pt')
    expect(origemDaFala('en', '', false)).toBe('en')
    expect(origemDaFala('pt-BR', 'en', true)).toBe('pt')
  })

  it('"…" só quando vai haver tradução; mesmo idioma base → vazio (uma linha)', () => {
    expect(marcadorDeTraducao('pt', 'pt-BR')).toBe('')
    expect(marcadorDeTraducao('en', 'pt')).toBe('…')
    // Origem ainda desconhecida: pode haver tradução, mantém o marcador.
    expect(marcadorDeTraducao('', 'pt')).toBe('…')
  })
})
