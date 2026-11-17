/**
 * O SERVICE WORKER MÍNIMO DO APP (change `modelos-confiaveis-e-offline`, DISP-02; aprovado pelo dono em 17/11/2026).
 *
 * Sem service worker, "Iniciar" offline falhava com "Worker error" (o chunk do worker de STT não estava em cache
 * nenhum) e recarregar offline dava página em branco. Este SW faz SÓ isto:
 *
 *  - PRECACHE, na instalação: a casca do app (o HTML da base, a entrada e o CSS que o `index.html` carrega) e os
 *    chunks da captura (LiveCapture e os workers de STT, VAD, fim de fala e tradução), mais o VAD `.onnx`;
 *  - NAVEGAÇÃO do app: rede primeiro; sem resposta em 3 s (ou sem rede), o HTML guardado da base;
 *  - ESTÁTICOS do próprio domínio (`/assets/*` com hash, o runtime do ONNX, o VAD, as traduções da interface):
 *    cache primeiro, guardando o que passou pela rede — o que foi usado com internet volta sem ela;
 *  - NUNCA: `/api/*`, outras origens (os pesos do Hub/R2 ficam no cache da transformers.js, `cacheDePesos.ts`),
 *    pesos do mesmo domínio (`/models/`, `/modelos/`), nada que não seja GET. Sem `respondWith`, o navegador
 *    segue como se o SW não existisse.
 *
 * ATUALIZAÇÃO: o nome do cache leva a versão do build e o `activate` apaga as versões velhas. Sem `skipWaiting`: a
 * versão nova espera todas as abas do app fecharem, então NUNCA troca no meio de uma captura — entra na próxima
 * abertura. Só na PRIMEIRA instalação (nenhum cache velho) o SW assume a página aberta (`clients.claim`), para a
 * primeira captura já guardar o runtime do VAD.
 *
 * DESLIGAR: `VITE_SERVICE_WORKER=0` no build gera um `sw.js` que se desregistra e apaga os caches (o "rollback"
 * do design), e o app deixa de registrar. Na página, `?sw=desligar` ou o botão do Diagnóstico fazem o mesmo para
 * um navegador só (`src/lib/registrarSw.ts`).
 */
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { OutputBundle } from 'rollup';
import type { Plugin } from 'vite';

/** O prefixo dos caches deste SW: o `activate` só apaga os seus, e o "desligar" também. */
export const PREFIXO_DO_CACHE = 'frasy-sw-';

/** Os chunks da captura que vão no precache (pelo nome do arquivo, sem o hash). */
const DA_CAPTURA =
  /^assets\/(LiveCapture|whisperWorker|vadWorker|fimDeFalaWorker|mtWorker|bergamotWorker)-[^/]+\.(js|css)$/;

/** Estáticos do próprio app que nunca vão no precache: pesos e o que não é do app. */
const NUNCA = /(^|\/)(api|models|modelos)\/|\.(br|gz|map)$|^sw\.js$/;

/** Estáticos de fora de `assets/` que o precache leva (o VAD da captura). */
export const ESTATICOS_DA_CAPTURA = ['silero_vad_legacy.onnx', 'vad.worklet.bundle.min.js'];

interface ItemDoBundle {
  fileName: string;
  type: 'chunk' | 'asset';
  isEntry?: boolean;
  imports?: string[];
  viteMetadata?: { importedCss?: Set<string> };
}

/**
 * A LISTA DE PRECACHE a partir do bundle do Vite: as entradas (e o que elas importam estaticamente, com o CSS) e
 * os chunks da captura (com as dependências estáticas deles). Caminhos relativos à raiz do `dist`.
 */
export function listaDePrecache(itens: ItemDoBundle[], extras: string[] = ESTATICOS_DA_CAPTURA): string[] {
  const porNome = new Map(itens.map((i) => [i.fileName, i]));
  const fora = new Set<string>();
  const visitar = (nome: string) => {
    if (fora.has(nome) || NUNCA.test(nome)) return;
    fora.add(nome);
    const item = porNome.get(nome);
    for (const imp of item?.imports ?? []) visitar(imp);
    for (const css of item?.viteMetadata?.importedCss ?? []) visitar(css);
  };
  for (const i of itens) if ((i.type === 'chunk' && i.isEntry) || DA_CAPTURA.test(i.fileName)) visitar(i.fileName);
  for (const e of extras) if (!NUNCA.test(e)) fora.add(e);
  return [...fora].sort();
}

export interface OpcoesDoSw {
  /** A versão do build (o nome do cache). */
  versao: string;
  /** Caminhos relativos à raiz do `dist` (`assets/index-abc.js`). */
  precache: string[];
  /** `false` gera o SW que se desregistra (o interruptor). */
  ligado: boolean;
}

/** O código do SW que se desfaz: desregistra, apaga os caches dele e recarrega as abas que controlava. */
function swDeDesligar(): string {
  return `/* Frasy: service worker DESLIGADO (VITE_SERVICE_WORKER=0). Desregistra e apaga os caches. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(${JSON.stringify(PREFIXO_DO_CACHE)})) await caches.delete(k);
    await self.registration.unregister();
  })());
});
`;
}

/** O código do `sw.js`. A base do app vem da URL de registro (`/sw.js?base=/app`): `/app` no Worker, `/` no resto. */
export function gerarServiceWorker(o: OpcoesDoSw): string {
  if (!o.ligado) return swDeDesligar();
  return `/* Frasy: service worker mínimo (scripts/vite/serviceWorker.ts). Gerado no build; não edite. */
const VERSAO = ${JSON.stringify(o.versao)};
const CACHE = ${JSON.stringify(PREFIXO_DO_CACHE)} + VERSAO;
const BASE = (new URL(self.location.href).searchParams.get('base') || '/').replace(/\\/+$/, '') || '';
const PRECACHE = ${JSON.stringify(o.precache.map((p) => `/${p}`))};
const RUNTIME = /^\\/(assets\\/|ort-wasm-simd-threaded\\.(jsep\\.)?(wasm|mjs)$|silero_vad_|vad\\.worklet|loopback-worklet\\.js$|i18n\\/|smart-turn\\/|favicon\\.svg$)/;
const ESPERA_DA_REDE_MS = 3000;

const urlDaBase = () => BASE || '/';
const ehDoApp = (p) => (BASE ? p === BASE || p.startsWith(BASE + '/') : true);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll([urlDaBase(), ...PRECACHE]);
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const velhos = (await caches.keys()).filter((k) => k.startsWith(${JSON.stringify(PREFIXO_DO_CACHE)}) && k !== CACHE);
    for (const k of velhos) await caches.delete(k);
    // Primeira instalação: assume a página aberta (a primeira captura já guarda o runtime do VAD).
    if (!velhos.length) await self.clients.claim();
  })());
});

async function navegar(req) {
  const c = await caches.open(CACHE);
  try {
    const rede = fetch(req);
    const r = await Promise.race([
      rede,
      new Promise((_, nao) => setTimeout(() => nao(new Error('rede lenta')), ESPERA_DA_REDE_MS)),
    ]);
    if (r && r.ok && r.type === 'basic') c.put(urlDaBase(), r.clone()).catch(() => {});
    return r;
  } catch (erro) {
    const guardado = await c.match(urlDaBase());
    if (guardado) return guardado;
    throw erro;
  }
}

async function estatico(req) {
  const c = await caches.open(CACHE);
  const guardado = await c.match(req, { ignoreSearch: true });
  if (guardado) return guardado;
  const r = await fetch(req);
  if (r.ok && r.type === 'basic' && r.status === 200) c.put(req, r.clone()).catch(() => {});
  return r;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/models/') || p.startsWith('/modelos/')) return;
  if (req.mode === 'navigate') {
    if (ehDoApp(p)) e.respondWith(navegar(req));
    return;
  }
  if (RUNTIME.test(p) || PRECACHE.includes(p)) e.respondWith(estatico(req));
});
`;
}

/** Os itens do bundle no formato que `listaDePrecache` lê. */
function itensDo(bundle: OutputBundle): ItemDoBundle[] {
  return Object.values(bundle).map((b) => {
    const chunk = b.type === 'chunk' ? b : null;
    return {
      fileName: b.fileName,
      type: b.type,
      isEntry: chunk?.isEntry,
      imports: chunk?.imports,
      viteMetadata: (chunk as { viteMetadata?: { importedCss?: Set<string> } } | null)?.viteMetadata,
    };
  });
}

/**
 * O plugin: grava `dist/sw.js` DEPOIS de o bundle ir para o disco (`writeBundle`). Antes disso a lista ainda tem
 * chunks que o Vite descarta (o JS vazio de um chunk só de CSS): um 404 no precache derruba a instalação inteira
 * (`cache.addAll`), então só entra o que existe no `dist`. A versão leva um hash da lista: build novo, cache novo.
 */
export function serviceWorkerDoBuild(opcoes: { versao: string; ligado: boolean }): Plugin {
  return {
    name: 'service-worker-do-app',
    apply: 'build',
    writeBundle(saida, bundle) {
      if (!Object.values(bundle).some((b) => b.type === 'chunk' && b.isEntry)) return;
      const dir = saida.dir ?? 'dist';
      const precache = listaDePrecache(itensDo(bundle)).filter((p) => existsSync(path.join(dir, p)));
      const hash = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 10);
      const versao = `${opcoes.versao}-${hash}`;
      writeFileSync(path.join(dir, 'sw.js'), gerarServiceWorker({ versao, precache, ligado: opcoes.ligado }));
    },
  };
}
