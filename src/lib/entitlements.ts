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
import { apiFetch } from '../data/api';
import { authRequired } from './supabase';

export type Plan = 'free' | 'pro' | 'selfhost' | 'anonimo';

export interface Entitlements {
  plan: Plan;
  /** Importação de YouTube (yt-dlp roda no servidor — custo/infra de quem hospeda). */
  youtubeImport: boolean;
  /** STT de nuvem com a chave do DONO do serviço (Groq gerenciado). BYOK é sempre livre. */
  managedCloudStt: boolean;
  /** LLM/MT de nuvem com a chave do dono. */
  managedCloudLlm: boolean;
  /** Modelos locais maiores (whisper-base+) — mais download/latência, mais precisão. */
  largerModels: boolean;
  /** Disco usado/teto em bytes; `teto: null` = sem teto; `null` inteiro = desconhecido. */
  armazenamento: { usados: number; teto: number | null } | null;
}

const CACHE_KEY = 'babel.entitlements';
const CHANGED = 'babel_plan_changed';

const FECHADO: Entitlements = Object.freeze({
  plan: 'free', youtubeImport: false, managedCloudStt: false, managedCloudLlm: false, largerModels: false, armazenamento: null,
});
const SELFHOST: Entitlements = Object.freeze({
  plan: 'selfhost', youtubeImport: true, managedCloudStt: true, managedCloudLlm: true, largerModels: true, armazenamento: null,
});

const PLANOS: readonly string[] = ['free', 'pro', 'selfhost', 'anonimo'];

/** Aceita só o que tem a forma do servidor; qualquer coisa fora vira `null` (e o default conservador vale). */
function normalizar(v: unknown): Entitlements | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.plan !== 'string' || !PLANOS.includes(o.plan)) return null;
  const bool = (k: string) => o[k] === true;
  let armazenamento: Entitlements['armazenamento'] = null;
  if (o.armazenamento && typeof o.armazenamento === 'object') {
    const a = o.armazenamento as Record<string, unknown>;
    if (typeof a.usados === 'number') armazenamento = { usados: a.usados, teto: typeof a.teto === 'number' ? a.teto : null };
  }
  return {
    plan: o.plan as Plan,
    youtubeImport: bool('youtubeImport'),
    managedCloudStt: bool('managedCloudStt'),
    managedCloudLlm: bool('managedCloudLlm'),
    largerModels: bool('largerModels'),
    armazenamento,
  };
}

let cache: Entitlements | null = null;

function lerCacheDurável(): Entitlements | null {
  try {
    const bruto = localStorage.getItem(CACHE_KEY);
    return bruto ? normalizar(JSON.parse(bruto)) : null;
  } catch { return null; }
}

/** Síncrono: o último valor conhecido do servidor, ou o default do modo. */
export function getEntitlements(): Entitlements {
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
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(e)); } catch { /* espelho é best-effort */ }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED));
    return e;
  } catch {
    return getEntitlements();
  }
}

/** Esquece o cache (logout / troca de identidade) e avisa as telas. */
export function limparEntitlements(): void {
  cache = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* idem */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED));
}

export function onPlanChange(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/** Rótulos p/ UI. */
export const PLAN_LABELS: Record<Plan, string> = {
  anonimo: 'Sem conta',
  free: 'Grátis',
  pro: 'Pro',
  selfhost: 'Self-host (tudo liberado)',
};
