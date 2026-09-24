// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const patchUiSettings = vi.fn()
const fetchSettings = vi.fn()
vi.mock('../src/data/api', () => ({
  patchUiSettings: (...a: unknown[]) => patchUiSettings(...a),
  fetchSettings: (...a: unknown[]) => fetchSettings(...a),
}))

import { montarResumo } from '../src/components/views/ajustes/RelatorioSemanal'
import { exportacaoEmCsv } from '../src/components/views/perfil/AbaDados'
import {
  _reiniciarPreferencias,
  carregarPreferencias,
  lerPreferencias,
  mudarConsentimento,
  normalizar,
  PADRAO,
  salvarPreferencias,
} from '../src/lib/preferencias'
import type { VocabCard } from '../src/types'

beforeEach(() => {
  localStorage.clear()
  _reiniciarPreferencias()
  patchUiSettings.mockReset()
  fetchSettings.mockReset()
})

describe('preferências (Ajustes → Notificações/Privacidade, Perfil → meta e nível)', () => {
  it('parte dos padrões do protótipo e completa um blob antigo/parcial', () => {
    const p = normalizar({ lembrete: { hora: '07:00' }, avisos: { revisao: { email: true } } })
    expect(p.lembrete).toEqual({ on: true, hora: '07:00' })
    expect(p.avisos.revisao).toEqual({ app: true, email: true, push: true })
    expect(p.avisos.fatura).toEqual(PADRAO.avisos.fatura)
    expect(p.metaMin).toBe(15)
    expect(p.formatoDaCopia).toBe('json')
  })

  it('grava no blob settings.ui (chave `preferencias`) e publica na hora', async () => {
    patchUiSettings.mockResolvedValue({ id: 'x' })
    const ok = await salvarPreferencias((p) => ({ ...p, metaMin: 30 }))
    expect(ok).toBe(true)
    expect(lerPreferencias().metaMin).toBe(30)
    expect(patchUiSettings).toHaveBeenCalledWith({ preferencias: expect.objectContaining({ metaMin: 30 }) })
  })

  it('servidor recusou → volta ao valor anterior e devolve false (a tela diz que não salvou)', async () => {
    patchUiSettings.mockResolvedValue(null)
    const ok = await salvarPreferencias((p) => ({ ...p, metaMin: 5 }))
    expect(ok).toBe(false)
    expect(lerPreferencias().metaMin).toBe(15)
  })

  it('consentimento fica registrado com data e valor', async () => {
    patchUiSettings.mockResolvedValue({ id: 'x' })
    await mudarConsentimento('ia', true)
    const p = lerPreferencias()
    expect(p.consentimentos.ia).toBe(true)
    expect(p.registroDeConsentimentos).toHaveLength(1)
    expect(p.registroDeConsentimentos[0]).toMatchObject({ chave: 'ia', valor: true })
  })

  it('lê do servidor o que outra sessão gravou', async () => {
    fetchSettings.mockResolvedValue({ ui: JSON.stringify({ preferencias: { niveis: { en: 'C1' } } }) })
    await carregarPreferencias()
    expect(lerPreferencias().niveis).toEqual({ en: 'C1' })
  })
})

describe('resumo semanal', () => {
  it('soma minutos, dias ativos, palavras novas e acerto dos últimos 7 dias', () => {
    const agora = new Date(2026, 8, 24, 12).getTime()
    const dia = 86_400_000
    const r = montarResumo(
      [
        { createdAt: agora - dia, ms: 120_000, correct: true, kind: 'memory' },
        { createdAt: agora - dia, ms: 60_000, correct: false, kind: 'memory' },
        { createdAt: agora, ms: 60_000, correct: true, kind: 'memory' },
        { createdAt: agora - 10 * dia, ms: 600_000, correct: true, kind: 'termo' },
      ] as never,
      [{ createdAtMs: agora - dia, inDeck: true, dueAtMs: agora + 2 * dia } as VocabCard],
      agora,
    )
    const k = Object.fromEntries(r.kpis.map((x) => [x.rotulo, x.valor]))
    expect(k['Minutos de estudo']).toBe('4')
    expect(k['Dias ativos']).toBe('2 de 7')
    expect(k['Palavras novas']).toBe('1')
    expect(k['Acerto médio']).toBe('67%')
    expect(r.destaque).toMatch(/^Memória com 67% de acerto/)
    expect(r.proximas).toBe(1)
  })
})

describe('cópia dos dados em CSV', () => {
  it('formato longo tabela,linha,campo,valor, com aspas onde precisa', () => {
    const csv = exportacaoEmCsv({
      usuario: { id: 'u1' },
      dados: { cards: [{ word: 'hello, world', n: 2 }] },
    })
    expect(csv.split('\n')).toEqual([
      'tabela,linha,campo,valor',
      'usuario,0,id,u1',
      'cards,0,word,"hello, world"',
      'cards,0,n,2',
    ])
  })
})
