/**
 * A TRADUÇÃO PARCIAL QUE FICA ATÉ A DO FINAL (`traducaoProvisoria`).
 *
 * Quando o final de uma fala chega, o balão volta a "…" e a tela voltava ao original para trocar de novo
 * quando a tradução do final chegava: três trocas por fala. Agora a parcial fica à parte e a legenda a
 * mostra só enquanto o balão está em "…":
 *   - a regra da tela (`traducaoNaLegenda`): nunca a parcial no lugar de uma tradução, de uma falha ou
 *     de uma espera do tradutor;
 *   - o motor a apaga quando a tradução do final assenta ou degrada, para ela não sair da captura.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ managedCloudLlm: false }) }))

import type { GatewayDaCaptura, SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { criarTraducaoDaFala, ehTraducaoParcial, traducaoNaLegenda } from '../src/lib/captura/traducaoDaFala'
import { OrdemDasTraducoes } from '../src/lib/ordemDaTraducao'
import { PerfilAdaptativoDeIdioma } from '../src/lib/perfilDeIdioma'

const ref = <T>(current: T) => ({ current })
const esperar = () => new Promise((r) => setTimeout(r, 0))

describe('traducaoNaLegenda', () => {
  it('a tradução da fala é a que vale', () => {
    expect(traducaoNaLegenda({ translatedText: ' Olá ', traducaoProvisoria: 'Oi' })).toEqual({
      texto: 'Olá',
      provisoria: false,
    })
  })
  it('em "…": a parcial que a tela já tinha, marcada como provisória; sem ela, nada', () => {
    expect(traducaoNaLegenda({ translatedText: '…', traducaoProvisoria: 'Oi' })).toEqual({
      texto: 'Oi',
      provisoria: true,
    })
    expect(traducaoNaLegenda({ translatedText: '…' })).toEqual({ texto: '', provisoria: false })
  })
  it('falha (original entre parênteses), mesmo idioma (vazio) e tradutor carregando: a parcial não aparece', () => {
    expect(traducaoNaLegenda({ translatedText: '(hello)', traducaoProvisoria: 'Oi' }).texto).toBe('(hello)')
    expect(traducaoNaLegenda({ translatedText: '', traducaoProvisoria: 'Oi' }).texto).toBe('')
    expect(traducaoNaLegenda({ translatedText: '…', traducaoProvisoria: 'Oi', traducaoPendente: true }).texto).toBe('')
  })
  it('"…" e vazio não são tradução parcial', () => {
    expect(ehTraducaoParcial('…')).toBe(false)
    expect(ehTraducaoParcial('  ')).toBe(false)
    expect(ehTraducaoParcial('Onde fica')).toBe(true)
  })
})

function montar(translate: (texto: string) => Promise<{ text: string; engine: string }>) {
  let segs: SpeechSegment[] = [
    {
      id: 'a',
      speakerId: 'user',
      source: 'mic',
      timestamp: '00:00',
      originalText: 'onde fica a estação',
      translatedText: '…',
      traducaoProvisoria: 'Where is',
      words: [],
    },
  ]
  const traducao = criarTraducaoDaFala({
    gateway: { mt: { translate: vi.fn(translate) } } as unknown as GatewayDaCaptura,
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
  return { traducao, seg: () => segs[0] }
}

describe('o motor apaga a provisória quando a tradução do final se resolve', () => {
  it('traduziu: a tradução do final entra e a provisória some', async () => {
    const m = montar(async () => ({ text: 'where is the station', engine: 'opus-mt-local' }))
    await m.traducao.translateSegment('a', 'onde fica a estação', 'pt', 'en', { falada: true })
    await esperar()
    expect(m.seg().translatedText).toBe('Where is the station')
    expect(m.seg().traducaoProvisoria).toBeUndefined()
  })

  it('falhou: o original entre parênteses (o de sempre), sem a parcial velha', async () => {
    const m = montar(async () => {
      throw new Error('sem tradutor')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await m.traducao.translateSegment('a', 'onde fica a estação', 'pt', 'en', { falada: true })
    await esperar()
    expect(m.seg().translatedText).toBe('(onde fica a estação)')
    expect(m.seg().traducaoProvisoria).toBeUndefined()
    expect(traducaoNaLegenda(m.seg()).texto).toBe('(onde fica a estação)')
  })
})
