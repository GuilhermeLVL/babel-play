import { describe, expect, it } from 'vitest'

import {
  consentimentoValido,
  CSP_DO_VLIBRAS,
  ORIGEM_DO_VLIBRAS,
  podeOferecerVLibras,
  portaoDoVLibras,
  RAIZ_DO_VLIBRAS,
  URL_DO_SCRIPT_DO_VLIBRAS,
} from '../src/core/libras/vlibras'

describe('portão do VLibras (piloto só para adultos)', () => {
  it('flag desligada, perfil protegido ou sem aceite: nunca carrega', () => {
    expect(portaoDoVLibras({ flag: false, protegido: false, consentimento: true })).toEqual({
      ok: false,
      motivo: 'flag_desligada',
    })
    expect(portaoDoVLibras({ flag: true, protegido: true, consentimento: true })).toEqual({
      ok: false,
      motivo: 'perfil_protegido',
    })
    expect(portaoDoVLibras({ flag: true, protegido: false, consentimento: false })).toEqual({
      ok: false,
      motivo: 'sem_consentimento',
    })
  })

  it('só adulto confirmado libera: idade desconhecida (undefined/null) é protegido', () => {
    for (const protegido of [undefined, null, 0, 'false'] as unknown[])
      expect(portaoDoVLibras({ flag: true, protegido: protegido as boolean, consentimento: true })).toMatchObject({
        ok: false,
        motivo: 'perfil_protegido',
      })
  })

  it('flag que não é exatamente true não libera', () => {
    for (const flag of [undefined, null, 1, 'true'] as unknown[])
      expect(portaoDoVLibras({ flag: flag as boolean, protegido: false, consentimento: true }).ok).toBe(false)
  })

  it('adulto, flag ligada e aceite: carrega', () => {
    expect(portaoDoVLibras({ flag: true, protegido: false, consentimento: true })).toEqual({ ok: true })
  })

  it('o botão aparece só com a flag e o adulto confirmado (o aceite vem depois, na tela)', () => {
    expect(podeOferecerVLibras({ flag: true, protegido: false })).toBe(true)
    expect(podeOferecerVLibras({ flag: false, protegido: false })).toBe(false)
    expect(podeOferecerVLibras({ flag: true, protegido: true })).toBe(false)
  })

  it('o consentimento guardado precisa ser o da versão atual', () => {
    expect(consentimentoValido(JSON.stringify({ v: 1, aceitoEm: 1 }))).toBe(true)
    for (const ruim of [null, '', 'x', '{}', JSON.stringify({ v: 0, aceitoEm: 1 }), JSON.stringify({ v: 1 }), 'true'])
      expect(consentimentoValido(ruim)).toBe(false)
  })

  it('o script oficial e os domínios da CSP', () => {
    expect(URL_DO_SCRIPT_DO_VLIBRAS).toBe('https://vlibras.gov.br/app/vlibras-plugin.js')
    expect(RAIZ_DO_VLIBRAS).toBe('https://vlibras.gov.br/app')
    expect(ORIGEM_DO_VLIBRAS).toBe('https://vlibras.gov.br')
    // O PostHog (analytics) nunca entra, e o jsdelivr só pelo caminho do repositório do VLibras.
    const todos = Object.values(CSP_DO_VLIBRAS).flat()
    expect(todos.some((h) => h.includes('posthog'))).toBe(false)
    expect(CSP_DO_VLIBRAS.script).toEqual([ORIGEM_DO_VLIBRAS, 'https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/'])
    expect(CSP_DO_VLIBRAS.connect).toEqual(
      expect.arrayContaining(['https://traducao2.vlibras.gov.br', 'https://dicionario2.vlibras.gov.br']),
    )
    expect(CSP_DO_VLIBRAS.frame).toEqual([ORIGEM_DO_VLIBRAS])
  })
})
