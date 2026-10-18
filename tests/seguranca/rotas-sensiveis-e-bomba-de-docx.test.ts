/**
 * Dois achados da auditoria de 17/10/2026, reproduzidos antes de corrigir:
 *  - `DELETE /API/me` e `PATCH /API/admin/...` (caixa trocada) chegavam ao router mas escapavam da lista de rotas
 *    sensíveis, e com isso do segundo fator (AAL2);
 *  - um .docx de 300 KB com um `document.xml` de 300 MB virava 1,4 GB de memória e derrubava o servidor.
 */
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { extractDocument } from '../../server/import/document'
import { ehRotaSensivel } from '../../server/lib/aal'

describe('ehRotaSensivel ignora a caixa da URL', () => {
  it.each([
    ['DELETE', '/API/me'],
    ['DELETE', '/Api/Me'],
    ['GET', '/API/me/exportar'],
    ['PATCH', '/API/admin/users/x'],
    ['POST', '/Api/Billing/subscribe'],
    ['POST', '/API/ai/credentials'],
  ])('%s %s é sensível', (metodo, caminho) => {
    expect(ehRotaSensivel(metodo, caminho)).toBe(true)
  })

  it('o webhook da cobrança e as leituras continuam livres', () => {
    expect(ehRotaSensivel('POST', '/API/billing/webhook/asaas')).toBe(false)
    expect(ehRotaSensivel('GET', '/api/me')).toBe(false)
  })
})

describe('.docx que expande demais', () => {
  it('é recusado antes de o mammoth abrir', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', Buffer.alloc(30 * 1024 * 1024, 0x61), { compression: 'DEFLATE' })
    const docx = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    expect(docx.length).toBeLessThan(200 * 1024)
    await expect(extractDocument(docx, 'bomba.docx', '')).rejects.toThrow(/teto|recusado|declara/)
  })
})
