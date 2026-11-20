/**
 * O RECONHECIMENTO AO ENTRAR NO INTÉRPRETE (conversa-de-verdade, 4.2):
 *   - com o modelo da conversa no aparelho (o aceite já foi dado), ele carrega ao abrir a tela, antes do 1º "Falar";
 *   - sem o modelo, nada sai da rede antes do toque, com rede boa ou lenta (o aceite não é guardado entre visitas);
 *   - nem na Capturar, nem com a sessão em curso, nem com a transcrição na nuvem.
 */
import { describe, expect, it } from 'vitest'

import { carregarAoEntrarNoInterprete } from '../src/lib/captura/downloadDoInterprete'

const base = { noInterprete: true, gravando: false, noAparelho: true, semModeloLocal: false }

describe('carregarAoEntrarNoInterprete', () => {
  it('o modelo no aparelho carrega ao abrir o Intérprete', () => {
    expect(carregarAoEntrarNoInterprete(base)).toBe(true)
  })

  it('sem o modelo no aparelho, não baixa nada antes do toque', () => {
    expect(carregarAoEntrarNoInterprete({ ...base, noAparelho: false })).toBe(false)
  })

  it('na Capturar, com a sessão em curso ou com a nuvem, não carrega', () => {
    expect(carregarAoEntrarNoInterprete({ ...base, noInterprete: false })).toBe(false)
    expect(carregarAoEntrarNoInterprete({ ...base, gravando: true })).toBe(false)
    expect(carregarAoEntrarNoInterprete({ ...base, semModeloLocal: true })).toBe(false)
  })
})
