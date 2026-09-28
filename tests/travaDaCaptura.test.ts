/**
 * A TRAVA DE SAÍDA DA CAPTURA DEPOIS DE SALVAR (relato do dono, 2026-09-28).
 *
 * "Salvar e ficar aqui" deixava as falas na tela; sair perguntava de novo e "Salvar na Biblioteca"
 * criava uma segunda sessão. A trava agora só vale para o que se perderia.
 */
import { describe, expect, it } from 'vitest'

import { capturaEmRisco } from '../src/lib/captura/estadoDoSalvamento'

const base = { gravando: false, falas: 3, salva: false, salvando: false, noRascunho: false }

describe('capturaEmRisco', () => {
  it('gravando: trava sempre', () => {
    expect(capturaEmRisco({ ...base, gravando: true, salva: true })).toBe(true)
  })
  it('falas não salvas: trava', () => {
    expect(capturaEmRisco(base)).toBe(true)
  })
  it('depois de "Salvar e ficar aqui": NÃO trava (e não há como salvar de novo pela trava)', () => {
    expect(capturaEmRisco({ ...base, salva: true })).toBe(false)
  })
  it('salvando em segundo plano: sair é seguro, o trabalho continua', () => {
    expect(capturaEmRisco({ ...base, salvando: true })).toBe(false)
  })
  it('recusada mas guardada no rascunho: sair não perde nada', () => {
    expect(capturaEmRisco({ ...base, noRascunho: true })).toBe(false)
  })
  it('sem falas: nada a proteger', () => {
    expect(capturaEmRisco({ ...base, falas: 0 })).toBe(false)
  })
})
