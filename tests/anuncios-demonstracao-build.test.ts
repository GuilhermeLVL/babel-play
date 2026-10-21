// @vitest-environment jsdom
/**
 * A DEMONSTRAÇÃO DE ANÚNCIOS POR VARIÁVEL DE BUILD (ruling R38).
 *
 *  - `ligarDemonstracaoDeAnuncios` só existe com `import.meta.env.DEV` ou `VITE_ANUNCIOS_DEMONSTRACAO === '1'`, e a
 *    condição é LITERAL (é o que deixa o Vite eliminar o ramo e o chunk no build sem a variável);
 *  - com a variável, a demonstração liga sem `localStorage`; sem ela e fora do DEV, nada é registrado nem com a
 *    chave local;
 *  - `scripts/anuncios/conferir-demonstracao.mjs` acha (ou não) o chunk da demonstração num `dist`. Os dois builds
 *    de verdade (com e sem a variável) são caros demais para a suíte: a conferência manual está em `docs/deploy.md`
 *    ("Anúncios") e no relatório da tarefa.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { arquivosDaDemonstracao } from '../scripts/anuncios/conferir-demonstracao.mjs'

const CONDICAO = "import.meta.env.DEV || import.meta.env.VITE_ANUNCIOS_DEMONSTRACAO === '1'"

async function carregar() {
  vi.resetModules()
  const { ligarDemonstracaoDeAnuncios } = await import('../src/components/anuncios/demonstracao/ligar')
  const provedor = await import('../src/lib/anuncios/provedor')
  return { ligarDemonstracaoDeAnuncios, provedor }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.unstubAllEnvs()
  localStorage.clear()
})

describe('ligar.ts: a demonstração só existe em DEV ou com VITE_ANUNCIOS_DEMONSTRACAO=1', () => {
  it('a condição é literal, em ligar.ts e em EspacoDeAnuncio.tsx (o Vite só elimina o que é literal)', () => {
    expect(readFileSync('src/components/anuncios/demonstracao/ligar.ts', 'utf8')).toContain(CONDICAO)
    expect(readFileSync('src/components/anuncios/EspacoDeAnuncio.tsx', 'utf8')).toContain(CONDICAO)
  })

  it('build de produção sem a variável: nada é registrado, nem com a chave local', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ANUNCIOS_DEMONSTRACAO', '')
    localStorage.setItem('babel.px.anunciosDeProva', '1')
    const { ligarDemonstracaoDeAnuncios, provedor } = await carregar()
    expect(await ligarDemonstracaoDeAnuncios()).toBe(false)
    expect(provedor.provedorDeAnuncios()).toBeNull()
  })

  it('build com VITE_ANUNCIOS_DEMONSTRACAO=1 (o staging): liga sem localStorage', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ANUNCIOS_DEMONSTRACAO', '1')
    const { ligarDemonstracaoDeAnuncios, provedor } = await carregar()
    expect(await ligarDemonstracaoDeAnuncios()).toBe(true)
    expect(provedor.provedorDeAnuncios()?.id).toBe('demonstracao')
  })

  it('outro valor que não "1" não liga', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_ANUNCIOS_DEMONSTRACAO', 'true')
    const { ligarDemonstracaoDeAnuncios, provedor } = await carregar()
    expect(await ligarDemonstracaoDeAnuncios()).toBe(false)
    expect(provedor.provedorDeAnuncios()).toBeNull()
  })

  it('em desenvolvimento, sem a variável: só com a chave local, como antes', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_ANUNCIOS_DEMONSTRACAO', '')
    let m = await carregar()
    expect(await m.ligarDemonstracaoDeAnuncios()).toBe(false)
    localStorage.setItem('babel.px.anunciosDeProva', '1')
    m = await carregar()
    expect(await m.ligarDemonstracaoDeAnuncios()).toBe(true)
  })
})

describe('conferir-demonstracao.mjs: o chunk da demonstração no dist', () => {
  const temporarios: string[] = []
  afterAll(() => {
    for (const d of temporarios) rmSync(d, { recursive: true, force: true })
  })
  const dist = (arquivos: Record<string, string>) => {
    const d = mkdtempSync(join(tmpdir(), 'dist-'))
    temporarios.push(d)
    mkdirSync(join(d, 'assets'))
    for (const [nome, texto] of Object.entries(arquivos)) writeFileSync(join(d, 'assets', nome), texto)
    return d
  }

  it('sem as marcas da demonstração: ausente', () => {
    expect(arquivosDaDemonstracao(dist({ 'index-a1.js': 'console.log("app")', 'index-a1.css': '.q{}' }))).toEqual([])
  })

  it('com o provedor de exemplo (marca inventada ou CSS dos espaços): presente', () => {
    const d = dist({
      'index-a1.js': 'console.log("app")',
      'provedor-x.js': 'const m={nome:"Tucano-Lilás Idiomas"}',
      'provedor-y.css': '.ad-fim-premio{display:flex}',
    })
    expect(
      arquivosDaDemonstracao(d)
        .map((f) => f.split('/').pop())
        .sort(),
    ).toEqual(['provedor-x.js', 'provedor-y.css'])
  })

  it('sem dist/assets: erro (rode o build antes)', () => {
    expect(() => arquivosDaDemonstracao(join(tmpdir(), 'nao-existe-mesmo'))).toThrow(/rode o build/)
  })
})
