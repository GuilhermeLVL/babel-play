/**
 * O PORTÃO DO ESPELHO (change `modelos-confiaveis-e-offline`, 3.3): um arquivo do manifesto que não responde
 * 200 no bucket reprova o deploy ANTES de publicar a CSP sem o Hub. E o workflow chama o portão com as mesmas
 * variáveis do build.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it, vi } from 'vitest'

import { arquivosEsperados, conferirEspelho } from '../scripts/modelos/conferir-espelho'
import { ARQUIVOS_DO_PARAKEET } from '../src/gateway/adapters/parakeetArquivos'

const m = {
  'org/modelo@abc': { 'config.json': [10] as [number], 'onnx/m.onnx': [100, 'f'.repeat(64)] as [number, string] },
}

describe('arquivosEsperados', () => {
  it('o layout do publicar-no-r2: <base>/<modelo>/<sha>/<arquivo>, mais o Parakeet e o runtime', () => {
    const e = arquivosEsperados('https://modelos.frasy.com.br/', {
      m,
      ort: 'https://modelos.frasy.com.br/ort/1.26.0/',
      runtime: ['ort-wasm-simd-threaded.asyncify.wasm'],
    })
    const urls = e.map((a) => a.url)
    expect(urls).toContain('https://modelos.frasy.com.br/org/modelo/abc/onnx/m.onnx')
    expect(urls).toContain('https://modelos.frasy.com.br/ort/1.26.0/ort-wasm-simd-threaded.asyncify.wasm')
    expect(e).toHaveLength(2 + ARQUIVOS_DO_PARAKEET.length + 1)
  })
})

describe('conferirEspelho', () => {
  const resposta = (status: number, tamanho?: number) => ({
    status,
    headers: new Headers(tamanho ? { 'content-length': String(tamanho) } : {}),
  })

  it('tudo 200 e do tamanho certo: passa', async () => {
    const buscar = vi.fn(async (url: string) => resposta(200, url.endsWith('m.onnx') ? 100 : 10))
    const r = await conferirEspelho(arquivosEsperados('https://b', { m }).slice(0, 2), buscar)
    expect(r.faltando).toEqual([])
    expect(buscar).toHaveBeenCalledWith('https://b/org/modelo/abc/config.json', { method: 'HEAD' })
  })

  it('um arquivo ausente reprova, com o nome dele', async () => {
    const buscar = vi.fn(async (url: string) => (url.endsWith('m.onnx') ? resposta(404) : resposta(200, 10)))
    const r = await conferirEspelho(arquivosEsperados('https://b', { m }).slice(0, 2), buscar)
    expect(r.faltando).toEqual(['https://b/org/modelo/abc/onnx/m.onnx (HTTP 404)'])
  })

  it('tamanho diferente do manifesto também reprova', async () => {
    const r = await conferirEspelho([{ url: 'https://b/x', bytes: 100 }], async () => resposta(200, 50))
    expect(r.faltando[0]).toMatch(/tamanho 50/)
  })
})

describe('deploy-worker.yml', () => {
  const yml = readFileSync('.github/workflows/deploy-worker.yml', 'utf8')
  it('roda o portão do espelho antes do build, com as variáveis do Environment', () => {
    const portao = yml.indexOf('scripts/modelos/conferir-espelho.ts')
    expect(portao).toBeGreaterThan(0)
    expect(portao).toBeLessThan(yml.indexOf('run: npm run build'))
    expect(yml).toMatch(/--base="\$VITE_SELF_HOST_MODELS"/)
  })
})
