// @vitest-environment jsdom
/**
 * O AJUSTE "Mostrar tradução das palavras novas" (spec `glosa-no-leitor`): o interruptor do painel de Aparência e o
 * componente sem tela que desenha a glosa no overlayer do capítulo — e some com ela quando a palavra vira conhecida.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import GlosaDoLeitor from '../src/components/views/leitor/GlosaDoLeitor'
import PainelDeTipografia from '../src/components/views/leitor/PainelDeTipografia'
import { PERFIL_PADRAO } from '../src/core/leitura/perfilDeLeitura'
import type { SnapshotDasEtiquetas } from '../src/lib/etiquetas/indiceDeEtiquetas'

let snapshot: SnapshotDasEtiquetas = { caderno: new Map(), vistas: new Map(), marcadas: new Map(), listaDeMarcadas: [] }
vi.mock('../src/lib/etiquetas/indiceDeEtiquetas', () => ({ useSnapshotDasEtiquetas: () => snapshot }))
vi.mock('../src/lib/dicionarioLocal', () => ({
  glosaLocal: async (palavra: string) =>
    palavra.toLowerCase() === 'lantern' ? { glosa: 'lanterna', lema: palavra } : null,
}))

afterEach(() => {
  cleanup()
  snapshot = { caderno: new Map(), vistas: new Map(), marcadas: new Map(), listaDeMarcadas: [] }
})

describe('painel de Aparência: tradução das palavras novas', () => {
  const painel = (glosa: boolean, mudarGlosa = vi.fn(), ehPdf = false) =>
    render(
      <PainelDeTipografia
        perfil={PERFIL_PADRAO}
        mudar={vi.fn()}
        restaurar={vi.fn()}
        ehPdf={ehPdf}
        glosa={glosa}
        mudarGlosa={mudarGlosa}
      />,
    )

  it('mostra o interruptor, desligado por padrão, e avisa quando a pessoa liga', () => {
    const mudarGlosa = vi.fn()
    painel(false, mudarGlosa)
    const caixa = screen.getByRole('checkbox', { name: /Mostrar tradução das palavras novas/ })
    expect((caixa as HTMLInputElement).checked).toBe(false)
    fireEvent.click(caixa)
    expect(mudarGlosa).toHaveBeenCalledWith(true)
  })

  it('PDF não tem o ajuste (página fixa)', () => {
    painel(false, vi.fn(), true)
    expect(screen.queryByRole('checkbox', { name: /Mostrar tradução das palavras novas/ })).toBeNull()
  })
})

describe('GlosaDoLeitor', () => {
  function montarMotor() {
    const doc = new DOMParser().parseFromString('<!DOCTYPE html><body><p>The lantern burns.</p></body>', 'text/html')
    const desenhados = new Map<string, SVGElement>()
    const overlayer = {
      add: (k: string, _r: Range, draw: (r: DOMRectList, o: never) => SVGElement, o: unknown) =>
        desenhados.set(k, draw([{ left: 1, top: 20, width: 40 }] as unknown as DOMRectList, o as never)),
      remove: (k: string) => void desenhados.delete(k),
    }
    const motorRef = { current: { documentos: () => [{ doc, index: 0, overlayer }] } }
    return { motorRef: motorRef as never, desenhados }
  }
  const props = (motorRef: never) => ({
    motorRef,
    aoSecaoCarregada: { current: null as (() => void) | null },
    idioma: 'en',
    nativo: 'pt',
    perfil: PERFIL_PADRAO,
  })

  it('desenha a glosa da palavra nova e a tira quando ela vira "Já sei", sem recarregar', async () => {
    const { motorRef, desenhados } = montarMotor()
    const p = props(motorRef)
    const { rerender } = render(<GlosaDoLeitor {...p} />)
    await waitFor(() => expect([...desenhados.values()].map((g) => g.textContent)).toEqual(['lanterna']), {
      timeout: 3000,
    })
    expect(p.aoSecaoCarregada.current).toBeTypeOf('function')

    snapshot = { ...snapshot, marcadas: new Map([['en', new Map([['lantern', 'conhecida' as const]])]]) }
    await act(async () => rerender(<GlosaDoLeitor {...p} />))
    await waitFor(() => expect(desenhados.size).toBe(0), { timeout: 3000 })
  })

  it('desmontar (ajuste desligado) tira a glosa e solta o gancho', async () => {
    const { motorRef, desenhados } = montarMotor()
    const p = props(motorRef)
    const { unmount } = render(<GlosaDoLeitor {...p} />)
    await waitFor(() => expect(desenhados.size).toBe(1), { timeout: 3000 })
    unmount()
    expect(desenhados.size).toBe(0)
    expect(p.aoSecaoCarregada.current).toBeNull()
  })

  it('sem o caderno carregado nada é desenhado (evita piscar tudo como novo)', async () => {
    snapshot = { ...snapshot, caderno: null }
    const { motorRef, desenhados } = montarMotor()
    render(<GlosaDoLeitor {...props(motorRef)} />)
    await new Promise((ok) => setTimeout(ok, 150))
    expect(desenhados.size).toBe(0)
  })
})
