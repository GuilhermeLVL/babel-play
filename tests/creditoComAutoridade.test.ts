/**
 * O CLIENTE DIZ QUAL EVENTO ACONTECEU; O SERVIDOR DECIDE QUANTO VALE.
 *
 * Esta era a regra do GASTO desde 01/09 (`autorizarGasto`) e não era a do CRÉDITO: das duas
 * famílias de `creditoId` que o app emitia, só `conquista-*` resolvia. Os cofres do passe
 * (`passe:t1:cofre-dN-K`) chegavam ao servidor e levavam 400 "crédito desconhecido" — com dois
 * efeitos medidos na auditoria de 07/09: a tela do passe repetia o pedido a cada montagem e nunca
 * marcava o baú, e as 36 linhas `passe:t1:*` que existiam no banco tinham entrado ANTES do
 * endurecimento, com o valor que o cliente mandou (10 a 172 Seeds, 2.472 no total).
 *
 * O que este arquivo prende é a régua: cada família vale o que a REGRA diz. (O Passe saiu na onda 5
 * das recompensas v2; a temporada, que o substitui, tem a mesma régua.)
 */
import { describe, expect,it } from 'vitest'

import { ehRecusa,valorDoCredito } from '../src/core/economiaAutoridade'
import { CONQUISTAS } from '../src/core/learning/conquistas'
import { recompensaDaTrilha } from '../src/core/temporada'

describe('valorDoCredito', () => {
  it('conquista: o valor é o da tabela, não o do pedido', () => {
    for (const c of CONQUISTAS) {
      const v = valorDoCredito(`conquista-${c.id}`)
      expect(ehRecusa(v), c.id).toBe(false)
      if (ehRecusa(v)) continue
      expect(v.seeds, c.id).toBe(c.recompensa.seeds)
      expect(v.xp, c.id).toBe(c.recompensa.xp)
      /* `reason` é a coluna de onde a posse é derivada (`economiaRepo.conquistasCreditadas`
         procura por `conquista:%`). Errar o prefixo aqui apagaria a posse silenciosamente. */
      expect(v.reason, c.id).toBe(`conquista:${c.id}`)
      /* A conquista traz a própria condição; nível não é o gate dela. */
      expect(v.nivelMinimo, c.id).toBe(0)
    }
  })

  /* O PASSE DE 100 CASAS SAIU (recompensas v2, onda 5). A família que o substitui é a da
     temporada, com a mesma régua: o valor é o da casa que a tela desenha (`recompensaDaTrilha`). */
  it('casa da temporada: o valor é o da trilha que a tela desenha, e o XP exigido é nível × 150', () => {
    for (let nivel = 1; nivel <= 30; nivel++) {
      for (const trilha of ['gratis', 'assinante'] as const) {
        const r = recompensaDaTrilha(nivel, trilha)
        const id = `temporada:t1:${nivel}:${trilha}`
        const v = valorDoCredito(id)
        if (!r) {
          expect(ehRecusa(v), id).toBe(true)
          continue
        }
        if (ehRecusa(v)) throw new Error(`${id}: ${v.erro}`)
        expect(v.seeds, id).toBe('seeds' in r ? r.seeds : 0)
        expect(v.xp, id).toBe(0)
        expect(v.reason, id).toBe(id)
        expect(v.temporada?.xpExigido, id).toBe(nivel * 150)
      }
    }
  })

  it('id inventado é recusado — inclusive um que parece de passe', () => {
    for (const id of [
      'conquista-nao-existe',
      'passe:t1:cofre-d99-1',
      'passe:t9:cofre-d1-1',
      'passe:t1:cofre-d2-1', // o Passe saiu: nem o cofre que existia vale mais
      'temporada:t1:1:gratis', // casa ímpar da grátis: nada a creditar
      'temporada:t2:2:gratis',
      'drop-partida-bau-1757000000000',
      'qualquer-coisa',
      '',
    ]) {
      expect(ehRecusa(valorDoCredito(id)), id).toBe(true)
    }
  })
})
