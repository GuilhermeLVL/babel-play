/**
 * SIMULA O CUSTO MENSAL DE NUVEM de uma base de usuários, com as COTAS REAIS da matriz de planos (`src/core/planos.ts`):
 * se alguém mudar uma cota, o número muda aqui sem editar nada.
 *
 *   npx tsx scripts/ia/simular-custo.ts --usuarios 1000 --essencial 50 --premium 30 --testes 100 [--plus 0 --familia 0 --pro4 0] [--uso 0.7] [--cambio 5.6] [--amostra 0.3]
 *
 * O preço por hora de legenda (transcrição + tradução) é o MEDIDO em 17/10/2026 pelo OpenRouter com retenção zero:
 * conservador US$ 0,058, esperado US$ 0,028 (docs/estrategia-comercial-e-custos-br.md §2). Os usuários grátis custam zero,
 * exceto a franquia de alívio (aparelho fraco) até `FRANQUIA_DE_ALIVIO.tetoUsdMes` e a AMOSTRA DA IA DE ESTUDO (planos v4, etapa 2:
 * 5 explicações por dia e 1 resumo por semana, `AMOSTRA_DE_IA`). `--amostra` é a fração dos grátis que usa a amostra INTEIRA no pior
 * caso (hipótese: 0,3); no típico, um terço disso usa metade, no preço esperado. É estimativa: o uso real precisa ser medido.
 */
import { FRANQUIA_DE_ALIVIO, FRANQUIA_DO_TESTE, PLAN_MATRIX } from '../../src/core/planos';
import {
  CAMBIO_BRL_POR_USD,
  custoDaAmostraPorConta,
  custoDoPlanoNoPiorCaso,
  margemDoAnual,
  PIOR_CUSTO_BRL_POR_HORA_DE_NUVEM,
  TAXA_DO_ANUAL,
} from './modeloDeCusto';

const arg = (nome: string, padrao: number): number => {
  const i = process.argv.indexOf(`--${nome}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : padrao;
};

const usuarios = arg('usuarios', 1000);
const essencial = arg('essencial', 50);
const premium = arg('premium', 30);
const testes = arg('testes', 100);
const uso = arg('uso', 0.7); // fração do teto que o pagante realmente usa
const cambio = arg('cambio', 5.6);
// Planos v4 (assinantes; 0 = a base não os tem): o custo do pior caso sai de `modeloDeCusto.ts`.
const plus = arg('plus', 0);
const familia = arg('familia', 0);
const pro4 = arg('pro4', 0);
const gratis = Math.max(0, usuarios - essencial - premium - plus - familia - pro4);
const amostra = arg('amostra', 0.3); // fração dos grátis que usa a amostra de IA de estudo inteira (pior caso; hipótese)

const HORA = { conservador: 0.04 * 1.08 + 0.0149, esperado: 0.012 * 1.08 + 0.0149 }; // US$ por hora de legenda
const VOZ_USD_POR_CARACTERE = 1 / 1_000_000; // US$ 1,00 por 1M de caracteres
const horas = (segundos: number | null) => (segundos ?? 0) / 3600;
const TAXA_DO_CREDITO = 1.055; // hipótese: não verificada
const FOLGA = 1.2;

const ess = PLAN_MATRIX.essencial.quotas;
const pre = PLAN_MATRIX.premium.quotas;
const liquido = {
  essencial: (PLAN_MATRIX.essencial.precoMensalBrl! - 1.68) / cambio,
  premium: (PLAN_MATRIX.premium.precoMensalBrl! - 2.28) / cambio,
};

function custo(modo: 'conservador' | 'esperado', fracaoDeUso: number, fracaoDoAlivio: number, fracaoDaAmostra: number) {
  const h = HORA[modo];
  const alivio = gratis * 0.2 * FRANQUIA_DE_ALIVIO.tetoUsdMes * fracaoDoAlivio; // 20% dos grátis com aparelho fraco (hipótese)
  const iaDeEstudo = gratis * fracaoDaAmostra * custoDaAmostraPorConta(modo).usdMes;
  const g = alivio + iaDeEstudo;
  const e = essencial * horas(ess.sttSegundosMes) * fracaoDeUso * h;
  const p =
    premium *
    (horas(pre.sttSegundosMes) * fracaoDeUso * h + (pre.vozCaracteresMes ?? 0) * fracaoDeUso * VOZ_USD_POR_CARACTERE);
  /* Planos v4: no pior caso (fracaoDeUso 1) é o `custoDoPlanoNoPiorCaso`; no típico, a nuvem e a voz escalam
     com o uso e a hora vale a razão esperada/conservadora. */
  const escala = fracaoDeUso * (h / HORA.conservador);
  const v4 = (n: number, plano: 'plus' | 'familia' | 'pro4') =>
    (n * custoDoPlanoNoPiorCaso(plano).totalMensalBrl * escala) / cambio;
  const v = v4(plus, 'plus') + v4(familia, 'familia') + v4(pro4, 'pro4');
  const t =
    testes *
    (horas(FRANQUIA_DO_TESTE.sttSegundosMes) * 0.4 * h +
      FRANQUIA_DO_TESTE.vozCaracteresMes * 0.4 * VOZ_USD_POR_CARACTERE);
  return { g, iaDeEstudo, e, p, v, t, total: g + e + p + v + t };
}

// Receita líquida mensal dos v4 (mensalistas: preço mensal − a mesma taxa do modelo; hipótese). O anual tem a tabela abaixo.
const liquidoV4 = (p: 'plus' | 'familia' | 'pro4') => (PLAN_MATRIX[p].precoMensalBrl! * (1 - TAXA_DO_ANUAL)) / cambio;
const receitaV4 = plus * liquidoV4('plus') + familia * liquidoV4('familia') + pro4 * liquidoV4('pro4');
const teto = custo('conservador', 1, 1, amostra);
const tipico = custo('esperado', uso, 0.5, (amostra / 3) * 0.5);
const receita = essencial * liquido.essencial + premium * liquido.premium + receitaV4;
const f = (n: number) => `US$ ${n.toFixed(2).padStart(8)}`;

console.log(
  `Base: ${usuarios} usuários = ${gratis} grátis + ${essencial} Essencial + ${premium} Premium + ${plus} Plus + ${familia} Família + ${pro4} Pro (${(((essencial + premium + plus + familia + pro4) / usuarios) * 100).toFixed(1)}% pagantes), ${testes} testes no mês.`,
);
console.log(
  `Hora de legenda: conservador US$ ${HORA.conservador.toFixed(4)} | esperado US$ ${HORA.esperado.toFixed(4)} | uso típico do pagante ${uso * 100}% do teto\n`,
);
console.log(`                       grátis     Essencial   Premium     v4         testes     TOTAL`);
console.log(`pior caso (teto)   ${f(teto.g)} ${f(teto.e)} ${f(teto.p)} ${f(teto.v)} ${f(teto.t)} ${f(teto.total)}`);
console.log(
  `típico (esperado)  ${f(tipico.g)} ${f(tipico.e)} ${f(tipico.p)} ${f(tipico.v)} ${f(tipico.t)} ${f(tipico.total)}`,
);
console.log(
  `\nReceita líquida dos pagantes: ${f(receita)}   | margem no pior caso: ${f(receita - teto.total)}   | típica: ${f(receita - tipico.total)}`,
);
console.log(
  `Custo por usuário do mês: pior caso US$ ${(teto.total / usuarios).toFixed(3)} | típico US$ ${(tipico.total / usuarios).toFixed(3)}`,
);
const am = { pior: custoDaAmostraPorConta('conservador'), esperado: custoDaAmostraPorConta('esperado') };
console.log(
  `\nAMOSTRA DE IA DE ESTUDO do Grátis (já no "grátis" acima): ${am.pior.explicacoesMes} explicações + ${am.pior.resumosMes.toFixed(1)} resumos por conta/mês no teto = US$ ${am.pior.usdMes.toFixed(3)} (conservador) | US$ ${am.esperado.usdMes.toFixed(3)} (esperado) por conta que usa tudo. Na base: pior ${f(teto.iaDeEstudo)} (${(amostra * 100).toFixed(0)}% dos grátis no teto) | típico ${f(tipico.iaDeEstudo)}`,
);
console.log(
  `\nCRÉDITO a manter por 30 dias (pior caso + ${((TAXA_DO_CREDITO - 1) * 100).toFixed(1)}% de taxa [hipótese] + ${((FOLGA - 1) * 100).toFixed(0)}% de folga): ${f(teto.total * TAXA_DO_CREDITO * FOLGA)}`,
);
console.log(
  `AI_BUDGET_USD_MONTH sugerido: ${Math.ceil(teto.total * TAXA_DO_CREDITO * FOLGA)}   AI_BUDGET_USD_DAY sugerido (mensal ÷ 20): ${Math.ceil((teto.total * TAXA_DO_CREDITO * FOLGA) / 20)}`,
);

// PLANOS V4, o ANUAL (10 mensalidades pagas de uma vez, 12 meses de serviço), uma conta com a cota CHEIA no pior custo.
// Margem >= 0 é o critério de aceite da spec.
const r = (n: number) => `R$ ${n.toFixed(2).padStart(7)}`;
console.log(
  `\nMARGEM DO ANUAL POR PLANO (uma conta, cota cheia, pior custo: R$ ${PIOR_CUSTO_BRL_POR_HORA_DE_NUVEM.toFixed(2)}/h de nuvem, câmbio ${CAMBIO_BRL_POR_USD}, taxa do anual ${(TAXA_DO_ANUAL * 100).toFixed(0)}%)`,
);
console.log(`plano      anual    líq./mês  nuvem   IA texto  voz     extra   custo/mês  margem/mês  margem/ano`);
for (const plano of ['plus', 'familia', 'pro4'] as const) {
  const m = margemDoAnual(plano);
  console.log(
    `${PLAN_MATRIX[plano].rotulo.padEnd(9)} ${r(m.receitaBrutaAnualBrl)} ${r(m.receitaLiquidaMensalBrl)} ${r(m.nuvemBrl)} ${r(m.iaDeTextoBrl)} ${r(m.vozBrl)} ${r(m.extraBrl)} ${r(m.totalMensalBrl)} ${r(m.margemMensalBrl)} ${r(m.margemAnualBrl)}${m.margemAnualBrl < 0 ? '  <-- NEGATIVA' : ''}`,
  );
}
