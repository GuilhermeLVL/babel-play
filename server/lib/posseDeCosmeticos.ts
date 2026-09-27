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
 * O QUE A CONFERÊNCIA PRECISA SABER DO USUÁRIO — nível, compras, conquistas e itens premium.
 *
 * Separado de `recusaDePosse` porque `PUT /api/settings` confere até sete campos no mesmo
 * pedido, e cada chamada recarregava as quatro fontes, com `economiaDoUsuario` (o perfil
 * inteiro) em cada uma: até 98 consultas num único PUT (fix/rotas-caras). Quem confere vários
 * itens carrega o contexto UMA vez e o passa adiante.
 */
export interface ContextoDePosse {
  nivel: number
  comprados: string[]
  conquistas: string[]
  premium: string[]
}

export async function contextoDePosse(userId: UserId): Promise<ContextoDePosse> {
  const [{ nivel, metricas }, conquistas, premium] = await Promise.all([
    economiaDoUsuario(userId),
    economiaRepo.conquistasCreditadas(userId),
    creditsRepo.itensPremium(userId),
  ])
  /* As compras da Loja já vêm no perfil que calculou o nível (`itensComprados`, derivado do mesmo
     razão por `seedSpendsRepo.razao`): reler `seed_spends` só para isso era uma consulta a mais. */
  return { nivel, comprados: metricas.itensComprados ?? [], conquistas, premium }
}

/**
 * Confere se o usuário pode equipar `(tipo, alvo)`. Devolve `null` quando pode.
 *
 * Item fora do catálogo passa: é o mesmo comportamento do cliente, e trancar o que ninguém vende
 * nem premia seria inventar uma regra que não existe em lugar nenhum. Por isso o contexto só é
 * carregado depois de achar o item — e, quando vem pronto em `ctx`, não é carregado de novo.
 */
export async function recusaDePosse(
  userId: UserId,
  tipo: string,
  alvo: string,
  ctx?: ContextoDePosse | (() => Promise<ContextoDePosse>),
): Promise<RecusaDePosse | null> {
  const item = CATALOGO_DA_LOJA.find((i) => i.tipo === tipo && i.alvo === alvo)
  if (!item) return null

  const { nivel, comprados, conquistas, premium } =
    typeof ctx === 'function' ? await ctx() : (ctx ?? (await contextoDePosse(userId)))

  /* O EQUIVALENTE PAGO (recompensas v2): quem pagou com Créditos por um item que saiu do catálogo
     recebe o equivalente na posse premium — mesmo que ele seja, por outra porta, de conquista. */
  if (premium.includes(item.id)) return null
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
  /* Maestria (recompensas v2): o servidor confere a posse pelo crédito, e os efeitos de jogo não
     passam por `settings` — quem chegar aqui com um deles é recusado. */
  if (item.origemMaestria) return { tipo, alvo, motivo: 'exige maestria do jogo' }
  /* Sem `nivel` (recompensas v2) só a compra abre. */
  if ((item.nivel !== undefined && nivel >= item.nivel) || comprados.includes(item.id)) return null
  return {
    tipo,
    alvo,
    motivo:
      item.nivel === undefined
        ? `exige ${item.precoSeeds ?? 0} seeds`
        : item.precoSeeds !== undefined
          ? `exige nível ${item.nivel} ou ${item.precoSeeds} seeds`
          : `exige nível ${item.nivel}`,
  }
}
