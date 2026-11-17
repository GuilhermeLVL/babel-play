/**
 * O REGISTRO DO SERVICE WORKER (change `modelos-confiaveis-e-offline`, DISP-02). O SW em si é gerado no build
 * (`scripts/vite/serviceWorker.ts` → `dist/sw.js`).
 *
 * QUANDO REGISTRA: só no build de produção do Worker (produção e staging: `VITE_AUTH_REQUIRED=1`), com o
 * interruptor ligado (`VITE_SERVICE_WORKER≠0`), e DEPOIS do LCP (`requestIdleCallback` depois do `load`): o
 * precache não disputa banda com a primeira tela. Dev, testes, self-host e a edição estática não registram.
 *
 * O ESCOPO É `/` (o `sw.js` mora na raiz) porque os workers da captura moram em `/assets/` e só são controlados
 * pelo SW cujo escopo cobre o endereço DELES. A base do app vai na URL (`/sw.js?base=/app`): o SW só responde às
 * navegações do app e deixa o site público passar direto.
 *
 * SAÍDAS DE EMERGÊNCIA: `?sw=desligar` na URL, ou o botão do Diagnóstico (`desligarServiceWorker`), desregistram
 * e apagam os caches do SW neste navegador; com o interruptor desligado no build, o app desregistra sozinho.
 */
import { baseDoAppAtual } from './baseDoApp';

/** O mesmo prefixo de `scripts/vite/serviceWorker.ts` (`PREFIXO_DO_CACHE`). */
const PREFIXO_DO_CACHE = 'frasy-sw-';

export type DecisaoDoSw = 'registrar' | 'desligar' | 'nada';

/** Puro: o que fazer com o SW neste build e nesta URL. */
export function decisaoDoSw(
  env: { PROD?: boolean; VITE_AUTH_REQUIRED?: unknown; VITE_SERVICE_WORKER?: unknown },
  busca: string,
): DecisaoDoSw {
  if (new URLSearchParams(busca).get('sw') === 'desligar') return 'desligar';
  if (String(env.VITE_SERVICE_WORKER ?? '').trim() === '0') return 'desligar';
  if (env.PROD !== true || String(env.VITE_AUTH_REQUIRED ?? '') !== '1') return 'nada';
  return 'registrar';
}

const temSw = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/** Desregistra o SW e apaga os caches dele (não toca no cache dos pesos). Devolve quantos registros saíram. */
export async function desligarServiceWorker(): Promise<number> {
  if (!temSw()) return 0;
  let saiu = 0;
  for (const r of await navigator.serviceWorker.getRegistrations()) if (await r.unregister()) saiu += 1;
  if (typeof caches !== 'undefined')
    for (const k of await caches.keys()) if (k.startsWith(PREFIXO_DO_CACHE)) await caches.delete(k);
  return saiu;
}

/** O SW controla esta página agora? (A "promessa offline" da captura depende disso, `sondaOffline.ts`.) */
export function swControlando(): boolean {
  return temSw() && !!navigator.serviceWorker.controller;
}

function quandoOcioso(f: () => void): void {
  const ocioso = () =>
    'requestIdleCallback' in window
      ? (
          window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => void }
        ).requestIdleCallback(f, { timeout: 10_000 })
      : setTimeout(f, 3000);
  if (document.readyState === 'complete') ocioso();
  else window.addEventListener('load', ocioso, { once: true });
}

/** Chamado uma vez no arranque (`main.tsx`). Nunca lança. */
export function registrarServiceWorker(env = import.meta.env): void {
  try {
    if (!temSw() || typeof window === 'undefined') return;
    const decisao = decisaoDoSw(env, window.location.search);
    if (decisao === 'nada') return;
    if (decisao === 'desligar') {
      void desligarServiceWorker().catch(() => 0);
      return;
    }
    quandoOcioso(() => {
      const base = baseDoAppAtual();
      void navigator.serviceWorker
        .register(`/sw.js?base=${encodeURIComponent(base || '/')}`, { scope: '/' })
        .catch((e) => console.warn('[sw] não registrou:', String(e)));
    });
  } catch {
    /* sem SW o app segue como antes */
  }
}
