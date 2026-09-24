import { describe, expect, it } from 'vitest'

import { montarTranscricao } from '../src/components/views/biblioteca/ExportarTranscricao'
import type { SessionTranscript } from '../src/data/api'

const fala = (o: Partial<SessionTranscript['utterances'][number]>) =>
  ({
    id: 'u',
    idx: 0,
    speakerName: null,
    source: 'tab',
    sourceLang: 'en',
    sourceText: '',
    targetLang: 'pt',
    translatedText: null,
    tStartMs: null,
    tEndMs: null,
    ...o,
  }) as SessionTranscript['utterances'][number]

const sessao = (utterances: SessionTranscript['utterances']) =>
  ({ session: { durationMs: 20_000 }, utterances }) as unknown as SessionTranscript

describe('Exportar a transcrição (B4)', () => {
  const t = sessao([
    fala({
      speakerName: 'Ana',
      sourceText: "Let's go over the roadmap.",
      translatedText: 'Vamos repassar o roteiro.',
      tStartMs: 4000,
      tEndMs: 8500,
    }),
    fala({ speakerName: 'Bruno', sourceText: 'Sure.', translatedText: 'Claro.', tStartMs: 9000 }),
  ])

  it('Markdown: título, tempo, falante e a tradução embaixo', () => {
    const md = montarTranscricao(t, 'Reunião', 'md', { trad: true, tempos: true })
    expect(md).toContain('# Reunião')
    expect(md).toContain("[00:04] **Ana:** Let's go over the roadmap.\n> Vamos repassar o roteiro.")
  })

  it('Texto sem tempos e sem tradução', () => {
    const txt = montarTranscricao(t, 'Reunião', 'txt', { trad: false, tempos: false })
    expect(txt).toContain("Ana: Let's go over the roadmap.")
    expect(txt).not.toContain('[00:04]')
    expect(txt).not.toContain('Vamos repassar')
  })

  it('SRT usa os tempos reais; sem fim gravado, a fala termina onde a próxima começa', () => {
    const srt = montarTranscricao(t, 'Reunião', 'srt', { trad: true, tempos: false })
    expect(srt).toContain('1\n00:00:04,000 --> 00:00:08,500\n')
    expect(srt).toContain('2\n00:00:09,000 --> 00:00:20,000\nSure.\nClaro.')
  })

  it('VTT tem o cabeçalho e o ponto nos milissegundos', () => {
    const vtt = montarTranscricao(t, 'Reunião', 'vtt', { trad: false, tempos: true })
    expect(vtt.startsWith('WEBVTT\n\n00:00:04.000 --> 00:00:08.500')).toBe(true)
  })
})
