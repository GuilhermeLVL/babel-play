/**
 * A VOZ DA NUVEM GUARDADA NO APARELHO (auditoria do servidor de 10/10/2026, achado A9).
 *
 * Duas camadas: o cache (`src/lib/voz/cacheDeVoz.ts`), com a chave, a validade e o teto de tamanho; e a
 * voz (`vozDaNuvem.ts`), que só fala com o servidor quando o aparelho não tem o áudio, e que não serve
 * áudio guardado a quem não tem o direito.
 */
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ vozNatural: true }) }))

import type { SpeakOptions, TtsEngine } from '../src/lib/tts'
import {
  chaveDoPedidoDeVoz,
  criarCacheDeVoz,
  type GuardadosDaVoz,
  MAIOR_AUDIO_GUARDADO_BYTES,
} from '../src/lib/voz/cacheDeVoz'
import { criarVozDaNuvem, type ReprodutorDaVoz } from '../src/lib/voz/vozDaNuvem'

const audio = (bytes: number, marca = 1) => new Blob([new Uint8Array(bytes).fill(marca)], { type: 'audio/mpeg' })
const primeiroByte = async (b: Blob | null) => (b ? new Uint8Array(await b.arrayBuffer())[0] : null)

describe('o cache de voz', () => {
  let agora = 1_000_000
  let cache: GuardadosDaVoz
  const novo = (o: { tetoBytes?: number; validadeMs?: number } = {}) =>
    criarCacheDeVoz({ fabrica: new IDBFactory(), agora: () => agora, ...o })

  beforeEach(() => {
    agora = 1_000_000
    cache = novo()
  })

  it('guarda e devolve o mesmo áudio, com o tipo', async () => {
    const pedido = { texto: 'bom dia', idioma: 'pt-BR' }
    expect(await cache.ler(pedido)).toBeNull()
    await cache.guardar(pedido, audio(300, 7))
    const lido = await cache.ler(pedido)
    expect(lido?.size).toBe(300)
    expect(lido?.type).toBe('audio/mpeg')
    expect(await primeiroByte(lido)).toBe(7)
  })

  it('a chave é texto + idioma + voz + velocidade: mudar um deles é outro áudio', async () => {
    const base = { texto: 'bom dia', idioma: 'pt-BR', voz: 'Kore', velocidade: 1 }
    await cache.guardar(base, audio(100))
    expect(await cache.ler(base)).not.toBeNull()
    // velocidade 1 e velocidade ausente são o mesmo pedido
    expect(await cache.ler({ ...base, velocidade: undefined })).not.toBeNull()
    for (const outro of [
      { ...base, texto: 'bom dia!' },
      { ...base, idioma: 'es' },
      { ...base, voz: 'Puck' },
      { ...base, voz: undefined },
      { ...base, velocidade: 0.8 },
    ])
      expect(await cache.ler(outro)).toBeNull()
    const chaves = await Promise.all([chaveDoPedidoDeVoz(base), chaveDoPedidoDeVoz({ ...base, velocidade: 0.8 })])
    expect(chaves[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(chaves[0]).not.toBe(chaves[1])
  })

  it('o texto não fica guardado em lugar nenhum: só o resumo dele', async () => {
    const fabrica = new IDBFactory()
    const c = criarCacheDeVoz({ fabrica, agora: () => agora })
    await c.guardar({ texto: 'segredo da reunião', idioma: 'pt-BR' }, audio(50))
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = fabrica.open('babel-voz', 1)
      r.onsuccess = () => ok(r.result)
    })
    const tudo = await new Promise<unknown[]>((ok) => {
      const r = db.transaction('indice').objectStore('indice').getAll()
      r.onsuccess = () => ok(r.result)
    })
    expect(JSON.stringify(tudo)).not.toContain('segredo')
    expect(tudo).toHaveLength(1)
  })

  it('validade: áudio vencido não é servido, e sai quando o próximo é guardado', async () => {
    cache = novo({ validadeMs: 1000 })
    const velho = { texto: 'velho', idioma: 'en' }
    await cache.guardar(velho, audio(100))
    agora += 999
    expect(await cache.ler(velho)).not.toBeNull()
    agora += 1
    expect(await cache.ler(velho)).toBeNull()
    await cache.guardar({ texto: 'novo', idioma: 'en' }, audio(100))
    agora -= 1000 // mesmo voltando o relógio, o vencido já foi apagado
    expect(await cache.ler(velho)).toBeNull()
  })

  it('teto de tamanho: para o novo caber, sai o mais antigo', async () => {
    cache = novo({ tetoBytes: 1000 })
    const p = (n: number) => ({ texto: `frase ${n}`, idioma: 'en' })
    for (let n = 1; n <= 3; n++) {
      agora += 10
      await cache.guardar(p(n), audio(400, n))
    }
    // 1 saiu para o 3 caber (400 + 400 + 400 > 1000)
    expect(await cache.ler(p(1))).toBeNull()
    expect(await primeiroByte(await cache.ler(p(2)))).toBe(2)
    expect(await primeiroByte(await cache.ler(p(3)))).toBe(3)
  })

  it('guardar de novo o mesmo pedido troca o áudio e não conta duas vezes no teto', async () => {
    cache = novo({ tetoBytes: 1000 })
    const p = { texto: 'igual', idioma: 'en' }
    await cache.guardar(p, audio(600, 1))
    await cache.guardar(p, audio(600, 2))
    expect(await primeiroByte(await cache.ler(p))).toBe(2)
    await cache.guardar({ texto: 'outro', idioma: 'en' }, audio(300, 3))
    expect(await cache.ler(p)).not.toBeNull()
  })

  it('áudio vazio ou grande demais não entra', async () => {
    await cache.guardar({ texto: 'vazio', idioma: 'en' }, audio(0))
    await cache.guardar({ texto: 'enorme', idioma: 'en' }, audio(MAIOR_AUDIO_GUARDADO_BYTES + 1))
    expect(await cache.ler({ texto: 'vazio', idioma: 'en' })).toBeNull()
    expect(await cache.ler({ texto: 'enorme', idioma: 'en' })).toBeNull()
  })

  it('limpar apaga tudo', async () => {
    const p = { texto: 'a', idioma: 'en' }
    await cache.guardar(p, audio(10))
    await cache.limpar()
    expect(await cache.ler(p)).toBeNull()
  })

  it('sem IndexedDB: não guarda, não devolve e não quebra', async () => {
    const sem = criarCacheDeVoz({ fabrica: null })
    await sem.guardar({ texto: 'a', idioma: 'en' }, audio(10))
    expect(await sem.ler({ texto: 'a', idioma: 'en' })).toBeNull()
    await sem.limpar()
  })
})

describe('a voz da nuvem com o cache do aparelho', () => {
  /*
   * ESPERAS DETERMINÍSTICAS (antes: dois `setTimeout` de 5 ms, que sob carga não bastavam: a gravação no cache
   * é "dispara e esquece" e o resumo SHA-256 + o IndexedDB demoram o que a máquina deixar). Cada espera é por um
   * FATO observável, com teto de 5 s, e não por tempo fixo.
   */
  const ESPERA = { timeout: 5000, interval: 5 }
  const noCache = (g: GuardadosDaVoz, pedido: Parameters<GuardadosDaVoz['ler']>[0]) =>
    vi.waitFor(async () => expect(await g.ler(pedido)).not.toBeNull(), ESPERA)
  const PEDIDO_BOM_DIA = { texto: 'bom dia', idioma: 'pt-BR', voz: 'Kore' }
  const reserva = (): TtsEngine & { falas: string[] } => {
    const falas: string[] = []
    return {
      falas,
      speak: (texto: string, opts?: SpeakOptions) => {
        falas.push(texto)
        opts?.onStart?.()
      },
      cancel: () => undefined,
    }
  }
  const tocador = () => {
    const tocados: Blob[] = []
    let fim: (() => void) | null = null
    const fabrica = (blob: Blob): ReprodutorDaVoz => {
      tocados.push(blob)
      return {
        tocar: () => Promise.resolve(),
        parar: () => undefined,
        aoTerminar: (cb) => {
          fim = cb
        },
        aoFalhar: () => undefined,
      }
    }
    return { fabrica, tocados, terminar: () => fim?.() }
  }
  const cb = (): SpeakOptions =>
    ({ lang: 'pt-BR', onStart: vi.fn(), onEnd: vi.fn(), onError: vi.fn() }) as unknown as SpeakOptions

  function montar(o: { guardados: GuardadosDaVoz | null; temDireito?: () => boolean; respostas?: Response[] }) {
    const r = reserva()
    const t = tocador()
    const respostas = o.respostas ?? []
    const buscar = vi.fn(async () => respostas.shift() ?? new Response(audio(200, 9), { status: 200 }))
    const voz = criarVozDaNuvem({
      reserva: r,
      buscar,
      tocador: t.fabrica,
      voz: 'Kore',
      guardados: o.guardados,
      temDireito: o.temDireito ?? (() => true),
    })
    return { voz, buscar, tocador: t, reserva: r }
  }

  it('a mesma frase, em outra abertura do app: UM pedido ao servidor, e o segundo toca do aparelho', async () => {
    const guardados = criarCacheDeVoz({ fabrica: new IDBFactory() })
    const primeira = montar({ guardados })
    primeira.voz.speak('bom dia', cb())
    await vi.waitFor(() => expect(primeira.tocador.tocados).toHaveLength(1), ESPERA)
    await noCache(guardados, PEDIDO_BOM_DIA) // a gravação é "dispara e esquece": espera ela terminar
    expect(primeira.buscar).toHaveBeenCalledTimes(1)

    /* Outra voz (o app foi fechado e reaberto): a memória da última fala não existe mais. */
    const segunda = montar({ guardados })
    const c = cb()
    segunda.voz.speak('bom dia', c)
    await vi.waitFor(() => expect(segunda.tocador.tocados).toHaveLength(1), ESPERA)
    expect(segunda.buscar).not.toHaveBeenCalled()
    expect(await primeiroByte(segunda.tocador.tocados[0])).toBe(9)
    await vi.waitFor(() => expect(c.onStart).toHaveBeenCalledTimes(1), ESPERA)
    expect(segunda.voz.motorDaUltimaFala()).toBe('voz-da-nuvem')
    expect(segunda.reserva.falas).toHaveLength(0)
  })

  it('outra velocidade é outro áudio: vai ao servidor', async () => {
    const guardados = criarCacheDeVoz({ fabrica: new IDBFactory() })
    const m = montar({ guardados })
    m.voz.speak('bom dia', cb())
    await vi.waitFor(() => expect(m.tocador.tocados).toHaveLength(1), ESPERA)
    await noCache(guardados, PEDIDO_BOM_DIA)
    const outra = montar({ guardados })
    outra.voz.speak('bom dia', { ...cb(), rate: 0.8 } as SpeakOptions)
    await vi.waitFor(() => expect(outra.buscar).toHaveBeenCalledTimes(1), ESPERA)
    await vi.waitFor(() => expect(outra.tocador.tocados).toHaveLength(1), ESPERA)
  })

  it('sem o direito, nada muda: o áudio guardado não é servido nem guardado; o servidor decide (402) e o aparelho lê', async () => {
    const guardados = criarCacheDeVoz({ fabrica: new IDBFactory() })
    const comDireito = montar({ guardados })
    comDireito.voz.speak('bom dia', cb())
    await vi.waitFor(() => expect(comDireito.tocador.tocados).toHaveLength(1), ESPERA)
    await noCache(guardados, PEDIDO_BOM_DIA)

    const sem = montar({
      guardados,
      temDireito: () => false,
      respostas: [new Response(JSON.stringify({ code: 'plano' }), { status: 402 })],
    })
    sem.voz.speak('bom dia', cb())
    await vi.waitFor(() => expect(sem.reserva.falas).toEqual(['bom dia']), ESPERA)
    expect(sem.buscar).toHaveBeenCalledTimes(1)
    expect(sem.tocador.tocados).toHaveLength(0)
    expect(sem.reserva.falas).toEqual(['bom dia'])
  })

  it('com a nuvem pausada por uma recusa (402), o aparelho lê mesmo havendo áudio guardado', async () => {
    const guardados = criarCacheDeVoz({ fabrica: new IDBFactory() })
    await guardados.guardar({ texto: 'boa noite', idioma: 'pt-BR', voz: 'Kore' }, audio(100, 4))
    const m = montar({
      guardados,
      respostas: [new Response(JSON.stringify({ code: 'quota_exceeded' }), { status: 402 })],
    })
    m.voz.speak('frase nova', cb())
    await vi.waitFor(() => expect(m.reserva.falas).toEqual(['frase nova']), ESPERA)
    m.voz.speak('boa noite', cb())
    await vi.waitFor(() => expect(m.reserva.falas).toEqual(['frase nova', 'boa noite']), ESPERA)
    expect(m.tocador.tocados).toHaveLength(0)
    expect(m.reserva.falas).toEqual(['frase nova', 'boa noite'])
    expect(m.buscar).toHaveBeenCalledTimes(1)
  })

  it('resposta recusada não entra no cache', async () => {
    const guardados = criarCacheDeVoz({ fabrica: new IDBFactory() })
    const m = montar({ guardados, respostas: [new Response('{}', { status: 500 })] })
    m.voz.speak('bom dia', cb())
    // A recusa (500) faz o aparelho ler: é o fato que prova que a resposta já foi tratada (e não entrou no cache).
    await vi.waitFor(() => expect(m.reserva.falas).toEqual(['bom dia']), ESPERA)
    expect(await guardados.ler({ texto: 'bom dia', idioma: 'pt-BR', voz: 'Kore' })).toBeNull()
  })

  it('`guardados: null`: o pedido sai na hora, como antes', async () => {
    const m = montar({ guardados: null })
    m.voz.speak('bom dia', cb())
    expect(m.buscar).toHaveBeenCalledTimes(1)
  })
})
