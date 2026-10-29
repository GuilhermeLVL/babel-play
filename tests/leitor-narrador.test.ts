// @vitest-environment jsdom
/**
 * O NARRADOR (`src/lib/leitor/narrador.ts`) com um motor e vozes de mentira: a frase falada é a destacada, a
 * página segue a frase, o capítulo vira no fim, pausar/retomar repetem a frase, e a voz natural da nuvem só é
 * usada com a escolha + o direito do plano + a flag (a voz do aparelho é de todos).
 */
import { describe, expect, it, vi } from 'vitest'

import { OPCOES_PADRAO_DA_NARRACAO } from '../src/core/leitura/estilosDeLeitura'
import { frasesDoDocumento } from '../src/lib/leitor/frasesDoCapitulo'
import type { MotorDoLeitor } from '../src/lib/leitor/motor'
import { type DependenciasDoNarrador, Narrador, type VistaDoNarrador } from '../src/lib/leitor/narrador'
import type { SpeakOptions, TtsEngine } from '../src/lib/tts'
import type { VozDaNuvem } from '../src/lib/voz/vozDaNuvem'

const capitulo = (html: string) => new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html')

/** Uma voz de mentira: guarda as falas; `terminar()` acaba a atual. */
function voz() {
  const falas: Array<{ texto: string; opts: SpeakOptions }> = []
  let atual: SpeakOptions | null = null
  const engine: TtsEngine & { falas: typeof falas; terminar: () => void; falhar: () => void } = {
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
    falhar() {
      const a = atual
      atual = null
      a?.onError?.()
    },
  }
  return engine
}

function montar(extra: Partial<DependenciasDoNarrador> = {}) {
  const docs = [
    capitulo('<h1>Um</h1><p>A raposa viu as uvas. Pulou alto.</p>'),
    capitulo('<h1>Dois</h1><p>O corvo achou um jarro.</p>'),
  ]
  let secao = 0
  const destaques: Array<string | null> = []
  const mostradas: string[] = []
  const motor = {
    documentos: () => [{ doc: docs[secao], index: secao }],
    destacarFrase: (r: Range | null) => destaques.push(r ? r.toString() : null),
    trechoVisivel: () => false,
    mostrarTrecho: async (r: Range) => {
      mostradas.push(r.toString())
    },
    proximoCapitulo: async () => {
      if (secao + 1 >= docs.length) return false
      secao++
      return true
    },
    posicao: null,
    cfiDe: () => 'epubcfi(/6/2!/4/2/1:0)',
    view: { resolveNavigation: () => undefined },
  } as unknown as MotorDoLeitor
  const aparelho = voz()
  const nuvem = voz()
  const vistas: VistaDoNarrador[] = []
  const n = new Narrador({
    motor: () => motor,
    livroId: 'teste',
    idiomaDoLivro: () => 'pt',
    idiomaDaPessoa: () => 'pt',
    traduzir: async (t) => `[${t}]`,
    escolheuNuvem: () => false,
    nuvemLiberada: () => ({ temDireito: false, flagLigada: false }),
    aoMudar: (v) => vistas.push(v),
    aparelho,
    /* Sem pausas: estes testes contam as falas, e o silêncio entre parágrafos é testado à parte. */
    opcoesIniciais: { ...OPCOES_PADRAO_DA_NARRACAO, pausaParagrafo: 0 },
    criarNuvem: async () => nuvem as unknown as VozDaNuvem,
    ...extra,
  })
  return { n, aparelho, nuvem, destaques, mostradas, vistas, ultima: () => vistas.at(-1)! }
}

const esperar = () => new Promise((ok) => setTimeout(ok, 0))

describe('o narrador', () => {
  it('fala e destaca frase a frase, a página segue a frase, e no fim o capítulo vira', async () => {
    const { n, aparelho, destaques, mostradas, ultima } = montar()
    n.tocar()
    await esperar()
    expect(aparelho.falas.map((f) => f.texto)).toEqual(['Um'])
    expect(ultima()).toMatchObject({ fase: 'tocando', indice: 0, total: 3, frase: 'Um' })
    expect(destaques.at(-1)).toBe('Um')
    aparelho.terminar()
    await esperar()
    expect(aparelho.falas.at(-1)!.texto).toBe('A raposa viu as uvas.')
    expect(destaques.at(-1)).toBe('A raposa viu as uvas.')
    expect(mostradas.at(-1)).toBe('A raposa viu as uvas.')
    aparelho.terminar()
    await esperar()
    aparelho.terminar() // fim de "Pulou alto.": vira o capítulo
    await esperar()
    await esperar()
    expect(aparelho.falas.at(-1)!.texto).toBe('Dois')
    expect(ultima()).toMatchObject({ fase: 'tocando', indice: 0, total: 2 })
  })

  it('pausar cala e mantém o destaque; retomar repete a MESMA frase; a velocidade recomeça a frase', async () => {
    const { n, aparelho, destaques, ultima } = montar()
    n.tocar()
    await esperar()
    aparelho.terminar()
    await esperar()
    n.pausar()
    expect(ultima()).toMatchObject({ fase: 'pausada', indice: 1 })
    expect(destaques.at(-1)).toBe('A raposa viu as uvas.')
    const antes = aparelho.falas.length
    n.tocar()
    await esperar()
    expect(aparelho.falas.length).toBe(antes + 1)
    expect(aparelho.falas.at(-1)!.texto).toBe('A raposa viu as uvas.')
    n.definirVelocidade(1.5)
    await esperar()
    expect(aparelho.falas.at(-1)).toMatchObject({ texto: 'A raposa viu as uvas.', opts: { rate: 1.5 } })
    expect(ultima()).toMatchObject({ fase: 'tocando', indice: 1 })
  })

  it('erro da voz para na frase, sem correr pelas outras; o fim do livro para', async () => {
    const aviso = vi.fn()
    const { n, aparelho, ultima } = montar({ aoAviso: aviso })
    n.tocar()
    await esperar()
    aparelho.falhar()
    expect(ultima()).toMatchObject({ fase: 'pausada', indice: 0 })
    expect(aviso).toHaveBeenCalledWith('erro')
  })

  it('bilíngue: a frase e a tradução, uma depois da outra', async () => {
    const { n, aparelho } = montar({ idiomaDaPessoa: () => 'en' })
    n.modo = 'bilingue'
    n.tocar()
    await esperar()
    expect(aparelho.falas.at(-1)).toMatchObject({ texto: 'Um', opts: { lang: 'pt-BR' } })
    aparelho.terminar()
    await esperar()
    expect(aparelho.falas.at(-1)).toMatchObject({ texto: '[Um]', opts: { lang: 'en-US' } })
  })

  it('voz natural: só com a escolha, o direito do plano e a flag; senão, a voz do aparelho', async () => {
    const semDireito = montar({
      escolheuNuvem: () => true,
      nuvemLiberada: () => ({ temDireito: false, flagLigada: true }),
    })
    semDireito.n.tocar()
    await esperar()
    expect(semDireito.aparelho.falas).toHaveLength(1)
    expect(semDireito.nuvem.falas).toHaveLength(0)

    const comDireito = montar({
      escolheuNuvem: () => true,
      nuvemLiberada: () => ({ temDireito: true, flagLigada: true }),
    })
    comDireito.n.tocar()
    await esperar()
    await esperar()
    expect(comDireito.nuvem.falas.map((f) => f.texto)).toEqual(['Um'])
    expect(comDireito.aparelho.falas).toHaveLength(0)
  })

  it('as frases do capítulo de teste são as que o narrador lê', () => {
    expect(frasesDoDocumento(capitulo('<p>Uma. Duas.</p>')).map((f) => f.texto)).toEqual(['Uma.', 'Duas.'])
  })
})
