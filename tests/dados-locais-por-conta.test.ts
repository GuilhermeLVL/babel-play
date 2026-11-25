// @vitest-environment jsdom
/**
 * DADOS LOCAIS POR CONTA (revisão de segurança): o que a pessoa guarda SÓ NO APARELHO e é dela não pode passar para a
 * próxima conta num aparelho compartilhado. Cada armazém migrado para `lib/armazemLocalPorConta` é conferido em cinco
 * cenários: conta -> conta, recarga com outra conta, sair, "esquecer este navegador" e excluir a conta. Cada caso falha
 * sem a correção (antes, o ouvinte nascia só no primeiro uso e os registros não tinham dono).
 */
import 'fake-indexeddb/auto'

import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const supa = vi.hoisted(() => ({ signOut: vi.fn(async () => ({})) }))
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({
  supabase: { auth: supa },
  authRequired: true,
  carregarSupabase: async () => ({ auth: supa }),
}))
vi.mock('../src/data/funil', () => ({ apiFetch: api.apiFetch }))

import { limparTudo } from '../src/data/efemero/store'
import { excluirConta } from '../src/data/rotas/conta'
import {
  _reiniciarGuardaDosArmazensLocais,
  armazensPorContaRegistrados,
  criarChaveLocalPorConta,
} from '../src/lib/armazemLocalPorConta'
import { signOut } from '../src/lib/auth'
import {
  apagarRascunho,
  guardarRascunho,
  lerRascunhos,
  type RascunhoDaCaptura,
} from '../src/lib/captura/rascunhoDaCaptura'
import { _reiniciarGuardaDoAudioDoCartao, armazemDeAudioDoCartao } from '../src/lib/cartoes/audioDoCartao/armazem'
import { _reiniciarArmazemDeCenas, armazemDeCenas } from '../src/lib/cartoes/cenaDoCartao'
import {
  _reiniciarHistoricoDoDiario,
  gravarRascunhoDoDiario,
  historicoDoDiario,
  lerRascunhoDoDiario,
} from '../src/lib/diario/historico'
import { _esquecerEntitlementsEmMemoria, carregarEntitlements, getEntitlements } from '../src/lib/entitlements'
import { iniciarGuardaDosArmazensLocais } from '../src/lib/guardaDosArmazensLocais'
import { carregarConversas, novaConversa, salvarConversas } from '../src/lib/ichat/conversas'
import { _reiniciarIdentidade, definirDonoDaConta, definirIdentidade } from '../src/lib/identidade'
import { _reiniciarVozesGuardadas, vozesGuardadas } from '../src/lib/revisao/vozGuardada'
import { CHAVE_DO_DONO_DO_CACHE_DE_VOZ, comDonoDoCache, criarCacheDeVoz } from '../src/lib/voz/cacheDeVoz'

const espera = () => new Promise((r) => setTimeout(r, 40))
const blob = (n: number) => new Blob([new Uint8Array(n).fill(7)], { type: 'audio/ogg' })
const bancos = async () => (await indexedDB.databases()).map((d) => d.name)

const rascunhoDaCaptura = (): RascunhoDaCaptura => ({
  origemLocalId: 'cap-1',
  resumeId: null,
  titulo: 'Reunião',
  capa: '',
  durationMs: 1000,
  sourceLang: 'en',
  targetLang: 'pt',
  parConfigurado: { sourceLang: 'en', targetLang: 'pt' },
  utterances: [{ sourceText: 'hello' }],
  criadoEm: 1,
})

const entrar = (id: string) => {
  definirDonoDaConta(id)
  definirIdentidade('conta')
}

/** Cada armazém: grava como a conta de agora e diz se o que a conta de agora enxerga é só o que é dela (nada da outra). */
interface Caso {
  nome: string
  gravar(): Promise<void>
  /** Há algo da conta A visível para quem está agora? */
  vazaAlgo(): Promise<boolean>
  /** O que fica no aparelho depois de "esquecer"/excluir: bancos IndexedDB e chaves do localStorage. */
  bancos: string[]
  chaves: string[]
}

const casos: Caso[] = [
  {
    nome: 'áudio do cartão',
    gravar: async () => void (await armazemDeAudioDoCartao().gravar('c1', { audio: blob(50), durMs: 1000 })),
    vazaAlgo: async () => (await armazemDeAudioDoCartao().abrir('c1')) !== null,
    bancos: ['babel-audio-do-cartao'],
    chaves: [],
  },
  {
    nome: 'cena do cartão',
    gravar: async () => void (await armazemDeCenas().gravar('c1', { audio: blob(50), durMs: 0 })),
    vazaAlgo: async () => (await armazemDeCenas().abrir('c1')) !== null,
    bancos: ['babel-cena-do-cartao'],
    chaves: [],
  },
  {
    nome: 'histórico do diário',
    gravar: async () => {
      await historicoDoDiario().gravar({
        id: 'e1',
        em: 1,
        idioma: 'en',
        texto: 'I goed home',
        retorno: null,
        cartoes: [],
        descartados: [],
      })
    },
    vazaAlgo: async () => (await historicoDoDiario().listar()).length > 0,
    bancos: ['babel-diario'],
    chaves: [],
  },
  {
    nome: 'rascunho do diário',
    gravar: async () => gravarRascunhoDoDiario('meu texto'),
    vazaAlgo: async () => lerRascunhoDoDiario() !== '',
    bancos: [],
    chaves: ['frasy.diario.rascunho'],
  },
  {
    nome: 'minha voz no cartão (revisão)',
    gravar: async () => void (await vozesGuardadas().guardar('c1', { picos: [0.5], dur: 1000, audio: blob(50) })),
    vazaAlgo: async () => (await vozesGuardadas().listar('c1')).length > 0,
    bancos: ['babel-minha-voz'],
    chaves: [],
  },
  {
    nome: 'conversas do iChat',
    gravar: async () => {
      const c = { ...novaConversa(), titulo: 'Segredo da A' }
      salvarConversas([c], c.id)
    },
    vazaAlgo: async () => carregarConversas().conversas.some((c) => c.titulo === 'Segredo da A'),
    bancos: [],
    chaves: ['ichat_conversas'],
  },
  {
    nome: 'rascunho da captura (de uma conta)',
    gravar: async () => void guardarRascunho(rascunhoDaCaptura()),
    vazaAlgo: async () => lerRascunhos().length > 0,
    bancos: [],
    chaves: ['babel.capturas_pendentes'],
  },
  {
    nome: 'plano guardado (entitlements)',
    gravar: async () => {
      api.apiFetch.mockResolvedValue(
        new Response(JSON.stringify({ plan: 'premium', sttAoVivo: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      await carregarEntitlements()
    },
    vazaAlgo: async () => getEntitlements().plan === 'premium',
    bancos: [],
    chaves: ['babel.entitlements'],
  },
]

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
  _reiniciarIdentidade()
  _reiniciarGuardaDosArmazensLocais()
  _reiniciarGuardaDoAudioDoCartao()
  _reiniciarHistoricoDoDiario()
  _reiniciarVozesGuardadas()
  _reiniciarArmazemDeCenas()
  _esquecerEntitlementsEmMemoria()
  supa.signOut.mockClear()
  api.apiFetch.mockReset()
})
afterEach(() => _reiniciarIdentidade())

describe('a guarda cobre todos os armazéns migrados', () => {
  it('estão todos registrados já no boot, sem abrir nenhuma tela', () => {
    expect(armazensPorContaRegistrados().sort()).toEqual(
      [
        'audio-do-cartao',
        'cache-de-voz',
        'cena-do-cartao',
        'diario-historico',
        'diario-rascunho',
        'entitlements',
        'entitlements-em-memoria',
        'ichat-conversas',
        'minha-voz-do-cartao',
        'rascunho-da-captura',
      ].sort(),
    )
  })
})

describe.each(casos)('$nome', (c) => {
  it('conta -> conta: a B não vê o que a A guardou (o ouvinte já nasceu no boot)', async () => {
    entrar('A')
    iniciarGuardaDosArmazensLocais() // como no main.tsx
    await c.gravar()
    expect(await c.vazaAlgo()).toBe(true)
    definirDonoDaConta('B')
    await espera()
    expect(await c.vazaAlgo()).toBe(false)
    definirDonoDaConta('A') // e a A também não o recupera: trocar apaga
    await espera()
    expect(await c.vazaAlgo()).toBe(false)
  })

  it('recarga com outra conta: sem ouvinte nenhum, o dado de A não aparece para B (cada registro tem dono)', async () => {
    entrar('A')
    await c.gravar()
    expect(await c.vazaAlgo()).toBe(true)
    // "recarrega": o módulo de identidade e os singletons nascem de novo; o disco (IndexedDB/localStorage) fica
    _reiniciarIdentidade()
    _reiniciarGuardaDosArmazensLocais()
    _reiniciarGuardaDoAudioDoCartao()
    _reiniciarHistoricoDoDiario()
    _reiniciarVozesGuardadas()
    _reiniciarArmazemDeCenas()
    _esquecerEntitlementsEmMemoria()
    entrar('B')
    expect(await c.vazaAlgo()).toBe(false)
  })

  it('sair: depois de sair e entrar, nada do que a conta deixou', async () => {
    entrar('A')
    iniciarGuardaDosArmazensLocais()
    await c.gravar()
    definirDonoDaConta(null)
    definirIdentidade('anonimo')
    await espera()
    entrar('A')
    await espera()
    expect(await c.vazaAlgo()).toBe(false)
  })

  it('signOut() apaga mesmo sem o ouvinte', async () => {
    entrar('A')
    await c.gravar()
    _reiniciarGuardaDosArmazensLocais()
    await signOut()
    expect(supa.signOut).toHaveBeenCalled()
    expect(await c.vazaAlgo()).toBe(false)
  })

  it('limparTudo() ("esquecer este navegador") destrói o banco e a chave', async () => {
    entrar('A')
    await c.gravar()
    for (const b of c.bancos) expect(await bancos()).toContain(b)
    await limparTudo()
    for (const b of c.bancos) expect(await bancos()).not.toContain(b)
    for (const k of c.chaves) expect(localStorage.getItem(k)).toBeNull()
  })

  it('excluirConta() com sucesso destrói; com falha, não', async () => {
    entrar('A')
    await c.gravar()
    api.apiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 500 }))
    await excluirConta()
    for (const b of c.bancos) expect(await bancos()).toContain(b)
    for (const k of c.chaves) expect(localStorage.getItem(k)).not.toBeNull()
    api.apiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await excluirConta()
    for (const b of c.bancos) expect(await bancos()).not.toContain(b)
    for (const k of c.chaves) expect(localStorage.getItem(k)).toBeNull()
  })
})

describe('o rascunho do visitante passa para a conta que entra (a captura que o login interrompeu)', () => {
  it('anônimo -> conta mantém; conta A -> conta B não; sair apaga o da conta', async () => {
    definirIdentidade('anonimo')
    iniciarGuardaDosArmazensLocais()
    guardarRascunho(rascunhoDaCaptura())
    entrar('A')
    await espera()
    expect(lerRascunhos()).toHaveLength(1) // adotado pela conta A (e leva o dono dela na próxima gravação)
    guardarRascunho({ ...rascunhoDaCaptura(), origemLocalId: 'cap-2' })
    definirDonoDaConta('B')
    await espera()
    expect(lerRascunhos()).toHaveLength(0)
    guardarRascunho(rascunhoDaCaptura())
    definirDonoDaConta(null)
    definirIdentidade('anonimo')
    await espera()
    expect(lerRascunhos()).toHaveLength(0)
    apagarRascunho('cap-1')
  })
})

describe('a chave local por conta', () => {
  it('valor de antes da regra (sem dono) sai ao ser lido; sem dono conhecido não lê nem grava', () => {
    let dono: string | null = 'A'
    const k = criarChaveLocalPorConta<string>('teste.chave', { dono: () => dono })
    localStorage.setItem('teste.chave', JSON.stringify(['velho']))
    expect(k.ler()).toBeNull()
    expect(localStorage.getItem('teste.chave')).toBeNull()
    expect(k.gravar('x')).toBe(true)
    dono = null
    expect(k.ler()).toBeNull()
    expect(k.gravar('y')).toBe(false)
    dono = 'B'
    expect(k.ler()).toBeNull()
    expect(localStorage.getItem('teste.chave')).toBeNull() // a leitura da B apagou o da A
  })
})

describe('o rascunho do visitante adotado não vaza para a conta seguinte', () => {
  it('visitante começa, A entra e adota, A sai, B entra: B não vê', async () => {
    definirIdentidade('anonimo')
    iniciarGuardaDosArmazensLocais()
    guardarRascunho(rascunhoDaCaptura())
    entrar('A')
    await espera()
    expect(lerRascunhos()).toHaveLength(1) // A adotou
    // a adoção regravou o registro como DA conta A (não fica `anonimo`)
    expect(JSON.parse(localStorage.getItem('babel.capturas_pendentes') ?? '{}').dono).toBe('A')
    definirDonoDaConta(null)
    definirIdentidade('anonimo')
    await espera()
    entrar('B')
    await espera()
    expect(lerRascunhos()).toHaveLength(0)
  })

  it('sair apaga também o registro anônimo que A não chegou a ler; conta -> conta idem', async () => {
    definirIdentidade('anonimo')
    iniciarGuardaDosArmazensLocais()
    guardarRascunho(rascunhoDaCaptura())
    entrar('A') // A não lê: o registro segue `anonimo`
    await espera()
    definirDonoDaConta('B') // conta -> conta
    await espera()
    expect(localStorage.getItem('babel.capturas_pendentes')).toBeNull()
    definirIdentidade('anonimo')
    guardarRascunho(rascunhoDaCaptura())
    entrar('A')
    await espera()
    definirDonoDaConta(null)
    definirIdentidade('anonimo') // sair
    await espera()
    expect(localStorage.getItem('babel.capturas_pendentes')).toBeNull()
  })
})

describe('o cache de voz tem dono', () => {
  const pedidoDeVoz = { texto: 'good morning', idioma: 'en', voz: 'v', velocidade: 1 }
  const novo = (dono: () => string | null) => comDonoDoCache(criarCacheDeVoz({ fabrica: new IDBFactory() }), dono)

  it('o áudio que a A gerou não chega à B no mesmo aparelho (sem ouvinte, só pelo dono do cache)', async () => {
    const f = new IDBFactory()
    let dono: string | null = 'A'
    const cache = comDonoDoCache(criarCacheDeVoz({ fabrica: f }), () => dono)
    await cache.guardar(pedidoDeVoz, blob(100))
    expect(await cache.ler(pedidoDeVoz)).not.toBeNull()
    dono = 'B'
    expect(await cache.ler(pedidoDeVoz)).toBeNull()
    dono = 'A' // e a B limpou o cache inteiro: a A também não o recupera
    expect(await cache.ler(pedidoDeVoz)).toBeNull()
  })

  it('cache de antes da regra (sem dono guardado) é esvaziado; purgarDeOutros limpa se o dono mudou', async () => {
    const f = new IDBFactory()
    const bruto = criarCacheDeVoz({ fabrica: f })
    await bruto.guardar(pedidoDeVoz, blob(100)) // sem dono guardado
    let dono: string | null = 'A'
    const cache = comDonoDoCache(criarCacheDeVoz({ fabrica: f }), () => dono)
    expect(await cache.ler(pedidoDeVoz)).toBeNull()
    await cache.guardar(pedidoDeVoz, blob(100))
    dono = 'B'
    await cache.purgarDeOutros()
    dono = 'B'
    expect(await bruto.ler(pedidoDeVoz)).toBeNull()
  })

  it('sem dono conhecido (identidade carregando) não lê nem grava', async () => {
    const cache = novo(() => null)
    await cache.guardar(pedidoDeVoz, blob(100))
    expect(await cache.ler(pedidoDeVoz)).toBeNull()
    expect(localStorage.getItem(CHAVE_DO_DONO_DO_CACHE_DE_VOZ)).toBeNull()
  })
})
