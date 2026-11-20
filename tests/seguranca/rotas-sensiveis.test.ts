/**
 * Achado da auditoria de 17/10/2026, reproduzido antes de corrigir: `DELETE /API/me` e `PATCH /API/admin/...` (caixa trocada)
 * chegavam ao router mas escapavam da lista de rotas sensíveis, e com isso do segundo fator (AAL2). (A bomba de .docx do
 * mesmo dia agora é coberta em `tests/extrair-documento.test.ts`.)
 */
import { describe, expect, it } from 'vitest'

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
