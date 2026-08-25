/**
 * Testes da sobreposição de fala.
 *
 * O teste que importa mais é o negativo: a MESMA pessoa em dois trechos encostados não interrompeu
 * ninguém. Sem essa regra o indicador contaria o recorte do motor de transcrição como conversa
 * atropelada, e o número subiria quanto mais bem fatiado fosse o áudio — o oposto da verdade.
 */
import { describe, it, expect } from 'vitest'
import { contarSobreposicoes } from '../src/core/learning/sobreposicao'

describe('contarSobreposicoes', () => {
  it('conta uma sobreposição entre falantes diferentes', () => {
    const r = contarSobreposicoes([
      { speaker: 'Ana', startMs: 0, endMs: 5000 },
      { speaker: 'Beto', startMs: 4000, endMs: 8000 },
    ])
    expect(r?.total).toBe(1)
    expect(r?.msSobrepostos).toBe(1000)
    expect(r?.maiorMs).toBe(1000)
    expect(r?.falantes).toEqual(['Ana', 'Beto'])
  })

  it('NÃO conta o mesmo falante em trechos encostados — não interrompeu ninguém', () => {
    const r = contarSobreposicoes([
      { speaker: 'Ana', startMs: 0, endMs: 5000 },
      { speaker: 'Ana', startMs: 4000, endMs: 9000 },
      { speaker: 'Beto', startMs: 20000, endMs: 21000 },
    ])
    expect(r?.total).toBe(0)
    expect(r?.msSobrepostos).toBe(0)
  })

  it('falas em sequência sem encostar dão zero', () => {
    const r = contarSobreposicoes([
      { speaker: 'Ana', startMs: 0, endMs: 3000 },
      { speaker: 'Beto', startMs: 3000, endMs: 6000 },
    ])
    expect(r?.total).toBe(0)
  })

  /* `mic` e `system` são fluxos independentes: coexistir no tempo é fala simultânea REAL. */
  it('usa a fonte como identidade quando não há nome de falante', () => {
    const r = contarSobreposicoes([
      { source: 'mic', startMs: 0, endMs: 5000 },
      { source: 'system', startMs: 2000, endMs: 7000 },
    ])
    expect(r?.total).toBe(1)
    expect(r?.msSobrepostos).toBe(3000)
    expect(r?.falantes).toEqual(['mic', 'system'])
  })

  /* Duas falas de "Ana" em vias diferentes: se a FONTE decidisse, haveria dois falantes e uma
     sobreposição de 4 s. Como o NOME decide, há um falante só — e um falante só é `null`, porque
     ninguém se interrompe. O `null` aqui é a prova da prioridade. */
  it('o nome do falante tem prioridade sobre a fonte', () => {
    const r = contarSobreposicoes([
      { speaker: 'Ana', source: 'mic', startMs: 0, endMs: 5000 },
      { speaker: 'Ana', source: 'system', startMs: 1000, endMs: 6000 },
    ])
    expect(r).toBeNull()
  })

  /* '—' é o que a UI usa como "sem falante"; não pode virar um falante chamado "—". */
  it('trata "—" como ausência de nome e cai para a fonte', () => {
    const r = contarSobreposicoes([
      { speaker: '—', source: 'mic', startMs: 0, endMs: 5000 },
      { speaker: '—', source: 'system', startMs: 1000, endMs: 6000 },
    ])
    expect(r?.total).toBe(1)
    expect(r?.falantes).toEqual(['mic', 'system'])
  })

  it('devolve null com um só falante — não zero', () => {
    const r = contarSobreposicoes([
      { speaker: 'Ana', startMs: 0, endMs: 5000 },
      { speaker: 'Ana', startMs: 6000, endMs: 9000 },
    ])
    expect(r).toBeNull()
  })

  it('devolve null sem timing', () => {
    expect(contarSobreposicoes([
      { speaker: 'Ana' },
      { speaker: 'Beto' },
    ])).toBeNull()
  })

  it('devolve null com lista vazia', () => {
    expect(contarSobreposicoes([])).toBeNull()
  })

  it('conta as falas descartadas por falta de timing', () => {
    const r = contarSobreposicoes([
      { speaker: 'Ana', startMs: 0, endMs: 5000 },
      { speaker: 'Beto', startMs: 4000, endMs: 8000 },
      { speaker: 'Caio' },
      { speaker: 'Dora', startMs: 100 },
    ])
    expect(r?.total).toBe(1)
    expect(r?.falasSemTiming).toBe(2)
  })

  it('fala sem identidade nenhuma é descartada, não vira falante anônimo', () => {
    const r = contarSobreposicoes([
      { startMs: 0, endMs: 5000 },
      { startMs: 1000, endMs: 6000 },
      { speaker: 'Ana', startMs: 20000, endMs: 21000 },
      { speaker: 'Beto', startMs: 20500, endMs: 22000 },
    ])
    expect(r?.total).toBe(1)
    expect(r?.falasSemTiming).toBe(2)
    expect(r?.falantes).toEqual(['Ana', 'Beto'])
  })

  it('intervalo invertido ou de duração zero é descartado', () => {
    const r = contarSobreposicoes([
      { speaker: 'Ana', startMs: 5000, endMs: 5000 },
      { speaker: 'Beto', startMs: 4000, endMs: 3000 },
      { speaker: 'Caio', startMs: 0, endMs: 9000 },
      { speaker: 'Dora', startMs: 1000, endMs: 2000 },
    ])
    expect(r?.total).toBe(1)
    expect(r?.falasSemTiming).toBe(2)
  })

  it('três falantes sobrepostos ao mesmo tempo geram três pares', () => {
    const r = contarSobreposicoes([
      { speaker: 'Ana', startMs: 0, endMs: 10000 },
      { speaker: 'Beto', startMs: 1000, endMs: 10000 },
      { speaker: 'Caio', startMs: 2000, endMs: 10000 },
    ])
    expect(r?.total).toBe(3)
    expect(r?.falantes).toEqual(['Ana', 'Beto', 'Caio'])
  })

  it('não depende da ordem em que as falas chegam', () => {
    const falas = [
      { speaker: 'Beto', startMs: 4000, endMs: 8000 },
      { speaker: 'Ana', startMs: 0, endMs: 5000 },
    ]
    const r = contarSobreposicoes(falas)
    const r2 = contarSobreposicoes([...falas].reverse())
    expect(r?.total).toBe(1)
    expect(r2?.total).toBe(1)
    expect(r?.msSobrepostos).toBe(r2?.msSobrepostos)
  })

  it('registra a maior sobreposição, não a última', () => {
    const r = contarSobreposicoes([
      { speaker: 'Ana', startMs: 0, endMs: 10000 },
      { speaker: 'Beto', startMs: 1000, endMs: 9000 },   // 8000 ms
      { speaker: 'Ana', startMs: 20000, endMs: 25000 },
      { speaker: 'Beto', startMs: 24500, endMs: 26000 }, // 500 ms
    ])
    expect(r?.maiorMs).toBe(8000)
  })
})
