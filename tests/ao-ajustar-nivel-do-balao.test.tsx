// @vitest-environment jsdom
/**
 * B7 (openspec `leitura-assistida`): o botão "Ajustar nível" do balão só existe com a flag `ia_ajustar_nivel` e abre o
 * painel da fatia D (`abrirAjustarNivel`) no parágrafo do trecho. Desligada, nada é aberto e o botão não aparece.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aoAjustarNivelDoBalao } from '../src/components/views/leitor/aoAjustarNivelDoBalao'
import BalaoDaTraducao from '../src/components/views/leitor/BalaoDaTraducao'
import PainelAjustarNivel, { fecharAjustarNivel } from '../src/components/views/leitor/PainelAjustarNivel'
import { _reiniciarIdentidade, definirIdentidade } from '../src/lib/identidade'

let flag = true
vi.mock('../src/lib/flags', () => ({ useFlag: () => flag, flagLigada: () => flag }))
vi.mock('../src/lib/entitlements', () => ({
  getEntitlements: () => ({ plan: 'plus' }),
  onPlanChange: () => () => {},
}))
vi.mock('../src/data/rotas/palavrasMarcadas', () => ({ fetchPalavrasMarcadas: async () => [] }))
vi.mock('../src/lib/leitor/ajustarNivelDoLeitor', () => ({
  ajustarComCache: () => new Promise(() => {}),
  ajustarCapitulo: () => new Promise(() => {}),
}))

const TRECHO = { texto: 'the quick fox', frase: 'The quick fox jumps.', paragrafo: '', idioma: 'en' }
const base = {
  trecho: TRECHO,
  rect: { x: 100, y: 100, w: 80, h: 20, coluna: 0 },
  area: { x: 0, y: 0, w: 800, h: 600 },
  colunas: 1,
  destino: 'pt-BR',
  estado: { disponivel: true },
  modoAuto: false,
  traduzir: async () => null,
  aoTraduzir: () => {},
  aoFechar: () => {},
} as unknown as React.ComponentProps<typeof BalaoDaTraducao>

function Cena() {
  return (
    <>
      <BalaoDaTraducao {...base} aoAjustarNivel={aoAjustarNivelDoBalao(flag, TRECHO)} />
      <PainelAjustarNivel idiomaDaPessoa="pt-BR" />
    </>
  )
}

beforeEach(() => definirIdentidade('conta'))
afterEach(() => {
  act(() => fecharAjustarNivel())
  cleanup()
  _reiniciarIdentidade()
})

describe('aoAjustarNivelDoBalao', () => {
  it('flag desligada: sem ação, sem botão e sem painel', () => {
    flag = false
    expect(aoAjustarNivelDoBalao(false, TRECHO)).toBeUndefined()
    render(<Cena />)
    expect(screen.queryByTestId('balao-ajustar-nivel')).toBeNull()
    expect(screen.queryByTestId('ajn-custo')).toBeNull()
  })

  it('flag ligada: o botão aparece e abre o painel no parágrafo (cai na frase se faltar o parágrafo)', () => {
    flag = true
    render(<Cena />)
    const antes = screen.queryAllByText(/The quick fox jumps\./).length
    fireEvent.click(screen.getByTestId('balao-ajustar-nivel'))
    expect(screen.queryAllByText(/The quick fox jumps\./).length).toBeGreaterThan(antes)
  })
})
