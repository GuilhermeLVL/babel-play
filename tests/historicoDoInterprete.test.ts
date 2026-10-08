/**
 * O HISTÓRICO DO INTÉRPRETE (Intérprete v3, Fase 1): a lista de falas de cada metade, pura.
 *   - cada metade lê a conversa no IDIOMA DELA: as falas do outro, traduzidas (original pequeno embaixo),
 *     e as dela, no original;
 *   - o DESTAQUE é a última fala do outro (o que a tela já mostrava);
 *   - o PARCIAL é só o da própria metade, e fica à parte da lista;
 *   - a JANELA limita o que se desenha (50), e `subirJanela` mostra mais de 50 em 50.
 */
import { describe, expect, it } from 'vitest'

import {
  type FalaDoHistorico,
  historicoDoInterprete,
  JANELA_DO_HISTORICO,
  subirJanela,
} from '../src/lib/captura/historicoDoInterprete'

const fala = (id: string, lado: 'meu' | 'outro', original: string, traducao = '', extra: Partial<FalaDoHistorico> = {}) => ({
  id,
  lado,
  originalText: original,
  translatedText: traducao,
  ...extra,
})

describe('historicoDoInterprete', () => {
  it('cada metade lê no idioma dela: o outro traduzido, o meu no original', () => {
    const falas = [
      fala('1', 'outro', 'I want rice', 'Eu quero arroz'),
      fala('2', 'meu', 'Quanto custa?', 'How much?'),
    ]
    const h = historicoDoInterprete(falas, 'meu')
    expect(h.itens).toEqual([
      {
        id: '1',
        lado: 'outro',
        original: 'I want rice',
        traducao: 'Eu quero arroz',
        propria: false,
        texto: 'Eu quero arroz',
        secundario: 'I want rice',
        traduzindo: false,
      },
      {
        id: '2',
        lado: 'meu',
        original: 'Quanto custa?',
        traducao: 'How much?',
        propria: true,
        texto: 'Quanto custa?',
        secundario: '',
        traduzindo: false,
      },
    ])
    const doOutro = historicoDoInterprete(falas, 'outro')
    expect(doOutro.itens.map((i) => [i.id, i.propria, i.texto])).toEqual([
      ['1', true, 'I want rice'],
      ['2', false, 'How much?'],
    ])
  })

  it('o destaque é a última fala do outro, e some quando só eu falei', () => {
    const falas = [fala('1', 'outro', 'Hi', 'Oi'), fala('2', 'meu', 'Olá', 'Hello'), fala('3', 'outro', 'Bye', 'Tchau')]
    expect(historicoDoInterprete(falas, 'meu').destaque?.id).toBe('3')
    expect(historicoDoInterprete([fala('2', 'meu', 'Olá')], 'meu').destaque).toBeUndefined()
  })

  it('a tradução que ainda não veio aparece como reticências e marca "traduzindo"', () => {
    const h = historicoDoInterprete([fala('1', 'outro', 'Hi', ''), fala('2', 'outro', 'Yo', '…')], 'meu')
    expect(h.itens.map((i) => [i.texto, i.traduzindo])).toEqual([
      ['…', true],
      ['…', true],
    ])
  })

  it('o parcial é só o da própria metade e não entra na lista', () => {
    const falas = [
      fala('1', 'outro', 'Hi', 'Oi'),
      fala('2', 'meu', 'Quero ar', '', { isPartial: true }),
      fala('3', 'outro', 'Yes', '', { isPartial: true }),
    ]
    const h = historicoDoInterprete(falas, 'meu')
    expect(h.itens.map((i) => i.id)).toEqual(['1'])
    expect(h.parcial).toEqual({ id: '2', texto: 'Quero ar' })
    expect(historicoDoInterprete(falas, 'outro').parcial).toEqual({ id: '3', texto: 'Yes' })
  })

  it('ignora fala sem lado (fora do intérprete) e fala vazia', () => {
    const falas = [fala('1', 'outro', '   ', 'x'), { id: '2', originalText: 'a', translatedText: 'b' }, fala('3', 'outro', 'Hi', 'Oi')]
    expect(historicoDoInterprete(falas as never, 'meu').itens.map((i) => i.id)).toEqual(['3'])
  })

  it('a janela guarda as últimas e conta as escondidas', () => {
    const falas = Array.from({ length: 120 }, (_, i) => fala(String(i), 'outro', `o${i}`, `t${i}`))
    const h = historicoDoInterprete(falas, 'meu')
    expect(h.itens).toHaveLength(JANELA_DO_HISTORICO)
    expect(h.itens[0].id).toBe('70')
    expect(h.itens.at(-1)?.id).toBe('119')
    expect(h.escondidas).toBe(70)
    const maior = historicoDoInterprete(falas, 'meu', { janela: subirJanela(JANELA_DO_HISTORICO, 120) })
    expect(maior.itens).toHaveLength(100)
    expect(maior.escondidas).toBe(20)
  })

  it('subirJanela sobe de 50 em 50 sem passar do total', () => {
    expect(subirJanela(50, 120)).toBe(100)
    expect(subirJanela(100, 120)).toBe(120)
    expect(subirJanela(120, 120)).toBe(120)
  })
})
