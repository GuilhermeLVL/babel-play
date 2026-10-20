/**
 * Importação de página web (Fase 3, T8): charset e extração com linkedom + Readability.
 *
 * Mesmo mecanismo de `tests/seguranca/ssrf-rebinding.test.ts`: a guarda de NOME é neutralizada, e aqui
 * também o `fetchSeguro` vira um `fetch` comum, para um servidor HTTP em loopback ser aceito (a conexão
 * pelo despachante seguro recusaria o loopback). A guarda em si é coberta por `ssrf-rebinding`/`ssrf-vetores`.
 */
import { createServer, type Server } from 'node:http'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../server/ai/ssrf', async (original) => {
  const real = await original<typeof import('../../server/ai/ssrf')>()
  return {
    ...real,
    assertPublicUrl: vi.fn(async () => {}),
    fetchSeguro: vi.fn((url: string, init: RequestInit) =>
      fetch(url, { ...init, dispatcher: undefined } as RequestInit),
    ),
  }
})

import { decodificarHtml, extractArticle } from '../../server/import/web'

const PARAGRAFO =
  'A ação do tempo transforma a informação; a educação é a base da organização social e da coração humana. '.repeat(8)

let alvo: Server
let base = ''
const paginas = new Map<string, { tipo: string; corpo: Buffer }>()

const pagina = (cabeca: string, texto = PARAGRAFO) =>
  `<html><head>${cabeca}</head><body><article><h1>Título</h1><p>${texto}</p><p>mais ${texto}</p></article></body></html>`

beforeAll(async () => {
  alvo = createServer((req, res) => {
    const p = paginas.get(req.url ?? '')
    if (!p) {
      res.statusCode = 404
      res.end()
      return
    }
    res.setHeader('content-type', p.tipo)
    res.end(p.corpo)
  })
  await new Promise<void>((ok) => alvo.listen(0, '127.0.0.1', () => ok()))
  const e = alvo.address()
  base = `http://127.0.0.1:${typeof e === 'object' && e ? e.port : 0}`
})

afterAll(async () => {
  await new Promise<void>((ok) => alvo.close(() => ok()))
})

describe('importação de página web', () => {
  it('página em ISO-8859-1 declarada no Content-Type → "ação" íntegro', async () => {
    paginas.set('/iso', {
      tipo: 'text/html; charset=ISO-8859-1',
      corpo: Buffer.from(pagina('<title>Ação</title>'), 'latin1'),
    })
    const r = await extractArticle(`${base}/iso`)
    expect(r.text).toContain('A ação do tempo')
    expect(r.text).not.toContain('�')
    expect(r.title).toBe('Ação')
  })

  it('página em windows-1252 declarada só no <meta charset> → sem mojibake', async () => {
    paginas.set('/w1252', {
      tipo: 'text/html',
      corpo: Buffer.from(pagina('<meta charset="windows-1252"><title>Coração</title>'), 'latin1'),
    })
    const r = await extractArticle(`${base}/w1252`)
    expect(r.text).toContain('informação')
    expect(r.text).not.toMatch(/Ã|�/)
    expect(r.title).toBe('Coração')
  })

  it('charset inválido → cai em utf-8 sem lançar', async () => {
    paginas.set('/invalido', {
      tipo: 'text/html; charset=nao-existe-9',
      corpo: Buffer.from(pagina('<title>Ação</title>'), 'utf8'),
    })
    const r = await extractArticle(`${base}/invalido`)
    expect(r.text).toContain('A ação do tempo')
    expect(decodificarHtml(new TextEncoder().encode('ação'), 'text/html; charset=xyz')).toBe('ação')
    expect(decodificarHtml(new TextEncoder().encode('<meta charset="xyz">ação'), null)).toContain('ação')
  })

  it('artigo com <p> dentro de <article> → text extraído e title do <title>', async () => {
    paginas.set('/artigo', {
      tipo: 'text/html; charset=utf-8',
      corpo: Buffer.from(
        pagina('<title>Meu artigo</title>', `${PARAGRAFO} <a href="/x">link relativo</a> <a href="rel">outro</a>`),
        'utf8',
      ),
    })
    const r = await extractArticle(`${base}/artigo`)
    expect(r.title).toBe('Meu artigo')
    expect(r.text).toContain('A ação do tempo')
    expect(r.text).toContain('link relativo')
  })

  it('página sem texto principal → "não consegui extrair o texto principal"', async () => {
    paginas.set('/vazia', {
      tipo: 'text/html; charset=utf-8',
      corpo: Buffer.from('<html><head><title>x</title></head><body></body></html>', 'utf8'),
    })
    await expect(extractArticle(`${base}/vazia`)).rejects.toThrow('não consegui extrair o texto principal desta página')
  })
})
