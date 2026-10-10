/**
 * ESPELHO SEM CONTA — o que dá para responder sobre uma conta que não existe.
 *
 * Metade de `src/data/rotas/conta.ts`, e a metade menor: das rotas `/api/me/*` que o cliente
 * chama, só `entitlements` tem resposta honesta aqui. `exportar` e a exclusão do titular NÃO têm
 * espelho — justificado em `tests/contratos/rotas-espelhadas`: a conta é justamente o que não
 * existe neste modo, e limpar o navegador é o "apagar tudo" desta ponta.
 *
 * Rotas: GET `/api/me/entitlements`.
 */
import { ENTITLEMENTS_FECHADOS } from '../../../core/planos';
import { json } from '../nucleo';

export async function entitlementsAnonimos(): Promise<Response> {
  return json({
    plan: 'anonimo',
    /* Os campos são os da MATRIZ, todos fechados: uma capacidade nova chega aqui sem cópia manual. */
    ...ENTITLEMENTS_FECHADOS,
    // Sem conta não há teste do Premium (C6): a mesma forma do servidor, com o campo vazio.
    teste: null,
    armazenamento: { usados: 0, teto: 0 },
  });
}
