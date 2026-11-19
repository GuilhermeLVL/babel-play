/**
 * O FIM DA ESCADA DO REGULADOR: o log e o aviso na tela andam juntos (auditoria de 17/11/2026, a oferta era registrada
 * e não aparecia).
 */
import { describe, expect, it, vi } from 'vitest'

import { AVISO_DO_FIM_DA_ESCADA, oferecerNoFimDaEscada } from '../src/lib/captura/ofertaDoFimDaEscada'

const montar = () => ({ clog: vi.fn(), avisar: vi.fn() })

describe('oferecerNoFimDaEscada', () => {
  it('fora do Grátis: o aviso na tela e o registro, juntos', async () => {
    const m = montar()
    await oferecerNoFimDaEscada(m)
    expect(m.avisar).toHaveBeenCalledWith(AVISO_DO_FIM_DA_ESCADA)
    expect(m.clog).toHaveBeenCalledTimes(1)
  })

  it('a nuvem de alívio apareceu: registra a oferta, sem o aviso de sempre', async () => {
    const m = montar()
    await oferecerNoFimDaEscada({ ...m, pedirNuvemDeAlivio: async () => true })
    expect(m.avisar).not.toHaveBeenCalled()
    expect(m.clog).toHaveBeenCalledTimes(1)
    expect(String(m.clog.mock.calls[0][0])).toMatch(/nuvem de alívio/)
  })

  it('sem franquia (ou o servidor falhou): o aviso de sempre, registrado uma vez', async () => {
    for (const pedir of [async () => false, async () => Promise.reject(new Error('x'))]) {
      const m = montar()
      await oferecerNoFimDaEscada({ ...m, pedirNuvemDeAlivio: pedir })
      expect(m.avisar).toHaveBeenCalledTimes(1)
      expect(m.clog).toHaveBeenCalledTimes(1)
    }
  })

  it('nada é registrado antes de a tela mostrar', async () => {
    const m = montar()
    let soltar: (v: boolean) => void = () => {}
    const p = oferecerNoFimDaEscada({ ...m, pedirNuvemDeAlivio: () => new Promise((r) => (soltar = r)) })
    expect(m.clog).not.toHaveBeenCalled()
    soltar(true)
    await p
    expect(m.clog).toHaveBeenCalledTimes(1)
  })
})
