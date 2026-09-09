/**
 * SERVIDOR EM MEMÓRIA do modo anônimo.
 *
 * `apiFetch` chama isto em vez de `fetch` quando a identidade é `anonimo`. Cada rota devolve uma
 * `Response` com a MESMA forma que o servidor real devolve — então as ~40 funções de `data/api.ts`
 * e as telas que as consomem não sabem (nem precisam saber) que o banco é o navegador.
 *
 * Nada aqui toca a rede. Rota sem suporte responde 501 `EXIGE_CONTA` e dispara o evento
 * `babel_exige_conta`, que o App escuta para abrir o convite de conta — é o mesmo "mostra, explica,
 * não esconde" do gate de YouTube em `Library.tsx`.
 *
 * Regras do servidor que valem a pena imitar estão imitadas (contagem de palavras, dedup de cartão
 * por palavra+idioma, revisão FSRS-5 via `@core`, idempotência de `spendId`). As que dependem de
 * recursos do servidor (régua CEFR, wordlist, reconciliação) ficam para a migração — o servidor
 * reaplica tudo quando os dados sobem.
 *
 * ─── O QUE FICA AQUI, E POR QUÊ ───
 *
 * Os HANDLERS moram em `./rotas/<domínio>.ts`, com o MESMO recorte por domínio do cliente
 * (`src/data/rotas/`): este contrato tem dois lados, e enquanto cada lado era um arquivo de
 * ~1000 linhas não havia como comparar `sessoes` com `sessoes`. Agora há — arquivo a arquivo.
 *
 * Aqui ficam só as três coisas que são do ROTEADOR e não de um domínio: os helpers compartilhados
 * (`json`, `uuid`, leitura de corpo, coerção), a tabela `ROTAS` e o ponto de entrada. Eles ficam
 * exportados porque os módulos de rota os importam de volta — o mesmo desenho do funil do cliente,
 * onde `apiFetch` fica em `src/data/api.ts` e os módulos de rota o importam.
 */
import * as sessoes from './rotas/sessoes';
import * as vocabulario from './rotas/vocabulario';
import * as exercicios from './rotas/exercicios';
import * as metricas from './rotas/metricas';
import * as economia from './rotas/economia';
import * as settings from './rotas/settings';
import * as conta from './rotas/conta';

export const CODIGO_EXIGE_CONTA = 'EXIGE_CONTA';
export const EVENTO_EXIGE_CONTA = 'babel_exige_conta';
export const DIA = 86_400_000;

export type Json = Record<string, unknown>;
type Handler = (m: RegExpMatchArray, url: URL, init: RequestInit) => Promise<Response>;

export const json = (corpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

export const uuid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `ef-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Rotas que vão ao servidor REAL mesmo sem conta: capacidades do servidor LOCAL (captura WASAPI
 * do áudio do sistema), sem banco, sem custo e sem dado de usuário. O próprio servidor decide se
 * existem (no modo público responde 403) — o cliente só pergunta. É a única exceção ao "nada sai".
 */
const PASSAM_DIRETO: RegExp[] = [/^\/api\/audio\/loopback\//];

/**
 * Só AÇÕES da pessoa avisam o App para oferecer a conta. Sondas automáticas (disponibilidade de
 * STT, suporte a loopback, busca de capa, tradução ao vivo) recebem o 501 em silêncio — senão o
 * convite aparece a cada tela, sem ninguém ter pedido nada, e vira ruído.
 */
const ACOES_QUE_CONVIDAM: RegExp[] = [
  /^POST \/api\/import\//, /^POST \/api\/gemini\/chat$/, /^POST \/api\/ai\/credentials$/,
  /^POST \/api\/ai\/providers\/test$/, /^POST \/api\/vocab\/relabel$/, /^POST \/api\/sessions\/utterances\/relabel$/,
  /^(PATCH|DELETE) \/api\/me$/,
];

/** Resposta padronizada para o que não existe sem conta. Em ação da pessoa, avisa o App. */
export function naoDisponivelSemConta(rota: string): Response {
  if (typeof window !== 'undefined' && ACOES_QUE_CONVIDAM.some((r) => r.test(rota))) {
    window.dispatchEvent(new CustomEvent(EVENTO_EXIGE_CONTA, { detail: { rota } }));
  }
  /* `code` além de `codigo`: o envelope de erro do servidor real é `{ error, code?, detalhes? }`
     (change `contratos-alinhados-nas-tres-pontas`), e o cliente que lê `code` precisa achar o
     mesmo campo nas duas pontas. `codigo` fica porque já há tela lendo dele. */
  return json({ error: 'conta necessária', code: CODIGO_EXIGE_CONTA, codigo: CODIGO_EXIGE_CONTA, rota, detalhes: { rota } }, 501);
}

// ───────────────────────────── Helpers de corpo e coerção ─────────────────────────────

export function lerJson(init: RequestInit): Json {
  const b = init.body;
  if (typeof b !== 'string') return {};
  try { return JSON.parse(b) as Json; } catch { return {}; }
}

export async function lerBytes(init: RequestInit): Promise<ArrayBuffer | null> {
  const b = init.body as unknown;
  if (b instanceof ArrayBuffer) return b;
  if (ArrayBuffer.isView(b)) return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  if (typeof Blob !== 'undefined' && b instanceof Blob) return await b.arrayBuffer();
  if (typeof b === 'string') return new TextEncoder().encode(b).buffer as ArrayBuffer;
  return null;
}

export const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const opcional = <T,>(v: T | undefined, atual: T): T => (v === undefined ? atual : v);

export function contarPalavras(falas: Array<{ sourceText: string | null }>): number {
  return falas.reduce((n, f) => n + (f.sourceText ? f.sourceText.trim().split(/\s+/).filter(Boolean).length : 0), 0);
}

export function lerMeta(meta: string | null): Json {
  try { return meta ? (JSON.parse(meta) as Json) : {}; } catch { return {}; }
}

/* A chave de dedup continua alcançável POR AQUI: `tests/paridade-anonima.test.ts` a importa deste
   módulo para provar que ela é a MESMA do servidor real. O corpo (e o porquê) está em
   `./rotas/vocabulario.ts`, junto do único código que a usa. */
export { chaveDedup } from './rotas/vocabulario';

// ───────────────────────────── Tabela de rotas ─────────────────────────────

const ROTAS: Array<{ metodo: string; padrao: RegExp; handler: Handler }> = [
  { metodo: 'GET', padrao: /^\/api\/sessions$/, handler: sessoes.listarSessoes },
  { metodo: 'GET', padrao: /^\/api\/sessions\/utterances\/all$/, handler: sessoes.todasAsFalas },
  { metodo: 'POST', padrao: /^\/api\/sessions$/, handler: sessoes.criarSessao },
  { metodo: 'PATCH', padrao: /^\/api\/sessions\/utterances\/([^/]+)$/, handler: sessoes.atualizarFala },
  { metodo: 'GET', padrao: /^\/api\/sessions\/([^/]+)$/, handler: sessoes.obterSessao },
  { metodo: 'PATCH', padrao: /^\/api\/sessions\/([^/]+)$/, handler: sessoes.atualizarSessao },
  { metodo: 'DELETE', padrao: /^\/api\/sessions\/([^/]+)$/, handler: sessoes.apagarSessao },
  { metodo: 'PATCH', padrao: /^\/api\/sessions\/([^/]+)\/meta$/, handler: sessoes.atualizarMeta },
  { metodo: 'PUT', padrao: /^\/api\/sessions\/([^/]+)\/utterances$/, handler: sessoes.substituirFalas },
  { metodo: 'POST', padrao: /^\/api\/sessions\/([^/]+)\/audio$/, handler: sessoes.guardarAudio },
  { metodo: 'GET', padrao: /^\/api\/sessions\/([^/]+)\/audio$/, handler: sessoes.lerAudio },
  { metodo: 'GET', padrao: /^\/api\/vocab$/, handler: vocabulario.listarCartoes },
  { metodo: 'GET', padrao: /^\/api\/vocab\/pagina$/, handler: vocabulario.paginaDeCartoes },
  { metodo: 'GET', padrao: /^\/api\/vocab\/inicio-da-contagem$/, handler: vocabulario.inicioDaContagemLocal },
  { metodo: 'POST', padrao: /^\/api\/vocab\/bulk-add$/, handler: vocabulario.adicionarCartoes },
  { metodo: 'PATCH', padrao: /^\/api\/vocab\/([^/]+)$/, handler: vocabulario.editarCartao },
  { metodo: 'DELETE', padrao: /^\/api\/vocab\/([^/]+)$/, handler: vocabulario.apagarCartao },
  { metodo: 'POST', padrao: /^\/api\/vocab\/([^/]+)\/review$/, handler: vocabulario.revisarCartao },
  { metodo: 'GET', padrao: /^\/api\/metrics\/profile$/, handler: metricas.metricas },
  { metodo: 'GET', padrao: /^\/api\/metrics\/xp$/, handler: metricas.historicoDeXpLocal },
  { metodo: 'POST', padrao: /^\/api\/metrics\/seeds\/gastar$/, handler: economia.gastarSeeds },
  { metodo: 'POST', padrao: /^\/api\/metrics\/seeds\/creditar$/, handler: economia.creditarSeeds },
  { metodo: 'POST', padrao: /^\/api\/metrics\/presenca$/, handler: economia.registrarPresenca },
  { metodo: 'POST', padrao: /^\/api\/exercises\/rodada$/, handler: exercicios.gravarRodada },
  { metodo: 'GET', padrao: /^\/api\/exercises\/results$/, handler: exercicios.listarResultados },
  { metodo: 'GET', padrao: /^\/api\/exercises\/historico$/, handler: exercicios.historicoPorItem },
  { metodo: 'GET', padrao: /^\/api\/exercises\/recordes$/, handler: exercicios.recordes },
  { metodo: 'GET', padrao: /^\/api\/settings$/, handler: settings.obterSettings },
  { metodo: 'PUT', padrao: /^\/api\/settings$/, handler: settings.gravarSettings },
  { metodo: 'GET', padrao: /^\/api\/me\/entitlements$/, handler: conta.entitlementsAnonimos },
];

/** Ponto de entrada: mesmo contrato de `fetch(input, init)`, nunca sai do navegador. */
export async function servidorEfemero(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, 'http://efemero.local');
  const metodo = (init.method ?? 'GET').toUpperCase();
  if (PASSAM_DIRETO.some((r) => r.test(url.pathname))) return fetch(input, init);
  for (const rota of ROTAS) {
    if (rota.metodo !== metodo) continue;
    const m = url.pathname.match(rota.padrao);
    if (!m) continue;
    try {
      return await rota.handler(m, url, init);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }
  return naoDisponivelSemConta(`${metodo} ${url.pathname}`);
}
