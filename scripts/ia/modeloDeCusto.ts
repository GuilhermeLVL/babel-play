/**
 * O MODELO DE CUSTO DOS PLANOS PAGOS, puro (sem I/O): `scripts/ia/simular-custo.ts` o imprime e
 * `tests/planos-v4-matriz.test.ts` o cobra. As cotas vêm da matriz (`src/core/planos.ts`): se uma cota mudar,
 * a margem muda aqui sem editar nada.
 *
 * Os números de referência são os da spec (`docs/specs/2026-10-24-planos-v4.md`, "Custos"):
 *   - PIOR CASO de nuvem: R$ 0,65 por hora (transcrição + tradução; o esperado é ~R$ 0,16 a R$ 0,33);
 *   - IA de texto fora da legenda (explicação da frase, resumo→cartões, tutor): R$ 1,40 por 1M de tokens da cota;
 *   - voz natural: US$ 1,00 por 1M de caracteres, câmbio de R$ 5,60;
 *   - o ANUAL são 10 mensalidades, pagas de uma vez (ou em 12x) e cobrindo 12 meses de serviço.
 * A taxa do anual (cartão em 12x) é calibrada na tabela da spec (6,3% a 6,7% do valor); usa-se 7%, do lado
 * conservador. É estimativa: o uso real precisa ser medido (docs/alternativas-de-custo-e-eficiencia.md).
 */
import { PLAN_MATRIX, type PlanoDeAssinatura } from '../../src/core/planos';

export const CAMBIO_BRL_POR_USD = 5.6;
/** Pior custo da hora de legenda na nuvem, em R$ (spec dos planos v4). */
export const PIOR_CUSTO_BRL_POR_HORA_DE_NUVEM = 0.65;
/** Tokens da cota de IA de texto: R$ por milhão. Calibrado no Plus da spec (2 M tokens ≈ R$ 2,80). */
export const CUSTO_BRL_POR_MILHAO_DE_TOKENS = 1.4;
export const USD_POR_MILHAO_DE_CARACTERES_DE_VOZ = 1;
/** Taxa do anual (cartão em 12x), sobre o valor bruto. */
export const TAXA_DO_ANUAL = 0.07;
/** O anual são 10 mensalidades de preço e cobre 12 meses de serviço. */
export const MESES_DO_ANUAL = 12;
/**
 * Extra do Pro que a matriz ainda não tem: 5 h de conversa por voz com o tutor, ESTIMADO (a medir) em R$ 4,20.
 * Só o `pro4` paga isto no modelo; some quando a medição trocar o número por uma cota.
 */
export const EXTRA_DO_TUTOR_POR_VOZ_BRL: Partial<Record<PlanoDeAssinatura, number>> = { pro4: 4.2 };

export interface CustoDoPlano {
  horasDeNuvem: number;
  nuvemBrl: number;
  iaDeTextoBrl: number;
  vozBrl: number;
  extraBrl: number;
  totalMensalBrl: number;
}

/** Custo mensal de UMA conta que usa 100% de cada cota, no pior preço. */
export function custoDoPlanoNoPiorCaso(plano: PlanoDeAssinatura): CustoDoPlano {
  const q = PLAN_MATRIX[plano].quotas;
  const horasDeNuvem = ((q.sttSegundosMes ?? 0) + (q.sttAoVivoSegundosMes ?? 0)) / 3600;
  const nuvemBrl = horasDeNuvem * PIOR_CUSTO_BRL_POR_HORA_DE_NUVEM;
  const iaDeTextoBrl = ((q.tokensMes ?? 0) / 1_000_000) * CUSTO_BRL_POR_MILHAO_DE_TOKENS;
  const vozBrl = ((q.vozCaracteresMes ?? 0) / 1_000_000) * USD_POR_MILHAO_DE_CARACTERES_DE_VOZ * CAMBIO_BRL_POR_USD;
  const extraBrl = EXTRA_DO_TUTOR_POR_VOZ_BRL[plano] ?? 0;
  return {
    horasDeNuvem,
    nuvemBrl,
    iaDeTextoBrl,
    vozBrl,
    extraBrl,
    totalMensalBrl: nuvemBrl + iaDeTextoBrl + vozBrl + extraBrl,
  };
}

export interface MargemDoAnual extends CustoDoPlano {
  receitaBrutaAnualBrl: number;
  receitaLiquidaMensalBrl: number;
  margemMensalBrl: number;
  margemAnualBrl: number;
}

/** A margem de quem paga o ANO e usa tudo: receita líquida do ano ÷ 12 meses, menos o custo mensal no pior caso. */
export function margemDoAnual(plano: PlanoDeAssinatura): MargemDoAnual {
  const anual = PLAN_MATRIX[plano].precoAnualBrl;
  if (anual === null) throw new Error(`o plano ${plano} não tem preço anual`);
  const custo = custoDoPlanoNoPiorCaso(plano);
  const receitaLiquidaMensalBrl = (anual * (1 - TAXA_DO_ANUAL)) / MESES_DO_ANUAL;
  const margemMensalBrl = receitaLiquidaMensalBrl - custo.totalMensalBrl;
  return {
    ...custo,
    receitaBrutaAnualBrl: anual,
    receitaLiquidaMensalBrl,
    margemMensalBrl,
    margemAnualBrl: margemMensalBrl * MESES_DO_ANUAL,
  };
}
