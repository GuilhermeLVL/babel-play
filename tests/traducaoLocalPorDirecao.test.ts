/**
 * TRADUÇÃO LOCAL POR DIREÇÃO (openspec `traducao-local-por-direcao`, tarefas 2.2, 3.1 e 3.3). O que estes testes prendem:
 *   - a flag `traducao_local_por_direcao` gateia o USO: só flag ligada + `VITE_BERGAMOT_MODELOS_URL` (no build,
 *     `__BERGAMOT_CDN__`) abrem os pares do CDN; o pt→en embutido não depende dela (comportamento de hoje);
 *   - a tabela por direção: X→en é do Bergamot, en→pt-BR é do opus-mt (`>>pt_br<<`) e o Bergamot NUNCA sai do inglês sem
 *     o veredito `aprovado`; o pivô muda a 2ª perna conforme o veredito;
 *   - `routeMt` consome a tabela e, para o que existe hoje, devolve a mesma escada de antes;
 *   - os perfis nativos listam `bergamot-local` antes de `opus-mt-local`; perfil salvo só com `opus-mt-local` segue válido;
 *   - falha do Bergamot (inclusive sha256 que não confere) cai no opus-mt sem erro visível, sem um 2º opus-mt.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { routeMt } from '../src/core/harness/roteadorDeTraducao'
import { FLAG_TRADUCAO_LOCAL_POR_DIRECAO } from '../src/core/planos'
import { motoresLocaisDaDirecao, pernasDaRotaLocal, vereditoDaDirecao } from '../src/core/traducao/rotaPorDirecao'
import vereditosVersionados from '../src/core/traducao/vereditoPorDirecao.json'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

describe('tabela da rota por direção (pura)', () => {
  const APROVADO = { 'en-pt': 'aprovado' }

  it('o veredito versionado de en→pt é "nao-avaliado": o opus-mt segue na frente', () => {
    expect(vereditosVersionados['en-pt']).toBe('nao-avaliado')
    expect(vereditoDaDirecao('en', 'pt-BR')).toBe('nao-avaliado')
    expect(motoresLocaisDaDirecao('en', 'pt-BR')).toEqual(['opus-mt-local'])
  })

  it.each(['pt', 'es', 'fr', 'de', 'it', 'ru', 'ar', 'ja', 'ko', 'zh', 'cs', 'fi', 'hu', 'nl', 'pl', 'th'])(
    'X→en (%s→en): Bergamot primeiro, opus-mt de reserva',
    (x) => {
      expect(motoresLocaisDaDirecao(x, 'en')).toEqual(['bergamot-local', 'opus-mt-local'])
      expect(motoresLocaisDaDirecao(`${x}-XX`, 'en-US')).toEqual(['bergamot-local', 'opus-mt-local'])
    },
  )

  it('saindo do inglês o Bergamot nunca entra: en→pt-BR, en→es, en→fr, en→ja', () => {
    for (const alvo of ['pt', 'pt-BR', 'es', 'fr', 'de', 'ja'])
      expect(motoresLocaisDaDirecao('en', alvo), `en→${alvo}`).toEqual(['opus-mt-local'])
  })

  it.each(['reprovado', 'inconclusivo', 'nao-avaliado', 'lixo'])('veredito "%s": en→pt continua no opus-mt', (v) => {
    expect(motoresLocaisDaDirecao('en', 'pt-BR', { 'en-pt': v })).toEqual(['opus-mt-local'])
  })

  it('só o veredito "aprovado" põe o leve na frente do en→pt (o veredito vem de dado)', () => {
    expect(motoresLocaisDaDirecao('en', 'pt-BR', APROVADO)).toEqual(['bergamot-local', 'opus-mt-local'])
    expect(motoresLocaisDaDirecao('en', 'es', APROVADO)).toEqual(['opus-mt-local'])
  })

  it('pivô es→pt nas duas situações do veredito: a 1ª perna é do Bergamot, a 2ª segue a linha de en→pt', () => {
    expect(pernasDaRotaLocal('es', 'pt-BR')).toEqual([
      { de: 'es', para: 'en', motores: ['bergamot-local', 'opus-mt-local'] },
      { de: 'en', para: 'pt', motores: ['opus-mt-local'] },
    ])
    expect(pernasDaRotaLocal('es', 'pt-BR', APROVADO)[1]).toEqual({
      de: 'en',
      para: 'pt',
      motores: ['bergamot-local', 'opus-mt-local'],
    })
  })

  it('mesmo idioma não tem rota', () => {
    expect(pernasDaRotaLocal('pt', 'pt-BR')).toEqual([])
  })
})

describe('routeMt consome a tabela (nada muda com o veredito atual)', () => {
  const tudo = { tradutorNativo: false, opusMt: true, bergamot: true, nuvem: false, memoria: false, dicionario: false }
  const locais = (origem: string, destino: string, d = tudo) =>
    routeMt({
      texto: 'uma frase de teste',
      origem,
      destino,
      ehToqueEmPalavra: false,
      parcial: false,
      pago: false,
      consentimento: false,
      falada: false,
      disponibilidade: d,
    })
      .degraus.filter((g) => g.degrau === 'local')
      .map((g) => g.motor)

  it('X→en e pivô: Bergamot e depois opus-mt', () => {
    expect(locais('pt', 'en')).toEqual(['bergamot-local', 'opus-mt-local'])
    expect(locais('es', 'en')).toEqual(['bergamot-local', 'opus-mt-local'])
    expect(locais('es', 'pt')).toEqual(['bergamot-local', 'opus-mt-local'])
  })

  it('en→pt-BR: só o opus-mt, mesmo com o Bergamot dito disponível', () => {
    expect(locais('en', 'pt-BR')).toEqual(['opus-mt-local'])
    expect(locais('en', 'es')).toEqual(['opus-mt-local'])
  })

  it('Bergamot indisponível (flag desligada, sem modelo): só o opus-mt, nas mesmas direções', () => {
    const sem = { ...tudo, bergamot: false }
    expect(locais('es', 'en', sem)).toEqual(['opus-mt-local'])
    expect(locais('pt', 'en', sem)).toEqual(['opus-mt-local'])
  })
})

/* ---------- o gate, os perfis e a cadeia, com workers falsos ---------- */

type Mensagem = { type: string; src?: string; tgt?: string; plano?: { par: string } }

class WorkerFalso {
  static todos: WorkerFalso[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  recebidas: Mensagem[] = []
  readonly tipo: 'bergamot' | 'opus'
  constructor(url: URL | string) {
    this.tipo = String(url).includes('bergamotWorker') ? 'bergamot' : 'opus'
    WorkerFalso.todos.push(this)
  }
  static de(tipo: 'bergamot' | 'opus') {
    return WorkerFalso.todos.filter((w) => w.tipo === tipo)
  }
  postMessage(m: Mensagem & { id?: string; textos?: string[]; text?: string }) {
    this.recebidas.push(m)
    if (m.type === 'traduzir' && this.tipo === 'bergamot')
      queueMicrotask(() =>
        this.responder({ type: 'result', id: m.id, textos: m.textos!.map((t) => `[bergamot] ${t}`) }),
      )
    if (m.type === 'translate' && this.tipo === 'opus')
      queueMicrotask(() => this.responder({ type: 'result', id: m.id, text: `[opus] ${m.text}` }))
  }
  responder(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
  terminate() {}
}

function localStorageFalso() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

function prepararAmbiente(opcoes: { flag: boolean; url: boolean }) {
  vi.resetModules()
  WorkerFalso.todos = []
  vi.stubGlobal('Worker', WorkerFalso)
  vi.stubGlobal('__BERGAMOT_PT_EN__', true)
  vi.stubGlobal('__BERGAMOT_CDN__', opcoes.url)
  const ls = localStorageFalso()
  if (opcoes.flag) ls.setItem('babel.flags', JSON.stringify({ [FLAG_TRADUCAO_LOCAL_POR_DIRECAO]: { ligada: true } }))
  vi.stubGlobal('localStorage', ls)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('gate da flag (flag × URL × par)', () => {
  const grade = [
    { flag: false, url: false },
    { flag: false, url: true },
    { flag: true, url: false },
    { flag: true, url: true },
  ]
  it.each(grade)('flag=$flag url=$url', async ({ flag, url }) => {
    prepararAmbiente({ flag, url })
    const m = await import('../src/gateway/adapters/bergamotModelo')
    const abreCdn = flag && url
    // O pt→en embutido não depende da flag: é o comportamento de hoje.
    expect(m.bergamotOferecido('pt', 'en')).toBe(true)
    // O resto vem do CDN: só abre com a flag E a URL.
    for (const x of ['es', 'ja', 'fr', 'de']) {
      expect(m.bergamotOferecido(x, 'en'), `${x}→en`).toBe(abreCdn)
      expect(m.parNoBuild(`${x}-en` as never), `${x}-en no build`).toBe(abreCdn)
    }
    expect(m.bergamotCdnNoBuild()).toBe(abreCdn)
    // Saindo do inglês, nunca (qualquer combinação).
    expect(m.bergamotOferecido('en', 'pt')).toBe(false)
    expect(m.bergamotOferecido('en', 'es')).toBe(false)
  })

  it('flag desligada com a URL definida: es→en usa o opus-mt e nenhum worker do Bergamot abre', async () => {
    prepararAmbiente({ flag: false, url: true })
    const { BergamotLocal, TradutorLocalComBergamot } = await import('../src/gateway/adapters/bergamotLocal')
    const { OpusMtLocal } = await import('../src/gateway/adapters/opusMtLocal')
    const local = new TradutorLocalComBergamot(new BergamotLocal(), new OpusMtLocal())
    local.preload('es', 'en')
    expect(WorkerFalso.de('bergamot')).toHaveLength(0)
    expect(WorkerFalso.de('opus')[0].recebidas[0]).toMatchObject({ type: 'preload', src: 'es', tgt: 'en' })
  })

  it('flag ligada sem a URL: só o pt→en embutido usa o Bergamot', async () => {
    prepararAmbiente({ flag: true, url: false })
    const { BergamotLocal } = await import('../src/gateway/adapters/bergamotLocal')
    const b = new BergamotLocal()
    expect(b.supports('pt', 'en')).toBe(true)
    expect(b.supports('es', 'en')).toBe(false)
  })
})

describe('perfis nativos', () => {
  it('free-web, local-private e cloud-quality: bergamot-local logo antes de opus-mt-local', async () => {
    const { BUILTIN_PROFILES } = await import('../src/gateway/profiles')
    expect(BUILTIN_PROFILES.map((p) => p.id)).toEqual(['free-web', 'local-private', 'cloud-quality'])
    for (const p of BUILTIN_PROFILES) {
      const ids = (p.bindings.mt ?? []).map((b) => b.adapterId)
      expect(ids.indexOf('bergamot-local'), p.id).toBe(ids.indexOf('opus-mt-local') - 1)
      expect(ids[0], p.id).toBe('chrome-translator')
      expect(ids.at(-1), p.id).toBe('mymemory')
    }
    const livre = BUILTIN_PROFILES.find((p) => p.id === 'free-web')!
    expect(livre.bindings.mt!.map((b) => b.adapterId)).toEqual([
      'chrome-translator',
      'bergamot-local',
      'opus-mt-local',
      'server-llm-mt',
      'mymemory',
    ])
  })
})

describe('cadeia com os dois bindings (gateway de verdade)', () => {
  const perfil = (mt: { adapterId: string }[]) =>
    ({
      id: 't',
      name: 't',
      builtin: true,
      economyMode: false,
      budget: { maxCloudRequests: 0, maxTokens: 0 },
      bindings: { mt },
    }) as never
  const NOVA = [{ adapterId: 'bergamot-local' }, { adapterId: 'opus-mt-local' }]

  async function gateway(mt = NOVA) {
    const { buildGateway } = await import('../src/gateway/index')
    return buildGateway({ profile: perfil(mt), cloudConsent: () => false })
  }

  it('desligada, pt→en: Bergamot carrega sem baixar o opus-mt; pronto, responde bergamot-local (igual a hoje)', async () => {
    prepararAmbiente({ flag: false, url: true })
    const gw = await gateway()
    const prontos = vi.fn()
    gw.mt.aoFicarPronto(prontos)
    await expect(gw.mt.translate('bom dia', 'pt', 'en')).rejects.toMatchObject({
      name: 'NoRouteError',
      carregando: true,
    })
    expect(WorkerFalso.de('opus')).toHaveLength(0)
    WorkerFalso.de('bergamot')[0].responder({ type: 'ready', model: 'bergamot/pt-en' })
    await tick()
    // O aviso de "pronto" chega UMA vez (os dois bindings veem o mesmo Bergamot).
    expect(prontos).toHaveBeenCalledTimes(1)
    expect(await gw.mt.translate('bom dia', 'pt', 'en')).toMatchObject({ engine: 'bergamot-local' })
  })

  it('desligada, es→en: nenhum worker do Bergamot; o opus-mt é o tradutor', async () => {
    prepararAmbiente({ flag: false, url: true })
    const gw = await gateway()
    await expect(gw.mt.translate('hola', 'es', 'en')).rejects.toMatchObject({ name: 'NoRouteError' })
    expect(WorkerFalso.de('bergamot')).toHaveLength(0)
    expect(WorkerFalso.de('opus')).toHaveLength(1)
  })

  it('ligada, es→en: o worker do es-en abre e o opus-mt NÃO baixa junto', async () => {
    prepararAmbiente({ flag: true, url: true })
    const gw = await gateway()
    await expect(gw.mt.translate('hola', 'es', 'en')).rejects.toMatchObject({ name: 'NoRouteError', carregando: true })
    expect(WorkerFalso.de('bergamot')[0].recebidas[0]).toMatchObject({ type: 'carregar', plano: { par: 'es-en' } })
    expect(WorkerFalso.de('opus')).toHaveLength(0)
    WorkerFalso.de('bergamot')[0].responder({ type: 'ready', model: 'bergamot/es-en' })
    await tick()
    expect(await gw.mt.translate('hola', 'es', 'en')).toMatchObject({
      engine: 'bergamot-local',
      text: '[bergamot] hola',
    })
  })

  it('ligada, en→pt-BR: o Bergamot nunca é consultado; o opus-mt traduz', async () => {
    prepararAmbiente({ flag: true, url: true })
    const gw = await gateway()
    await expect(gw.mt.translate('good morning', 'en', 'pt-BR')).rejects.toMatchObject({ name: 'NoRouteError' })
    expect(WorkerFalso.de('bergamot')).toHaveLength(0)
    expect(WorkerFalso.de('opus')).toHaveLength(1)
    expect(WorkerFalso.de('opus')[0].recebidas[0]).toMatchObject({ type: 'preload', src: 'en', tgt: 'pt-BR' })
  })

  it('ligada: o par de es-en falha no sha256 (integridade) → o opus-mt assume, sem erro visível e sem 2º opus-mt', async () => {
    prepararAmbiente({ flag: true, url: true })
    const gw = await gateway()
    await expect(gw.mt.translate('hola', 'es', 'en')).rejects.toMatchObject({ carregando: true })
    const b = WorkerFalso.de('bergamot')[0]
    b.responder({
      type: 'loadError',
      model: 'bergamot/es-en',
      motivo: 'integridade',
      message: 'modelo: sha256 não confere',
    })
    const opus = WorkerFalso.de('opus')
    expect(opus).toHaveLength(1)
    expect(opus[0].recebidas[0]).toMatchObject({ type: 'preload', src: 'es', tgt: 'en' })
    opus[0].responder({ type: 'ready', model: 'Xenova/opus-mt-es-en' })
    await tick()
    expect(await gw.mt.translate('hola', 'es', 'en')).toMatchObject({ engine: 'opus-mt-local', text: '[opus] hola' })
    // O pt→en (outro par) segue no Bergamot: a falha de integridade tirou só o es-en.
    await expect(gw.mt.translate('bom dia', 'pt', 'en')).rejects.toMatchObject({ carregando: true })
    expect(WorkerFalso.de('bergamot').some((w) => w.recebidas[0]?.plano?.par === 'pt-en')).toBe(true)
  })

  it('perfil salvo SÓ com opus-mt-local segue válido: pt→en no Bergamot, en→pt no opus-mt', async () => {
    prepararAmbiente({ flag: false, url: false })
    const gw = await gateway([{ adapterId: 'opus-mt-local' }])
    await expect(gw.mt.translate('bom dia', 'pt', 'en')).rejects.toMatchObject({ carregando: true })
    WorkerFalso.de('bergamot')[0].responder({ type: 'ready', model: 'bergamot/pt-en' })
    await tick()
    expect(await gw.mt.translate('bom dia', 'pt', 'en')).toMatchObject({ engine: 'bergamot-local' })
    await expect(gw.mt.translate('good morning', 'en', 'pt')).rejects.toMatchObject({ name: 'NoRouteError' })
    expect(WorkerFalso.de('opus')).toHaveLength(1)
  })

  it('os dois bindings compartilham UM tradutor local: um só opus-mt mesmo no pivô', async () => {
    prepararAmbiente({ flag: true, url: true })
    const gw = await gateway()
    gw.mt.warmup([['es', 'pt']])
    expect(WorkerFalso.de('opus')).toHaveLength(1)
    expect(WorkerFalso.de('opus')[0].recebidas[0]).toMatchObject({ type: 'preload', src: 'en', tgt: 'pt' })
    expect(WorkerFalso.de('bergamot')).toHaveLength(1)
  })
})
