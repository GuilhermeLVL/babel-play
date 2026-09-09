/**
 * O NÚCLEO do servidor em memória do modo anônimo — a FOLHA que todos os handlers importam.
 *
 * ─── POR QUE ISTO É UM ARQUIVO SEPARADO DE `servidor.ts` ───
 *
 * O CICLO, e é o mesmo desenho do funil do cliente (`src/data/funil.ts`). `servidor.ts` é o
 * roteador: ele importa `./rotas/<domínio>.ts` para montar a tabela `ROTAS`. Enquanto os helpers
 * compartilhados moravam lá, cada módulo de rota tinha de importá-los DE VOLTA de `servidor.ts` —
 * sete ciclos de importação (`servidor.ts → rotas/x.ts → servidor.ts`), e `npm run morto:ciclos`
 * (madge) é portão de CI. Um ciclo só se quebra tirando o alvo do importe-de-volta do módulo que
 * importa/reexporta. Por isso os helpers ficam numa FOLHA: `nucleo.ts` não importa nenhum
 * `rotas/*` e não importa `servidor.ts`; os handlers importam daqui, e `servidor.ts` reexporta
 * este módulo para que quem já importava de `efemero/servidor` (telas e testes) continue valendo.
 *
 * O que fica aqui é o que é do PROTOCOLO e não de um domínio: a `Response` JSON, o `uuid`, a
 * leitura de corpo, as coerções, a contagem de palavras, a lista do que passa direto para a rede
 * e a resposta padronizada de "isto exige conta".
 */

export const CODIGO_EXIGE_CONTA = 'EXIGE_CONTA';
export const EVENTO_EXIGE_CONTA = 'babel_exige_conta';
export const DIA = 86_400_000;

export type Json = Record<string, unknown>;

export const json = (corpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

export const uuid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `ef-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Rotas que vão ao servidor REAL mesmo sem conta: capacidades do servidor LOCAL (captura WASAPI
 * do áudio do sistema), sem banco, sem custo e sem dado de usuário. O próprio servidor decide se
 * existem (no modo público responde 403) — o cliente só pergunta. É a única exceção ao "nada sai".
 */
export const PASSAM_DIRETO: RegExp[] = [/^\/api\/audio\/loopback\//];

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
