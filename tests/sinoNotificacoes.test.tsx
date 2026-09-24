// @vitest-environment jsdom
/**
 * O SINO respeita as preferências de aviso (Ajustes → Notificações): o tipo desligado "no app"
 * some da lista e da contagem. A sessão salva não tem chave lá e aparece sempre.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CentralDeNotificacoes from '../src/components/shell/CentralDeNotificacoes'
import { _zerarNotificacoes, notificar } from '../src/lib/notificacoes'

const avisos = {
  revisao: { app: false, email: false, push: false },
  conquista: { app: true, email: false, push: false },
  fatura: { app: true, email: false, push: false },
  novidades: { app: true, email: false, push: false },
}
vi.mock('../src/lib/preferencias', () => ({ usePreferencias: () => ({ avisos }) }))

describe('sino de notificações', () => {
  beforeEach(() => {
    _zerarNotificacoes()
    notificar({
      chave: 'rev',
      tipo: 'revisao',
      icone: 'target',
      titulo: '3 palavras esperando revisão',
      detalhe: 'd',
      ir: 'study',
    })
    notificar({
      chave: 'c',
      tipo: 'conquista',
      icone: 'award',
      titulo: 'Conquista: Primeira captura',
      detalhe: 'd',
      ir: 'loja',
    })
    notificar({
      chave: 's',
      tipo: 'sessao',
      icone: 'library',
      titulo: 'Sessão salva: Aula',
      detalhe: 'd',
      ir: 'analysis',
    })
  })
  afterEach(cleanup)

  it('esconde o tipo desligado e conta só o que mostra; o item leva ao destino e fica lido', () => {
    const ir = vi.fn()
    render(<CentralDeNotificacoes onIr={ir} />)
    expect(screen.getByLabelText('2 não lidas')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Notificações' }))
    expect(screen.queryByText('3 palavras esperando revisão')).toBeNull()
    fireEvent.click(screen.getByText('Conquista: Primeira captura'))
    expect(ir).toHaveBeenCalledWith('loja', undefined)
    expect(screen.getByLabelText('1 não lidas')).toBeTruthy()
  })

  it('a engrenagem leva às preferências de notificação', () => {
    const ir = vi.fn()
    render(<CentralDeNotificacoes onIr={ir} />)
    fireEvent.click(screen.getByRole('button', { name: 'Notificações' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preferências de notificação' }))
    expect(ir).toHaveBeenCalledWith('settings', { aba: 'notificacoes' })
  })
})
