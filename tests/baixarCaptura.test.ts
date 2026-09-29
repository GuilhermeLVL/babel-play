// @vitest-environment jsdom
/**
 * "BAIXAR ESTA SESSÃO" — a saída que não depende de servidor nem de conta (relato do dono,
 * 2026-09-28). Quando a captura não pode ser guardada (teto, rede), a pessoa leva a transcrição
 * num arquivo de texto legível, com o tempo e a tradução de cada fala, e o áudio quando houver.
 */
import { describe, expect, it, vi } from 'vitest'

import { baixarCaptura, nomeDoArquivo, textoDaCaptura } from '../src/lib/captura/baixarCaptura'
import type { RascunhoDaCaptura } from '../src/lib/captura/rascunhoDaCaptura'

const R: RascunhoDaCaptura = {
  origemLocalId: 'captura-x', resumeId: null, titulo: 'Aula de sexta', capa: '', durationMs: 65_000,
  sourceLang: 'en', targetLang: 'pt-BR', parConfigurado: { sourceLang: 'pt-BR', targetLang: 'en' },
  utterances: [
    { idx: 0, source: 'system', speakerName: 'Outros', sourceText: 'Good morning', translatedText: 'Bom dia', tStartMs: 0 },
    { idx: 1, source: 'mic', speakerName: 'Você', sourceText: 'Hi', translatedText: '', tStartMs: 61_000 },
  ],
  criadoEm: Date.UTC(2026, 8, 28, 12, 0),
}

describe('textoDaCaptura', () => {
  it('título, duração e cada fala com o tempo, quem falou e a tradução', () => {
    const t = textoDaCaptura(R)
    expect(t).toContain('Aula de sexta')
    expect(t).toContain('[00:00] Outros: Good morning')
    expect(t).toContain('  → Bom dia')
    expect(t).toContain('[01:01] Você: Hi')
    expect(t).not.toContain('→ \n')
  })
})

describe('nomeDoArquivo', () => {
  it('sem caractere que o sistema de arquivos recusa', () => {
    expect(nomeDoArquivo({ ...R, titulo: 'a/b:c*?' }, 'txt')).toMatch(/^babel-play-a-b-c-2026-09-28\.txt$/)
  })
})

describe('baixarCaptura', () => {
  it('baixa o texto e, com áudio, o áudio também', () => {
    const cliques: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      cliques.push(this.download)
    })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    baixarCaptura(R, new Blob(['a'], { type: 'audio/ogg; codecs=opus' }))
    expect(cliques).toEqual(['babel-play-aula-de-sexta-2026-09-28.txt', 'babel-play-aula-de-sexta-2026-09-28.ogg'])
  })
})
