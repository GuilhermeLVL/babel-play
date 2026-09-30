/**
 * OS NÍVEIS POR PLANO × FUNÇÃO (`IA_NIVEIS`) — B3 da Fase B, 29/09/2026.
 *
 * A decisão do dono: o Grátis e o convidado recebem a TRADUÇÃO RÁPIDA (o modelo barato); quem paga,
 * a TRADUÇÃO NUANCE (o modelo que o registro marca para a nuance — o vencedor da bancada, no B7 —,
 * com o barato de reserva). O contrato dos níveis mora em `src/core/nivelDeTraducao.ts`; o modelo de
 * cada nível, no registro de provedores (campo `niveis` de cada modelo); ESTE arquivo diz, função por
 * função, que nível cada capacidade de plano recebe, e monta a cascata daquele nível.
 *
 * PELA CAPACIDADE, NUNCA PELO NOME. A tabela lê `traducaoNuance` (a matriz de `src/core/planos.ts`),
 * e nenhuma linha daqui compara `plan` com uma string: a Fase C renomeia essencial/pro → premium, e
 * o entitlement atravessa o rename sem que ninguém precise lembrar deste arquivo.
 *
 * UNIFICA O `largerModels`. Antes, mtProxy e tutor montavam a cascata com
 * `cascataDeNuvem({ modelosGrandes: plano.largerModels })`. Agora os dois chamam `cascataDoPlano`,
 * que resolve o nível e ainda repassa o `largerModels` — que só o registro LEGADO lê (o
 * `LLM_MODEL_GRANDE` de sempre, para quem tem `largerModels`). Sem `IA_PROVEDORES` nenhum modelo
 * declara nível, a nuance desce inteira para a rápida, e a cascata de cada plano é a de antes
 * (`tests/integration/niveis-de-traducao.test.ts` confere numa matriz de ambientes).
 *
 * A TABELA É O TETO, NÃO O PADRÃO DA LEGENDA (D1 da Fase D). Na tradução, a nuance chega quando o
 * cliente a PEDE (`nivel`, ao tocar numa frase); a legenda ao vivo, sem pedido, fica na rápida — o
 * padrão do dono —, salvo com `NUANCE_AO_VIVO=1` (`nivelDaTraducaoPedida`). O pedido é do corpo, e
 * por isso passa sempre pelo `rebaixarNivel`: quem não tem `traducaoNuance` recebe a rápida.
 *
 * O POLIMENTO (D5 da Fase D) é a linha `polimento` da tabela: o "polir a sessão"
 * (`server/ai/polimento.ts`) recusa (402) quem não tem a capacidade, e quem tem recebe o nível
 * `polimento` — a cascata dele desce a escada (polimento → nuance → rápida, `pernasDaFuncao`).
 */
import { type CapacidadeDeNivel, type NivelDaTraducao, rebaixarNivel } from '../../src/core/nivelDeTraducao'
import type { FuncaoDeIa } from './funcoesDeIa'
import { cascataDeNuvem, type Provedor } from './provedores'

/** O nível de uma função para quem tem (ou não) a capacidade da nuance. */
export interface NiveisDaFuncao {
  semNuance: NivelDaTraducao
  comNuance: NivelDaTraducao
}

/**
 * A TABELA. O corretor (a checagem curta de uma resposta do exercício) segue o tutor, com quem
 * divide os modelos: um JSON de ~30 tokens custa quase nada em qualquer nível, e dar a quem paga um
 * corretor pior que o tutor seria a incoerência que o plano não explica. Mudar uma linha aqui é
 * decisão de produto — o custo de cada nível está na bancada (B5) e no `politicaDeCusto.ts` (B4).
 */
export const IA_NIVEIS: Readonly<Record<FuncaoDeIa, NiveisDaFuncao>> = {
  traducao: { semNuance: 'rapida', comNuance: 'nuance' },
  tutor: { semNuance: 'rapida', comNuance: 'nuance' },
  corretor: { semNuance: 'rapida', comNuance: 'nuance' },
  /* As "Outras formas" (D4) são da Tradução Nuance: a rota recusa (402) quem não tem a capacidade,
     e a linha `semNuance` só existe porque a tabela cobre toda função. */
  alternativas: { semNuance: 'rapida', comNuance: 'nuance' },
  /* "Polir a sessão" (D5): blocos inteiros, sem pressa de legenda — o nível mais alto da escada. Como
     as "Outras formas", a rota recusa (402) quem não tem a capacidade. */
  polimento: { semNuance: 'rapida', comNuance: 'polimento' },
}

/** O nível que a função entrega a este plano — pela capacidade `traducaoNuance`. */
export function nivelDaFuncao(funcao: FuncaoDeIa, capacidade: CapacidadeDeNivel): NivelDaTraducao {
  const linha = IA_NIVEIS[funcao]
  /* `rebaixarNivel` é a mesma régua do D1: sem a capacidade, a rápida, qualquer que seja o pedido. */
  return rebaixarNivel(capacidade.traducaoNuance === true ? linha.comNuance : linha.semNuance, capacidade)
}

/**
 * A NUANCE NA LEGENDA AO VIVO (D1 da Fase D). O padrão do dono, até ele decidir diferente: a legenda
 * ao vivo usa o modelo RÁPIDO — é ela que roda o tempo todo, e o custo do plano foi feito com ela —,
 * e a nuance entra quando a pessoa toca numa frase (o cliente pede `nivel: 'nuance'`) e no "polir"
 * (D5). `NUANCE_AO_VIVO=1` liga a nuance também ao vivo, para quem tem a capacidade.
 */
export const nuanceAoVivo = (env: NodeJS.ProcessEnv = process.env): boolean => env.NUANCE_AO_VIVO?.trim() === '1'

/**
 * O NÍVEL DE UMA TRADUÇÃO PEDIDA (D1): o que o cliente pediu, rebaixado pela capacidade
 * (`rebaixarNivel`: sem `traducaoNuance`, a rápida, qualquer que seja o pedido). Sem pedido é a
 * legenda ao vivo: a rápida, ou o nível da função com `NUANCE_AO_VIVO=1`. O corpo é do cliente e
 * qualquer um escreve `"nivel": "nuance"` num `curl` — por isso o pedido nunca passa sem o rebaixo.
 */
export function nivelDaTraducaoPedida(
  pedido: NivelDaTraducao | undefined,
  capacidade: CapacidadeDeNivel,
  env: NodeJS.ProcessEnv = process.env,
): NivelDaTraducao {
  const aoVivo = nuanceAoVivo(env) ? nivelDaFuncao('traducao', capacidade) : 'rapida'
  return rebaixarNivel(pedido ?? aoVivo, capacidade)
}

/** A cascata de um nível, com o nível que a escolheu (para o rastro, a política de custo e o cache). */
export interface CascataDoNivel {
  nivel: NivelDaTraducao
  pernas: Provedor[]
}

/**
 * A CASCATA DE NUVEM DE UM PLANO para uma função: o nível pela capacidade, as pernas pelo registro.
 * `largerModels` segue só para o legado (ver o topo). Sem pernas, a lista vem vazia — quem chama
 * responde 501 como sempre.
 */
export function cascataDoPlano(
  funcao: FuncaoDeIa,
  plano: CapacidadeDeNivel & { largerModels?: boolean },
  env: NodeJS.ProcessEnv = process.env,
): CascataDoNivel {
  const nivel = nivelDaFuncao(funcao, plano)
  return { nivel, pernas: cascataDeNuvem({ funcao, nivel, modelosGrandes: plano.largerModels === true }, env) }
}

/**
 * A CASCATA DA TRADUÇÃO PEDIDA (`POST /api/ai/mt`, D1): o nível de `nivelDaTraducaoPedida`, as
 * pernas do registro para ele. No legado nenhum modelo declara nível, e o pedido não muda nada.
 */
export function cascataDaTraducao(
  pedido: NivelDaTraducao | undefined,
  plano: CapacidadeDeNivel & { largerModels?: boolean },
  env: NodeJS.ProcessEnv = process.env,
): CascataDoNivel {
  const nivel = nivelDaTraducaoPedida(pedido, plano, env)
  return {
    nivel,
    pernas: cascataDeNuvem({ funcao: 'traducao', nivel, modelosGrandes: plano.largerModels === true }, env),
  }
}
