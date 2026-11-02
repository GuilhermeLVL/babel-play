// @vitest-environment jsdom
/**
 * A TROCA PARA A VOZ NO APARELHO NO LIMITE DE FRASE (primeiro contato, openspec `voz-no-aparelho`): a frase em curso
 * termina na voz do sistema e a seguinte já sai do motor local, sem pular nem repetir; com o modelo pronto desde o
 * começo, a PRIMEIRA frase já sai dele; uma escolha manual de voz do sistema vence. Narrador, voz e motor de mentira.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OPCOES_PADRAO_DA_NARRACAO } from '../src/core/leitura/estilosDeLeitura'
import { CAPACIDADES_DO_APARELHO } from '../src/core/voz/portaDeVoz'
import { registrarMotorDeVoz, reiniciarRegistroDeMotoresDeVoz } from '../src/gateway/registroDeMotoresDeVoz'
import type { MotorDoLeitor } from '../src/lib/leitor/motor'
import { type DependenciasDoNarrador, Narrador, type VistaDoNarrador } from '../src/lib/leitor/narrador'
import type { SpeakOptions, TtsEngine } from '../src/lib/tts'

const capitulo = (html: string) => new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html')

function voz() {
  const falas: string[] = []
  const preparadas: string[][] = []
  let atual: SpeakOptions | null = null
  const engine: TtsEngine & {
    falas: string[]
    preparadas: string[][]
    cancelada: number
    falando: () => boolean
    terminar: () => void
  } = {
    falas,
    preparadas,
    cancelada: 0,
    speak(texto, opts) {
      falas.push(texto)
      atual = opts!
    },
    cancel() {
      engine.cancelada++
      atual = null
    },
    preparar(itens) {
      preparadas.push(itens.map((i) => i.texto))
    },
    falando: () => atual !== null,
    terminar() {
      const a = atual
      atual = null
      a?.onEnd?.()
    },
  }
  return engine
}

function montar(o: { pronta: { agora: boolean } } & Partial<DependenciasDoNarrador>) {
  const doc = capitulo('<p>Alfa um. Alfa dois.</p><p>Beta um.</p>')
  const motor = {
    documentos: () => [{ doc, index: 0 }],
    destacarFrase: () => {},
    trechoVisivel: () => true,
    mostrarTrecho: async () => {},
    proximoCapitulo: async () => false,
    capituloAnterior: async () => false,
    posicao: null,
    cfiDe: () => 'epubcfi(/6/2!/4/2/1:0)',
    view: { resolveNavigation: () => undefined },
  } as unknown as MotorDoLeitor
  const aparelho = voz()
  const neural = voz()
  registrarMotorDeVoz({
    id: 'neural-local',
    capacidades: CAPACIDADES_DO_APARELHO,
    pronto: () => o.pronta.agora,
    criar: () => neural,
  })
  const vistas: VistaDoNarrador[] = []
  const n = new Narrador({
    motor: () => motor,
    livroId: 'troca',
    idiomaDoLivro: () => 'pt',
    idiomaDaPessoa: () => 'pt',
    traduzir: async (t) => t,
    escolheuNuvem: () => false,
    nuvemLiberada: () => ({ temDireito: false, flagLigada: false }),
    aoMudar: (v) => vistas.push(v),
    aparelho,
    vozLocalPronta: () => o.pronta.agora,
    opcoesIniciais: { ...OPCOES_PADRAO_DA_NARRACAO, pausaFrase: 0, pausaParagrafo: 0 },
    ...o,
  })
  /** As frases efetivamente tocadas, na ordem (o índice da vista a cada mudança, sem repetição consecutiva). */
  const indices = () =>
    vistas
      .filter((v) => v.fase === 'tocando')
      .map((v) => v.indice)
      .filter((x, i, a) => i === 0 || a[i - 1] !== x)
  return { n, aparelho, neural, vistas, indices, ultima: () => vistas.at(-1)! }
}

const esperar = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  reiniciarRegistroDeMotoresDeVoz()
})

describe('a voz no aparelho entra no limite de frase', () => {
  it('a frase em curso termina na voz do sistema; a seguinte sai do motor local; nada pula nem repete', async () => {
    const pronta = { agora: false }
    const m = montar({ pronta })
    m.n.tocar()
    await esperar()
    expect(m.aparelho.falas).toEqual(['Alfa um.'])
    expect(m.ultima().vozDoSistema).toBe(true)

    /* O download terminou e o modelo abriu no meio da frase 1. */
    const canceladasAntes = m.aparelho.cancelada
    pronta.agora = true
    await m.n.anteciparVozLocal()
    expect(m.neural.preparadas).toEqual([['Alfa dois.', 'Beta um.']]) // as 2 seguintes, sintetizadas enquanto a 1 toca
    expect(m.aparelho.falando()).toBe(true) // a frase 1 NÃO foi cortada
    expect(m.aparelho.cancelada).toBe(canceladasAntes)
    expect(m.neural.falas).toEqual([])

    m.aparelho.terminar() // a frase 1 acaba na voz do sistema
    await esperar()
    expect(m.neural.falas).toEqual(['Alfa dois.'])
    expect(m.ultima()).toMatchObject({ indice: 1, vozLocal: true })
    expect(m.ultima().vozDoSistema).toBeUndefined()

    m.neural.terminar()
    await esperar()
    expect(m.neural.falas).toEqual(['Alfa dois.', 'Beta um.'])
    expect(m.aparelho.falas).toEqual(['Alfa um.']) // a voz do sistema nunca repetiu nem leu adiante
    expect(m.indices()).toEqual([0, 1, 2])
  })

  it('com o modelo pronto desde o começo, a PRIMEIRA frase já sai do motor local', async () => {
    const m = montar({ pronta: { agora: true } })
    m.n.tocar()
    await esperar()
    expect(m.neural.falas).toEqual(['Alfa um.'])
    expect(m.aparelho.falas).toEqual([])
    expect(m.ultima().vozLocal).toBe(true)
  })

  it('a pessoa escolheu uma voz do sistema (a porta diz "não"): o sistema lê, mesmo com o motor registrado', async () => {
    const m = montar({ pronta: { agora: false } })
    m.n.tocar()
    await esperar()
    await m.n.anteciparVozLocal()
    expect(m.neural.preparadas).toEqual([])
    m.aparelho.terminar()
    await esperar()
    expect(m.aparelho.falas).toEqual(['Alfa um.', 'Alfa dois.'])
    expect(m.neural.falas).toEqual([])
  })

  it('antecipar com a narração parada ou pausada não fala nada', async () => {
    const m = montar({ pronta: { agora: true } })
    await m.n.anteciparVozLocal()
    expect(m.neural.preparadas).toEqual([])
    expect(m.neural.falas).toEqual([])
  })
})
