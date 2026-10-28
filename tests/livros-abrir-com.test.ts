/**
 * "Abrir com o Frasy" (File Handling API): melhoria progressiva. Sem `launchQueue` não faz nada; com ela,
 * o primeiro arquivo da fila vai para a porta do leitor. O manifesto declara só EPUB e PDF.
 */
import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ligarAbrirCom } from '../src/lib/livros/abrirCom'

afterEach(() => {
  delete (globalThis as { launchQueue?: unknown }).launchQueue
})

describe('ligarAbrirCom', () => {
  it('sem launchQueue (Safari, aba comum) devolve false e não quebra', () => {
    expect(ligarAbrirCom(vi.fn())).toBe(false)
  })

  it('com launchQueue, o arquivo lançado é aberto', async () => {
    let consumidor: (p: { files?: Array<{ getFile(): Promise<File> }> }) => void = () => {}
    ;(globalThis as { launchQueue?: unknown }).launchQueue = { setConsumer: (c: typeof consumidor) => (consumidor = c) }
    const abrir = vi.fn(async () => undefined)
    expect(ligarAbrirCom(abrir)).toBe(true)
    const arquivo = new File(['x'], 'livro.epub')
    consumidor({ files: [{ getFile: async () => arquivo }] })
    await vi.waitFor(() => expect(abrir).toHaveBeenCalledWith(arquivo))
    consumidor({})
    expect(abrir).toHaveBeenCalledTimes(1)
  })
})

describe('site.webmanifest', () => {
  it('declara file_handlers só para EPUB e PDF, dentro do escopo, e mantém o resto', () => {
    const m = JSON.parse(readFileSync('public/site.webmanifest', 'utf8'))
    expect(m.start_url).toBe('/app')
    expect(m.file_handlers).toHaveLength(1)
    expect(m.file_handlers[0].action.startsWith('/')).toBe(true)
    expect(Object.keys(m.file_handlers[0].accept).sort()).toEqual(['application/epub+zip', 'application/pdf'])
  })
})
