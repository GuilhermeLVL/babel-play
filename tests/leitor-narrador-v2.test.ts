// @vitest-environment jsdom
/**
 * O NARRADOR v2 (spec `docs/specs/2026-10-28-narracao-v2.md`): tom, volume e velocidade chegam à voz, o silêncio
 * entre frases e parágrafos, a repetição do modo Estudo, "voltar 10 s", capítulo anterior/próximo, o temporizador
 * de sono e a persistência dos ajustes. Voz e motor de mentira; o relógio é simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OPCOES_PADRAO_DA_NARRACAO, type OpcoesDaNarracao } from '../src/core/leitura/estilosDeLeitura'
import type { MotorDoLeitor } from '../src/lib/leitor/motor'
import { type DependenciasDoNarrador, Narrador, type VistaDoNarrador } from '../src/lib/leitor/narrador'
import { CHAVE_DAS_OPCOES, lerOpcoesDaNarracao } from '../src/lib/leitor/preferenciasDaNarracao'
import type { SpeakOptions, TtsEngine } from '../src/lib/tts'
import type { VozDaNuvem } from '../src/lib/voz/vozDaNuvem'

const capitulo = (html: string) => new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html')

function voz() {
  const falas: Array<{ texto: string; opts: SpeakOptions }> = []
  let atual: SpeakOptions | null = null
  const engine: TtsEngine & { falas: typeof falas; terminar: () => void } = {
    falas,
    speak(texto, opts) {
      falas.push({ texto, opts: opts! })
      atual = opts!
    },
    cancel() {
      atual = null
    },
    terminar() {
      const a = atual
      atual = null
      a?.onEnd?.()
    },
  }
  return engine
}

const SEM_PAUSAS: OpcoesDaNarracao = { ...OPCOES_PADRAO_DA_NARRACAO, pausaParagrafo: 0 }

function montar(extra: Partial<DependenciasDoNarrador> = {}, html = '<p>Alfa um. Alfa dois.</p><p>Beta um.</p>') {
  const docs = [capitulo(html), capitulo('<p>Gama um.</p>')]
  let secao = 0
  const motor = {
    documentos: () => [{ doc: docs[secao], index: secao }],
    destacarFrase: () => {},
    trechoVisivel: () => true,
    mostrarTrecho: async () => {},
    proximoCapitulo: async () => {
      if (secao + 1 >= docs.length) return false
      secao++
      return true
    },
    capituloAnterior: async () => {
      if (secao === 0) return false
      secao--
      return true
    },
    posicao: null,
    cfiDe: () => 'epubcfi(/6/2!/4/2/1:0)',
    view: { resolveNavigation: () => undefined },
  } as unknown as MotorDoLeitor
  const aparelho = voz()
  const nuvem = voz()
  const vistas: VistaDoNarrador[] = []
  const avisos: string[] = []
  const n = new Narrador({
    motor: () => motor,
    livroId: 'teste-v2',
    idiomaDoLivro: () => 'pt',
    idiomaDaPessoa: () => 'pt',
    traduzir: async (t) => `[${t}]`,
    escolheuNuvem: () => false,
    nuvemLiberada: () => ({ temDireito: false, flagLigada: false }),
    aoMudar: (v) => vistas.push(v),
    aoAviso: (a) => avisos.push(a),
    aparelho,
    opcoesIniciais: SEM_PAUSAS,
    criarNuvem: async () => nuvem as unknown as VozDaNuvem,
    ...extra,
  })
  return { n, aparelho, nuvem, vistas, avisos, ultima: () => vistas.at(-1)! }
}

/** Deixa as promessas e os timers de 0 ms correrem. */
const esperar = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('narrador v2: ajustes que chegam à voz', () => {
  it('velocidade, tom e volume vão em cada fala', async () => {
    const { n, aparelho } = montar({ opcoesIniciais: { ...SEM_PAUSAS, velocidade: 1.4, tom: 0.8, volume: 0.5 } })
    n.tocar()
    await esperar()
    expect(aparelho.falas[0].opts).toMatchObject({ rate: 1.4, pitch: 0.8, volume: 0.5, lang: 'pt-BR' })
  })

  it('mudar o tom recomeça a frase depois de um respiro (a pessoa arrasta o controle)', async () => {
    const { n, aparelho } = montar()
    n.tocar()
    await esperar()
    n.definirOpcoes({ tom: 0.9 })
    n.definirOpcoes({ tom: 0.8 })
    await vi.advanceTimersByTimeAsync(200)
    expect(aparelho.falas).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(200)
    expect(aparelho.falas).toHaveLength(2)
    expect(aparelho.falas[1]).toMatchObject({ texto: 'Alfa um.', opts: { pitch: 0.8 } })
  })

  it('a voz natural da nuvem só vai até 2× e não leva tom', async () => {
    const { n, nuvem } = montar({
      escolheuNuvem: () => true,
      nuvemLiberada: () => ({ temDireito: true, flagLigada: true }),
      opcoesIniciais: { ...SEM_PAUSAS, velocidade: 2.5 },
    })
    n.tocar()
    await esperar()
    expect(nuvem.falas[0].opts.rate).toBe(2)
  })

  it('os ajustes ficam no aparelho e o próximo narrador parte deles; valor fora do intervalo é preso', () => {
    const { n } = montar()
    n.definirOpcoes({ velocidade: 9, tom: 1.2, repeticoes: 2 })
    expect(n.opcoes).toMatchObject({ velocidade: 2.5, tom: 1.2, repeticoes: 2 })
    expect(JSON.parse(localStorage.getItem(CHAVE_DAS_OPCOES)!)).toMatchObject({ velocidade: 2.5, tom: 1.2 })
    expect(lerOpcoesDaNarracao()).toMatchObject({ velocidade: 2.5, repeticoes: 2 })
  })

  it('a velocidade guardada antes dos ajustes novos ainda vale', () => {
    localStorage.setItem('leitor:narracao:velocidade', '1.5')
    expect(lerOpcoesDaNarracao().velocidade).toBe(1.5)
    localStorage.setItem(CHAVE_DAS_OPCOES, '{lixo')
    expect(lerOpcoesDaNarracao().velocidade).toBe(1.5)
  })
})

describe('narrador v2: pausas e repetição', () => {
  it('silêncio depois da frase, e o de parágrafo só no fim do parágrafo', async () => {
    const { n, aparelho } = montar({ opcoesIniciais: { ...SEM_PAUSAS, pausaFrase: 0.5, pausaParagrafo: 1 } })
    n.tocar()
    await esperar()
    aparelho.terminar() // "Alfa um." (meio do parágrafo): 0,5 s
    await vi.advanceTimersByTimeAsync(499)
    expect(aparelho.falas).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2)
    expect(aparelho.falas.map((f) => f.texto)).toEqual(['Alfa um.', 'Alfa dois.'])
    aparelho.terminar() // "Alfa dois." fecha o parágrafo: 0,5 + 1 s
    await vi.advanceTimersByTimeAsync(1499)
    expect(aparelho.falas).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(2)
    expect(aparelho.falas.at(-1)!.texto).toBe('Beta um.')
  })

  it('pausar durante o silêncio cala o relógio: nada fala sozinho', async () => {
    const { n, aparelho, ultima } = montar({ opcoesIniciais: { ...SEM_PAUSAS, pausaFrase: 1 } })
    n.tocar()
    await esperar()
    aparelho.terminar()
    await vi.advanceTimersByTimeAsync(300)
    n.pausar()
    await vi.advanceTimersByTimeAsync(5000)
    expect(aparelho.falas).toHaveLength(1)
    expect(ultima()).toMatchObject({ fase: 'pausada', indice: 0 })
  })

  it('modo Estudo: cada frase é lida N vezes antes de passar à próxima', async () => {
    const { n, aparelho, ultima } = montar({ opcoesIniciais: { ...SEM_PAUSAS, repeticoes: 3 } })
    n.tocar()
    await esperar()
    for (let i = 0; i < 3; i++) {
      aparelho.terminar()
      await esperar()
    }
    expect(aparelho.falas.map((f) => f.texto)).toEqual(['Alfa um.', 'Alfa um.', 'Alfa um.', 'Alfa dois.'])
    expect(ultima()).toMatchObject({ indice: 1 })
  })
})

describe('narrador v2: transporte', () => {
  const longo = Array.from({ length: 8 }, (_, i) => `<p>Frase número ${i + 1} do texto de teste.</p>`).join('')

  it('voltar 10 s recua as frases que cobrem o tempo, sem passar do começo, mantendo a fase', async () => {
    const { n, aparelho, ultima } = montar({}, longo)
    n.tocar()
    await esperar()
    for (let i = 0; i < 6; i++) {
      aparelho.terminar()
      await esperar()
    }
    expect(ultima().indice).toBe(6)
    n.voltar(10) // 10 s × 15 caracteres = 150; frases de ~32: 5 frases
    await esperar()
    expect(ultima()).toMatchObject({ fase: 'tocando', indice: 1 })
    expect(aparelho.falas.at(-1)!.texto).toBe('Frase número 2 do texto de teste.')
    n.pausar()
    n.voltar(10)
    expect(ultima()).toMatchObject({ fase: 'pausada', indice: 0 })
  })

  it('capítulo seguinte e anterior pelo botão; no primeiro, recomeça o capítulo', async () => {
    const { n, aparelho, ultima } = montar()
    n.tocar()
    await esperar()
    n.irParaCapitulo(1)
    await esperar()
    await esperar()
    expect(aparelho.falas.at(-1)!.texto).toBe('Gama um.')
    expect(ultima()).toMatchObject({ fase: 'tocando', indice: 0, total: 1 })
    n.irParaCapitulo(-1)
    await esperar()
    await esperar()
    expect(aparelho.falas.at(-1)!.texto).toBe('Alfa um.')
    expect(ultima()).toMatchObject({ fase: 'tocando', indice: 0, total: 3 })
    n.irParaCapitulo(-1)
    await esperar()
    await esperar()
    expect(ultima()).toMatchObject({ fase: 'tocando', indice: 0, total: 3 })
  })

  it('virar o capítulo com a narração pausada não sai tocando', async () => {
    const { n, aparelho, ultima } = montar()
    n.tocar()
    await esperar()
    n.pausar()
    const antes = aparelho.falas.length
    n.irParaCapitulo(1)
    await esperar()
    await esperar()
    expect(ultima()).toMatchObject({ fase: 'pausada', total: 1 })
    expect(aparelho.falas).toHaveLength(antes)
  })
})

describe('narrador v2: temporizador de sono', () => {
  it('por minutos: pausa quando vence e avisa', async () => {
    const { n, aparelho, avisos, ultima } = montar()
    n.tocar()
    await esperar()
    n.definirSono(15)
    expect(ultima().sono).toMatchObject({ tipo: 'minutos' })
    await vi.advanceTimersByTimeAsync(15 * 60_000 - 1000)
    expect(ultima().fase).toBe('tocando')
    await vi.advanceTimersByTimeAsync(1000)
    expect(ultima()).toMatchObject({ fase: 'pausada', sono: null })
    expect(avisos).toContain('sono')
    expect(aparelho.falas).toHaveLength(1)
  })

  it('desarmar antes de vencer cancela o relógio', async () => {
    const { n, ultima } = montar()
    n.tocar()
    await esperar()
    n.definirSono(15)
    n.definirSono(null)
    await vi.advanceTimersByTimeAsync(20 * 60_000)
    expect(ultima()).toMatchObject({ fase: 'tocando', sono: null })
  })

  it('no fim do capítulo: lê até a última frase e pausa, sem abrir o próximo', async () => {
    const { n, aparelho, avisos, ultima } = montar({}, '<p>Só uma.</p>')
    n.tocar()
    await esperar()
    n.definirSono('capitulo')
    expect(ultima().sono).toEqual({ tipo: 'capitulo' })
    aparelho.terminar()
    await esperar()
    await esperar()
    expect(ultima()).toMatchObject({ fase: 'pausada', sono: null })
    expect(avisos).toContain('sono')
    expect(aparelho.falas.map((f) => f.texto)).toEqual(['Só uma.'])
  })

  it('sem sono, o fim do capítulo continua no próximo, como sempre', async () => {
    const { n, aparelho } = montar({}, '<p>Só uma.</p>')
    n.tocar()
    await esperar()
    aparelho.terminar()
    await esperar()
    await esperar()
    expect(aparelho.falas.at(-1)!.texto).toBe('Gama um.')
  })

  it('pular de capítulo à mão com o sono "fim do capítulo" armado não dispara o sono', async () => {
    const { n, aparelho } = montar()
    n.tocar()
    await esperar()
    n.definirSono('capitulo')
    n.irParaCapitulo(1)
    await esperar()
    await esperar()
    expect(aparelho.falas.at(-1)!.texto).toBe('Gama um.')
  })
})
