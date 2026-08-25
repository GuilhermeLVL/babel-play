/**
 * F11-03 — o subtipo do `Content-Type` da capa não pode ser escolhido pelo usuário.
 *
 * Origem: o Semgrep apontou `res.send(capa.bytes)` em `server/routes/sessions.ts:87`. Exercitar o
 * caminho daquela linha revelou que `isSafeImageUrl` aceitava por PREFIXO `data:image/` e que
 * `lerCapaEmbutida` montava o MIME como `image/${subtipo}` verbatim — `svg+xml` casava nos dois,
 * e um SVG com `<script>` voltava servido como `image/svg+xml` com os bytes intactos.
 * Ver `audit/evidence/fase-11/capa-mime.json`.
 *
 * A guarda tem de valer nos DOIS lados, e cada metade tem o seu teste aqui:
 *   · ESCRITA  — `isSafeImageUrl`, para a capa hostil não entrar;
 *   · LEITURA  — `lerCapaEmbutida`, para as que já estão no banco não saírem.
 * Consertar só a escrita deixaria passando tudo o que foi gravado antes.
 */
import { describe, it, expect } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import { isSafeImageUrl, MAX_IMAGE_URL } from '../../server/validation'
import { lerCapaEmbutida, ehCapaEmbutida, SUBTIPOS_DE_CAPA_ACEITOS } from '../../server/lib/capaDeSessao'

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

const SVG_HOSTIL = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)"><script>alert(1)</script></svg>'
const URI_SVG = `data:image/svg+xml;base64,${b64(SVG_HOSTIL)}`
/** PNG de 1x1 de verdade — o controle: o caminho legítimo tem de continuar funcionando. */
const URI_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('F11-03 · escrita — isSafeImageUrl', () => {
  it('recusa data:image/svg+xml', () => {
    expect(isSafeImageUrl(URI_SVG)).toBe(false)
  })

  it('recusa svg+xml em qualquer caixa (a comparação é normalizada)', () => {
    expect(isSafeImageUrl(`data:IMAGE/SVG+XML;base64,${b64(SVG_HOSTIL)}`)).toBe(false)
  })

  it('recusa outros subtipos executáveis ou desconhecidos', () => {
    for (const sub of ['svg', 'xml', 'html', 'svg+xml;charset=utf-8', 'x-inventado']) {
      expect(isSafeImageUrl(`data:image/${sub};base64,${b64('x')}`), sub).toBe(false)
    }
  })

  it('aceita os subtipos da lista fechada', () => {
    for (const sub of SUBTIPOS_DE_CAPA_ACEITOS) {
      expect(isSafeImageUrl(`data:image/${sub};base64,${b64('x')}`), sub).toBe(true)
    }
  })

  it('continua aceitando https: e recusando os outros esquemas (S-13 não regrediu)', () => {
    expect(isSafeImageUrl('https://exemplo.test/capa.png')).toBe(true)
    for (const u of ['http://exemplo.test/a.png', 'javascript:alert(1)', 'file:///etc/passwd']) {
      expect(isSafeImageUrl(u), u).toBe(false)
    }
  })

  it('continua respeitando o teto de tamanho (P2-N5 não regrediu)', () => {
    expect(isSafeImageUrl(`data:image/png;base64,${'A'.repeat(MAX_IMAGE_URL)}`)).toBe(false)
  })
})

describe('F11-03 · leitura — lerCapaEmbutida', () => {
  it('devolve null para svg+xml, então o subtipo nunca vira Content-Type', () => {
    expect(lerCapaEmbutida(URI_SVG)).toBeNull()
  })

  it('não é tratada como capa embutida — o listador não a reescreve', () => {
    expect(ehCapaEmbutida(URI_SVG)).toBe(false)
  })

  it('o PNG de controle continua decodificando com o MIME certo', () => {
    const capa = lerCapaEmbutida(URI_PNG)
    expect(capa).not.toBeNull()
    expect(capa!.mime).toBe('image/png')
    expect(capa!.bytes.length).toBeGreaterThan(0)
  })
})

describe('F11-03 · o caminho HTTP, como sessions.ts:85-87 o exercita', () => {
  /** Replica o handler real: o que `lerCapaEmbutida` devolver vira Content-Type e corpo. */
  async function servir(uri: string) {
    const app = express()
    app.get('/capa', (_req, res) => {
      const capa = lerCapaEmbutida(uri)
      if (!capa) { res.status(404).json({ error: 'esta sessão não tem capa embutida' }); return }
      res.setHeader('Content-Type', capa.mime)
      res.send(capa.bytes)
    })
    const servidor = app.listen(0, '127.0.0.1')
    await new Promise((r) => servidor.once('listening', r))
    const { port } = servidor.address() as AddressInfo
    const resp = await fetch(`http://127.0.0.1:${port}/capa`)
    const corpo = await resp.text()
    await new Promise((r) => servidor.close(r))
    return { status: resp.status, tipo: resp.headers.get('content-type') ?? '', corpo }
  }

  it('a capa hostil não é servida — 404, sem Content-Type de SVG e sem o script', async () => {
    const r = await servir(URI_SVG)
    expect(r.status).toBe(404)
    expect(r.tipo).not.toMatch(/svg/i)
    expect(r.corpo).not.toMatch(/<script|onload=/i)
  }, 20_000)

  it('a capa legítima continua sendo servida como imagem', async () => {
    const r = await servir(URI_PNG)
    expect(r.status).toBe(200)
    expect(r.tipo).toMatch(/^image\/png/)
  }, 20_000)
})
