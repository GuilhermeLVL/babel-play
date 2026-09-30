/**
 * PROTOCOLO DO WORKER DO BERGAMOT — com o WASM SIMULADO (a prova com o motor de verdade é no
 * navegador; ver o relatório do A9b). O que estes testes prendem:
 *   - a carga baixa os três `.gz`, confere o sha256 do conteúdo DESCOMPRIMIDO e entrega ao motor os
 *     bytes certos, no alinhamento certo, e aquece antes do `ready`;
 *   - o motivo da falha é o que a janela precisa para decidir o que lembrar: rede, integridade, motor;
 *   - o que vai ao Cache Storage passou no hash, e a cópia corrompida volta da rede;
 *   - `descartar` solta o modelo e o serviço do heap do WASM;
 *   - lote na ordem, final na frente do parcial (a mesma fila do opus-mt).
 */
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

import { describe, expect, it, vi } from 'vitest'

import type { PlanoDeCarga } from '../src/gateway/adapters/bergamotModelo'
import {
  type CacheDoWorker,
  CONFIG_DO_MODELO,
  criarWorkerDoBergamot,
  type MensagemDoWorker,
  type ModuloBergamot,
} from '../src/gateway/adapters/bergamotWorker'

const hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

/** Conteúdo "de modelo" com cara de binário: o motor simulado confere que recebeu exatamente isto. */
const CONTEUDO = {
  modelo: new Uint8Array(Array.from({ length: 4096 }, (_, i) => (i * 7) % 251)),
  lex: new Uint8Array(Array.from({ length: 1024 }, (_, i) => (i * 13) % 199)),
  vocab: new Uint8Array(Array.from({ length: 512 }, (_, i) => (i * 3) % 97)),
}
const GZ = {
  modelo: new Uint8Array(gzipSync(CONTEUDO.modelo)),
  lex: new Uint8Array(gzipSync(CONTEUDO.lex)),
  vocab: new Uint8Array(gzipSync(CONTEUDO.vocab)),
}
const URL_BASE = 'https://app.exemplo/modelos/bergamot/pt-en/run1/'

function plano(sobre: Partial<Record<'modelo' | 'lex' | 'vocab', string>> = {}): PlanoDeCarga {
  const chaves = ['modelo', 'lex', 'vocab'] as const
  const arquivos = chaves.map((chave) => ({
    chave,
    url: `${URL_BASE}${chave}.gz`,
    bytes: GZ[chave].length,
    sha256: sobre[chave] ?? hex(CONTEUDO[chave]),
    alinhamento: chave === 'modelo' ? 256 : 64,
  }))
  return {
    par: 'pt-en',
    modelId: 'bergamot/pt-en',
    revisao: 'run1',
    motor: { wasm: 'https://app.exemplo/m/x.wasm', cola: 'https://app.exemplo/m/x.mjs' },
    arquivos,
    bytesTotais: arquivos.reduce((s, a) => s + a.bytes, 0),
  }
}

/** O módulo embind simulado: guarda o que recebeu e "traduz" com um prefixo. */
function moduloFalso(opcoes: { modeloQuebra?: boolean; traduzirQuebra?: boolean } = {}) {
  const registro = {
    memorias: [] as { bytes: Int8Array; alinhamento: number; apagada: boolean }[],
    modelos: [] as { config: string; modelo: Int8Array; lex: Int8Array; vocabs: Int8Array[]; apagado: boolean }[],
    servicos: [] as { apagado: boolean }[],
    traducoes: [] as string[][],
  }
  class AlignedMemory {
    registro: { bytes: Int8Array; alinhamento: number; apagada: boolean }
    constructor(n: number, alinhamento: number) {
      this.registro = { bytes: new Int8Array(n), alinhamento, apagada: false }
      registro.memorias.push(this.registro)
    }
    getByteArrayView() {
      return this.registro.bytes
    }
    delete() {
      this.registro.apagada = true
    }
  }
  class Vetor<T> {
    itens: T[] = []
    push_back(x: T) {
      this.itens.push(x)
    }
    delete() {}
  }
  class TranslationModel {
    r: (typeof registro.modelos)[number]
    constructor(config: string, modelo: AlignedMemory, lex: AlignedMemory, vocabs: Vetor<AlignedMemory>) {
      if (opcoes.modeloQuebra) throw new Error('bad_alloc')
      this.r = {
        config,
        modelo: modelo.registro.bytes,
        lex: lex.registro.bytes,
        vocabs: vocabs.itens.map((v) => v.registro.bytes),
        apagado: false,
      }
      registro.modelos.push(this.r)
    }
    delete() {
      this.r.apagado = true
    }
  }
  class BlockingService {
    r = { apagado: false }
    constructor() {
      registro.servicos.push(this.r)
    }
    translate(_m: TranslationModel, textos: Vetor<string>) {
      if (opcoes.traduzirQuebra && textos.itens[0] !== 'Bom dia.') throw new Error('RuntimeError: unreachable')
      registro.traducoes.push([...textos.itens])
      const saidas = textos.itens.map((t) => `EN(${t})`)
      return { size: () => saidas.length, get: (i: number) => ({ getTranslatedText: () => saidas[i] }), delete() {} }
    }
    delete() {
      this.r.apagado = true
    }
  }
  const M = {
    AlignedMemory,
    AlignedMemoryList: Vetor,
    TranslationModel,
    BlockingService,
    VectorString: Vetor,
    VectorResponseOptions: Vetor,
  } as unknown as ModuloBergamot
  return { M, registro }
}

function cacheFalso(): CacheDoWorker & { dados: Map<string, Uint8Array> } {
  const dados = new Map<string, Uint8Array>()
  return {
    dados,
    match: async (url) => (dados.has(url) ? new Response(dados.get(url)! as BodyInit) : undefined),
    put: async (url, r) => {
      dados.set(url, new Uint8Array(await r.arrayBuffer()))
    },
    delete: async (url) => dados.delete(url),
  }
}

function montar(
  opcoes: {
    servir?: (url: string) => Response | Promise<Response>
    modulo?: () => Promise<ModuloBergamot>
    cache?: CacheDoWorker | null
  } = {},
) {
  const enviadas: MensagemDoWorker[] = []
  const manifestos: unknown[] = []
  const falso = moduloFalso()
  const buscar = vi.fn(async (url: string) => {
    if (opcoes.servir) return opcoes.servir(url)
    const chave = (['modelo', 'lex', 'vocab'] as const).find((k) => url.endsWith(`${k}.gz`))
    return chave ? new Response(GZ[chave] as BodyInit) : new Response('não achei', { status: 404 })
  })
  const w = criarWorkerDoBergamot({
    buscar,
    abrirCache: async () => (opcoes.cache === undefined ? null : opcoes.cache),
    carregarModulo: opcoes.modulo ?? (async () => falso.M),
    enviar: (m) => enviadas.push(m),
    registrarManifesto: (m) => manifestos.push(m),
  })
  return { w, enviadas, manifestos, buscar, falso }
}

const tipos = (ms: MensagemDoWorker[]) => ms.map((m) => m.type)

describe('worker do Bergamot — carga', () => {
  it('baixa, confere, entrega ao motor os bytes descomprimidos no alinhamento certo e aquece antes do ready', async () => {
    const { w, enviadas, falso } = montar()
    await w.receber({ type: 'carregar', plano: plano() })
    expect(enviadas.at(-1)).toEqual({ type: 'ready', model: 'bergamot/pt-en' })
    const [m] = falso.registro.modelos
    expect(m.config).toBe(CONFIG_DO_MODELO)
    expect(Array.from(new Uint8Array(m.modelo.buffer))).toEqual(Array.from(CONTEUDO.modelo))
    expect(Array.from(new Uint8Array(m.lex.buffer))).toEqual(Array.from(CONTEUDO.lex))
    expect(Array.from(new Uint8Array(m.vocabs[0].buffer))).toEqual(Array.from(CONTEUDO.vocab))
    expect(falso.registro.memorias.map((x) => x.alinhamento).sort()).toEqual([256, 64, 64].sort())
    // Aquecimento: a primeira tradução (a cara, que prepara as matrizes int8) é nossa, não do usuário.
    expect(falso.registro.traducoes[0]).toEqual(['Bom dia.'])
  })

  it('a barra anda por bytes e termina em 100%', async () => {
    const { w, enviadas } = montar()
    await w.receber({ type: 'carregar', plano: plano() })
    const progresso = enviadas.filter((m) => m.type === 'progress') as Extract<MensagemDoWorker, { type: 'progress' }>[]
    expect(progresso.length).toBeGreaterThan(0)
    expect(progresso.at(-1)!.progress).toBe(1)
    expect(progresso.at(-1)!.total).toBe(plano().bytesTotais)
    for (let i = 1; i < progresso.length; i++)
      expect(progresso[i].progress).toBeGreaterThanOrEqual(progresso[i - 1].progress)
  })

  it('carregar duas vezes não baixa de novo (a mesma carga)', async () => {
    const { w, buscar, enviadas } = montar()
    await Promise.all([
      w.receber({ type: 'carregar', plano: plano() }),
      w.receber({ type: 'carregar', plano: plano() }),
    ])
    expect(buscar).toHaveBeenCalledTimes(3)
    expect(tipos(enviadas).filter((t) => t === 'ready')).toHaveLength(2)
  })

  it('sha256 que não confere → loadError de INTEGRIDADE e nada no cache', async () => {
    const cache = cacheFalso()
    const { w, enviadas, falso } = montar({ cache })
    await w.receber({ type: 'carregar', plano: plano({ lex: 'f'.repeat(64) }) })
    expect(enviadas.at(-1)).toMatchObject({ type: 'loadError', motivo: 'integridade', model: 'bergamot/pt-en' })
    expect(cache.dados.has(`${URL_BASE}lex.gz`)).toBe(false)
    expect(falso.registro.modelos).toHaveLength(0)
  })

  it('HTTP 404 (build sem o modelo) → loadError de REDE', async () => {
    const { w, enviadas } = montar({ servir: () => new Response('x', { status: 404 }) })
    await w.receber({ type: 'carregar', plano: plano() })
    expect(enviadas.at(-1)).toMatchObject({ type: 'loadError', motivo: 'rede' })
  })

  it('fetch que rejeita (sem internet) → REDE', async () => {
    const { w, enviadas } = montar({
      servir: () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await w.receber({ type: 'carregar', plano: plano() })
    expect(enviadas.at(-1)).toMatchObject({ type: 'loadError', motivo: 'rede' })
  })

  it('WASM que não instancia → MOTOR (é o que fica lembrado no aparelho)', async () => {
    const { w, enviadas } = montar({ modulo: () => Promise.reject(new Error('CompileError: bad magic')) })
    await w.receber({ type: 'carregar', plano: plano() })
    expect(enviadas.at(-1)).toMatchObject({ type: 'loadError', motivo: 'motor' })
  })

  it('cola que não chega (marcada como rede pelo worker real) → REDE, não motor', async () => {
    const { w, enviadas } = montar({
      modulo: () => Promise.reject(Object.assign(new Error('cola: 404'), { motivo: 'rede' })),
    })
    await w.receber({ type: 'carregar', plano: plano() })
    expect(enviadas.at(-1)).toMatchObject({ type: 'loadError', motivo: 'rede' })
  })

  it('modelo que não monta (TranslationModel lança) → MOTOR', async () => {
    const quebrado = moduloFalso({ modeloQuebra: true })
    const { w, enviadas } = montar({ modulo: async () => quebrado.M })
    await w.receber({ type: 'carregar', plano: plano() })
    expect(enviadas.at(-1)).toMatchObject({ type: 'loadError', motivo: 'motor' })
  })

  it('servidor que já descomprimiu (Content-Encoding) também serve: o hash é do conteúdo', async () => {
    const { w, enviadas } = montar({
      servir: (url) => {
        const chave = (['modelo', 'lex', 'vocab'] as const).find((k) => url.endsWith(`${k}.gz`))!
        return new Response(CONTEUDO[chave] as BodyInit)
      },
    })
    await w.receber({ type: 'carregar', plano: plano() })
    expect(enviadas.at(-1)).toEqual({ type: 'ready', model: 'bergamot/pt-en' })
  })
})

describe('worker do Bergamot — Cache Storage e manifesto', () => {
  it('guarda os .gz conferidos e grava o manifesto com a revisão (id da execução)', async () => {
    const cache = cacheFalso()
    const { w, manifestos } = montar({ cache })
    await w.receber({ type: 'carregar', plano: plano() })
    expect(cache.dados.size).toBe(3)
    expect(manifestos).toHaveLength(1)
    expect(manifestos[0]).toMatchObject({
      modelId: 'bergamot/pt-en',
      dtype: 'int8',
      device: 'wasm',
      revisao: 'run1',
      bytesTotais: plano().bytesTotais,
      bytesEsperados: plano().bytesTotais,
    })
  })

  it('a segunda carga (outra sessão) sai do cache, sem rede', async () => {
    const cache = cacheFalso()
    await montar({ cache }).w.receber({ type: 'carregar', plano: plano() })
    const segunda = montar({ cache })
    await segunda.w.receber({ type: 'carregar', plano: plano() })
    expect(segunda.buscar).not.toHaveBeenCalled()
    expect(segunda.enviadas.at(-1)).toEqual({ type: 'ready', model: 'bergamot/pt-en' })
  })

  it('cópia corrompida no cache: sai dele e volta da rede', async () => {
    const cache = cacheFalso()
    cache.dados.set(`${URL_BASE}modelo.gz`, new Uint8Array(gzipSync(Buffer.from('lixo'))))
    const { w, buscar, enviadas } = montar({ cache })
    await w.receber({ type: 'carregar', plano: plano() })
    expect(buscar).toHaveBeenCalledWith(`${URL_BASE}modelo.gz`)
    expect(Array.from(cache.dados.get(`${URL_BASE}modelo.gz`)!)).toEqual(Array.from(GZ.modelo))
    expect(enviadas.at(-1)).toEqual({ type: 'ready', model: 'bergamot/pt-en' })
  })
})

describe('worker do Bergamot — tradução e descarte', () => {
  it('traduz um LOTE na ordem', async () => {
    const { w, enviadas } = montar()
    await w.receber({ type: 'carregar', plano: plano() })
    await w.receber({ type: 'traduzir', id: 'a', textos: ['Olá.', 'Tudo bem?'] })
    expect(enviadas.at(-1)).toEqual({ type: 'result', id: 'a', textos: ['EN(Olá.)', 'EN(Tudo bem?)'] })
  })

  it('traduzir antes de carregar responde erro (a janela cai no opus-mt), não fica pendurado', async () => {
    const { w, enviadas } = montar()
    await w.receber({ type: 'traduzir', id: 'x', textos: ['oi'] })
    expect(enviadas.at(-1)).toEqual({ type: 'error', id: 'x', message: 'Bergamot não carregado' })
  })

  it('erro do motor numa tradução volta como `error` daquele pedido', async () => {
    const quebrado = moduloFalso({ traduzirQuebra: true })
    const { w, enviadas } = montar({ modulo: async () => quebrado.M })
    await w.receber({ type: 'carregar', plano: plano() })
    await w.receber({ type: 'traduzir', id: 'b', textos: ['Olá.'] })
    expect(enviadas.at(-1)).toMatchObject({ type: 'error', id: 'b' })
  })

  it('o final chega e o parcial que esperava é descartado (cancelado)', async () => {
    const { w, enviadas } = montar()
    await w.receber({ type: 'carregar', plano: plano() })
    const p1 = w.receber({ type: 'traduzir', id: 'p1', textos: ['par'], prioridade: 'parcial' })
    const p2 = w.receber({ type: 'traduzir', id: 'p2', textos: ['parc'], prioridade: 'parcial' })
    const f = w.receber({ type: 'traduzir', id: 'f', textos: ['final'], prioridade: 'final' })
    await Promise.all([p1, p2, f])
    const desfecho = Object.fromEntries(
      enviadas.filter((m) => 'id' in m).map((m) => [(m as { id: string }).id, m.type]),
    )
    expect(desfecho.f).toBe('result')
    expect(desfecho.p2).toBe('cancelado')
  })

  it('descartar solta modelo e serviço do heap do WASM; depois não traduz', async () => {
    const { w, enviadas, falso } = montar()
    await w.receber({ type: 'carregar', plano: plano() })
    await w.receber({ type: 'descartar' })
    expect(falso.registro.modelos[0].apagado).toBe(true)
    expect(falso.registro.servicos[0].apagado).toBe(true)
    expect(enviadas.at(-1)).toEqual({ type: 'descartado' })
    await w.receber({ type: 'traduzir', id: 'z', textos: ['oi'] })
    expect(enviadas.at(-1)).toMatchObject({ type: 'error', id: 'z' })
  })

  it('descartar DURANTE a carga: o que termina de montar é solto, não instalado', async () => {
    let liberar: (m: ModuloBergamot) => void = () => {}
    const falso = moduloFalso()
    const { w, enviadas } = montar({ modulo: () => new Promise<ModuloBergamot>((r) => (liberar = r)) })
    const carga = w.receber({ type: 'carregar', plano: plano() })
    await new Promise((r) => setTimeout(r, 10))
    await w.receber({ type: 'descartar' })
    liberar(falso.M)
    await carga
    expect(falso.registro.modelos[0].apagado).toBe(true)
    await w.receber({ type: 'traduzir', id: 'depois', textos: ['oi'] })
    expect(enviadas.at(-1)).toMatchObject({ type: 'error', id: 'depois' })
  })
})
