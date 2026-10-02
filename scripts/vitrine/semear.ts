/**
 * SEMEADOR DA VITRINE (`npm run vitrine`): põe cada conta de `contas.json` no estado que o rótulo
 * dela promete, no banco PRÓPRIO da vitrine (`data/vitrine/vitrine.db`).
 *
 * Roda antes do servidor, com o mesmo ambiente, e escreve pelos repositórios que o app usa: o que a
 * tela mostra depois é o caminho real (assinatura → entitlements → tela), não um desenho à parte.
 * As assinaturas pagas são registradas também no Asaas falso, com os mesmos ids, para "Sua
 * assinatura", as faturas e o cancelamento terem a quem perguntar.
 *
 * SEMPRE VOLTA AO ESTADO DO RÓTULO: plano, teste e contadores são regravados a cada subida. Quem
 * cancelou a conta "Premium mensal" para ver o fluxo a encontra assinada de novo na próxima vez.
 * As sessões e o vocabulário só são criados quando a conta não tem nenhum.
 *
 * Recusa-se a rodar fora do banco da vitrine: o nome do arquivo é a trava.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import { PLAN_MATRIX } from '../../src/core/planos';
import { db, dbReady } from '../../server/db/db';
import { aplicarMigrations } from '../../server/db/manutencao';
import { idadesRepo } from '../../server/db/repositories/idades';
import { sessionsRepo } from '../../server/db/repositories/sessions';
import { settingsRepo } from '../../server/db/repositories/settings';
import { type SubscriptionPatch, subscriptionsRepo } from '../../server/db/repositories/subscriptions';
import { usageCountersRepo } from '../../server/db/repositories/usageCounters';
import { usersRepo } from '../../server/db/repositories/users';
import { vinculosRepo } from '../../server/db/repositories/vinculos';
import { vocabRepo } from '../../server/db/repositories/vocab';
import { subscriptions, testesPremium } from '../../server/db/schema';
import { asUserId, type UserId } from '../../server/lib/authContext';
import {
  currentWindow,
  janelaDoDia,
  METRIC_LLM_TOKENS,
  METRIC_LLM_TOKENS_DIA,
  METRIC_MANAGED,
  METRIC_STT_SEGUNDOS,
  METRIC_STT_SEGUNDOS_DIA,
} from '../../server/lib/usageQuota';

interface Conta {
  email: string;
  id: string;
  estado: string;
}

const DIA = 86_400_000;
const agora = Date.now();
const dia = (deslocamento: number) => new Date(agora + deslocamento * DIA).toISOString().slice(0, 10);

const banco = process.env.DATABASE_URL ?? '';
if (!/vitrine\.db$/.test(banco) || process.env.NODE_ENV === 'production') {
  console.error('[vitrine] o semeador só roda no banco da vitrine (DATABASE_URL terminando em vitrine.db).');
  process.exit(2);
}

const ASAAS = (process.env.ASAAS_BASE_URL ?? '').replace(/\/v3$/, '');
const premium = PLAN_MATRIX.premium;
const MENSAL = premium.precoMensalBrl ?? 0;
const ANUAL = premium.precoAnualBrl ?? 0;
const cotas = premium.quotas;

/** O que o Asaas falso precisa conhecer de uma conta paga. */
interface NoAsaas {
  assinatura?: { id: string; value: number; cycle: 'MONTHLY' | 'YEARLY'; nextDueDate: string; deleted?: boolean };
  pagamentos: Array<Record<string, unknown>>;
}

/** O estado de plano de cada rótulo: a linha de `subscriptions` e o espelho no Asaas falso. */
function planoDe(estado: string, id: string): { sub: SubscriptionPatch | null; asaas: NoAsaas | null } {
  const sufixo = id.slice(-4);
  const cliente = `cus_vitrine_${sufixo}`;
  const assinatura = `sub_vitrine_${sufixo}`;
  const paga = (
    ciclo: 'mensal' | 'anual',
    pagoHa: number,
    extra: Partial<SubscriptionPatch> = {},
    status = 'CONFIRMED',
  ): { sub: SubscriptionPatch; asaas: NoAsaas & { assinatura: NonNullable<NoAsaas['assinatura']> } } => {
    const periodo = ciclo === 'anual' ? 365 : 30;
    const valor = ciclo === 'anual' ? ANUAL : MENSAL;
    return {
      sub: {
        plan: 'premium',
        status: 'active',
        ciclo,
        meio: 'assinatura',
        provider: 'asaas',
        providerCustomerId: cliente,
        providerSubscriptionId: assinatura,
        providerInstallmentId: null,
        currentPeriodEnd: agora + (periodo - pagoHa + 5) * DIA,
        cancelAtPeriodEnd: 0,
        ...extra,
      },
      asaas: {
        assinatura: {
          id: assinatura,
          value: valor,
          cycle: ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
          nextDueDate: dia(periodo - pagoHa),
        },
        pagamentos: [
          {
            id: `pay_vitrine_${sufixo}`,
            customer: cliente,
            subscription: assinatura,
            value: valor,
            status,
            billingType: 'CREDIT_CARD',
            dueDate: dia(-pagoHa),
            confirmedDate: dia(-pagoHa),
            paymentDate: dia(-pagoHa),
            externalReference: id,
          },
        ],
      },
    };
  };

  switch (estado) {
    case 'mensal-recente':
      return paga('mensal', 2);
    case 'mensal':
    case 'teto-do-dia':
    case 'teto-do-mes':
      return paga('mensal', 10);
    case 'anual':
      return paga('anual', 60);
    case 'atrasado': {
      // Pagou o mês passado; a cobrança deste mês venceu há 2 dias e a tolerância acaba em 3.
      const r = paga('mensal', 32, { status: 'past_due', currentPeriodEnd: agora + 3 * DIA });
      r.asaas.pagamentos.push({
        id: `pay_vitrine_${sufixo}_2`,
        customer: cliente,
        subscription: assinatura,
        value: MENSAL,
        status: 'OVERDUE',
        billingType: 'CREDIT_CARD',
        dueDate: dia(-2),
        externalReference: id,
      });
      return r;
    }
    case 'cancelada': {
      const r = paga('mensal', 23, { status: 'canceled', currentPeriodEnd: agora + 12 * DIA, cancelAtPeriodEnd: 1 });
      r.asaas.assinatura.deleted = true;
      return r;
    }
    case 'parcelado': {
      const parcelamento = `ins_vitrine_${sufixo}`;
      const base = Math.floor((ANUAL * 100) / 12) / 100;
      const ultima = Math.round((ANUAL - base * 11) * 100) / 100;
      return {
        sub: {
          plan: 'premium',
          status: 'active',
          ciclo: 'anual',
          meio: 'parcelamento',
          provider: 'asaas',
          providerCustomerId: cliente,
          providerSubscriptionId: null,
          providerInstallmentId: parcelamento,
          currentPeriodEnd: agora + (365 - 40 + 5) * DIA,
          cancelAtPeriodEnd: 0,
        },
        asaas: {
          pagamentos: Array.from({ length: 12 }, (_, i) => ({
            id: `pay_vitrine_${sufixo}_${i + 1}`,
            customer: cliente,
            installment: parcelamento,
            installmentNumber: i + 1,
            value: i === 11 ? ultima : base,
            status: 'CONFIRMED',
            billingType: 'CREDIT_CARD',
            dueDate: dia(-40 + i * 30),
            confirmedDate: dia(-40),
            paymentDate: dia(-40),
            externalReference: id,
          })),
        },
      };
    }
    case 'admin':
      // Concedido pelo admin, sem cobrança: `meio` e `provider` nulos, como a rota admin grava.
      return {
        sub: {
          plan: 'premium',
          status: 'active',
          ciclo: 'mensal',
          meio: null,
          provider: null,
          providerCustomerId: null,
          providerSubscriptionId: null,
          providerInstallmentId: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: 0,
        },
        asaas: null,
      };
    default:
      return { sub: null, asaas: null };
  }
}

/** O teste de 14 dias de cada rótulo (início e fim), ou nada. */
function testeDe(estado: string): { iniciadoEm: number; terminaEm: number } | null {
  if (estado === 'teste') return { iniciadoEm: agora - 5 * DIA, terminaEm: agora + 9 * DIA };
  if (estado === 'teste-vencido') return { iniciadoEm: agora - 20 * DIA, terminaEm: agora - 6 * DIA };
  return null;
}

/** Quanto da nuvem a conta já usou: fração do teto do mês e do dia. */
function usoDe(estado: string): { mes: number; hoje: number } | null {
  if (estado === 'teto-do-dia') return { mes: 0.35, hoje: 1 };
  if (estado === 'teto-do-mes') return { mes: 1, hoje: 0.4 };
  if (estado === 'mensal' || estado === 'anual' || estado === 'parcelado') return { mes: 0.22, hoje: 0.15 };
  if (estado === 'teste') return { mes: 0.05, hoje: 0.3 };
  return null;
}

async function gravarUso(userId: UserId, estado: string): Promise<void> {
  const mes = currentWindow();
  const hoje = await janelaDoDia(userId);
  const metricas: Array<[string, string, number]> = [];
  const uso = usoDe(estado);
  const fracao = (teto: number | null, f: number) => Math.round((teto ?? 0) * f);
  metricas.push([METRIC_STT_SEGUNDOS, mes, uso ? fracao(cotas.sttSegundosMes, uso.mes) : 0]);
  metricas.push([METRIC_LLM_TOKENS, mes, uso ? fracao(cotas.tokensMes, uso.mes) : 0]);
  metricas.push([METRIC_MANAGED, mes, uso ? fracao(cotas.chamadasMes, uso.mes * 0.5) : 0]);
  metricas.push([METRIC_STT_SEGUNDOS_DIA, hoje, uso ? fracao(cotas.sttSegundosDia, uso.hoje) : 0]);
  metricas.push([METRIC_LLM_TOKENS_DIA, hoje, uso ? fracao(cotas.tokensDia, uso.hoje) : 0]);
  for (const [metrica, janela, valor] of metricas) {
    await usageCountersRepo.reset(userId, metrica, janela);
    if (valor > 0) await usageCountersRepo.increment(userId, metrica, janela, valor);
  }
}

const FALAS = [
  [
    'Sarah',
    'We must leverage our onboarding flow to improve retention.',
    'Precisamos aproveitar o nosso fluxo de entrada para melhorar a retenção.',
  ],
  ['Você', 'Agreed. The July cohort exceeded expectations.', 'Concordo. A turma de julho superou as expectativas.'],
  ['Sarah', 'Let us double down on what worked and drop the rest.', 'Vamos reforçar o que funcionou e largar o resto.'],
  ['Mark', 'I will draft the proposal by Friday.', 'Eu preparo a proposta até sexta-feira.'],
] as const;

const PALAVRAS = [
  ['leverage', 'aproveitar', 'We must leverage our onboarding flow.'],
  ['retention', 'retenção', 'It should improve retention.'],
  ['cohort', 'turma', 'The July cohort exceeded expectations.'],
  ['exceed', 'superar', 'It exceeded expectations.'],
  ['draft', 'rascunhar', 'I will draft the proposal by Friday.'],
  ['proposal', 'proposta', 'I will draft the proposal by Friday.'],
] as const;

/** Uma biblioteca pequena, para as telas de conta não abrirem vazias. Só se a conta não tem nada. */
async function semearConteudo(userId: UserId, comPalavras: boolean): Promise<void> {
  if ((await sessionsRepo.list(userId)).length > 0) return;
  const titulos = ['Reunião de alinhamento do trimestre', 'Podcast: hábitos de estudo', 'Entrevista sobre produto'];
  for (const [n, title] of titulos.entries()) {
    const sessao = await sessionsRepo.createWithUtterances(
      userId,
      { title, kind: 'audio', sourceLang: 'en', targetLang: 'pt', status: 'done', durationMs: (4 + n * 3) * 60_000 },
      FALAS.map(([speakerName, sourceText, translatedText], idx) => ({
        idx,
        source: speakerName === 'Você' ? 'mic' : 'tab',
        speakerName,
        sourceLang: 'en',
        sourceText,
        targetLang: 'pt',
        translatedText,
      })),
    );
    /* Palavras no caderno disparam as conquistas ("Primeira palavra") no primeiro acesso, e o
       diálogo de recompensa fica por cima do que a vitrine quer mostrar. Só duas contas as têm. */
    if (n === 0 && comPalavras) {
      await vocabRepo.bulkAdd(
        userId,
        PALAVRAS.map(([word, back, sentence]) => ({
          word,
          back,
          sentence,
          srcLang: 'en',
          tgtLang: 'pt',
          sessionId: sessao.id,
        })),
      );
    }
  }
}

async function registrarNoAsaas(corpo: unknown): Promise<void> {
  if (!ASAAS) return;
  const r = await fetch(`${ASAAS}/vitrine/registrar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`Asaas falso recusou o registro: HTTP ${r.status}`);
}

async function principal(): Promise<void> {
  const contas = JSON.parse(readFileSync(path.join(import.meta.dirname, 'contas.json'), 'utf8')) as Conta[];
  await dbReady;
  await aplicarMigrations();

  const noAsaas = {
    clientes: [] as unknown[],
    assinaturas: [] as unknown[],
    pagamentos: [] as unknown[],
    limpar: [] as string[],
  };

  for (const conta of contas) {
    const userId = asUserId(conta.id);
    noAsaas.limpar.push(conta.id);
    // A conta nova não ganha linha nenhuma: o primeiro acesso dela é o que a vitrine quer mostrar.
    if (conta.estado === 'nova') continue;

    await usersRepo.ensure(userId, conta.email);
    await usersRepo.setRole(userId, conta.estado === 'admin' ? 'admin' : 'user');
    await idadesRepo.declarar(userId, conta.estado === 'menor' ? dia(-14 * 365 - 100) : '1990-05-10');
    // A apresentação já foi vista: quem entra numa conta pronta quer a tela do rótulo, não o tour.
    const ajustes = await settingsRepo.ensure(userId);
    const ui = ajustes.ui ? (JSON.parse(ajustes.ui) as Record<string, unknown>) : {};
    if (!ui.onboarded) await settingsRepo.update(userId, { ui: { ...ui, onboarded: true } });

    const { sub, asaas } = planoDe(conta.estado, conta.id);
    if (sub) await subscriptionsRepo.upsert(userId, sub);
    else await db.delete(subscriptions).where(eq(subscriptions.userId, userId));
    if (asaas) {
      noAsaas.clientes.push({ id: `cus_vitrine_${conta.id.slice(-4)}`, externalReference: conta.id });
      if (asaas.assinatura) {
        noAsaas.assinaturas.push({
          ...asaas.assinatura,
          customer: `cus_vitrine_${conta.id.slice(-4)}`,
          status: asaas.assinatura.deleted ? 'INACTIVE' : 'ACTIVE',
          externalReference: conta.id,
        });
      }
      noAsaas.pagamentos.push(...asaas.pagamentos);
    }

    await db.delete(testesPremium).where(eq(testesPremium.userId, userId));
    const teste = testeDe(conta.estado);
    if (teste) await db.insert(testesPremium).values({ userId, ...teste });

    await gravarUso(userId, conta.estado);

    if (conta.estado === 'menor') {
      if (!(await vinculosRepo.pendenteDoMenor(userId)))
        await vinculosRepo.convidar(userId, 'responsavel@vitrine.test');
    } else {
      await semearConteudo(userId, conta.estado === 'gratis' || conta.estado === 'mensal');
    }
  }

  await registrarNoAsaas(noAsaas);
  console.log(`[vitrine] ${contas.length} contas prontas.`);
}

principal().then(
  () => process.exit(0),
  (err) => {
    console.error('[vitrine] o semeador falhou:', err);
    process.exit(1);
  },
);
