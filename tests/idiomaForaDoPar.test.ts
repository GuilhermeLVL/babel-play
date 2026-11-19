/**
 * A FALA FORA DO PAR NO INTÉRPRETE POR TOQUE (conversa-de-verdade, 3.1 e 3.2): a regra que decide quando a fala do
 * turno é bloqueada (sem tradução, sem leitura, com "Não parece … — repetir?").
 *   - o idioma ouvido difere do idioma do lado, com fala de 2 s ou mais e confiança de 0,8 ou mais → bloqueia;
 *   - o mesmo idioma, a fala curta, a confiança baixa ou nada conferido → a fala segue normal.
 */
import { describe, expect, it } from 'vitest'

import { idiomaForaDoPar } from '../src/lib/captura/idiomaForaDoPar'

describe('idiomaForaDoPar', () => {
  it('espanhol no lado do inglês, com confiança alta: bloqueia (CONV-03)', () => {
    expect(idiomaForaDoPar({ esperado: 'en', conferido: { idioma: 'es', confianca: 0.97 }, audioMs: 2600 })).toBe('es')
  })

  it('o idioma do lado (inclusive em BCP-47) segue normal', () => {
    expect(
      idiomaForaDoPar({ esperado: 'pt-BR', conferido: { idioma: 'pt', confianca: 0.99 }, audioMs: 4000 }),
    ).toBeNull()
  })

  it('fala curta ou confiança baixa: segue normal (falso bloqueio custa mais que a tradução ruim de um "Ok")', () => {
    expect(idiomaForaDoPar({ esperado: 'en', conferido: { idioma: 'es', confianca: 0.99 }, audioMs: 1500 })).toBeNull()
    expect(idiomaForaDoPar({ esperado: 'en', conferido: { idioma: 'es', confianca: 0.6 }, audioMs: 4000 })).toBeNull()
  })

  it('nada conferido (motor que não mede, a nuvem): segue normal', () => {
    expect(idiomaForaDoPar({ esperado: 'en', conferido: undefined, audioMs: 4000 })).toBeNull()
  })

  it('o limiar pode ser outro (a calibração, 3.3)', () => {
    expect(
      idiomaForaDoPar({ esperado: 'en', conferido: { idioma: 'es', confianca: 0.7 }, audioMs: 4000, limiar: 0.65 }),
    ).toBe('es')
  })
})
