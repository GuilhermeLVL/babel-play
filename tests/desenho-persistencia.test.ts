// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { desenhosDaSessao } from '../src/lib/desenho/desenhosDaSessao'
import {
  criarArmazemDeDesenhos,
  type DesenhoGuardado,
  registrarSalvador,
  trocarArmazemDeDesenhos,
} from '../src/lib/desenho/persistencia'

// PNG 3x2: só o cabeçalho IHDR importa para o tamanho.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAEUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
const traco = {
  f: 'caneta' as const,
  cor: '#ff0000',
  w: 3,
  a: 1,
  pts: [
    [1, 1, 1],
    [5, 5, 1],
  ] as [number, number, number][],
}
const desenho = (png?: string): DesenhoGuardado => ({
  v: 1,
  atualizadoEm: 1,
  quadros: [{ largura: 300, altura: 200, tracos: [traco], ...(png ? { png } : {}) }],
})

beforeEach(() => trocarArmazemDeDesenhos(null))

describe('persistência do desenho por sessão', () => {
  it('guarda e lê no IndexedDB, por sessão', async () => {
    const a = criarArmazemDeDesenhos({ fabrica: indexedDB, storage: null })
    expect(await a.gravar('s1', desenho(PNG))).toBe('ok')
    expect((await a.ler('s1'))?.quadros[0]?.tracos).toHaveLength(1)
    expect(await a.ler('s2')).toBeUndefined()
    await a.apagar('s1')
    expect(await a.ler('s1')).toBeUndefined()
  })

  it('sem IndexedDB cai no localStorage (sem o PNG) e depois na memória', async () => {
    const mem = new Map<string, string>()
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    }
    const a = criarArmazemDeDesenhos({ fabrica: undefined, storage })
    expect(await a.gravar('s1', desenho(PNG))).toBe('ok')
    const lido = await a.ler('s1')
    expect(lido?.quadros[0]?.png).toBeUndefined()
    expect(lido?.quadros[0]?.tracos).toHaveLength(1)
    const sem = criarArmazemDeDesenhos({ fabrica: undefined, storage: null })
    expect(await sem.gravar('s1', desenho())).toBe('indisponivel')
    expect((await sem.ler('s1'))?.quadros).toHaveLength(1) // ainda vale nesta abertura
  })

  it('cota cheia vira "cheio", sem quebrar', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('cheio', 'QuotaExceededError')
      },
      removeItem: () => undefined,
    }
    const a = criarArmazemDeDesenhos({ fabrica: undefined, storage })
    expect(await a.gravar('s1', desenho())).toBe('cheio')
  })

  it('o contrato: desenhosDaSessao devolve um item por quadro, com o tamanho do PNG', async () => {
    const a = criarArmazemDeDesenhos({ fabrica: indexedDB, storage: null })
    trocarArmazemDeDesenhos(a)
    expect(await desenhosDaSessao('vazia')).toEqual([])
    const d = desenho(PNG)
    d.quadros.push({ largura: 10, altura: 10, tracos: [traco], png: PNG }, { largura: 1, altura: 1, tracos: [] })
    await a.gravar('s1', d)
    const r = await desenhosDaSessao('s1')
    expect(r.map((x) => x.rotulo)).toEqual(['Desenho da leitura', 'Desenho 2'])
    expect(r[0]).toMatchObject({ png: PNG, largura: 3, altura: 2 })
  })

  it('salva o traço pendente antes de ler', async () => {
    const a = criarArmazemDeDesenhos({ fabrica: indexedDB, storage: null })
    trocarArmazemDeDesenhos(a)
    const sair = registrarSalvador('s9', async () => void (await a.gravar('s9', desenho(PNG))))
    expect(await desenhosDaSessao('s9')).toHaveLength(1)
    sair()
  })
})
