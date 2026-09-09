/**
 * A métrica de diarização, testada nos casos em que ela é fácil de errar.
 *
 * Os dois pontos que mais enganam num DER caseiro:
 *   1. esquecer que os RÓTULOS SÃO ARBITRÁRIOS — sem mapear, um sistema perfeito que chamou de
 *      "voice_1" quem a referência chama de "B" mediria 100% de erro;
 *   2. reportar só o número agregado — que não distingue VAD perdendo fala de embedding
 *      confundindo pessoas, defeitos com correções opostas.
 */
import { describe, expect,it } from 'vitest'

import { calcularDer, mapearRotulos, purezaDeClusters, type Turno } from '../src/core/eval/der'

/** A,B,A — dois falantes alternando, 3 s cada. */
const REF: Turno[] = [
  { inicioMs: 0, fimMs: 3000, falante: 'A' },
  { inicioMs: 3000, fimMs: 6000, falante: 'B' },
  { inicioMs: 6000, fimMs: 9000, falante: 'A' },
]

describe('mapeamento de rótulos — os nomes são arbitrários', () => {
  it('casa os rótulos do sistema com os da referência pela maior sobreposição', () => {
    const hip: Turno[] = [
      { inicioMs: 0, fimMs: 3000, falante: 'voice_1' },
      { inicioMs: 3000, fimMs: 6000, falante: 'voice_2' },
      { inicioMs: 6000, fimMs: 9000, falante: 'voice_1' },
    ]
    expect(mapearRotulos(REF, hip)).toEqual({ voice_1: 'A', voice_2: 'B' })
  })

  it('uma diarização PERFEITA com nomes trocados dá DER zero — este é o teste que justifica o mapeamento', () => {
    const hip: Turno[] = [
      { inicioMs: 0, fimMs: 3000, falante: 'voice_7' },
      { inicioMs: 3000, fimMs: 6000, falante: 'voice_3' },
      { inicioMs: 6000, fimMs: 9000, falante: 'voice_7' },
    ]
    expect(calcularDer(REF, hip).der).toBe(0)
  })

  it('um-para-um: dois clusters não podem casar com o mesmo falante', () => {
    const hip: Turno[] = [
      { inicioMs: 0, fimMs: 3000, falante: 'v1' },
      { inicioMs: 3000, fimMs: 6000, falante: 'v2' },
      { inicioMs: 6000, fimMs: 9000, falante: 'v3' }, // fragmentou A em v1 e v3
    ]
    const mapa = mapearRotulos(REF, hip)
    expect(new Set(Object.values(mapa)).size).toBe(Object.values(mapa).length)
  })
})

describe('decomposição — cada componente aponta um defeito diferente', () => {
  it('sistema que não detectou nada: tudo PERDIDO (sintoma de VAD conservador)', () => {
    const r = calcularDer(REF, [])
    expect(r.der).toBe(1)
    expect(r.perdidoMs).toBeGreaterThan(0)
    expect(r.confusaoMs).toBe(0)
    expect(r.falsoAlarmeMs).toBe(0)
  })

  it('sistema que inventou fala no silêncio: FALSO ALARME (sintoma de VAD permissivo ou ruído)', () => {
    const ref: Turno[] = [{ inicioMs: 0, fimMs: 3000, falante: 'A' }]
    const hip: Turno[] = [
      { inicioMs: 0, fimMs: 3000, falante: 'v1' },
      { inicioMs: 5000, fimMs: 8000, falante: 'v1' }, // não há ninguém falando aqui
    ]
    const r = calcularDer(ref, hip)
    expect(r.falsoAlarmeMs).toBeGreaterThan(0)
    expect(r.confusaoMs).toBe(0)
  })

  it('duas pessoas colapsadas numa: CONFUSÃO (sintoma de embedding pouco discriminativo)', () => {
    // O sistema detecta a fala toda, mas acha que é sempre a mesma pessoa.
    const hip: Turno[] = [{ inicioMs: 0, fimMs: 9000, falante: 'v1' }]
    const r = calcularDer(REF, hip)
    expect(r.confusaoMs).toBeGreaterThan(0)
    expect(r.perdidoMs).toBe(0)
    // v1 casa com A (6 s de sobreposição contra 3 s de B); o trecho de B vira confusão.
    expect(r.der).toBeCloseTo(3000 / 9000, 2)
  })
})

describe('colar', () => {
  it('desalinhamento menor que o colar não pontua — a fronteira é ambígua até para humanos', () => {
    const hip: Turno[] = [
      { inicioMs: 0, fimMs: 3100, falante: 'v1' },     // 100 ms além
      { inicioMs: 3100, fimMs: 6000, falante: 'v2' },
      { inicioMs: 6000, fimMs: 9000, falante: 'v1' },
    ]
    expect(calcularDer(hip.length ? REF : REF, hip, 250).der).toBe(0)
  })

  it('sem colar, o mesmo desalinhamento pontua — por isso comparar DER de colares diferentes engana', () => {
    const hip: Turno[] = [
      { inicioMs: 0, fimMs: 3100, falante: 'v1' },
      { inicioMs: 3100, fimMs: 6000, falante: 'v2' },
      { inicioMs: 6000, fimMs: 9000, falante: 'v1' },
    ]
    expect(calcularDer(REF, hip, 0).der).toBeGreaterThan(0)
  })

  it('o colar usado sai no resultado, para o número nunca ser lido fora de contexto', () => {
    expect(calcularDer(REF, [], 250).colarMs).toBe(250)
  })
})

describe('pureza de cluster — a métrica por ENUNCIADO, que é como o usuário vê', () => {
  it('atribuição perfeita dá 1', () => {
    const r = purezaDeClusters(['A', 'B', 'A', 'B'], ['v1', 'v2', 'v1', 'v2'])
    expect(r.pureza).toBe(1); expect(r.cobertura).toBe(1); expect(r.f1).toBe(1)
    expect(r.clustersCriados).toBe(2); expect(r.falantesReais).toBe(2)
  })

  it('FUNDIR duas pessoas derruba a pureza, não a cobertura', () => {
    const r = purezaDeClusters(['A', 'A', 'B', 'B'], ['v1', 'v1', 'v1', 'v1'])
    expect(r.pureza).toBe(0.5)     // o cluster único é metade A, metade B
    expect(r.cobertura).toBe(1)    // cada pessoa ficou concentrada num cluster só
    expect(r.clustersCriados).toBe(1)
    expect(r.falantesReais).toBe(2)
  })

  it('FRAGMENTAR uma pessoa derruba a cobertura, não a pureza — o sintoma oposto', () => {
    const r = purezaDeClusters(['A', 'A', 'A', 'A'], ['v1', 'v2', 'v3', 'v4'])
    expect(r.pureza).toBe(1)       // cada cluster tem uma pessoa só
    expect(r.cobertura).toBe(0.25) // mas A ficou espalhada em quatro
    expect(r.clustersCriados).toBe(4)
    expect(r.falantesReais).toBe(1)
  })

  it('listas de tamanhos diferentes é erro de uso, não resultado silencioso', () => {
    expect(() => purezaDeClusters(['A'], ['v1', 'v2'])).toThrow(/tamanhos diferentes/)
  })

  it('lista vazia não divide por zero', () => {
    expect(purezaDeClusters([], []).f1).toBe(0)
  })
})
