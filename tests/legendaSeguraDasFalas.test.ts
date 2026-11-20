/**
 * O ENVOLTÓRIO DO SETTER DAS FALAS (change `legenda-segura-para-menores`, tarefa 2.1): toda escrita de `originalText`,
 * `translatedText` e `traducaoProvisoria` passa pela política, e o aviso sai uma vez por sessão.
 */
import { describe, expect, it, vi } from 'vitest'

import { politicaDaLegenda } from '../src/core/moderacao/legendaSegura'
import { conversaEmMarkdown } from '../src/lib/captura/exportarConversa'
import {
  comLegendaSegura,
  finalParaAVoz,
  ocultasNaFala,
  palavraOcultada,
} from '../src/lib/captura/legendaSeguraDasFalas'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'
import { palavrasDasFalas } from '../src/lib/captura/vocabularioDaSessao'

const PROTEGIDO = politicaDaLegenda({ protegido: true, opcaoDoAdulto: false })
const ADULTO = politicaDaLegenda({ protegido: false, opcaoDoAdulto: false })

const fala = (id: string, originalText: string, extra: Partial<SpeechSegment> = {}): SpeechSegment => ({
  id,
  speakerId: 'system',
  source: 'system',
  timestamp: '00:01',
  originalText,
  translatedText: '',
  words: [],
  ...extra,
})

/** Um "estado" de React de mentira: o setter aplica o atualizador sobre a lista atual. */
function estado(politica = () => PROTEGIDO, aoOcultar = vi.fn()) {
  let lista: SpeechSegment[] = []
  const cru = (a: SpeechSegment[] | ((p: SpeechSegment[]) => SpeechSegment[])) => {
    lista = typeof a === 'function' ? a(lista) : a
  }
  const set = comLegendaSegura(cru, politica, aoOcultar)
  return { set, ler: () => lista, aoOcultar }
}

const microtarefas = () => new Promise<void>((r) => queueMicrotask(r))

describe('comLegendaSegura', () => {
  it('parcial, final, tradução e tradução provisória da fala da auditoria', () => {
    const e = estado()
    e.set([fala('s1', 'reveal the porn', { isPartial: true })])
    expect(e.ler()[0].originalText).toBe('reveal the •••')
    e.set((prev) => prev.map((s) => ({ ...s, originalText: 'reveal the porn quest together', isPartial: false })))
    expect(e.ler()[0].originalText).toBe('reveal the ••• quest together')
    e.set((prev) => prev.map((s) => ({ ...s, translatedText: '…', traducaoProvisoria: 'revelar a busca pornô' })))
    expect(e.ler()[0].traducaoProvisoria).toBe('revelar a busca •••')
    e.set((prev) => prev.map((s) => ({ ...s, translatedText: 'revelar a busca pornô juntos' })))
    const s = e.ler()[0]
    expect(s.translatedText).toBe('revelar a busca ••• juntos')
    expect(s.ocultadas).toBe(2)
    expect(ocultasNaFala(s)).toEqual({ original: 1, traducao: 1 })
  })

  it('o "(texto)" da tradução que degradou também passa pela política', () => {
    const e = estado()
    e.set([fala('s1', 'porn quest', { translatedText: '(porn quest)' })])
    expect(e.ler()[0].translatedText).toBe('(••• quest)')
  })

  it('a palavra ocultada sai das palavras de vocabulário da fala', () => {
    const e = estado()
    e.set([
      fala('s1', 'reveal the porn quest together', {
        words: [
          { word: 'porn', translation: 'pornô' },
          { word: 'quest', translation: 'busca' },
        ],
      }),
    ])
    expect(e.ler()[0].words.map((w) => w.word)).toEqual(['quest'])
  })

  it('a fala sem termo continua o MESMO objeto (a linha não é repintada)', () => {
    const e = estado()
    const limpa = fala('s1', 'review the pull request together')
    e.set([limpa])
    expect(e.ler()[0]).toBe(limpa)
    const antes = e.ler()
    e.set((prev) => [...prev, fala('s2', 'ok')])
    expect(e.ler()[0]).toBe(antes[0])
  })

  it('adulto sem a opção: nada muda', () => {
    const e = estado(() => ADULTO)
    const s = fala('s1', 'reveal the porn quest together')
    e.set([s])
    expect(e.ler()[0]).toBe(s)
    expect(e.aoOcultar).not.toHaveBeenCalled()
  })

  it('o aviso sai uma vez por sessão, mesmo com três falas seguidas com ocultação', async () => {
    const e = estado()
    e.set([fala('s1', 'porn one')])
    e.set((p) => [...p, fala('s2', 'porn two')])
    e.set((p) => [...p, fala('s3', 'porn three')])
    await microtarefas()
    expect(e.aoOcultar).toHaveBeenCalledTimes(1)
    // Sessão nova (a lista zera): o aviso pode voltar.
    e.set([])
    e.set([fala('s4', 'porn four')])
    await microtarefas()
    expect(e.aoOcultar).toHaveBeenCalledTimes(2)
  })
})

describe('as superfícies que leem o estado', () => {
  it('a exportação traz ••• e nenhum termo', () => {
    const e = estado()
    e.set([
      fala('s1', 'reveal the porn quest together', {
        lado: 'outro',
        translatedText: 'revelar a busca pornô juntos',
      }),
    ])
    const md = conversaEmMarkdown(e.ler(), {
      titulo: 'Conversa',
      rotulos: { meu: 'Você', outro: 'A outra pessoa' },
      idiomas: { meu: 'Português', outro: 'English' },
    })
    expect(md).toContain('•••')
    expect(md).not.toMatch(/porn/i)
  })

  it('o vocabulário da sessão não tem ••• nem termo', () => {
    const e = estado()
    e.set([fala('s1', 'reveal the porn quest together', { lang: 'en' })])
    const palavras = palavrasDasFalas(e.ler(), { sourceLang: 'pt-BR', targetLang: 'en-US' }).map((p) => p.word)
    expect(palavras.length).toBeGreaterThan(0)
    expect(palavras.some((w) => w.includes('•') || /porn/i.test(w))).toBe(false)
  })

  it('palavraOcultada barra o "Guardar palavra" do marcador e do termo', () => {
    expect(palavraOcultada('•••', PROTEGIDO)).toBe(true)
    expect(palavraOcultada('porn', PROTEGIDO)).toBe(true)
    expect(palavraOcultada('quest', PROTEGIDO)).toBe(false)
    expect(palavraOcultada('porn', ADULTO)).toBe(false)
  })

  it('a voz do intérprete não recebe o termo nem o marcador', () => {
    const f = finalParaAVoz(
      {
        segId: 'sys-1',
        original: 'reveal the porn quest together',
        resultado: 'traduzida',
        traducao: 'revelar a busca pornô juntos',
        de: 'en',
        para: 'pt',
        aproximada: false,
        falada: false,
      },
      PROTEGIDO,
    )
    expect(f.traducao).toBe('revelar a busca juntos')
    expect(f.original).not.toMatch(/porn/i)
  })
})
