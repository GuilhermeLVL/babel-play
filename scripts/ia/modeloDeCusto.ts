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
import { FUNCOES_DE_IA } from '../../server/ai/funcoesDeIa';
import { AMOSTRA_DE_IA, PLAN_MATRIX, type PlanoDeAssinatura } from '../../src/core/planos';

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

/**
 * A AMOSTRA DA IA DE ESTUDO DO GRÁTIS (planos v4, etapa 2; `AMOSTRA_DE_IA`), em US$ por conta Grátis que a usa INTEIRA
 * no mês: 5 explicações por dia (30 dias) e 1 resumo por semana (52 ÷ 12 no mês). Os tokens de SAÍDA são o teto
 * da função (`FUNCOES_DE_IA[...].maxTokens`); os de ENTRADA, o pior caso pela estimativa conservadora do servidor
 * (metade dos caracteres do prompt, `estimarTokens`): explicação ~3.900 caracteres (system + instrução de menor +
 * frase, tradução e 3 falas de contexto no teto) ≈ 2.000 tokens; resumo ~14.000 caracteres ≈ 7.000 tokens.
 * Os preços são os da cascata RÁPIDA do registro (`ops/ia-provedores.openrouter.json`): conservador = Llama 3.3 70B
 * (a perna mais cara do nível), esperado = Gemma 4 26B (a primeira). A EXPLICAÇÃO tem cascata própria desde 25/10/2026
 * (DeepSeek V4.1 Flash sem raciocínio → Gemma → Llama): esperado = o DeepSeek (preço declarado, o endpoint ZDR mais
 * barato com saída estruturada); conservador = o Llama, ainda a perna mais cara declarada do nível. O custo REAL medido
 * do DeepSeek na bancada é ~US$ 0,235/1M tokens (o roteamento nem sempre cai no endpoint mais barato).
 */
export const TOKENS_DE_ENTRADA_DA_AMOSTRA = { explicacao: 2_000, resumo: 7_000 } as const;
export const PRECO_DO_TEXTO_RAPIDO_USD_POR_MILHAO = {
  conservador: { entrada: 0.1, saida: 0.32 },
  esperado: { entrada: 0.0675, saida: 0.225 },
} as const;
/**
 * A explicação da amostra (cascata própria) no DeepSeek V4.1 Flash. O preço é o do endpoint ZDR que o OpenRouter
 * de fato escolheu na chamada real de 25/10/2026 (Wafer, 0,10/0,65), não o mais barato da lista (Decart, 0,09/0,18):
 * declarado conservador (0,15/0,65) para o orçamento não contar metade do gasto real. A saída dele passa a do Llama.
 */
export const PRECO_DA_EXPLICACAO_RAPIDA_USD_POR_MILHAO = {
  conservador: { entrada: 0.15, saida: 0.65 },
  esperado: { entrada: 0.15, saida: 0.65 },
} as const;

export interface CustoDaAmostra {
  explicacoesMes: number;
  resumosMes: number;
  usdPorExplicacao: number;
  usdPorResumo: number;
  usdMes: number;
}

export function custoDaAmostraPorConta(modo: 'conservador' | 'esperado'): CustoDaAmostra {
  const usd = (p: { entrada: number; saida: number }, entrada: number, saida: number) =>
    (entrada * p.entrada + saida * p.saida) / 1_000_000;
  const usdPorExplicacao = usd(
    PRECO_DA_EXPLICACAO_RAPIDA_USD_POR_MILHAO[modo],
    TOKENS_DE_ENTRADA_DA_AMOSTRA.explicacao,
    FUNCOES_DE_IA.explicacao.maxTokens,
  );
  const usdPorResumo = usd(
    PRECO_DO_TEXTO_RAPIDO_USD_POR_MILHAO[modo],
    TOKENS_DE_ENTRADA_DA_AMOSTRA.resumo,
    FUNCOES_DE_IA.resumo.maxTokens,
  );
  const explicacoesMes = AMOSTRA_DE_IA.explicacoesDia * 30;
  const resumosMes = (AMOSTRA_DE_IA.resumosSemana * 52) / 12;
  return {
    explicacoesMes,
    resumosMes,
    usdPorExplicacao,
    usdPorResumo,
    usdMes: explicacoesMes * usdPorExplicacao + resumosMes * usdPorResumo,
  };
}

/**
 * O TETO DA AMOSTRA NA BASE INTEIRA, em US$ por mês: o pool diário global (`AMOSTRA_DE_IA.poolChamadasDia`) × 30 dias,
 * com toda chamada no preço da mais cara (o resumo) — o pior caso, qualquer que seja o tamanho da base.
 */
export function custoDoPoolDaAmostraNoMes(modo: 'conservador' | 'esperado'): number {
  const c = custoDaAmostraPorConta(modo);
  return AMOSTRA_DE_IA.poolChamadasDia * 30 * Math.max(c.usdPorExplicacao, c.usdPorResumo);
}
