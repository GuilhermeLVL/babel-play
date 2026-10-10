/**
 * O PLANO PAGO COM A TRADUÇÃO NUANCE E A VOZ NATURAL, lido da MATRIZ — nunca escrito à mão num teste.
 *
 * A Fase C renomeia os planos (essencial/pro → premium) enquanto a Fase D é escrita. Um teste que
 * semeia `plan: 'pro'` quebraria no merge, e — pior — um teste que forja "o `essencial` sem nuance"
 * deixaria de forjar qualquer coisa. Os testes da Fase D pegam o plano daqui e forjam a falta da
 * capacidade por um interruptor (ver `modelo-por-plano-nivel.test.ts`), não pelo nome.
 *
 * MATRIZ V3: há três planos pagos, e o primeiro com Nuance passou a ser o Essencial — que não tem voz
 * natural, e os testes da voz (`tts.test.ts`) pegam o plano daqui. O plano de referência é o
 * primeiro que tem as DUAS capacidades que os testes exercitam.
 */
import { PLAN_MATRIX, type PlanoDeAssinatura, PLANOS_DE_ASSINATURA } from '../../src/core/planos'

const achado = PLANOS_DE_ASSINATURA.find(
  (p) =>
    PLAN_MATRIX[p].precoMensalBrl !== null &&
    PLAN_MATRIX[p].entitlements.traducaoNuance &&
    PLAN_MATRIX[p].entitlements.vozNatural,
)
if (!achado) throw new Error('a matriz não tem plano pago com traducaoNuance e vozNatural')

export const PLANO_PAGO: PlanoDeAssinatura = achado
