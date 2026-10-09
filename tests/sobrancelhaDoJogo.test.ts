/**
 * A SOBRANCELHA DA PARTIDA (`sobrancelhaNoDesenho`, `src/components/minigames/polimento/textos.ts`).
 *
 * Saiu "Ro8ada · pares…" e "Esca3a · 3 palavras" numa versão: a expressão que troca o número do molde
 * tinha perdido a barra (`/d+/` no lugar de `/\d+/`) e trocava a primeira letra "d". Nenhum teste via.
 */
import { describe, expect, it } from 'vitest'

import { sobrancelhaNoDesenho } from '../src/components/minigames/polimento/textos'

describe('a sobrancelha da partida', () => {
  it('troca só o número do molde do protótipo pelo da rodada de verdade', () => {
    expect(sobrancelhaNoDesenho('tenis', 10, 'x')).toBe('Rodada · 10 bolas')
    expect(sobrancelhaNoDesenho('termo', 3, 'x')).toBe('Escada · 3 palavras')
    expect(sobrancelhaNoDesenho('blitz', 45, 'x')).toBe('Rodada · 45 segundos')
  })

  it('molde sem número fica como está', () => {
    expect(sobrancelhaNoDesenho('memory', 8, 'x')).toBe('Rodada · pares de palavra e tradução')
  })

  it('nenhum jogo perde letra do rótulo', () => {
    for (const jogo of ['memory', 'wordsearch', 'termo', 'scramble', 'blitz', 'karuta', 'koffer', 'bao'] as const)
      expect(sobrancelhaNoDesenho(jogo, 7, 'x')).toMatch(/^(Rodada|Escada) · /)
  })
})
