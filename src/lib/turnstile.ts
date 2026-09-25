/**
 * CLOUDFLARE TURNSTILE — o captcha do convidado com nuvem (Fase 7).
 *
 * O Supabase recomenda captcha para o `signInAnonymously` (sem ele, qualquer script cria usuários
 * anônimos em laço e enche o banco de autenticação). O token vai em `options.captchaToken`, e o
 * Supabase o confere com a chave SECRETA configurada no painel dele — o nosso servidor não entra.
 *
 * SÓ EXISTE COM A CHAVE: sem `VITE_TURNSTILE_SITE_KEY` no build, este módulo devolve `null` e o
 * script do Cloudflare NUNCA é carregado (a CSP também só libera o host com a chave —
 * `server/http/csp.ts`). É pendência do dono criar o site no Cloudflare e ligar o captcha no Supabase.
 *
 * O widget é o "gerenciado": `appearance: 'interaction-only'` — invisível para quase todo mundo, e só
 * aparece (no canto da tela) quando o Cloudflare precisa de uma interação.
 */
const env: Record<string, string | undefined> =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const SCRIPT_DO_TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TEMPO_MAXIMO_MS = 30_000;

interface ApiDoTurnstile {
  render: (alvo: HTMLElement, opcoes: Record<string, unknown>) => string | undefined;
  remove: (id: string) => void;
}

export function chaveDoTurnstile(): string | null {
  return env.VITE_TURNSTILE_SITE_KEY?.trim() || null;
}

let carga: Promise<ApiDoTurnstile | null> | null = null;

function carregarScript(): Promise<ApiDoTurnstile | null> {
  carga ??= new Promise((resolve) => {
    const w = window as unknown as { turnstile?: ApiDoTurnstile };
    if (w.turnstile) {
      resolve(w.turnstile);
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_DO_TURNSTILE;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(w.turnstile ?? null);
    s.onerror = () => {
      carga = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return carga;
}

/** Um token do Turnstile, ou `null` (sem chave, script bloqueado, desafio recusado ou tempo esgotado). */
export async function obterTokenDoTurnstile(): Promise<string | null> {
  const sitekey = chaveDoTurnstile();
  if (!sitekey || typeof document === 'undefined') return null;
  const api = await carregarScript();
  if (!api) return null;
  const alvo = document.createElement('div');
  alvo.setAttribute('data-turnstile-convidado', '');
  alvo.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483000';
  document.body.appendChild(alvo);
  let id: string | undefined;
  try {
    return await new Promise<string | null>((resolve) => {
      const relogio = window.setTimeout(() => resolve(null), TEMPO_MAXIMO_MS);
      const fim = (v: string | null) => {
        window.clearTimeout(relogio);
        resolve(v);
      };
      id = api.render(alvo, {
        sitekey,
        appearance: 'interaction-only',
        callback: (token: string) => fim(token),
        'error-callback': () => fim(null),
        'expired-callback': () => fim(null),
      });
    });
  } finally {
    if (id) api.remove(id);
    alvo.remove();
  }
}
