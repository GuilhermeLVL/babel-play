import { afterEach, describe, expect, it } from 'vitest'

import { abrirSessaoDeCaptura, cabecalhoDaSessaoDeCaptura, fecharSessaoDeCaptura } from '../src/lib/sessaoDeCaptura'

describe('sessão de captura (agrupamento no Langfuse)', () => {
  afterEach(() => fecharSessaoDeCaptura())

  it('fora de uma captura não manda cabeçalho', () => {
    expect(cabecalhoDaSessaoDeCaptura('/api/ai/stt')).toEqual({})
  })

  it('durante a captura, só as rotas de IA levam o id — e ele passa na validação do servidor', () => {
    const id = abrirSessaoDeCaptura()
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/) // SESSAO_VALIDA de server/ai/telemetriaDeIa.ts
    expect(cabecalhoDaSessaoDeCaptura('/api/ai/stt')).toEqual({ 'x-sessao-captura': id })
    expect(cabecalhoDaSessaoDeCaptura('/api/tutor/chat')).toEqual({ 'x-sessao-captura': id })
    expect(cabecalhoDaSessaoDeCaptura('/api/sessions')).toEqual({})
    expect(cabecalhoDaSessaoDeCaptura('/api/aid')).toEqual({})
  })

  it('cada START gera um id novo; STOP encerra', () => {
    const a = abrirSessaoDeCaptura()
    const b = abrirSessaoDeCaptura()
    expect(a).not.toBe(b)
    fecharSessaoDeCaptura()
    expect(cabecalhoDaSessaoDeCaptura('/api/ai/mt')).toEqual({})
  })
})
