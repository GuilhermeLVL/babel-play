/**
 * O USO JUSTO DO DIA — o contrato que servidor e cliente compartilham (C4 da change `planos-v2`,
 * ADR 0011).
 *
 * O Premium é "sem limite no dia a dia" com um uso justo de nuvem por dia LOCAL da pessoa
 * (`sttSegundosDia`/`tokensDia` em `src/core/planos.ts`). Passando dele, o servidor recusa com
 * **429 `uso_justo_do_dia`** e `Retry-After` até a virada do dia (`segundosAteVirarODia`, em
 * `learning/economia.ts`, ao lado de `diaNoFuso`) — e não com o 402 de cota, porque o 402 é "o plano
 * não cobre" e o cliente o transforma em momento de venda. Aqui não há o que vender: a nuvem descansa,
 * o aparelho assume, e ela volta amanhã.
 *
 * FOLHA, SEM IMPORT NENHUM, de propósito: o adaptador de nuvem do cliente a importa, e ela não pode
 * puxar para o bundle nada além do código da recusa.
 */

/** O código da recusa do dia. Nunca vira oferta (`momentoDaRecusa` só olha 402). */
export const CODIGO_USO_JUSTO_DO_DIA = 'uso_justo_do_dia';

/** O corpo é a recusa do uso justo do dia? (status 429 + o código acima). */
export function ehRecusaDoUsoJusto(status: number, corpo: unknown): boolean {
  return (
    status === 429 &&
    !!corpo &&
    typeof corpo === 'object' &&
    (corpo as { code?: unknown }).code === CODIGO_USO_JUSTO_DO_DIA
  );
}
