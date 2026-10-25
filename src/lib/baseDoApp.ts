/**
 * O APP MORA EM `/app` (site público, 25/10/2026 — `docs/specs/2026-10-25-site-publico-seo-e-anuncios.md`).
 *
 * No Worker, a raiz é o site público estático (`/`, `/planos`, `/guias`…) e o app é servido em `/app` e
 * `/app/*`. Em desenvolvimento (Vite), nos testes, no self-host (Node) e na edição estática o app continua
 * na raiz. Por isso a base é DESCOBERTA pela URL em que o app abriu, e não fixa: o roteador
 * (`lib/rotas`) fala sempre em caminhos internos (`/jogar`, `/plano/assinado`) e só a barra de endereço
 * leva a base.
 *
 *   · `semBaseDoApp('/app/jogar')` → `/jogar` (leitura: tudo o que vem da barra passa por aqui);
 *   · `comBaseDoApp('/jogar')` → `/app/jogar` quando o app está sob `/app`, `/jogar` na raiz.
 *
 * O CALLBACK DO LOGIN (`/auth/callback`) fica fora de `/app` (é o endereço cadastrado no Supabase). No
 * build de produção o app que abriu ali vai para `/app` ao limpar a URL; em desenvolvimento e nos testes,
 * para a raiz, como sempre.
 */
export const BASE_DO_APP = '/app';

const SOB_A_BASE = /^\/app(?=\/|$|\?|#)/i;

/** O caminho interno (sem a base `/app`). Puro. `/app` → `/`; `/jogar` (sem base) → `/jogar`. */
export function semBaseDoApp(caminho: string): string {
  const bruto = String(caminho || '/');
  if (!SOB_A_BASE.test(bruto)) return bruto;
  const resto = bruto.replace(SOB_A_BASE, '');
  return resto.startsWith('/') ? resto : `/${resto}`;
}

/** A base em uso agora: `/app` se a barra está sob ela (ou no callback do login, no build de produção). */
export function baseDoAppAtual(): '' | typeof BASE_DO_APP {
  if (typeof window === 'undefined') return '';
  const caminho = window.location.pathname;
  if (SOB_A_BASE.test(caminho)) return BASE_DO_APP;
  if (import.meta.env.PROD && caminho === '/auth/callback') return BASE_DO_APP;
  return '';
}

/** O endereço da barra para um caminho interno: a base atual + o caminho (`/` sob a base vira `/app`). */
export function comBaseDoApp(alvo: string): string {
  const base = baseDoAppAtual();
  if (!base) return alvo;
  if (alvo === '/' || alvo === '') return base;
  if (alvo.startsWith('?') || alvo.startsWith('#')) return `${base}${alvo}`;
  return `${base}${alvo.startsWith('/') ? '' : '/'}${alvo}`;
}

/** O caminho interno da barra agora (sem a base). */
export function caminhoInternoAtual(): string {
  return typeof window === 'undefined' ? '/' : semBaseDoApp(window.location.pathname);
}
