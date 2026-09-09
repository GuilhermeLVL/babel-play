/**
 * O CLIENTE DIZ QUAL EVENTO ACONTECEU; O SERVIDOR DECIDE QUANTO VALE.
 *
 * Esta era a regra do GASTO desde 01/09 (`autorizarGasto`) e não era a do CRÉDITO: das duas
 * famílias de `creditoId` que o app emite, só `conquista-*` resolvia. Os cofres do passe
 * (`passe:t1:cofre-dN-K`) chegavam ao servidor e levavam 400 "crédito desconhecido" — com dois
 * efeitos medidos na auditoria de 07/09: a tela do passe repetia o pedido a cada montagem e nunca
 * marcava o baú, e as 36 linhas `passe:t1:*` que existiam no banco tinham entrado ANTES do
 * endurecimento, com o valor que o cliente mandou (10 a 172 Seeds, 2.472 no total).
 *
 * O que este arquivo prende é a régua: cada família vale o que a REGRA diz, e o cofre exige o
 * nível da sua década.
 */
import { describe, expect,it } from 'vitest'

import { ehRecusa,valorDoCredito } from '../src/core/economiaAutoridade'
import { CONQUISTAS } from '../src/core/learning/conquistas'
import { slotsDoPasse, TEMPORADA_ATUAL } from '../src/core/passe'

const cofres = slotsDoPasse().filter((s): s is Extract<typeof s, { tipo: 'seeds' }> => s.tipo === 'seeds')

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

  it('cofre do passe: o valor é o do slot que a tela desenha, e a década é o nível exigido', () => {
    expect(cofres.length).toBeGreaterThan(0)
    for (const s of cofres) {
      const v = valorDoCredito(s.creditoId)
      expect(ehRecusa(v), s.creditoId).toBe(false)
      if (ehRecusa(v)) continue
      /* MESMO NÚMERO, não um número parecido: o cofre vale o que o trilho mostra porque os dois
         leem `slotsDoPasse()`. A função anterior (`seedsDoCofreDoPasse`) recebia a curva por
         parâmetro — quem chamasse com outra curva creditava outro valor. */
      expect(v.seeds, s.creditoId).toBe(s.quantidade)
      expect(v.xp, s.creditoId).toBe(0)
      expect(v.reason, s.creditoId).toBe(`passe:${TEMPORADA_ATUAL}`)
      /* A década N do passe é o nível N do app — a mesma regra de `slotDestravado`. */
      expect(v.nivelMinimo, s.creditoId).toBe(s.decada)
    }
  })

  it('o cofre mais caro da trilha exige o nível mais alto', () => {
    const caro = [...cofres].sort((a, b) => b.quantidade - a.quantidade)[0]
    const v = valorDoCredito(caro.creditoId)
    expect(ehRecusa(v)).toBe(false)
    if (ehRecusa(v)) return
    expect(v.seeds).toBeGreaterThan(100)
    expect(v.nivelMinimo).toBeGreaterThanOrEqual(9)
  })

  it('id inventado é recusado — inclusive um que parece de passe', () => {
    for (const id of [
      'conquista-nao-existe',
      'passe:t1:cofre-d99-1',
      'passe:t9:cofre-d1-1',
      'drop-partida-bau-1757000000000',
      'qualquer-coisa',
      '',
    ]) {
      expect(ehRecusa(valorDoCredito(id)), id).toBe(true)
    }
  })

  it('a década 1 do passe não tem cofre — e por isso nenhum crédito sai no nível 1', () => {
    /* A década 1 do catálogo já enche as dez casas com item, então `SEEDS_POR_COFRE[1]` nunca é
       usado. Se isso mudar, esta linha cai e obriga a decidir se um cofre de nível 1 deve existir. */
    expect(cofres.filter((s) => s.decada === 1)).toEqual([])
  })
})
