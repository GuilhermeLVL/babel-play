/**
 * EMULAÇÃO DOS APARELHOS da auditoria de dispositivos (2026-09-26), no Chromium do Playwright.
 *
 * Usada pela e2e `perfis-de-dispositivo.e2e.ts` e por `scripts/perf/latencia-legenda/medir.mjs
 * --dispositivo`. O que se emula e o que NÃO se emula (limites honestos):
 *
 *  - quest    viewport 1280×720, UA do Meta Quest Browser em modo desktop (X11/Linux + OculusBrowser,
 *             browser-specs da Meta), sem `getDisplayMedia`, sem WebGPU (`navigator.gpu` ausente: em
 *             página 2D não é confirmado), `navigator.xr` presente, sem toque, 6 núcleos (XR2 Gen 2),
 *             `deviceMemory` 8, CPU 4× mais lenta (CDP `Emulation.setCPUThrottlingRate`).
 *  - pixel7   descritor `Pixel 7` do Playwright (UA Android, toque, 412×839), sem `getDisplayMedia`
 *             (o Chrome Android não tem), `deviceMemory` 8, CPU 2× mais lenta.
 *  - iphone14 descritor `iPhone 14` do Playwright MAS no Chromium (não há WebKit instalado aqui):
 *             sem `getDisplayMedia`, sem `deviceMemory`/`connection` (o Safari não expõe),
 *             `hardwareConcurrency` 4, sem WebGPU (iOS < 26) e `crossOriginIsolated` FORÇADO a false
 *             (o Safari não aceita COEP `credentialless`, BCD) — o motor JS/WASM continua sendo o V8.
 *
 * Nada disso substitui o aparelho: memória por aba, térmica, GPU e o comportamento real do WebKit ficam
 * para o roteiro `docs/testar-no-quest.md`.
 */
import { devices } from '@playwright/test';

const UA_QUEST =
  'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/40.0.0.0 SamsungBrowser/4.0 Chrome/150.0.0.0 VR Safari/537.36';

export const DISPOSITIVOS = {
  quest: {
    contexto: {
      viewport: { width: 1280, height: 720 },
      userAgent: UA_QUEST,
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
    },
    cpu: 4,
    sinais: {
      semTela: true,
      semGpu: true,
      xr: true,
      nucleos: 6,
      memoriaGb: 8,
      naoIsolado: false,
      semMemoriaDoAparelho: false,
    },
    esperado: { tipo: 'quest', alvo: 56 },
  },
  pixel7: {
    contexto: { ...devices['Pixel 7'] },
    cpu: 2,
    sinais: {
      semTela: true,
      semGpu: false,
      xr: true,
      nucleos: 8,
      memoriaGb: 8,
      naoIsolado: false,
      semMemoriaDoAparelho: false,
    },
    esperado: { tipo: /^celular/, alvo: 48 },
  },
  iphone14: {
    contexto: (() => {
      const { defaultBrowserType: _ignorado, ...resto } = devices['iPhone 14'];
      return resto;
    })(),
    cpu: 2,
    sinais: {
      semTela: true,
      semGpu: true,
      xr: false,
      nucleos: 4,
      memoriaGb: null,
      naoIsolado: true,
      semMemoriaDoAparelho: true,
    },
    esperado: { tipo: 'celular-fraco', alvo: 48 },
  },
};

/**
 * Script de inicialização (roda antes do app): tira/põe as APIs conforme o aparelho. Serializável —
 * vai por `addInitScript({ content })`.
 */
export function scriptDoAparelho(sinais) {
  return `(() => {
    const s = ${JSON.stringify(sinais)};
    const def = (obj, nome, valor) => { try { Object.defineProperty(obj, nome, { get: () => valor, configurable: true }); } catch {} };
    if (s.semTela && globalThis.MediaDevices) {
      try { delete MediaDevices.prototype.getDisplayMedia; } catch {}
      // Também na instância e SEM escrita: um script de sonda que rode depois não o recoloca.
      try { Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: undefined, writable: false, configurable: false }); } catch {}
    }
    if (s.semGpu) def(Navigator.prototype, 'gpu', undefined);
    if (s.xr) def(Navigator.prototype, 'xr', { isSessionSupported: async () => true });
    else def(Navigator.prototype, 'xr', undefined);
    def(Navigator.prototype, 'hardwareConcurrency', s.nucleos);
    if (s.semMemoriaDoAparelho) { def(Navigator.prototype, 'deviceMemory', undefined); def(Navigator.prototype, 'connection', undefined); }
    else if (s.memoriaGb) def(Navigator.prototype, 'deviceMemory', s.memoriaGb);
    if (s.naoIsolado) def(globalThis, 'crossOriginIsolated', false);
  })();`;
}

/** Aplica a lentidão de CPU pelo CDP (só Chromium). */
export async function aplicarCpu(page, taxa) {
  if (!taxa || taxa <= 1) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: taxa });
}
