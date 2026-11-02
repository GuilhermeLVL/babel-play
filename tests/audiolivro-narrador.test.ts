// @vitest-environment jsdom
/**
 * O ÁUDIO GRAVADO DENTRO DO NARRADOR (F2): com manifesto íntegro para o capítulo, o "Ouvir" toca o reprodutor (não a
 * voz do aparelho) e o destaque segue `aoMudarFrase`; qualquer desvio (hash, erro de rede, flag desligada no meio,
 * capítulo ausente, modo tradução) lê com a voz do aparelho a MESMA frase, sem silêncio.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type FraseComTempo, hashDasFrases, type ManifestoDeAudio } from '../src/core/leitura/audiolivro'
import { OPCOES_PADRAO_DA_NARRACAO } from '../src/core/leitura/estilosDeLeitura'
import type { ReprodutorDeCapitulo } from '../src/lib/leitor/audiolivro/reprodutor'
import type { MotorDoLeitor } from '../src/lib/leitor/motor'
import {
  type AudioGravadoDoLivro,
  type DependenciasDoNarrador,
  Narrador,
  type VistaDoNarrador,
} from '../src/lib/leitor/narrador'
import type { SpeakOptions, TtsEngine } from '../src/lib/tts'

const capitulo = (html: string) => new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html')
const esperar = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise((ok) => setTimeout(ok, 0))
}

function voz() {
  const falas: string[] = []
  let atual: SpeakOptions | null = null
  const engine: TtsEngine & { falas: string[]; terminar: () => void } = {
    falas,
    speak(texto, opts) {
      falas.push(texto)
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

/** O reprodutor de mentira: anota o que o narrador pede; o teste dispara os eventos. */
function reprodutorFalso() {
  const chamadas: string[] = []
  const r: ReprodutorDeCapitulo & { chamadas: string[] } = {
    chamadas,
    aoMudarFrase: () => {},
    aoFimDoCapitulo: () => {},
    aoErro: () => {},
    aoPausarDeFora: () => {},
    carregar: vi.fn(async (url: string) => void chamadas.push(`carregar ${url}`)),
    tocarDe: vi.fn(async (i: number) => void chamadas.push(`tocarDe ${i}`)),
    pausar: vi.fn(() => void chamadas.push('pausar')),
    retomar: vi.fn(async () => void chamadas.push('retomar')),
    parar: vi.fn(() => void chamadas.push('parar')),
    definirVelocidade: vi.fn(),
    precarregar: vi.fn(),
    destruir: vi.fn(() => void chamadas.push('destruir')),
  }
  return r
}

const HTML = [
  '<h1>Um</h1><p>A raposa viu as uvas. Pulou alto.</p>',
  '<p><img src="x.png" alt=""></p>',
  '<h1>Três</h1><p>O corvo achou um jarro.</p>',
]
const FRASES_1 = ['Um', 'A raposa viu as uvas.', 'Pulou alto.']
const TEMPOS_1: FraseComTempo[] = [
  { i: 0, t0: 0, t1: 1 },
  { i: 1, t0: 1.4, t1: 3 },
  { i: 2, t0: 3.4, t1: 4 },
]

async function manifestoCom(capitulos: { nn: number; frases: string[] }[]): Promise<ManifestoDeAudio> {
  return {
    versao: 1,
    livroId: 'teste',
    voz: 'F1',
    capitulos: await Promise.all(
      capitulos.map(async (c) => ({
        nn: c.nn,
        frases: c.frases.length,
        hashDasFrases: await hashDasFrases(c.frases),
        duracaoS: c.frases.length ? 4 : 0,
        bytes: c.frases.length ? 10 : 0,
        sha256: '',
      })),
    ),
  } as unknown as ManifestoDeAudio
}

/** O CFI de mentira: guarda o trecho e o devolve (para "recarregar retoma na mesma frase"). */
const cfis = new Map<string, { index: number; range: Range }>()

function montar(o: {
  manifesto: ManifestoDeAudio
  flag?: { ligada: boolean }
  extra?: Partial<DependenciasDoNarrador>
  /** Os mesmos documentos entre dois narradores (recarregar a página reabre o mesmo livro). */
  docs?: Document[]
}) {
  const docs = o.docs ?? HTML.map(capitulo)
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
    cfiDe: (index: number, range: Range) => {
      const k = `cfi-${cfis.size}`
      cfis.set(k, { index, range })
      return k
    },
    view: {
      resolveNavigation: (k: string) => {
        const c = cfis.get(k)
        return c && { index: c.index, anchor: () => c.range }
      },
    },
  } as unknown as MotorDoLeitor
  const aparelho = voz()
  const reprodutor = reprodutorFalso()
  const flag = o.flag ?? { ligada: true }
  const tempos = vi.fn(async (nn: number) => (nn === 1 ? TEMPOS_1 : null))
  const gravado: AudioGravadoDoLivro = {
    manifesto: o.manifesto,
    urlDoCapitulo: (nn) => `https://cdn/1/0${nn}.opus`,
    tempos,
    reprodutor,
    flagLigada: () => flag.ligada,
  }
  const avisos: string[] = []
  const vistas: VistaDoNarrador[] = []
  const deps: DependenciasDoNarrador = {
    motor: () => motor,
    livroId: 'teste',
    idiomaDoLivro: () => 'pt',
    idiomaDaPessoa: () => 'en',
    traduzir: async (t) => `[${t}]`,
    escolheuNuvem: () => false,
    nuvemLiberada: () => ({ temDireito: false, flagLigada: false }),
    aoMudar: (v) => vistas.push(v),
    aoAviso: (a) => avisos.push(a),
    aparelho,
    opcoesIniciais: { ...OPCOES_PADRAO_DA_NARRACAO, pausaParagrafo: 0, pausaFrase: 0 },
    audioGravado: () => gravado,
    ...o.extra,
  }
  const n = new Narrador(deps)
  return { n, deps, aparelho, reprodutor, tempos, flag, avisos, ultima: () => vistas.at(-1)! }
}

beforeEach(() => {
  localStorage.clear()
  cfis.clear()
})

describe('o narrador com áudio gravado', () => {
  it('(a) manifesto íntegro: toca o reprodutor, não a voz do aparelho; o destaque segue aoMudarFrase', async () => {
    const m = montar({ manifesto: await manifestoCom([{ nn: 1, frases: FRASES_1 }]) })
    m.n.tocar()
    await esperar()
    expect(m.reprodutor.chamadas).toEqual(['carregar https://cdn/1/01.opus', 'tocarDe 0'])
    expect(m.reprodutor.carregar).toHaveBeenCalledWith('https://cdn/1/01.opus', TEMPOS_1)
    expect(m.aparelho.falas).toEqual([])
    expect(m.ultima()).toMatchObject({ fase: 'tocando', indice: 0, gravado: true })
    m.reprodutor.aoMudarFrase(1)
    await esperar()
    expect(m.ultima()).toMatchObject({ fase: 'tocando', indice: 1, frase: 'A raposa viu as uvas.', gravado: true })
    /* o áudio segue: nada de recomeçar a frase nem de pausar */
    expect(m.reprodutor.chamadas).toEqual(['carregar https://cdn/1/01.opus', 'tocarDe 0'])
    expect(m.aparelho.falas).toEqual([])
  })

  it('(b) hash das frases ≠ manifesto: nenhum áudio é buscado e a voz do aparelho lê', async () => {
    const m = montar({
      manifesto: await manifestoCom([{ nn: 1, frases: ['Um', 'A raposa viu as UVAS.', 'Pulou alto.'] }]),
    })
    m.n.tocar()
    await esperar()
    expect(m.tempos).not.toHaveBeenCalled()
    expect(m.reprodutor.carregar).not.toHaveBeenCalled()
    expect(m.aparelho.falas).toEqual(['Um'])
    expect(m.ultima().gravado).toBe(false)
  })

  it('(c) erro de rede no meio: a MESMA frase segue pela voz do aparelho e o aviso sai uma vez', async () => {
    const m = montar({ manifesto: await manifestoCom([{ nn: 1, frases: FRASES_1 }]) })
    m.n.tocar()
    await esperar()
    m.reprodutor.aoMudarFrase(1)
    await esperar()
    m.reprodutor.aoErro('rede')
    await esperar()
    expect(m.aparelho.falas).toEqual(['A raposa viu as uvas.'])
    expect(m.ultima()).toMatchObject({ fase: 'tocando', indice: 1, gravado: false })
    expect(m.avisos).toEqual(['audio-indisponivel'])
    m.reprodutor.aoErro('rede')
    m.aparelho.terminar()
    await esperar()
    expect(m.aparelho.falas).toEqual(['A raposa viu as uvas.', 'Pulou alto.'])
    expect(m.avisos).toEqual(['audio-indisponivel'])
  })

  it('(d) kill-switch: a flag desliga tocando; a frase em curso termina e a seguinte vai à voz do aparelho', async () => {
    const m = montar({ manifesto: await manifestoCom([{ nn: 1, frases: FRASES_1 }]) })
    m.n.tocar()
    await esperar()
    m.flag.ligada = false
    /* a frase 0 terminou no áudio (o tempo cruzou o t0 da 1): o áudio para ali */
    m.reprodutor.aoMudarFrase(1)
    await esperar()
    expect(m.reprodutor.chamadas).toEqual(['carregar https://cdn/1/01.opus', 'tocarDe 0', 'parar'])
    expect(m.aparelho.falas).toEqual(['A raposa viu as uvas.'])
    m.aparelho.terminar()
    await esperar()
    m.aparelho.terminar()
    await esperar(6)
    /* o capítulo seguinte (vazio) é pulado e o terceiro lê pelo aparelho, sem nenhuma busca nova */
    expect(m.aparelho.falas).toEqual(['A raposa viu as uvas.', 'Pulou alto.', 'Três'])
    expect(m.tempos).toHaveBeenCalledTimes(1)
    expect(m.reprodutor.tocarDe).toHaveBeenCalledTimes(1)
    expect(m.avisos).toEqual([])
  })

  it('(e) capítulo sem frases (frases: 0) é pulado; capítulo fora do manifesto lê pelo aparelho sem aviso', async () => {
    const m = montar({
      manifesto: await manifestoCom([
        { nn: 1, frases: FRASES_1 },
        { nn: 2, frases: [] },
      ]),
    })
    m.n.tocar()
    await esperar()
    m.reprodutor.aoMudarFrase(1)
    m.reprodutor.aoMudarFrase(2)
    m.reprodutor.aoFimDoCapitulo()
    await esperar(8)
    expect(m.reprodutor.carregar).toHaveBeenCalledTimes(1)
    expect(m.aparelho.falas).toEqual(['Três'])
    expect(m.ultima()).toMatchObject({ fase: 'tocando', indice: 0, gravado: false })
    expect(m.avisos).toEqual([])
  })

  it('(f) recarregar (novo Narrador, mesmo livro) retoma na MESMA frase', async () => {
    const manifesto = await manifestoCom([{ nn: 1, frases: FRASES_1 }])
    const docs = HTML.map(capitulo)
    const a = montar({ manifesto, docs })
    a.n.tocar()
    await esperar()
    a.reprodutor.aoMudarFrase(1)
    a.reprodutor.aoMudarFrase(2)
    await esperar()
    a.n.destruir()
    expect(a.reprodutor.chamadas).toContain('destruir')
    const b = montar({ manifesto, docs })
    b.n.tocar()
    await esperar()
    expect(b.reprodutor.chamadas.at(-1)).toBe('tocarDe 2')
    expect(b.ultima()).toMatchObject({ indice: 2, frase: 'Pulou alto.' })
  })

  it('(g) próxima/anterior/voltar movem o áudio; o sono "fim do capítulo" pausa no fim', async () => {
    const m = montar({ manifesto: await manifestoCom([{ nn: 1, frases: FRASES_1 }]) })
    m.n.tocar()
    await esperar()
    m.n.proxima()
    await esperar()
    expect(m.reprodutor.chamadas.slice(-2)).toEqual(['pausar', 'tocarDe 1'])
    m.n.anterior()
    await esperar()
    expect(m.reprodutor.chamadas.at(-1)).toBe('tocarDe 0')
    m.n.proxima()
    m.n.proxima()
    await esperar()
    m.n.voltar(10)
    await esperar()
    expect(m.reprodutor.chamadas.at(-1)).toMatch(/^tocarDe [01]$/)
    m.n.definirSono('capitulo')
    m.n.proxima()
    m.n.proxima()
    await esperar()
    m.reprodutor.aoFimDoCapitulo()
    await esperar(6)
    expect(m.avisos).toContain('sono')
    expect(m.ultima()).toMatchObject({ fase: 'pausada', indice: 2 })
    expect(m.aparelho.falas).toEqual([])
  })

  it('(h) modo tradução ou bilíngue ignora o áudio gravado', async () => {
    const m = montar({ manifesto: await manifestoCom([{ nn: 1, frases: FRASES_1 }]) })
    m.n.modo = 'traducao'
    m.n.tocar()
    await esperar()
    expect(m.reprodutor.tocarDe).not.toHaveBeenCalled()
    expect(m.aparelho.falas).toEqual(['[Um]'])
    expect(m.ultima().gravado).toBe(false)
    m.n.definirModo('bilingue')
    await esperar()
    expect(m.reprodutor.tocarDe).not.toHaveBeenCalled()
    m.n.definirModo('original')
    await esperar()
    expect(m.reprodutor.chamadas.at(-1)).toBe('tocarDe 0')
  })

  it('outra aba começou a tocar: a narração pausa', async () => {
    const m = montar({ manifesto: await manifestoCom([{ nn: 1, frases: FRASES_1 }]) })
    m.n.tocar()
    await esperar()
    m.reprodutor.aoPausarDeFora()
    expect(m.ultima()).toMatchObject({ fase: 'pausada', indice: 0 })
  })

  it('sem audioGravado (flag desligada, dependência ausente): o narrador de sempre', async () => {
    const m = montar({
      manifesto: await manifestoCom([{ nn: 1, frases: FRASES_1 }]),
      extra: { audioGravado: undefined },
    })
    m.n.tocar()
    await esperar()
    expect(m.aparelho.falas).toEqual(['Um'])
    expect(m.reprodutor.carregar).not.toHaveBeenCalled()
  })
})
