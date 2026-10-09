// @vitest-environment jsdom
/**
 * O SINO respeita as preferências de aviso (Ajustes → Notificações): o tipo desligado "no app"
 * some da lista e da contagem. A sessão salva não tem chave lá e aparece sempre. A lista é a de
 * `useListaDeNotificacoes`, que o painel "Mais" do trilho desenha (`questCasca.test.tsx`).
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useListaDeNotificacoes } from '../src/components/shell/CentralDeNotificacoes'
import { _zerarNotificacoes, marcarLida, naoLidas, notificar } from '../src/lib/notificacoes'

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

  it('esconde o tipo desligado e conta só o que mostra; a sessão salva aparece sempre', () => {
    const { result } = renderHook(() => useListaDeNotificacoes())
    const titulos = () => result.current.map((n) => n.titulo)
    expect(titulos()).not.toContain('3 palavras esperando revisão')
    expect(titulos()).toEqual(expect.arrayContaining(['Conquista: Primeira captura', 'Sessão salva: Aula']))
    expect(naoLidas(result.current)).toBe(2)
  })

  it('marcar como lida tira da contagem, e a lista acompanha na hora', () => {
    const { result } = renderHook(() => useListaDeNotificacoes())
    const conquista = result.current.find((n) => n.titulo === 'Conquista: Primeira captura')!
    act(() => marcarLida(conquista.id))
    expect(naoLidas(result.current)).toBe(1)
  })
})
