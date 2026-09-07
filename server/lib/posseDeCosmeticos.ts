/**
 * A POSSE CONFERIDA NO SERVIDOR (auditoria de 2026-09-07, achado A11).
 *
 * O QUE ESTAVA ABERTO. `PUT /api/settings` gravava `ui.theme` e `ui.customColors` validando só a
 * FORMA: um POST com `{"ui":{"theme":"premium"}}` equipava o tema mais caro do catálogo sem nível,
 * sem Seeds e sem compra. Toda a régua de posse vivia no cliente — e régua no cliente é sugestão,
 * porque a rota está aberta a quem souber o caminho. Num app que vende esses itens, a diferença
 * entre sugestão e regra é a diferença entre um catálogo e uma vitrine.
 *
 * O QUE ESTA FUNÇÃO FAZ. Refaz, do lado de cá, a mesma pergunta que `estadoDoItem` faz no cliente,
 * com as fontes que o servidor tem e o navegador não pode falsear:
 *
 *  - **nível**: derivado de `computeProfile`, que sai dos eventos gravados;
 *  - **comprado com Seeds**: `seed_spends.reason = 'loja:<id>'`;
 *  - **conquista**: `seed_credits.reason = 'conquista:<id>'`;
 *  - **premium**: `credit_spends`.
 *
 * O QUE ELA NÃO FAZ, e está escrito porque a omissão é deliberada: não confere `customColors`
 * item a item. A paleta livre é uma capacidade (o "Estúdio"), e é a capacidade que tem dono — se
 * o Estúdio está liberado, as cores são da pessoa.
 */
import { CATALOGO_DA_LOJA } from '../../src/core/loja'
import { seedSpendsRepo } from '../db/repositories/seedSpends'
import { creditsRepo } from '../db/repositories/credits'
import { economiaRepo } from '../db/repositories/economia'
import { economiaDoUsuario } from '../db/repositories/metrics'
import type { UserId } from './authContext'

export interface RecusaDePosse {
  /** O que foi recusado, no vocabulário do catálogo (`tema`, `fonte`, `posicao`…). */
  tipo: string
  /** O alvo pedido (`premium`, `aurora`…). */
  alvo: string
  /** Por que não pode: nível que falta, preço, ou a conquista exigida. */
  motivo: string
}

/**
 * Confere se o usuário pode equipar `(tipo, alvo)`. Devolve `null` quando pode.
 *
 * Item fora do catálogo passa: é o mesmo comportamento do cliente, e trancar o que ninguém vende
 * nem premia seria inventar uma regra que não existe em lugar nenhum.
 */
export async function recusaDePosse(
  userId: UserId,
  tipo: string,
  alvo: string,
): Promise<RecusaDePosse | null> {
  const item = CATALOGO_DA_LOJA.find((i) => i.tipo === tipo && i.alvo === alvo)
  if (!item) return null

  const [{ nivel }, comprados, conquistas, premium] = await Promise.all([
    economiaDoUsuario(userId),
    seedSpendsRepo.itensComprados(userId),
    economiaRepo.conquistasCreditadas(userId),
    creditsRepo.itensPremium(userId),
  ])

  if (item.exclusivoDe) {
    return conquistas.includes(item.exclusivoDe)
      ? null
      : { tipo, alvo, motivo: `exige a conquista "${item.exclusivoDe}"` }
  }
  if (item.precoCreditos !== undefined) {
    return premium.includes(item.id)
      ? null
      : { tipo, alvo, motivo: `item premium: ${item.precoCreditos} créditos ou o Passe` }
  }
  if (nivel >= item.nivel || comprados.includes(item.id)) return null
  return {
    tipo,
    alvo,
    motivo: item.precoSeeds !== undefined
      ? `exige nível ${item.nivel} ou ${item.precoSeeds} seeds`
      : `exige nível ${item.nivel}`,
  }
}
