// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { avisarTemporadaNova, notificacaoDaRecompensa } from '../src/lib/estado/useNotificacoes'
import {
  _zerarNotificacoes,
  marcarLida,
  marcarTodasLidas,
  naoLidas,
  notificacoes,
  notificar,
  quando,
} from '../src/lib/notificacoes'

const base = { tipo: 'revisao' as const, icone: 'target' as const, detalhe: 'd', ir: 'study' }

describe('central de notificações', () => {
  beforeEach(() => _zerarNotificacoes())

  it('registra, conta as não lidas e persiste no navegador', () => {
    notificar({ ...base, chave: 'a', titulo: 'A' })
    notificar({ ...base, chave: 'b', titulo: 'B' })
    expect(notificacoes().map((n) => n.titulo)).toEqual(['B', 'A'])
    expect(naoLidas()).toBe(2)
    expect(JSON.parse(localStorage.getItem('babel.notificacoes')!)).toHaveLength(2)
  })

  it('o mesmo fato não vira duas notificações; texto novo atualiza e volta a ser não lida', () => {
    notificar({ ...base, chave: 'rev:hoje', titulo: '3 palavras' })
    const id = notificacoes()[0].id
    marcarLida(id)
    notificar({ ...base, chave: 'rev:hoje', titulo: '3 palavras' })
    expect(notificacoes()).toHaveLength(1)
    expect(naoLidas()).toBe(0)
    notificar({ ...base, chave: 'rev:hoje', titulo: '5 palavras' })
    expect(notificacoes()).toHaveLength(1)
    expect(notificacoes()[0]).toMatchObject({ id, titulo: '5 palavras', lida: false })
  })

  it('marcar todas como lidas zera a contagem', () => {
    notificar({ ...base, chave: 'a', titulo: 'A' })
    notificar({ ...base, chave: 'b', titulo: 'B' })
    marcarTodasLidas()
    expect(naoLidas()).toBe(0)
  })

  it('diz quando aconteceu como o protótipo (agora, hoje, ontem, data)', () => {
    const agora = new Date(2026, 8, 24, 20, 0).getTime()
    expect(quando(agora - 10_000, agora)).toBe('agora')
    expect(quando(agora - 5 * 3_600_000, agora)).toBe('hoje')
    expect(quando(agora - 24 * 3_600_000, agora)).toBe('ontem')
    expect(quando(new Date(2026, 8, 20).getTime(), agora)).toBe('20/09')
  })

  it('cada recompensa entregue vira o fato certo, sem inventar nada', () => {
    const c = notificacaoDaRecompensa({
      tipo: 'conquista',
      id: 'x',
      nome: 'Primeira captura',
      seeds: 25,
      xp: 30,
    })
    expect(c).toMatchObject({
      chave: 'recompensa:conquista:x',
      titulo: 'Conquista: Primeira captura',
      detalhe: '+25 Seeds e +30 XP.',
    })
    const n = notificacaoDaRecompensa({ tipo: 'nivel', nivel: 3, itens: [] })
    expect(n.titulo).toBe('Você subiu para o nível 3')
  })

  /* SPEC 10.2: "temporada nova" no sino, UMA vez por temporada, quando ela começa — sem contagem
     regressiva (serve igual para o perfil protegido). */
  it('temporada nova: avisa uma vez quando começa, e nunca antes', () => {
    expect(avisarTemporadaNova(new Date('2026-09-27T12:00:00-03:00'))).toBe(false)
    expect(notificacoes()).toHaveLength(0)

    expect(avisarTemporadaNova(new Date('2026-10-01T09:00:00-03:00'))).toBe(true)
    const [n] = notificacoes()
    expect(n).toMatchObject({ chave: 'temporada:t1', ir: 'loja', dado: { aba: 'temporada' } })
    expect(n.titulo).toMatch(/Temporada 1/)
    expect(`${n.titulo} ${n.detalhe}`).not.toMatch(/termina em|faltam|dias/)

    // Lida, não volta; outro dia da mesma temporada também não recria.
    marcarLida(n.id)
    expect(avisarTemporadaNova(new Date('2026-10-12T09:00:00-03:00'))).toBe(false)
    expect(notificacoes()).toHaveLength(1)
    expect(naoLidas()).toBe(0)
  })
})
