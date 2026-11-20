import { describe, expect, it } from 'vitest'

import { calcularMetricas, carregarOuro, fmt, marcarPassagem, nomeDoFalante } from './harness/metricasDoElenco'

describe('elenco: conjunto de ouro', () => {
  const ouro = carregarOuro()
  const marcadas = ouro.passagens.map(marcarPassagem)
  const m = calcularMetricas(ouro, marcadas)

  it('é original e bem formado: 36+ passagens curtas, 12 por idioma, todos os casos', () => {
    expect(ouro.passagens.length).toBeGreaterThanOrEqual(36)
    for (const idioma of ['pt', 'en', 'es']) {
      expect(ouro.passagens.filter((p) => p.idioma === idioma).length).toBeGreaterThanOrEqual(12)
    }
    for (const p of ouro.passagens) {
      expect(p.frases.length).toBeGreaterThanOrEqual(3)
      expect(p.frases.length).toBeLessThanOrEqual(10)
      for (const f of p.frases) {
        expect(f.nota).not.toBeUndefined()
        expect(['narrador', ...p.personagens]).toContain(f.falante)
      }
    }
  })

  it('a marcação mantém 1 por frase, na ordem', () => {
    ouro.passagens.forEach((p, i) => {
      expect(marcadas[i].map((x) => x.texto)).toEqual(p.frases.map((f) => f.texto))
      expect(marcadas[i].map((x) => x.indice)).toEqual(p.frases.map((_, k) => k))
    })
  })

  /*
   * PISOS (medidos na primeira versão, com margem para ruído de futuras mexidas; subir, nunca descer):
   *  - falante com pista EXPLÍCITA (nome na marca + verbo, ou narração pura): o caso que a heurística PROMETE.
   *  - emoção com pista explícita (palavra-chave, caixa alta, verbo de grito/sussurro).
   *  - NUNCA inventar personagem e NUNCA transformar narração em fala: piso 100%/0, são os erros que o ouvinte nota.
   */
  it('falante com pista explícita >= 0,90', () => {
    console.info(
      'falante explícito',
      fmt(m.falanteExplicito),
      '| todos',
      fmt(m.falante),
      '| personagens',
      fmt(m.falanteDePersonagem),
      '| audível',
      fmt(m.falanteAudivel),
    )
    expect(m.falanteExplicito.taxa).toBeGreaterThanOrEqual(0.9)
  })

  it('falante em geral >= 0,80 (inclui alternância e pronome)', () => {
    expect(m.falante.taxa).toBeGreaterThanOrEqual(0.8)
  })

  it('emoção com pista explícita >= 0,85 e emoção em geral >= 0,75', () => {
    console.info(
      'emoção explícita',
      fmt(m.emocaoExplicita),
      '| geral',
      fmt(m.emocao),
      '| precisão',
      fmt(m.emocaoPrecisao),
      '| revocação',
      fmt(m.emocaoRevocacao),
    )
    expect(m.emocaoExplicita.taxa).toBeGreaterThanOrEqual(0.85)
    expect(m.emocao.taxa).toBeGreaterThanOrEqual(0.75)
  })

  it('quando marca emoção, acerta (precisão >= 0,80): errar para o neutro, não para a emoção errada', () => {
    expect(m.emocaoPrecisao.taxa).toBeGreaterThanOrEqual(0.8)
  })

  it('nunca inventa personagem e nunca vira narração em fala', () => {
    expect(m.inventadas).toBe(0)
    expect(m.narradorViradoPersonagem).toBe(0)
  })

  it('o que a pessoa ouviria (confiança >= 0,5) em frases de personagem acerta >= 0,60', () => {
    expect(m.falanteAudivel.taxa).toBeGreaterThanOrEqual(0.6)
  })

  it('mostra onde erra (informativo)', () => {
    const erros: string[] = []
    ouro.passagens.forEach((p, pi) =>
      p.frases.forEach((g, fi) => {
        const x = marcadas[pi][fi]
        if (nomeDoFalante(x) !== g.falante || x.emocao !== g.emocao) {
          erros.push(
            `${p.id}#${fi} esperado ${g.falante}/${g.emocao} dado ${nomeDoFalante(x)}/${x.emocao} (${x.confianca}) "${g.texto.slice(0, 40)}"`,
          )
        }
      }),
    )
    console.info(erros.join('\n'))
    expect(Array.isArray(erros)).toBe(true)
  })
})
