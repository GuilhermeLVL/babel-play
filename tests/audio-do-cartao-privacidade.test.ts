// @vitest-environment jsdom
/**
 * PRIVACIDADE DO ÁUDIO DO CARTÃO (openspec `cartao-com-audio-do-trecho`, correção da revisão de segurança).
 * O clipe é a voz de alguém e mora só no aparelho: não pode passar para a próxima conta (conta->conta, sair, recarga)
 * nem sobreviver a "esquecer este navegador" e a "excluir conta". Cada caso falha sem a correção.
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
import { signOut } from '../src/lib/auth'
import {
  _reiniciarGuardaDoAudioDoCartao,
  armazemDeAudioDoCartao,
  criarArmazemDeAudioDoCartao,
} from '../src/lib/cartoes/audioDoCartao/armazem'
import { _reiniciarGuardaDosArmazensLocais, iniciarGuardaDosArmazensLocais } from '../src/lib/guardaDosArmazensLocais'
import { _reiniciarIdentidade, definirDonoDaConta, definirIdentidade } from '../src/lib/identidade'

const blob = (n: number) => new Blob([new Uint8Array(n).fill(7)], { type: 'audio/ogg' })
const bancos = async () => (await indexedDB.databases()).map((d) => d.name)
const espera = () => new Promise((r) => setTimeout(r, 30))

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  _reiniciarIdentidade()
  _reiniciarGuardaDoAudioDoCartao()
  _reiniciarGuardaDosArmazensLocais()
  supa.signOut.mockClear()
  api.apiFetch.mockReset()
})
afterEach(() => _reiniciarIdentidade())

describe('o clipe tem dono', () => {
  it('conta A grava; com o dono B no mesmo banco (recarga) o clipe não abre e sai', async () => {
    let dono: string | null = 'A'
    const f = new IDBFactory()
    const a = criarArmazemDeAudioDoCartao({ fabrica: f, dono: () => dono })
    expect(await a.gravar('c1', { audio: blob(100), durMs: 3000 })).toBe(true)
    dono = 'B'
    expect(await a.abrir('c1')).toBeNull()
    dono = 'A'
    expect(await a.abrir('c1')).toBeNull() // já foi descartado, não volta
    expect((await a.uso()).clipes).toBe(0)
  })

  it('linha de antes da regra (sem dono) não é de ninguém: sai ao abrir e ao medir o uso', async () => {
    const f = new IDBFactory()
    const sem = criarArmazemDeAudioDoCartao({ fabrica: f, dono: () => 'A' })
    await sem.uso() // cria o banco
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = f.open('babel-audio-do-cartao', 1)
      r.onsuccess = () => ok(r.result)
    })
    const linha = { cartao: 'velho', em: 1, durMs: 1000, tipo: 'audio/ogg', bytes: new ArrayBuffer(8), tamanho: 8 }
    await new Promise((ok) => {
      const t = db.transaction('clipes', 'readwrite')
      t.objectStore('clipes').put(linha)
      t.oncomplete = () => ok(null)
    })
    db.close()
    const a = criarArmazemDeAudioDoCartao({ fabrica: f, dono: () => 'A' })
    expect(await a.abrir('velho')).toBeNull()
    expect((await a.uso()).clipes).toBe(0)
  })

  it('sem dono conhecido (identidade carregando) não grava nem lê', async () => {
    const a = criarArmazemDeAudioDoCartao({ fabrica: new IDBFactory(), dono: () => null })
    expect(await a.gravar('c1', { audio: blob(10), durMs: 1000 })).toBe(false)
    expect(await a.abrir('c1')).toBeNull()
  })

  it('o clipe de um dono não aparece para o outro', async () => {
    let dono = 'A'
    const a = criarArmazemDeAudioDoCartao({ fabrica: new IDBFactory(), dono: () => dono })
    await a.gravar('a1', { audio: blob(100), durMs: 1 })
    dono = 'B'
    await a.gravar('b1', { audio: blob(100), durMs: 1 })
    dono = 'A'
    expect(await a.abrir('a1')).toBeNull()
    dono = 'B'
    expect((await a.abrir('b1'))?.audio.size).toBe(100)
  })
})

describe('o ouvinte nasce no boot', () => {
  it('troca conta -> conta (o estado não muda) apaga o clipe da primeira, sem ninguém abrir os Ajustes', async () => {
    definirDonoDaConta('A')
    definirIdentidade('conta')
    iniciarGuardaDosArmazensLocais() // como no main.tsx: antes de qualquer uso do armazém
    await armazemDeAudioDoCartao().gravar('c1', { audio: blob(100), durMs: 3000 })
    definirDonoDaConta('B')
    await espera()
    definirDonoDaConta('A')
    await espera()
    // sem a troca apagar, A voltaria a ver o clipe; o que A gravou antes de B não fica à espera
    expect(await armazemDeAudioDoCartao().abrir('c1')).toBeNull()
  })

  it('sair (conta -> anônimo) apaga tudo', async () => {
    definirDonoDaConta('A')
    definirIdentidade('conta')
    iniciarGuardaDosArmazensLocais()
    await armazemDeAudioDoCartao().gravar('c1', { audio: blob(100), durMs: 3000 })
    definirDonoDaConta(null)
    definirIdentidade('anonimo')
    await espera()
    definirDonoDaConta('A')
    definirIdentidade('conta')
    await espera()
    expect(await armazemDeAudioDoCartao().abrir('c1')).toBeNull()
  })

  it('signOut() apaga os áudios mesmo sem o ouvinte', async () => {
    definirDonoDaConta('A')
    definirIdentidade('conta')
    await armazemDeAudioDoCartao().gravar('c1', { audio: blob(100), durMs: 3000 })
    _reiniciarGuardaDoAudioDoCartao()
    _reiniciarGuardaDosArmazensLocais() // sem ouvinte
    await signOut()
    expect(supa.signOut).toHaveBeenCalled()
    expect(await armazemDeAudioDoCartao().abrir('c1')).toBeNull()
    // o apagarTudo do signOut esvaziou o banco: nada a descartar por dono
    const raw = await new Promise<number>((ok) => {
      const r = indexedDB.open('babel-audio-do-cartao', 1)
      r.onsuccess = () => {
        const c = r.result.transaction('clipes').objectStore('clipes').count()
        c.onsuccess = () => ok(c.result)
      }
    })
    expect(raw).toBe(0)
  })
})

describe('apagar o banco', () => {
  it('limparTudo() ("esquecer este navegador") apaga o banco do áudio do cartão', async () => {
    definirIdentidade('anonimo')
    await armazemDeAudioDoCartao().gravar('c1', { audio: blob(100), durMs: 3000 })
    expect(await bancos()).toContain('babel-audio-do-cartao')
    await limparTudo()
    expect(await bancos()).not.toContain('babel-audio-do-cartao')
  })

  it('excluirConta() com sucesso apaga o banco; com falha, não', async () => {
    definirIdentidade('anonimo')
    await armazemDeAudioDoCartao().gravar('c1', { audio: blob(100), durMs: 3000 })
    api.apiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 500 }))
    await excluirConta()
    expect(await bancos()).toContain('babel-audio-do-cartao')
    api.apiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await excluirConta()
    expect(await bancos()).not.toContain('babel-audio-do-cartao')
  })
})
