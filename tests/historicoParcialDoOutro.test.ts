/**
 * A TRADUÇÃO PARCIAL na lista do outro lado (task 3.2): a fala em andamento de quem fala, já traduzida, aparece
 * em cinza na metade de quem ouve. Só com a opção ligada (chave `parcialTraduzido`); nunca vira item da lista.
 */
import { describe, expect, it } from 'vitest'

import { historicoDoInterprete } from '../src/lib/captura/historicoDoInterprete'

const emAndamento = { id: 'mic-1', originalText: 'I want to buy rice,', translatedText: 'Eu quero comprar arroz,', isPartial: true, lado: 'outro' as const }

describe('historicoDoInterprete: parcial traduzido do outro lado', () => {
  it('sem a opção, nada muda (o parcial do outro não aparece)', () => {
    const h = historicoDoInterprete([emAndamento], 'meu')
    expect(h.parcialDoOutro).toBeUndefined()
    expect(h.itens).toHaveLength(0)
  })

  it('com a opção, a metade de quem ouve recebe a tradução parcial, fora da lista', () => {
    const h = historicoDoInterprete([emAndamento], 'meu', { parcialDoOutro: true })
    expect(h.parcialDoOutro).toEqual({ id: 'mic-1', texto: 'Eu quero comprar arroz,' })
    expect(h.itens).toHaveLength(0)
    expect(h.parcial).toBeUndefined()
  })

  it('a metade de quem fala não vê a própria fala como "do outro"', () => {
    const h = historicoDoInterprete([emAndamento], 'outro', { parcialDoOutro: true })
    expect(h.parcialDoOutro).toBeUndefined()
    expect(h.parcial).toEqual({ id: 'mic-1', texto: 'I want to buy rice,' })
  })

  it('tradução ainda em "…" ou vazia não aparece', () => {
    expect(historicoDoInterprete([{ ...emAndamento, translatedText: '…' }], 'meu', { parcialDoOutro: true }).parcialDoOutro).toBeUndefined()
    expect(historicoDoInterprete([{ ...emAndamento, translatedText: '' }], 'meu', { parcialDoOutro: true }).parcialDoOutro).toBeUndefined()
  })

  it('quando o final chega, o parcial some e a fala vira item normal', () => {
    const h = historicoDoInterprete([{ ...emAndamento, isPartial: false }], 'meu', { parcialDoOutro: true })
    expect(h.parcialDoOutro).toBeUndefined()
    expect(h.itens[0]).toMatchObject({ id: 'mic-1', texto: 'Eu quero comprar arroz,' })
  })
})
