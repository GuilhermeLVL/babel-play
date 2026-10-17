/**
 * SIMULA O CUSTO MENSAL DE NUVEM de uma base de usuários, com as COTAS REAIS da matriz de planos (`src/core/planos.ts`):
 * se alguém mudar uma cota, o número muda aqui sem editar nada.
 *
 *   npx tsx scripts/ia/simular-custo.ts --usuarios 1000 --essencial 50 --premium 30 --testes 100 [--uso 0.7] [--cambio 5.6]
 *
 * O preço por hora de legenda (transcrição + tradução) é o MEDIDO em 17/10/2026 pelo OpenRouter com retenção zero:
 * conservador US$ 0,058, esperado US$ 0,028 (docs/estrategia-comercial-e-custos-br.md §2). Os usuários grátis custam zero,
 * exceto a franquia de alívio (aparelho fraco) até `FRANQUIA_DE_ALIVIO.tetoUsdMes`. É estimativa: o uso real precisa ser medido.
 */
import { FRANQUIA_DE_ALIVIO, FRANQUIA_DO_TESTE, PLAN_MATRIX } from '../../src/core/planos';

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
const gratis = Math.max(0, usuarios - essencial - premium);

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

function custo(modo: 'conservador' | 'esperado', fracaoDeUso: number, fracaoDoAlivio: number) {
  const h = HORA[modo];
  const g = gratis * 0.2 * FRANQUIA_DE_ALIVIO.tetoUsdMes * fracaoDoAlivio; // 20% dos grátis com aparelho fraco (hipótese)
  const e = essencial * horas(ess.sttSegundosMes) * fracaoDeUso * h;
  const p =
    premium *
    (horas(pre.sttSegundosMes) * fracaoDeUso * h + (pre.vozCaracteresMes ?? 0) * fracaoDeUso * VOZ_USD_POR_CARACTERE);
  const t =
    testes *
    (horas(FRANQUIA_DO_TESTE.sttSegundosMes) * 0.4 * h +
      FRANQUIA_DO_TESTE.vozCaracteresMes * 0.4 * VOZ_USD_POR_CARACTERE);
  return { g, e, p, t, total: g + e + p + t };
}

const teto = custo('conservador', 1, 1);
const tipico = custo('esperado', uso, 0.5);
const receita = essencial * liquido.essencial + premium * liquido.premium;
const f = (n: number) => `US$ ${n.toFixed(2).padStart(8)}`;

console.log(
  `Base: ${usuarios} usuários = ${gratis} grátis + ${essencial} Essencial + ${premium} Premium (${(((essencial + premium) / usuarios) * 100).toFixed(1)}% pagantes), ${testes} testes no mês.`,
);
console.log(
  `Hora de legenda: conservador US$ ${HORA.conservador.toFixed(4)} | esperado US$ ${HORA.esperado.toFixed(4)} | uso típico do pagante ${uso * 100}% do teto\n`,
);
console.log(`                       grátis     Essencial   Premium     testes     TOTAL`);
console.log(`pior caso (teto)   ${f(teto.g)} ${f(teto.e)} ${f(teto.p)} ${f(teto.t)} ${f(teto.total)}`);
console.log(`típico (esperado)  ${f(tipico.g)} ${f(tipico.e)} ${f(tipico.p)} ${f(tipico.t)} ${f(tipico.total)}`);
console.log(
  `\nReceita líquida dos pagantes: ${f(receita)}   | margem no pior caso: ${f(receita - teto.total)}   | típica: ${f(receita - tipico.total)}`,
);
console.log(
  `Custo por usuário do mês: pior caso US$ ${(teto.total / usuarios).toFixed(3)} | típico US$ ${(tipico.total / usuarios).toFixed(3)}`,
);
console.log(
  `\nCRÉDITO a manter por 30 dias (pior caso + ${((TAXA_DO_CREDITO - 1) * 100).toFixed(1)}% de taxa [hipótese] + ${((FOLGA - 1) * 100).toFixed(0)}% de folga): ${f(teto.total * TAXA_DO_CREDITO * FOLGA)}`,
);
console.log(
  `AI_BUDGET_USD_MONTH sugerido: ${Math.ceil(teto.total * TAXA_DO_CREDITO * FOLGA)}   AI_BUDGET_USD_DAY sugerido (mensal ÷ 20): ${Math.ceil((teto.total * TAXA_DO_CREDITO * FOLGA) / 20)}`,
);
