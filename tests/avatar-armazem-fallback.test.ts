// @vitest-environment jsdom
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TETO_DO_MODELO_BYTES } from '../src/core/avatar/tiers'
import {
  apagar,
  apagarModelo,
  esquecerConexaoDoAvatar,
  lerModeloImportado,
  lerReceita,
  salvarModeloImportado,
  salvarReceita,
} from '../src/lib/avatar/armazem'
import { detectarTier, sinaisDoAparelho, temWebGL2 } from '../src/lib/avatar/detectarTier'
import { descritorDoFallback, iniciaisDe } from '../src/lib/avatar/fallback2d'

const receita = (origem = 'importado', id = 'meu-modelo') => ({
  versao: 1,
  base: { origem, id },
  paleta: { pele: 'pele-3', cabelo: 'cabelo-1', olhos: 'olhos-2' },
  pecas: ['bone-azul'],
  ajustes: { escala: 1 },
  meta: { nome: 'Ana', criadoEm: 1_790_000_000_000 },
})

beforeEach(async () => {
  await esquecerConexaoDoAvatar()
  indexedDB = new IDBFactory()
  localStorage.clear()
})

describe('armazém do avatar (IndexedDB frasy-avatar)', () => {
  it('guarda e lê a receita; espelha no localStorage', async () => {
    expect(await salvarReceita('eu', receita())).toBe(true)
    expect(await lerReceita('eu')).toEqual(receita())
    expect(JSON.parse(localStorage.getItem('frasy.avatar.receita.eu')!)).toEqual(receita())
  })

  it('recusa receita inválida e id esquisito, sem gravar nada', async () => {
    expect(await salvarReceita('eu', { ...receita(), extra: 1 })).toBe(false)
    expect(await salvarReceita('../x', receita())).toBe(false)
    expect(await salvarReceita('a'.repeat(65), receita())).toBe(false)
    expect(await lerReceita('eu')).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('o que está no disco passa por validação: espelho adulterado é ignorado', async () => {
    localStorage.setItem('frasy.avatar.receita.eu', JSON.stringify({ ...receita(), base: { origem: 'x', id: '1' } }))
    expect(await lerReceita('eu')).toBeNull()
    localStorage.setItem('frasy.avatar.receita.eu', '{não é json')
    expect(await lerReceita('eu')).toBeNull()
  })

  it('guarda o modelo como bytes e devolve um Blob; recusa acima do teto e vazio', async () => {
    const bytes = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0])
    expect(await salvarModeloImportado('meu-modelo', new Blob([bytes], { type: 'model/gltf-binary' }))).toBe(true)
    const volta = await lerModeloImportado('meu-modelo')
    expect(volta?.type).toBe('model/gltf-binary')
    expect(new Uint8Array(await volta!.arrayBuffer())).toEqual(bytes)
    expect(await salvarModeloImportado('grande', { size: TETO_DO_MODELO_BYTES + 1 } as Blob)).toBe(false)
    expect(await salvarModeloImportado('vazio', new Blob([]))).toBe(false)
    expect(await lerModeloImportado('nunca-guardado')).toBeNull()
  })

  it('apagar remove a receita, o espelho e o modelo importado dela', async () => {
    await salvarReceita('eu', receita())
    await salvarModeloImportado('meu-modelo', new Blob(['abcd']))
    await apagar('eu')
    expect(await lerReceita('eu')).toBeNull()
    expect(localStorage.getItem('frasy.avatar.receita.eu')).toBeNull()
    expect(await lerModeloImportado('meu-modelo')).toBeNull()
  })

  it('apagar não mexe no modelo quando a base é da coleção', async () => {
    await salvarReceita('eu', receita('colecao', 'milk'))
    await salvarModeloImportado('milk', new Blob(['abcd']))
    await apagar('eu')
    expect(await lerModeloImportado('milk')).not.toBeNull()
    await apagarModelo('milk')
    expect(await lerModeloImportado('milk')).toBeNull()
  })

  it('com o IndexedDB quebrado, cai no espelho e nunca lança', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('indisponível')
    })
    await esquecerConexaoDoAvatar()
    expect(await salvarReceita('eu', receita())).toBe(true)
    expect(await lerReceita('eu')).toEqual(receita())
    expect(await salvarModeloImportado('m', new Blob(['x']))).toBe(false)
    expect(await lerModeloImportado('m')).toBeNull()
    vi.restoreAllMocks()
  })

  it('com o localStorage bloqueado, segue pelo IndexedDB', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cota')
    })
    expect(await salvarReceita('eu', receita())).toBe(true)
    expect(await lerReceita('eu')).toEqual(receita())
    vi.restoreAllMocks()
  })
})

describe('fallback 2D', () => {
  it('iniciais: primeira e última palavra, acentos e emoji', () => {
    expect(iniciaisDe('Ana Maria Souza')).toBe('AS')
    expect(iniciaisDe('ana')).toBe('A')
    expect(iniciaisDe('  élcio  ')).toBe('É')
    expect(iniciaisDe('')).toBe('?')
    expect(iniciaisDe(null)).toBe('?')
    expect(iniciaisDe('!!! ???')).toBe('?')
    expect(iniciaisDe('李 小龙')).toBe('李小')
  })

  it('sem foto, devolve as iniciais; com foto local válida, a foto', () => {
    expect(descritorDoFallback({ usuario: 'u1', nome: 'Bia Lima', motivo: 'sem_webgl2' })).toEqual({
      tipo: 'iniciais',
      texto: 'BL',
      motivo: 'sem_webgl2',
    })
    localStorage.setItem('babel.fotoDoPerfil.u1', 'data:image/jpeg;base64,AAAA')
    expect(descritorDoFallback({ usuario: 'u1', nome: 'Bia Lima', motivo: 'carregando' })).toMatchObject({
      tipo: 'foto',
      src: 'data:image/jpeg;base64,AAAA',
    })
  })

  it('ignora no armazenamento qualquer "foto" que não seja data URL de imagem', () => {
    for (const ruim of ['https://tracker.exemplo/p.gif', 'javascript:alert(1)', 'data:text/html;base64,AAAA']) {
      localStorage.setItem('babel.fotoDoPerfil.u2', ruim)
      expect(descritorDoFallback({ usuario: 'u2', nome: 'Caio', motivo: 'erro_de_carga' }).tipo).toBe('iniciais')
    }
  })
})

describe('detecção de tier e WebGL2', () => {
  it('lê os sinais do navegador e escolhe o tier', () => {
    vi.stubGlobal('navigator', { deviceMemory: 8, hardwareConcurrency: 12, connection: { saveData: false } })
    expect(sinaisDoAparelho()).toMatchObject({ memoriaGb: 8, nucleos: 12, saveData: false })
    expect(detectarTier()).toBe('forte')
    expect(detectarTier({ saveData: true })).toBe('fraco')
    vi.stubGlobal('navigator', { hardwareConcurrency: 2 })
    expect(detectarTier()).toBe('fraco')
    vi.unstubAllGlobals()
  })

  it('jsdom não tem WebGL2: temWebGL2 é false e não lança', () => {
    expect(temWebGL2()).toBe(false)
  })
})
