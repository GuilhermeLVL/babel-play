/**
 * AS ETAPAS PRECISAM SER A MESMA COISA AMANHÃ.
 *
 * O `id` da etapa é a chave pela qual o progresso é lido. Se o fatiamento variasse entre chamadas —
 * por embaralhamento, por ordenação instável, por qualquer coisa —, "etapa 7" mudaria de conteúdo
 * entre sessões e o progresso passaria a apontar para palavras que nunca estiveram ali. É a
 * invariante que este arquivo protege primeiro.
 *
 * A segunda é a honestidade do rótulo: nenhuma etapa derivada pode ganhar um nome temático, porque
 * o dado de origem é uma lista alfabética e não há tema nenhum lá dentro.
 */
import { describe, it, expect } from 'vitest'
import {
  etapasDoNivel, progressoDasEtapas, etapaAtual, posicaoNaTrilha, niveisComEtapas,
  TAMANHO_PADRAO, CORTE_DE_FEITA, type DadoTrilhaComEtapas,
} from '../src/core/learning/etapas'
import { chaveDaPalavra } from '../src/core/learning/trilha'
import trilhaEn from '../src/data/trilha/en.json'

const EN = trilhaEn as unknown as DadoTrilhaComEtapas

/** Um dado sintético, para os casos que o `en.json` não cobre sem depender do conteúdo dele. */
function dadoDe(palavras: string[]): DadoTrilhaComEtapas {
  return {
    lang: 'xx',
    fonte: 'teste',
    versao: '1',
    niveis: { A1: palavras.map(p => [p, `t-${p}`] as [string, string]) },
  }
}

describe('fatiamento determinístico', () => {
  it('duas chamadas devolvem exatamente as mesmas etapas', () => {
    const a = etapasDoNivel(EN, 'A2')
    const b = etapasDoNivel(EN, 'A2')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('preserva a ordem do dado — a etapa 1 começa onde a lista começa', () => {
    const lista = (EN.niveis.A2 ?? []).map(p => p[0])
    const [primeira] = etapasDoNivel(EN, 'A2')
    expect(primeira.palavras[0]).toBe(lista[0])
    expect(primeira.palavras).toEqual(lista.slice(0, TAMANHO_PADRAO))
  })

  it('nenhuma palavra fica de fora e nenhuma aparece em duas etapas', () => {
    const lista = (EN.niveis.A2 ?? []).map(p => p[0])
    const etapas = etapasDoNivel(EN, 'A2')
    const todas = etapas.flatMap(e => e.palavras)

    expect(todas).toHaveLength(lista.length)
    expect(new Set(todas).size).toBe(new Set(lista).size)
  })

  it('a última etapa fica curta em vez de ser descartada', () => {
    const etapas = etapasDoNivel(dadoDe(Array.from({ length: 30 }, (_, i) => `w${i}`)), 'A1', { tamanho: 28 })
    expect(etapas).toHaveLength(2)
    expect(etapas[1].palavras).toHaveLength(2)
  })

  it('nível ausente devolve lista vazia, não uma etapa vazia', () => {
    expect(etapasDoNivel(dadoDe([]), 'C2')).toEqual([])
  })

  it('o id é estável e ordenável', () => {
    const etapas = etapasDoNivel(EN, 'A2')
    expect(etapas[0].id).toBe('en:A2:01')
    expect(etapas[9].id).toBe('en:A2:10')
    // Zero à esquerda para a ordenação alfabética coincidir com a numérica.
    expect([...etapas.map(e => e.id)].sort()).toEqual(etapas.map(e => e.id))
  })
})

describe('o nome não inventa tema', () => {
  it('etapas derivadas se chamam pelo nível e pelo número', () => {
    for (const e of etapasDoNivel(EN, 'A2')) {
      expect(e.nome).toBe(`A2 · etapa ${e.ordem}`)
    }
  })

  it('o subtítulo diz o que a etapa é, com as pontas reais da fatia', () => {
    const [primeira] = etapasDoNivel(EN, 'A2')
    const ini = primeira.palavras[0]
    const fim = primeira.palavras[primeira.palavras.length - 1]
    expect(primeira.subtitulo).toBe(`${primeira.palavras.length} palavras, de ${ini} a ${fim}`)
  })

  it('quando existirem etapas CURADAS, o nome delas vence', () => {
    const dado: DadoTrilhaComEtapas = {
      ...dadoDe(['one', 'two', 'three']),
      etapas: { A1: [{ nome: 'Na escola', palavras: ['one', 'two'] }] },
    }
    const [e] = etapasDoNivel(dado, 'A1')
    expect(e.nome).toBe('Na escola')
    expect(e.palavras).toEqual(['one', 'two'])
  })
})

describe('progresso', () => {
  const etapas = etapasDoNivel(dadoDe(Array.from({ length: 20 }, (_, i) => `w${i}`)), 'A1', { tamanho: 10 })

  it('sem nada no caderno, a primeira é a atual e o resto é futura', () => {
    const p = progressoDasEtapas(etapas, new Set())
    expect(p.map(x => x.estado)).toEqual(['atual', 'futura'])
    expect(etapaAtual(p)?.ordem).toBe(1)
  })

  it('80% fecha a etapa — o mesmo corte de nivelSugerido', () => {
    const oito = new Set(Array.from({ length: 8 }, (_, i) => chaveDaPalavra(`w${i}`)))
    const p = progressoDasEtapas(etapas, oito)
    expect(8 / 10).toBeGreaterThanOrEqual(CORTE_DE_FEITA)
    expect(p[0].estado).toBe('feita')
    expect(p[1].estado).toBe('atual')
  })

  it('79% ainda não fecha', () => {
    const sete = new Set(Array.from({ length: 7 }, (_, i) => chaveDaPalavra(`w${i}`)))
    expect(progressoDasEtapas(etapas, sete)[0].estado).toBe('atual')
  })

  it('só UMA etapa é a atual, mesmo com várias em aberto', () => {
    const p = progressoDasEtapas(etapas, new Set())
    expect(p.filter(x => x.estado === 'atual')).toHaveLength(1)
  })

  it('com o nível inteiro fechado, não há etapa atual', () => {
    const todas = new Set(Array.from({ length: 20 }, (_, i) => chaveDaPalavra(`w${i}`)))
    const p = progressoDasEtapas(etapas, todas)
    expect(p.every(x => x.estado === 'feita')).toBe(true)
    expect(etapaAtual(p)).toBeNull()
  })

  it('acertos só são contados quando o histórico é fornecido', () => {
    const semHistorico = progressoDasEtapas(etapas, new Set())
    expect(semHistorico[0].acertou).toBeUndefined()

    const comHistorico = progressoDasEtapas(etapas, new Set(), new Set([chaveDaPalavra('w0')]))
    expect(comHistorico[0].acertou).toBe(1)
  })

  it('a comparação normaliza acento e caixa, como o resto da trilha', () => {
    const dado = dadoDe(['Ação', 'ação2'])
    const p = progressoDasEtapas(etapasDoNivel(dado, 'A1'), new Set([chaveDaPalavra('acao')]))
    expect(p[0].jaTem).toBe(1)
  })
})

describe('posição na trilha', () => {
  it('conta a partir de 1 e diz o total', () => {
    const etapas = etapasDoNivel(EN, 'A2')
    const pos = posicaoNaTrilha(progressoDasEtapas(etapas, new Set()))
    expect(pos).toEqual({ atual: 1, total: etapas.length })
  })

  it('nível vazio não vira "etapa 0 de 0"', () => {
    expect(posicaoNaTrilha([])).toBeNull()
  })
})

describe('o dado real de inglês', () => {
  it('só oferece níveis que existem', () => {
    const niveis = niveisComEtapas(EN)
    expect(niveis).toContain('A1')
    expect(niveis).toContain('A2')
    for (const n of niveis) expect((EN.niveis[n] ?? []).length).toBeGreaterThan(0)
  })

  it('todo nível se decompõe em pelo menos uma etapa', () => {
    for (const n of niveisComEtapas(EN)) {
      expect(etapasDoNivel(EN, n).length, n).toBeGreaterThan(0)
    }
  })
})
