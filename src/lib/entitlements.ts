/**
 * PLANOS / ENTITLEMENTS — o cliente NÃO decide, só pinta.
 *
 * A autoridade é `GET /api/me/entitlements` (server/lib/entitlements.ts deriva de `subscriptions`).
 * Este módulo é um CACHE dessa resposta: `getEntitlements()` é síncrono para as telas não
 * piscarem, e `carregarEntitlements()` atualiza o cache e avisa quem está aberto.
 *
 * Antes o plano vivia em `localStorage['babel.plan']` com default `selfhost`, e havia um seletor
 * em Ajustes — o cliente se auto-promovia. O servidor já ignorava isso (escalada A01), então a UI
 * mentia: mostrava "liberado" e a rota respondia 402. Agora o que a tela mostra é o que o servidor
 * vai aplicar.
 *
 * Default SEM cache: conservador (tudo fechado) no modo público; tudo aberto no self-host, porque
 * aí o servidor responde `selfhost` de qualquer forma e esperar a rede só atrasaria a primeira tela.
 *
 * Regra de honestidade (inalterada): gate NUNCA esconde a feature — mostra com selo e explica.
 */
import {
  ENTITLEMENTS_FECHADOS,
  type EntitlementsDoPlano,
  lerEntitlements,
  normalizarPlano,
  PLAN_MATRIX,
  type PlanoDeAssinatura,
  PLANOS_DE_ASSINATURA,
} from '../core/planos';
import { apiFetch } from '../data/api';
import { edicaoEstatica } from './edicaoEstatica';
import { authRequired } from './supabase';

/** Plano de assinatura (da MATRIZ) + `anonimo`, que é identidade do cliente sem conta — o
 *  servidor nunca o atribui, por isso ele fica fora da matriz. */
export type Plan = PlanoDeAssinatura | 'anonimo';

/**
 * As CAPACIDADES são as da matriz (`EntitlementsDoPlano`, em `src/core/planos.ts`), herdadas e não
 * copiadas: até a change `planos-v3` cada campo era repetido aqui, nos três padrões abaixo, no
 * `normalizar` e no espelho sem conta — e um campo novo no servidor só chegava à tela depois de cinco
 * edições à mão. A tela só PINTA (com cadeado sem a capacidade); quem decide é o servidor, pelo mesmo
 * campo — nunca pelo nome do plano.
 */
export interface Entitlements extends EntitlementsDoPlano {
  plan: Plan;
  /** Disco usado/teto em bytes; `teto: null` = sem teto; `null` inteiro = desconhecido. */
  armazenamento: { usados: number; teto: number | null } | null;
  /**
   * O TESTE de 14 dias do Premium (C6): presente só enquanto ele vale — o Premium de `plan` é o do
   * teste, e ele termina em `terminaEm` (ms) sem cobrar nada. Ausente/`null` = Premium pago, ou não é
   * Premium. É o que o aviso `fim_do_teste` (D-3 e D0) lê.
   */
  teste?: { terminaEm: number } | null;
  /**
   * Quando a CONTA foi criada (ms), como o servidor a gravou. `null`/ausente = sem conta, ou um servidor
   * anterior que não manda o campo. É o que a política de anúncios lê para a regra dos três dias
   * (`src/core/anuncios/politicaDeAnuncio.ts`): sem data, ela nega.
   */
  contaCriadaEm?: number | null;
}

const CACHE_KEY = 'babel.entitlements';
const CHANGED = 'babel_plan_changed';

/* Os dois padrões sem cache são PLANOS DA MATRIZ, com as capacidades que ela declara. */
const FECHADO: Entitlements = Object.freeze({ plan: 'free', ...PLAN_MATRIX.free.entitlements, armazenamento: null });
const SELFHOST: Entitlements = Object.freeze({
  plan: 'selfhost',
  ...PLAN_MATRIX.selfhost.entitlements,
  armazenamento: null,
});

/**
 * EDIÇÃO ESTÁTICA (site sem servidor): o que o servidor em memória responde para quem não tem conta
 * (`data/efemero/rotas/conta.ts`), fixo desde o primeiro paint. Sem isto ela herdaria o SELFHOST
 * (build sem login = dono do servidor, tudo liberado) e prometeria nuvem e YouTube que não existem.
 */
const EDICAO_ESTATICA: Entitlements = Object.freeze({
  plan: 'anonimo',
  ...ENTITLEMENTS_FECHADOS,
  armazenamento: { usados: 0, teto: 0 },
});

/** O plano da resposta: `anonimo` passa; o nome antigo (`pro` de um servidor anterior ou
 *  do cache de antes da matriz v2) é o Premium; o resto é `null`. */
const planoDaResposta = (v: string): Plan | null => (v === 'anonimo' ? 'anonimo' : normalizarPlano(v));

/**
 * Aceita só o que tem a forma do servidor; forma inválida vira `null` (e o default conservador vale).
 *
 * PLANO DESCONHECIDO NÃO DESCARTA MAIS A RESPOSTA. A versão anterior devolvia `null` se `plan` não
 * estivesse na lista local — ou seja, um cliente antigo diante de um plano novo do servidor jogava
 * fora as FLAGS verdadeiras que vieram junto e fechava tudo. Agora o plano vira `free` (só o
 * rótulo degrada) e as flags do servidor valem — a UI mostra o que o servidor de fato concedeu.
 *
 * O NOME ANTIGO É O PREMIUM (matriz v2): um servidor anterior durante o deploy, ou o cache do
 * navegador de antes da troca, diz `pro` — e a tela mostra o Premium, não o Grátis.
 * Entitlement que não veio (servidor anterior não conhece `traducaoNuance`) fica FECHADO.
 */
function normalizar(v: unknown): Entitlements | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.plan !== 'string') return null;
  const plan: Plan = planoDaResposta(o.plan) ?? 'free';
  let armazenamento: Entitlements['armazenamento'] = null;
  if (o.armazenamento && typeof o.armazenamento === 'object') {
    const a = o.armazenamento as Record<string, unknown>;
    if (typeof a.usados === 'number')
      armazenamento = { usados: a.usados, teto: typeof a.teto === 'number' ? a.teto : null };
  }
  const t = o.teste as { terminaEm?: unknown } | null | undefined;
  const teste = t && typeof t === 'object' && typeof t.terminaEm === 'number' ? { terminaEm: t.terminaEm } : null;
  /* As capacidades são lidas pela forma da MATRIZ (`lerEntitlements`): nenhum campo é listado aqui. */
  return {
    plan,
    ...lerEntitlements(o),
    armazenamento,
    teste,
    contaCriadaEm: typeof o.contaCriadaEm === 'number' && Number.isFinite(o.contaCriadaEm) ? o.contaCriadaEm : null,
  };
}

let cache: Entitlements | null = null;

function lerCacheDurável(): Entitlements | null {
  try {
    const bruto = localStorage.getItem(CACHE_KEY);
    return bruto ? normalizar(JSON.parse(bruto)) : null;
  } catch {
    return null;
  }
}

/** Síncrono: o último valor conhecido do servidor, ou o default do modo. */
export function getEntitlements(): Entitlements {
  if (edicaoEstatica()) return EDICAO_ESTATICA;
  if (!authRequired) return SELFHOST;
  cache ??= lerCacheDurável();
  return cache ?? FECHADO;
}

/**
 * Pergunta ao servidor e atualiza o cache. Falha de rede ou resposta fora da forma NÃO rebaixa
 * nem promove: mantém o último valor conhecido (e devolve-o). Quem chama não precisa tratar erro.
 */
export async function carregarEntitlements(): Promise<Entitlements> {
  try {
    const res = await apiFetch('/api/me/entitlements');
    if (!res.ok) return getEntitlements();
    const e = normalizar(await res.json());
    if (!e) return getEntitlements();
    cache = e;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(e));
    } catch {
      /* espelho é best-effort */
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED));
    return e;
  } catch {
    return getEntitlements();
  }
}

/** Esquece o cache (logout / troca de identidade) e avisa as telas. */
export function limparEntitlements(): void {
  cache = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* idem */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED));
}

export function onPlanChange(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/** Rótulos p/ UI — os de assinatura vêm da matriz; `anonimo` é o único local. */
export const PLAN_LABELS: Record<Plan, string> = {
  anonimo: 'Sem conta',
  ...(Object.fromEntries(PLANOS_DE_ASSINATURA.map((p) => [p, PLAN_MATRIX[p].rotulo])) as Record<
    PlanoDeAssinatura,
    string
  >),
};
