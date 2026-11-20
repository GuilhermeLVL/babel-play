// @vitest-environment jsdom
/**
 * O ELENCO NO NARRADOR (M5): com `elenco` ligado, a personagem fala com a voz dela (`voiceName` chega ao motor), a
 * emoção muda o ritmo (e o tom, no aparelho), o resto segue na voz do narrador; sem `elenco` a fala é a de sempre.
 */
import { describe, expect, it } from 'vitest'

import type { ConfigDoElenco } from '../src/core/avatar/elenco'
import { OPCOES_PADRAO_DA_NARRACAO } from '../src/core/leitura/estilosDeLeitura'
import type { MotorDoLeitor } from '../src/lib/leitor/motor'
import { type DependenciasDoNarrador, Narrador, type VistaDoNarrador } from '../src/lib/leitor/narrador'
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

const CONFIG: ConfigDoElenco = {
  idioma: 'pt',
  personagens: ['Ana', 'Bruno'],
  vozes: [
    { id: 'Luciana', idioma: 'pt-BR', principal: true },
    { id: 'Felipe', idioma: 'pt-BR' },
    { id: 'Joana', idioma: 'pt-BR' },
  ],
  vozPrincipal: 'Luciana',
}

function montar(extra: Partial<DependenciasDoNarrador> = {}) {
  const doc = capitulo('<p>A tarde caiu sobre o vale.</p><p>"Estou triste, sinto muito", disse Ana.</p>')
  const motor = {
    documentos: () => [{ doc, index: 0 }],
    destacarFrase: () => {},
    trechoVisivel: () => true,
    mostrarTrecho: async () => {},
    proximoCapitulo: async () => false,
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
    opcoesIniciais: { ...OPCOES_PADRAO_DA_NARRACAO, pausaParagrafo: 0, pausaFrase: 0 },
    criarNuvem: async () => nuvem as unknown as VozDaNuvem,
    ...extra,
  })
  return { n, aparelho, nuvem, ultima: () => vistas.at(-1)! }
}

const esperar = () => new Promise((ok) => setTimeout(ok, 0))

describe('o narrador com elenco', () => {
  it('a personagem fala com a voz dela e a emoção muda ritmo e tom; o narrador fica como estava', async () => {
    const { n, aparelho, ultima } = montar({ elenco: () => CONFIG })
    n.tocar()
    await esperar()
    expect(aparelho.falas[0].opts.voiceName).toBeUndefined()
    expect(aparelho.falas[0].opts.rate).toBe(1)
    expect(ultima().fala).toMatchObject({ nome: null, emocao: 'neutro' })
    aparelho.terminar()
    await esperar()
    const f = aparelho.falas[1]
    expect(['Felipe', 'Joana']).toContain(f.opts.voiceName)
    expect(ultima().fala?.nome).toBe('Ana')
  })

  it('sem `elenco` (flag desligada ou chave do livro desligada) é a fala de sempre', async () => {
    const { n, aparelho, ultima } = montar()
    n.tocar()
    await esperar()
    aparelho.terminar()
    await esperar()
    expect(aparelho.falas[1].opts.voiceName).toBeUndefined()
    expect(ultima().fala).toBeNull()
  })

  it('`elenco` devolvendo null também volta à voz única', async () => {
    const { n, aparelho } = montar({ elenco: () => null })
    n.tocar()
    await esperar()
    aparelho.terminar()
    await esperar()
    expect(aparelho.falas[1].opts.voiceName).toBeUndefined()
  })

  it('voz da nuvem: só o ritmo muda; sem voiceName nem tom de emoção', async () => {
    const { n, nuvem } = montar({
      elenco: () => CONFIG,
      escolheuNuvem: () => true,
      nuvemLiberada: () => ({ temDireito: true, flagLigada: true }),
    })
    n.tocar()
    await esperar()
    await esperar()
    nuvem.terminar()
    await esperar()
    await esperar()
    expect(nuvem.falas.length).toBe(2)
    for (const f of nuvem.falas) {
      expect(f.opts.voiceName).toBeUndefined()
      expect(f.opts.pitch).toBeUndefined()
    }
    expect(nuvem.falas[1].opts.rate).toBeLessThan(1)
  })

  it('trocar o elenco no meio (definirElenco) vale na frase seguinte', async () => {
    let cfg: ConfigDoElenco | null = null
    const { n, aparelho } = montar({ elenco: () => cfg })
    n.tocar()
    await esperar()
    cfg = CONFIG
    n.definirElenco()
    await esperar()
    aparelho.terminar()
    await esperar()
    expect(['Felipe', 'Joana']).toContain(aparelho.falas.at(-1)!.opts.voiceName)
  })
})
