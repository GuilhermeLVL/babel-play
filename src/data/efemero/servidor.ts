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
 */
import { abrirStore, type CartaoLocal, type ExercicioLocal, type FalaLocal, type SessaoLocal } from './store';
import { Fsrs5Strategy, type Grade, type SchedulingState } from '../../core/learning/scheduler';
import type { AppMetrics } from '../../core/learning/contract';
import { diaLocal, marcosDeSequencia, minutosPremiados, sequencias } from '../../core/learning/economia';
import { economiaDeMetricas } from '../../core/learning/xp';
import { historicoDeXp } from '../../core/learning/historicoDeXp';
import {
  valorDoCredito, autorizarGasto, ehRecusa,
  roundIdDoDrop, itensSorteaveisNoDrop, sortearItemDoDrop, valorDoDrop,
} from '../../core/economiaAutoridade';
import { MINIGAMES } from '../../core/minigames/types';
import { estadoDoTeto, motivoDoTeto } from '../../core/tetoAnonimo';

export const CODIGO_EXIGE_CONTA = 'EXIGE_CONTA';
export const EVENTO_EXIGE_CONTA = 'babel_exige_conta';
const CHAVE_SETTINGS = 'babel.efemero.settings';
const DIA = 86_400_000;

type Json = Record<string, unknown>;
type Handler = (m: RegExpMatchArray, url: URL, init: RequestInit) => Promise<Response>;

const json = (corpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

const uuid = (): string =>
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

function lerJson(init: RequestInit): Json {
  const b = init.body;
  if (typeof b !== 'string') return {};
  try { return JSON.parse(b) as Json; } catch { return {}; }
}

async function lerBytes(init: RequestInit): Promise<ArrayBuffer | null> {
  const b = init.body as unknown;
  if (b instanceof ArrayBuffer) return b;
  if (ArrayBuffer.isView(b)) return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  if (typeof Blob !== 'undefined' && b instanceof Blob) return await b.arrayBuffer();
  if (typeof b === 'string') return new TextEncoder().encode(b).buffer as ArrayBuffer;
  return null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const opcional = <T,>(v: T | undefined, atual: T): T => (v === undefined ? atual : v);

function contarPalavras(falas: Array<{ sourceText: string | null }>): number {
  return falas.reduce((n, f) => n + (f.sourceText ? f.sourceText.trim().split(/\s+/).filter(Boolean).length : 0), 0);
}

/**
 * A MESMA CHAVE DO SERVIDOR — agora de verdade (auditoria de 2026-09-07, achado A24).
 *
 * O comentário aqui dizia "mesma chave do servidor" e a implementação diferia em TRÊS pontos: a
 * ordem dos campos era invertida (`palavra|lang` contra `lang|palavra`), a pontuação não era
 * removida, e o idioma entrava como locale inteiro em vez da base. "Água!" em `pt-BR` era uma
 * carta aqui e outra lá — e a conta só era feita na MIGRAÇÃO, onde o estrago aparece: quem estudou
 * sem conta e depois criou uma via o acervo duplicar palavras que já tinha.
 *
 * Comentário que afirma paridade sem teste que a prove envelhece para mentira. A implementação
 * agora é uma só (`core/texto/palavra.ts`) e `tests/paridade-anonima.test.ts` a trava.
 */
import { chaveDedup } from '@core/texto/palavra';
export { chaveDedup };

/**
 * A chave que ESTA VERSÃO gravava, para reconhecer cartas antigas uma última vez.
 *
 * Some quando não houver mais base anônima anterior a 2026-09-07 — e some sozinha: cada carta
 * encontrada por aqui é regravada com a chave nova no mesmo fluxo que a encontrou.
 */
function chaveDedupLegada(word: string, srcLang: string | null | undefined): string {
  const w = (word ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return `${w}|${(srcLang ?? '').toLowerCase()}`;
}

async function acharPelaChaveAntiga(
  // O nome do índice é literal ('porNormKey'), não `string`: o `IDBPObjectStore` do `idb` tipa
  // `index()` pelos índices declarados no schema, e um parâmetro `string` não casa com isso.
  store: { index: (nome: 'porNormKey') => { get: (k: string) => Promise<CartaoLocal | undefined> } },
  word: string,
  srcLang: string | null | undefined,
): Promise<CartaoLocal | undefined> {
  const legada = chaveDedupLegada(word, srcLang);
  return legada ? store.index('porNormKey').get(legada) : undefined;
}

function lerMeta(meta: string | null): Json {
  try { return meta ? (JSON.parse(meta) as Json) : {}; } catch { return {}; }
}

function falaDePayload(sessionId: string, u: Json, i: number): FalaLocal {
  return {
    id: uuid(), sessionId,
    idx: num(u.idx) ?? i,
    speakerName: str(u.speakerName), source: str(u.source), sourceLang: str(u.sourceLang),
    sourceText: str(u.sourceText), targetLang: str(u.targetLang), translatedText: str(u.translatedText),
    tStartMs: num(u.tStartMs), tEndMs: num(u.tEndMs), engine: str(u.engine), confidence: num(u.confidence),
  };
}

// ───────────────────────────── Sessões ─────────────────────────────

async function listarSessoes(): Promise<Response> {
  const db = await abrirStore();
  const todas = await db.getAllFromIndex('sessoes', 'porCriacao');
  return json(todas.reverse());
}

async function criarSessao(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const db = await abrirStore();

  /* O TETO DO MODO SEM CONTA (mudança porta-de-entrada). Sem conta o acervo mora num só navegador
     e some com ele; deixar acumular é deixar preparada uma perda grande. O 507 é o mesmo código
     que a cota de armazenamento do servidor real usa — a tela já sabe tratá-lo. */
  const jaGuardadas = await db.count('sessoes');
  const teto = estadoDoTeto('sessoes', jaGuardadas);
  if (!teto.cabe) {
    return json({ error: motivoDoTeto('sessoes'), codigo: 'TETO_ANONIMO', recurso: 'sessoes', ...teto }, 507);
  }

  /**
   * IDEMPOTÊNCIA PELO `origemLocalId`, como no Express (achado A23).
   *
   * Lá a coluna tem índice único e reenviar devolve `jaExistia: true`. Aqui o campo era ignorado,
   * então a mesma operação tinha garantias diferentes conforme onde rodava — e uma migração
   * interrompida no meio, repetida, duplicava as sessões deste lado. Varredura simples porque o
   * modo sem conta tem teto de 5 sessões (`TETO_ANONIMO`): índice novo no IndexedDB custaria uma
   * migração de schema para percorrer, no máximo, cinco registros.
   */
  const origemLocalId = str(p.origemLocalId);
  if (origemLocalId) {
    const existentes = await db.getAll('sessoes');
    const ja = existentes.find((s) => s.origemLocalId === origemLocalId);
    if (ja) return json({ ...ja, jaExistia: true });
  }

  const agora = Date.now();
  const id = uuid();
  const brutas = Array.isArray(p.utterances) ? (p.utterances as Json[]) : [];
  const falas = brutas.map((u, i) => falaDePayload(id, u, i));
  const sessao: SessaoLocal = {
    id, createdAt: agora, updatedAt: agora,
    title: str(p.title), kind: str(p.kind), sourceLang: str(p.sourceLang), targetLang: str(p.targetLang),
    status: str(p.status) ?? 'draft', durationMs: num(p.durationMs),
    wordCount: num(p.wordCount) ?? contarPalavras(falas), meta: null,
    origemLocalId: origemLocalId ?? null,
  };
  const tx = db.transaction(['sessoes', 'falas'], 'readwrite');
  await tx.objectStore('sessoes').put(sessao);
  for (const f of falas) await tx.objectStore('falas').put(f);
  await tx.done;
  return json(sessao);
}

async function obterSessao(m: RegExpMatchArray): Promise<Response> {
  const db = await abrirStore();
  const session = await db.get('sessoes', m[1]);
  if (!session) return json({ error: 'sessão não encontrada' }, 404);
  const utterances = (await db.getAllFromIndex('falas', 'porSessao', m[1])).sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
  return json({ session, utterances });
}

async function atualizarSessao(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const db = await abrirStore();
  const s = await db.get('sessoes', m[1]);
  if (!s) return json({ error: 'sessão não encontrada' }, 404);
  const nova: SessaoLocal = {
    ...s, updatedAt: Date.now(),
    title: opcional(str(p.title) ?? undefined, s.title), kind: opcional(str(p.kind) ?? undefined, s.kind),
    status: opcional(str(p.status) ?? undefined, s.status), durationMs: opcional(num(p.durationMs) ?? undefined, s.durationMs),
    wordCount: opcional(num(p.wordCount) ?? undefined, s.wordCount),
  };
  await db.put('sessoes', nova);
  return json(nova);
}

async function atualizarMeta(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const db = await abrirStore();
  const s = await db.get('sessoes', m[1]);
  if (!s) return json({ error: 'sessão não encontrada' }, 404);
  const meta = lerMeta(s.meta);
  if ('pinned' in p) meta.pinned = p.pinned === true;
  if ('imageUrl' in p) { if (typeof p.imageUrl === 'string') meta.imageUrl = p.imageUrl; else delete meta.imageUrl; }
  const nova = { ...s, meta: JSON.stringify(meta), updatedAt: Date.now() };
  await db.put('sessoes', nova);
  return json(nova);
}

async function substituirFalas(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const db = await abrirStore();
  const s = await db.get('sessoes', m[1]);
  if (!s) return json({ error: 'sessão não encontrada' }, 404);
  const brutas = Array.isArray(p.utterances) ? (p.utterances as Json[]) : [];
  const falas = brutas.map((u, i) => falaDePayload(s.id, u, i));
  const tx = db.transaction(['sessoes', 'falas'], 'readwrite');
  const antigas = await tx.objectStore('falas').index('porSessao').getAllKeys(s.id);
  for (const k of antigas) await tx.objectStore('falas').delete(k);
  for (const f of falas) await tx.objectStore('falas').put(f);
  const nova = { ...s, wordCount: contarPalavras(falas), updatedAt: Date.now() };
  await tx.objectStore('sessoes').put(nova);
  await tx.done;
  return json(nova);
}

async function atualizarFala(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const db = await abrirStore();
  const f = await db.get('falas', m[1]);
  if (!f) return json({ error: 'fala não encontrada' }, 404);
  const nova: FalaLocal = {
    ...f,
    sourceText: opcional(str(p.sourceText) ?? undefined, f.sourceText),
    translatedText: opcional(str(p.translatedText) ?? undefined, f.translatedText),
    speakerName: opcional(str(p.speakerName) ?? undefined, f.speakerName),
  };
  await db.put('falas', nova);
  return json(nova);
}

async function apagarSessao(m: RegExpMatchArray): Promise<Response> {
  const db = await abrirStore();
  const tx = db.transaction(['sessoes', 'falas', 'audios'], 'readwrite');
  const chaves = await tx.objectStore('falas').index('porSessao').getAllKeys(m[1]);
  for (const k of chaves) await tx.objectStore('falas').delete(k);
  await tx.objectStore('audios').delete(m[1]);
  await tx.objectStore('sessoes').delete(m[1]);
  await tx.done;
  return json({ ok: true });
}

async function guardarAudio(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const bytes = await lerBytes(init);
  if (!bytes) return json({ error: 'corpo vazio' }, 400);
  const db = await abrirStore();
  const s = await db.get('sessoes', m[1]);
  if (!s) return json({ error: 'sessão não encontrada' }, 404);
  const cabecalhos = new Headers(init.headers ?? {});
  const tipo = cabecalhos.get('content-type') || 'audio/webm';
  const meta = lerMeta(s.meta);
  meta.audioFile = 'local';
  await db.put('audios', { sessionId: s.id, bytes, tipo });
  await db.put('sessoes', { ...s, meta: JSON.stringify(meta), updatedAt: Date.now() });
  return json({ ok: true, audioUrl: `/api/sessions/${s.id}/audio` });
}

async function lerAudio(m: RegExpMatchArray): Promise<Response> {
  const db = await abrirStore();
  const a = await db.get('audios', m[1]);
  if (!a) return json({ error: 'sessão sem áudio' }, 404);
  return new Response(a.bytes, { status: 200, headers: { 'content-type': a.tipo } });
}

// ───────────────────────────── Vocabulário ─────────────────────────────

async function listarCartoes(): Promise<Response> {
  const db = await abrirStore();
  return json(await db.getAll('cartoes'));
}

async function adicionarCartoes(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const entrada = Array.isArray(p.cards) ? (p.cards as Json[]) : [];
  const db = await abrirStore();

  /* Mesmo teto, outro recurso. A recusa é do LOTE inteiro e não parcial de propósito: fichar
     metade das palavras que a pessoa marcou, em silêncio, seria pior do que recusar e explicar. */
  const jaFichadas = await db.count('cartoes');
  const tetoP = estadoDoTeto('palavras', jaFichadas);
  if (!tetoP.cabe) {
    return json({ error: motivoDoTeto('palavras'), codigo: 'TETO_ANONIMO', recurso: 'palavras', ...tetoP }, 507);
  }

  const agora = Date.now();
  const skipped: Array<{ word: string; motivo: string }> = [];
  const resultado = new Map<string, CartaoLocal>();
  const tx = db.transaction('cartoes', 'readwrite');
  for (const c of entrada) {
    const word = str(c.word)?.trim() ?? '';
    if (!word) { skipped.push({ word: String(c.word ?? ''), motivo: 'palavra vazia' }); continue; }
    const srcLang = str(c.srcLang);
    const normKey = chaveDedup(word, srcLang);
    const existente = resultado.get(normKey)
      ?? (await tx.store.index('porNormKey').get(normKey))
      /* CARTA GRAVADA COM A CHAVE ANTIGA. A forma da chave mudou (ver `chaveDedup`), então uma
         carta guardada antes desta versão não é encontrada pelo índice — e sem esta busca ela
         duplicaria uma vez, justamente para quem já usava o modo sem conta. A varredura é barata:
         o modo anônimo tem teto de 80 palavras (`TETO_ANONIMO`). */
      ?? (await acharPelaChaveAntiga(tx.store, word, srcLang));
    if (existente) {
      const atualizado: CartaoLocal = {
        ...existente, occurrences: existente.occurrences + 1,
        back: existente.back || str(c.back), sentence: existente.sentence || str(c.sentence),
      };
      await tx.store.put(atualizado);
      resultado.set(normKey, atualizado);
      continue;
    }
    const novo: CartaoLocal = {
      id: uuid(), normKey, word, back: str(c.back), sentence: str(c.sentence), srcLang, tgtLang: str(c.tgtLang),
      clozePrompt: str(c.clozePrompt), clozeAnswer: str(c.clozeAnswer), box: 1, dueAt: agora,
      stability: null, difficulty: null, reps: null, lapses: null, lastReview: null,
      sessionId: str(c.sessionId), inDeck: 1, cefrLevel: null, cefrConfidence: null, createdAt: agora, occurrences: 1,
    };
    await tx.store.put(novo);
    resultado.set(normKey, novo);
  }
  await tx.done;
  return json({ cards: [...resultado.values()], skipped });
}

async function editarCartao(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const db = await abrirStore();
  const c = await db.get('cartoes', m[1]);
  if (!c) return json({ error: 'card não encontrado' }, 404);
  const novo: CartaoLocal = {
    ...c,
    back: typeof p.back === 'string' ? p.back : c.back,
    inDeck: typeof p.inDeck === 'boolean' ? (p.inDeck ? 1 : 0) : c.inDeck,
  };
  await db.put('cartoes', novo);
  return json(novo);
}

function estadoDe(c: CartaoLocal): SchedulingState {
  return {
    box: c.box ?? 1, dueAt: c.dueAt ?? 0,
    stability: c.stability ?? undefined, difficulty: c.difficulty ?? undefined,
    reps: c.reps ?? undefined, lapses: c.lapses ?? undefined, lastReview: c.lastReview ?? undefined,
  };
}

async function revisarCartao(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const grade = num(p.grade);
  if (grade !== 1 && grade !== 2 && grade !== 3 && grade !== 4) return json({ error: 'grade inválido' }, 400);
  const db = await abrirStore();
  const c = await db.get('cartoes', m[1]);
  if (!c) return json({ error: 'card não encontrado' }, 404);
  const agora = Date.now();
  const prev = estadoDe(c);
  const next = Fsrs5Strategy.review(prev, grade as Grade, agora);
  const novo: CartaoLocal = {
    ...c, box: next.box, dueAt: next.dueAt, stability: next.stability ?? null, difficulty: next.difficulty ?? null,
    reps: next.reps ?? null, lapses: next.lapses ?? null, lastReview: next.lastReview ?? null,
  };
  const tx = db.transaction(['cartoes', 'revisoes'], 'readwrite');
  await tx.objectStore('cartoes').put(novo);
  await tx.objectStore('revisoes').put({
    id: uuid(), cardId: c.id, reviewedAt: agora, grade, prevStability: prev.stability ?? null, newStability: next.stability ?? null,
  });
  await tx.done;
  return json(novo);
}

// ───────────────────────────── Exercícios / seeds ─────────────────────────────

function exercicioDe(base: Json, item: Json, agora: number): ExercicioLocal {
  return {
    id: uuid(), createdAt: agora,
    roundId: str(base.roundId), exerciseKind: str(base.exerciseKind) ?? str(item.exerciseKind),
    kind: str(item.kind) ?? str(base.kind), origem: str(base.origem), sessionId: str(base.sessionId),
    itemRef: str(item.itemRef), cardId: str(item.cardId), correct: num(item.correct), attempts: num(item.attempts),
    ms: num(item.ms), hinted: num(item.hinted), score: num(item.score) ?? num(base.score),
    melhorSequencia: num(base.melhorSequencia),
  };
}

async function gravarRodada(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const itens = Array.isArray(p.itens) ? (p.itens as Json[]) : [];
  const db = await abrirStore();
  const agora = Date.now();
  const tx = db.transaction('exercicios', 'readwrite');
  for (const it of itens) await tx.store.put(exercicioDe(p, it, agora));
  await tx.done;
  return json({ ok: true, gravados: itens.length });
}

/* `POST /api/exercises/results` SAIU (07/09). Ela era o gravador POR ITEM, anterior a `/rodada`,
   e o Express a removeu na mudanca `servicos-sem-duplicata` — o cliente passou a gravar tudo por
   `/rodada`. Manter o espelho de uma rota que o servidor real nao tem e o mesmo tipo de
   divergencia que esta change existe para fechar, so que na direcao contraria: sem conta
   funcionaria algo que com conta responde 404. */

/**
 * A CURVA DE XP — a mesma funcao do servidor real (`historicoDeXp`, do core).
 *
 * Esta rota nao existia aqui: a aba de Progresso levava um 501 e o grafico ficava vazio para quem
 * estuda sem conta. O que faltava nao era o dado — as tres colecoes estao no IndexedDB — era
 * alguem soma-las. Copiar a agregacao do servidor resolveria a tela e criaria a segunda verdade;
 * a formula foi para o core e as duas pontas passaram a chama-la.
 */
async function historicoDeXpLocal(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const [sessoes, revisoes, exercicios] = await Promise.all([
    db.getAll('sessoes'), db.getAll('revisoes'), db.getAll('exercicios'),
  ]);
  const balde = url.searchParams.get('balde') === 'semana' ? 'semana' : 'dia';
  const desde = Number(url.searchParams.get('desde') ?? 0) || undefined;
  return json(historicoDeXp({
    sessoes: sessoes.map((s) => ({ em: s.createdAt, palavras: s.wordCount ?? 0 })),
    revisoes: revisoes.map((r) => ({ em: r.reviewedAt ?? 0, certa: (r.grade ?? 0) >= 3 })),
    /* `kind === 'drill'` e o mesmo discriminador das duas pontas: um item que gravou nota no
       agendador JA esta em `revisoes`, e conta-lo de novo inflaria a curva. */
    itensDeJogo: exercicios.filter((e) => e.kind === 'drill').map((e) => ({ em: e.createdAt, certo: e.correct === 1 })),
  }, { balde, desde }));
}

/**
 * O CATALOGO DE PALAVRAS paginado — busca, filtros e ordenacao.
 *
 * No servidor real isto e SQL com cursor composto; aqui e o mesmo contrato sobre um array. A ordem
 * de aplicacao e a dele (filtra, conta o total, ordena, corta a pagina) porque o `total` que a tela
 * mostra e o do FILTRO, nao o do acervo — mostrar o acervo inteiro acima de uma lista de doze seria
 * a mesma contagem desonesta que o resto do app ja corrigiu.
 */
async function paginaDeCartoes(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const q = url.searchParams;
  const limite = Math.min(Math.max(Number(q.get('limite') ?? 200) || 200, 1), 500);
  const ordem = (q.get('ordem') ?? 'recentes') as 'recentes' | 'frequentes' | 'dificuldade' | 'alfabetica';
  const busca = (q.get('q') ?? '').trim().toLowerCase();
  const niveis = (q.get('niveis') ?? '').split(',').filter(Boolean);
  const cursorId = q.get('cursorId');

  let cartoes = (await db.getAll('cartoes')).filter((c) => c.inDeck !== 0);
  if (busca) {
    // Palavra E traducao: procurar "alavanc" tem de achar tanto "leverage" quanto o verso.
    cartoes = cartoes.filter((c) => c.word.toLowerCase().includes(busca) || (c.back ?? '').toLowerCase().includes(busca));
  }
  if (niveis.length) {
    // 'ausente' e um filtro legitimo: "o que eu tenho sem nivel" e uma pergunta real.
    const querAusente = niveis.includes('ausente');
    const reais = niveis.filter((n) => n !== 'ausente');
    cartoes = cartoes.filter((c) => (c.cefrLevel ? reais.includes(c.cefrLevel) : querAusente));
  }
  /* `origens` NAO e aplicado aqui, e isto e uma ausencia declarada: a procedencia mora em
     `vocab_occurrences`, que o modo sem conta nao tem — ele guarda a contagem no cartao, nao a
     linha do tempo. Filtrar por origem devolveria uma lista vazia em vez de dizer que nao sabe. */

  const total = cartoes.length;
  const valorDe = (c: CartaoLocal): number | string | null =>
    ordem === 'recentes' ? c.createdAt
      : ordem === 'frequentes' ? c.occurrences
        : ordem === 'dificuldade' ? (c.difficulty ?? null)
          : c.word;

  cartoes.sort((a, b) => {
    const va = valorDe(a); const vb = valorDe(b);
    if (ordem === 'alfabetica') return String(va).localeCompare(String(vb)) || a.id.localeCompare(b.id);
    return (Number(vb ?? 0) - Number(va ?? 0)) || a.id.localeCompare(b.id);
  });

  /* O cursor e por ID e nao por valor: a lista ja esta ordenada em memoria, entao "continue depois
     daquele item" e uma posicao, nao um predicado. No servidor o cursor precisa ser composto
     porque a ordenacao acontece no SQL. */
  if (cursorId) {
    const i = cartoes.findIndex((c) => c.id === cursorId);
    if (i >= 0) cartoes = cartoes.slice(i + 1);
  }

  const temMais = cartoes.length > limite;
  const pagina = cartoes.slice(0, limite);
  const ultimo = pagina[pagina.length - 1];
  return json({
    itens: pagina,
    total,
    proximoCursor: temMais && ultimo ? { valor: valorDe(ultimo), id: ultimo.id } : null,
  });
}

/**
 * QUANDO A CONTAGEM DE ENCONTROS COMECOU A VALER.
 *
 * A tela usa isto para nao afirmar "visto 1 vez" sobre um cartao anterior a contagem. Sem conta
 * NAO HA acervo legado: o IndexedDB nasceu depois da contagem, entao todo cartao daqui tem
 * `occurrences` de verdade. `totalLegado` e zero porque e verdade, nao porque nao sabemos contar.
 */
async function inicioDaContagemLocal(): Promise<Response> {
  const db = await abrirStore();
  const cartoes = await db.getAll('cartoes');
  const inicioEm = cartoes.length ? Math.min(...cartoes.map((c) => c.createdAt)) : null;
  return json({ inicioEm, totalLegado: 0, total: cartoes.length });
}

/** Apaga um cartao. Sem `deleted_at`: no navegador o apagar e apagar. */
async function apagarCartao(m: RegExpMatchArray): Promise<Response> {
  const db = await abrirStore();
  const c = await db.get('cartoes', m[1]);
  if (!c) return json({ error: 'cartao nao encontrado' }, 404);
  await db.delete('cartoes', m[1]);
  /* As revisoes dele vao junto: uma revisao orfa contaria para as metricas de um cartao que nao
     existe mais, e o servidor real derruba as duas coisas com a mesma FOREIGN KEY. */
  for (const r of await db.getAll('revisoes')) if (r.cardId === m[1]) await db.delete('revisoes', r.id);
  return json({ ok: true });
}

/** Todas as falas de todas as sessoes — a lista que a busca do acervo le. */
async function todasAsFalas(): Promise<Response> {
  const db = await abrirStore();
  return json(await db.getAll('falas'));
}

async function listarResultados(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const sessionId = url.searchParams.get('sessionId');
  const origem = url.searchParams.get('origem');
  let linhas = await db.getAll('exercicios');
  if (sessionId) linhas = linhas.filter((l) => l.sessionId === sessionId);
  else if (origem) linhas = linhas.filter((l) => l.origem === origem);
  return json(linhas.sort((a, b) => b.createdAt - a.createdAt));
}

async function historicoPorItem(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const origem = url.searchParams.get('origem');
  const desde = Number(url.searchParams.get('desde') ?? 0) || 0;
  const linhas = (await db.getAll('exercicios'))
    .filter((l) => l.itemRef && (!origem || l.origem === origem) && l.createdAt >= desde)
    .sort((a, b) => a.createdAt - b.createdAt);
  /* SELEÇÃO v2: além de vezes/erros, a régua de retorno precisa de ERROS SEGUIDOS (contados do
     fim) e de quantas RODADAS do mesmo jogo já passaram desde o último erro. As rodadas são
     contadas por `roundId` distinto do mesmo `exerciseKind` depois da linha errada. */
  const agregado = new Map<string, { itemRef: string; vezes: number; erros: number; ultimaEm: number; ultimoAcerto: boolean; errosSeguidos: number; rodadasDesdeUltimoErro: number; _ultimoErroEm: number; _jogo: string | null }>();
  for (const l of linhas) {
    const h = agregado.get(l.itemRef!) ?? { itemRef: l.itemRef!, vezes: 0, erros: 0, ultimaEm: 0, ultimoAcerto: false, errosSeguidos: 0, rodadasDesdeUltimoErro: 0, _ultimoErroEm: 0, _jogo: null };
    h.vezes += 1;
    if (l.correct !== 1) { h.erros += 1; h.errosSeguidos += 1; h._ultimoErroEm = l.createdAt; h._jogo = l.exerciseKind; }
    else h.errosSeguidos = 0;
    h.ultimaEm = l.createdAt;
    h.ultimoAcerto = l.correct === 1;
    agregado.set(l.itemRef!, h);
  }
  for (const h of agregado.values()) {
    if (!h._ultimoErroEm) continue;
    const rodadas = new Set<string>();
    for (const l of linhas) if (l.roundId && l.exerciseKind === h._jogo && l.createdAt > h._ultimoErroEm) rodadas.add(l.roundId);
    h.rodadasDesdeUltimoErro = rodadas.size;
  }
  return json([...agregado.values()].map(({ _ultimoErroEm: _a, _jogo: _b, ...h }) => h));
}

async function recordes(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const origem = url.searchParams.get('origem');
  const linhas = (await db.getAll('exercicios')).filter((l) => l.exerciseKind && (!origem || l.origem === origem));
  const porJogo = new Map<string, { exerciseKind: string; melhorPontos: number; melhorEm: number; melhorCombo: number; certos: number; total: number; ultimaEm: number; rodadas: Set<string> }>();
  for (const l of linhas) {
    const r = porJogo.get(l.exerciseKind!) ?? { exerciseKind: l.exerciseKind!, melhorPontos: 0, melhorEm: 0, melhorCombo: 0, certos: 0, total: 0, ultimaEm: 0, rodadas: new Set<string>() };
    if ((l.score ?? 0) > r.melhorPontos) { r.melhorPontos = l.score ?? 0; r.melhorEm = l.createdAt; }
    if ((l.melhorSequencia ?? 0) > r.melhorCombo) r.melhorCombo = l.melhorSequencia ?? 0;
    if (l.correct != null) { r.total += 1; if (l.correct === 1) r.certos += 1; }
    if (l.createdAt > r.ultimaEm) r.ultimaEm = l.createdAt;
    r.rodadas.add(l.roundId ?? l.id);
    porJogo.set(l.exerciseKind!, r);
  }
  return json([...porJogo.values()].map((r) => ({
    exerciseKind: r.exerciseKind, melhorPontos: r.melhorPontos, melhorEm: r.melhorEm,
    melhorCombo: r.melhorCombo, precisao: r.total > 0 ? Math.round((r.certos / r.total) * 100) : null,
    ultimaEm: r.ultimaEm, rodadas: r.rodadas.size,
  })));
}

/**
 * GASTA SEEDS — com o preço do catálogo, como no Express.
 *
 * O `amount` do corpo era gravado como veio, e a POSSE é derivada do razão (`reason LIKE
 * 'loja:%'`, ver `itensComprados` logo acima): `{amount: 1, reason: 'loja:tema-custom'}` entregava
 * o lendário de 600 Seeds por 1. O Express fechou isso em 01/09 com `autorizarGasto`; aqui ficou
 * aberto, e o acervo do modo sem conta MIGRA para a conta.
 *
 * O saldo também é conferido, pelo mesmo motivo do servidor real: o único guarda era o botão
 * desabilitado na tela, e um cliente adulterado não tem botão.
 */
async function gastarSeeds(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const spendId = str(p.spendId);
  if (!spendId) return json({ error: 'spendId é obrigatório' }, 400);

  const autorizacao = autorizarGasto(str(p.reason) ?? '');
  if (ehRecusa(autorizacao)) return json({ error: autorizacao.erro, code: 'motivo_desconhecido' }, 400);

  const amount = num(p.amount);
  if (amount !== null && amount !== autorizacao.preco) {
    return json({ error: 'preço divergente do catálogo', code: 'preco_divergente', codigo: 'preco_divergente', detalhes: { preco: autorizacao.preco } }, 400);
  }

  const db = await abrirStore();
  const existente = await db.get('gastos', spendId);
  const jaExistia = !!existente;
  if (!jaExistia) {
    const { saldo } = economiaDeMetricas(await perfilEfemero(null));
    if (saldo < autorizacao.preco) {
      return json({ error: 'saldo insuficiente', code: 'saldo_insuficiente', codigo: 'saldo_insuficiente', detalhes: { falta: autorizacao.preco - saldo, saldo, preco: autorizacao.preco } }, 402);
    }
    await db.put('gastos', { spendId, amount: autorizacao.preco, reason: str(p.reason) ?? '', ref: str(p.ref), createdAt: Date.now() });
  }
  const total = (await db.getAll('gastos')).reduce((n, g) => n + g.amount, 0);
  return json({ jaExistia, gasto: existente?.amount ?? autorizacao.preco, seedsGastas: total });
}

/* ── ECONOMIA v2 (2026-08-28) ── */

/** Presença do dia: idempotente por dia local. O cliente manda o `dia` que calculou (fuso dele). */
async function registrarPresenca(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const dia = num(p.dia) ?? diaLocal(Date.now());
  const db = await abrirStore();
  const jaExistia = !!(await db.get('presencas', dia));
  if (!jaExistia) await db.put('presencas', { dia, createdAt: Date.now() });
  const dias = (await db.getAll('presencas')).map((x) => x.dia);
  const { atual } = sequencias(dias, dia);
  return json({ jaExistia, dia, streakPresenca: atual });
}

/**
 * CRÉDITO AVULSO — idempotente por `creditoId`, e com o VALOR decidido pela regra.
 *
 * ATÉ 07/09 ESTA FUNÇÃO CUNHAVA MOEDA. Ela gravava o `amount` e o `xp` que viessem no corpo, sem
 * teto e sem catálogo: `{creditoId: 'x'.repeat(8), amount: 999999}` entrava. O Express tinha
 * fechado esse mesmo furo em 01/09 e este lado ficou aberto — o que é pior do que nunca ter
 * fechado, porque a economia passou a valer duas coisas diferentes conforme a pessoa tivesse
 * conta ou não, e o acervo do modo sem conta MIGRA para a conta.
 *
 * Agora as duas pontas chamam `valorDoCredito`, do core, e nenhuma das duas lê `amount`.
 */
/**
 * O DROP DE FIM DE RODADA, sem conta — o ESPELHO exato do caminho do Express.
 *
 * As MESMAS funções do core, na MESMA ordem de guardas: rodada existente, idempotência por
 * `creditoId` lendo o item do razão gravado, sorteio do servidor sobre o que ainda falta, e
 * `valorDoDrop` como última régua antes de gravar. O contrato entre as duas pontas é testado
 * (`tests/contratos/economia.test.ts`), e a razão de existir desse teste vale aqui em cheio: o
 * acervo do modo sem conta MIGRA para a conta, então um baú mais generoso deste lado seria um
 * cosmético cunhado de graça atravessando para o outro.
 *
 * A diferença de mecânica, e só ela: aqui não há `user_id` (o banco inteiro é de uma pessoa só) e
 * a posse da Loja sai de `gastos` com razão `loja:` em vez de `seed_spends`.
 */
async function creditarDrop(creditoId: string, roundId: string): Promise<Response> {
  const db = await abrirStore();
  const exercicios = await db.getAll('exercicios');
  if (!exercicios.some((e) => e.roundId === roundId)) {
    return json({ error: 'rodada inexistente para este drop', code: 'rodada_inexistente', codigo: 'rodada_inexistente', detalhes: { roundId } }, 400);
  }

  const creditos = await db.getAll('creditos');
  const totais = (linhas: typeof creditos) => ({
    seedsCreditadas: linhas.reduce((n, c) => n + c.amount, 0),
    xpCreditado: linhas.reduce((n, c) => n + c.xp, 0),
  });

  const jaAberto = creditos.find((c) => c.creditoId === creditoId);
  if (jaAberto) {
    return json({ jaExistia: true, item: jaAberto.reason.slice('drop:'.length), ...totais(creditos) });
  }

  const jaPossui = new Set<string>();
  for (const g of await db.getAll('gastos')) {
    if (g.reason.startsWith('loja:')) jaPossui.add(g.reason.slice('loja:'.length));
  }
  for (const c of creditos) {
    if (c.reason.startsWith('drop:')) jaPossui.add(c.reason.slice('drop:'.length));
  }

  const sorteado = sortearItemDoDrop(Math.random(), itensSorteaveisNoDrop(jaPossui));
  if (!sorteado) return json({ jaExistia: false, item: null, ...totais(creditos) });

  const credito = valorDoDrop(creditoId, sorteado.id);
  if (ehRecusa(credito)) return json({ error: credito.erro, code: 'drop_invalido', codigo: 'drop_invalido' }, 400);

  await db.put('creditos', {
    creditoId: credito.creditoId, amount: credito.seeds, xp: credito.xp, reason: credito.reason, createdAt: Date.now(),
  });
  return json({ jaExistia: false, item: sorteado.id, ...totais(await db.getAll('creditos')) });
}

async function creditarSeeds(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const creditoId = str(p.creditoId);
  if (!creditoId) return json({ error: 'creditoId é obrigatório', code: 'credito_desconhecido' }, 400);

  /* A família de drop desvia antes de `valorDoCredito`, exatamente como no Express: o valor de um
     baú depende do item sorteado, que não está no id. */
  const roundIdDeDrop = roundIdDoDrop(creditoId);
  if (roundIdDeDrop) return creditarDrop(creditoId, roundIdDeDrop);

  const credito = valorDoCredito(creditoId);
  if (ehRecusa(credito)) return json({ error: credito.erro, code: 'credito_desconhecido' }, 400);

  const db = await abrirStore();
  const existente = await db.get('creditos', creditoId);
  const jaExistia = !!existente;
  if (!jaExistia) {
    /* O NÍVEL É CONFERIDO AQUI TAMBÉM, e do mesmo jeito: `economiaDeMetricas` sobre o perfil que
       este servidor calcula. Sem isto o cofre da década 10 sairia no nível 1 para quem joga sem
       conta — e depois migraria para a conta com as Seeds já lançadas. A conferência só roda no
       crédito NOVO: o reenvio de um crédito já lançado não pode ser recusado por nível. */
    if (credito.nivelMinimo > 0) {
      const { nivel } = economiaDeMetricas(await perfilEfemero(null));
      if (nivel < credito.nivelMinimo) {
        return json({ error: 'nível insuficiente para este crédito', code: 'nivel_insuficiente', codigo: 'nivel_insuficiente', detalhes: { nivel, exigido: credito.nivelMinimo } }, 400);
      }
    }
    await db.put('creditos', { creditoId, amount: credito.seeds, xp: credito.xp, reason: credito.reason, createdAt: Date.now() });
  }
  const todos = await db.getAll('creditos');
  return json({ jaExistia, seedsCreditadas: todos.reduce((n, c) => n + c.amount, 0), xpCreditado: todos.reduce((n, c) => n + c.xp, 0) });
}

// ───────────────────────────── Métricas ─────────────────────────────

/**
 * O PERFIL, como OBJETO — e a rota como casca dele.
 *
 * Era só uma rota, e por isso o próprio modo sem conta não conseguia consultar o que ele mesmo
 * calcula: para decidir um crédito é preciso saber o nível, e o nível vem daqui. Devolver
 * `Response` era o formato certo para o cliente e o errado para o código ao lado.
 */
async function perfilEfemero(sessionId: string | null): Promise<AppMetrics> {
  const db = await abrirStore();
  const agora = Date.now();
  const [sessoesTodas, cartoesTodos, revisoes, falasTodas, exercicios, gastos, presencas, creditos] = await Promise.all([
    db.getAll('sessoes'), db.getAll('cartoes'), db.getAll('revisoes'), db.getAll('falas'), db.getAll('exercicios'), db.getAll('gastos'),
    db.getAll('presencas'), db.getAll('creditos'),
  ]);
  const sessoes = sessionId ? sessoesTodas.filter((s) => s.id === sessionId) : sessoesTodas;
  const cartoes = sessionId ? cartoesTodos.filter((c) => c.sessionId === sessionId) : cartoesTodos;
  const falas = sessionId ? falasTodas.filter((f) => f.sessionId === sessionId) : falasTodas;
  const noDeck = cartoes.filter((c) => c.inDeck !== 0);
  const idsDoDeck = new Set(cartoes.map((c) => c.id));
  const revs = revisoes.filter((r) => idsDoDeck.has(r.cardId));
  const corretas = revs.filter((r) => r.grade >= 3).length;
  const drills = sessionId ? exercicios.filter((e) => e.sessionId === sessionId) : exercicios;
  const drillCorrect = drills.filter((e) => e.correct === 1).length;
  const totalAvaliado = revs.length + drills.length;
  const accuracy = totalAvaliado ? (corretas + drillCorrect) / totalAvaliado : 0;

  const dias = new Set(revs.map((r) => Math.floor(r.reviewedAt / DIA)));
  let streakDays = 0;
  for (let d = Math.floor(agora / DIA); dias.has(d); d -= 1) streakDays += 1;

  /* ── ECONOMIA v2: presença, tempo de captura premiado, rodadas perfeitas, créditos. ── */
  const diasDePresenca = presencas.map((x) => x.dia);
  const seq = sequencias(diasDePresenca, diaLocal(agora));
  const sequencias7 = marcosDeSequencia(diasDePresenca, 7);
  // Minutos de captura por dia local; o teto diário vive no core (`minutosPremiados`).
  const minutosPorDia = new Map<number, number>();
  let capturaMinutos = 0;
  for (const s of sessoes) {
    const min = (s.durationMs ?? 0) / 60_000;
    if (min <= 0) continue;
    capturaMinutos += min;
    const d = diaLocal(s.createdAt);
    minutosPorDia.set(d, (minutosPorDia.get(d) ?? 0) + min);
  }
  const capturaMinutosPremiados = Math.floor(minutosPremiados(minutosPorDia.values()));
  // Rodada perfeita = todos os itens certos E tamanho ≥ mínimo do jogo (senão uma rodada de 1
  // item viraria fábrica de "perfeitas").
  const porRodada = new Map<string, { kind: string | null; total: number; certos: number }>();
  for (const e of drills) {
    if (!e.roundId) continue;
    const r = porRodada.get(e.roundId) ?? { kind: e.exerciseKind, total: 0, certos: 0 };
    r.total += 1;
    if (e.correct === 1) r.certos += 1;
    porRodada.set(e.roundId, r);
  }
  let rodadasPerfeitas = 0;
  for (const r of porRodada.values()) {
    /* Com `r.kind === ''` o `&&` devolve a própria string vazia, e o `>=` a coage para 0. O
       `Number()` reproduz EXATAMENTE essa coerção e tira o `string` do tipo de `minimo`. */
    const minimo = Number((r.kind && (MINIGAMES as Record<string, { minItems?: number } | undefined>)[r.kind]?.minItems) ?? 3);
    if (r.total >= minimo && r.certos === r.total) rodadasPerfeitas += 1;
  }
  const seedsCreditadas = creditos.reduce((n, c) => n + c.amount, 0);
  const xpCreditado = creditos.reduce((n, c) => n + c.xp, 0);
  // A ofensiva que a tela mostra é a MAIOR entre revisar e aparecer: aparecer todo dia também conta.
  streakDays = Math.max(streakDays, seq.atual);

  const revisados = noDeck.filter((c) => c.stability != null);
  const avgStability = revisados.length ? revisados.reduce((n, c) => n + (c.stability ?? 0), 0) / revisados.length : 0;
  const retencoes = revisados.map((c) => Fsrs5Strategy.predictedRetention(estadoDe(c), agora)).filter((r): r is number => typeof r === 'number');
  const avgRetention = retencoes.length ? retencoes.reduce((a, b) => a + b, 0) / retencoes.length : 0;

  const semanas = new Map<number, number>();
  for (const c of cartoes) { const w = Math.floor(c.createdAt / (7 * DIA)) * 7 * DIA; semanas.set(w, (semanas.get(w) ?? 0) + 1); }
  const speakingMs = falas.reduce((n, f) => n + (f.tStartMs != null && f.tEndMs != null && f.tEndMs > f.tStartMs ? f.tEndMs - f.tStartMs : 0), 0);
  const palavrasFaladas = contarPalavras(falas.filter((f) => f.tStartMs != null && f.tEndMs != null));
  const wpm = speakingMs > 0 ? palavrasFaladas / (speakingMs / 60_000) : 0;
  const niveis = new Map<string, number>();
  for (const c of noDeck) if (c.cefrLevel) niveis.set(c.cefrLevel, (niveis.get(c.cefrLevel) ?? 0) + 1);

  const m: AppMetrics = {
    sessions: sessoes.length,
    wordsCaptured: sessoes.reduce((n, s) => n + (s.wordCount ?? 0), 0),
    deckSize: noDeck.length,
    newCards: noDeck.filter((c) => c.stability == null).length,
    dueToday: noDeck.filter((c) => (c.dueAt ?? 0) <= agora).length,
    reviews: revs.length,
    correctReviews: corretas,
    drillItems: drills.length,
    drillCorrect,
    accuracy,
    accuracyConfidence: Math.min(1, totalAvaliado / 20),
    streakDays,
    seedsGastas: gastos.reduce((n, g) => n + g.amount, 0),
    // Paridade com o servidor real (B4): posse derivada do log de compras da Loja.
    itensComprados: [...new Set(gastos.map((g) => g.reason).filter((r) => r.startsWith('loja:')).map((r) => r.slice('loja:'.length)))],
    presencas: presencas.length,
    streakPresenca: seq.atual,
    maiorSequenciaPresenca: seq.maior,
    sequencias7,
    capturaMinutos: Math.round(capturaMinutos),
    capturaMinutosPremiados,
    rodadasPerfeitas,
    seedsCreditadas,
    xpCreditado,
    idiomas: new Set(sessoes.map((s) => s.sourceLang).filter((l): l is string => !!l)).size,
    avgStability,
    avgRetention,
    avgRetentionConfidence: Math.min(1, retencoes.length / 20),
    vocabByWeek: [...semanas.entries()].sort((a, b) => a[0] - b[0]).map(([weekStart, count]) => ({ weekStart, count })),
    speakingMs,
    wpm,
    wpmConfidence: Math.min(1, speakingMs / 300_000),
    uniqueWords: new Set(noDeck.map((c) => c.normKey)).size,
    levelDistribution: [...niveis.entries()].map(([level, count]) => ({ level, count })),
    levelConfidence: 0,
    asOf: agora,
    escopo: sessionId ? 'sessao' : 'global',
    base: { considerados: revisados.length, total: noDeck.length },
  };
  return m;
}

async function metricas(_m: RegExpMatchArray, url: URL): Promise<Response> {
  return json(await perfilEfemero(url.searchParams.get('sessao')));
}

// ───────────────────────────── Configurações / conta ─────────────────────────────

interface SettingsLocal { id: string; activeProfileId: string | null; targetLanguage: string | null; ui: string | null }

function lerSettings(): SettingsLocal {
  try {
    const bruto = localStorage.getItem(CHAVE_SETTINGS);
    if (bruto) return JSON.parse(bruto) as SettingsLocal;
  } catch { /* sem localStorage → default */ }
  return { id: 'efemero', activeProfileId: null, targetLanguage: null, ui: null };
}

async function obterSettings(): Promise<Response> { return json(lerSettings()); }

async function gravarSettings(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const atual = lerSettings();
  const novo: SettingsLocal = {
    id: 'efemero',
    activeProfileId: 'activeProfileId' in p ? str(p.activeProfileId) : atual.activeProfileId,
    targetLanguage: 'targetLanguage' in p ? str(p.targetLanguage) : atual.targetLanguage,
    ui: 'ui' in p ? (p.ui == null ? null : JSON.stringify(p.ui)) : atual.ui,
  };
  try { localStorage.setItem(CHAVE_SETTINGS, JSON.stringify(novo)); } catch { /* best-effort */ }
  return json(novo);
}

async function entitlementsAnonimos(): Promise<Response> {
  return json({
    plan: 'anonimo', youtubeImport: false, managedCloudStt: false, managedCloudLlm: false, largerModels: false,
    armazenamento: { usados: 0, teto: 0 },
  });
}

// ───────────────────────────── Tabela de rotas ─────────────────────────────

const ROTAS: Array<{ metodo: string; padrao: RegExp; handler: Handler }> = [
  { metodo: 'GET', padrao: /^\/api\/sessions$/, handler: listarSessoes },
  { metodo: 'GET', padrao: /^\/api\/sessions\/utterances\/all$/, handler: todasAsFalas },
  { metodo: 'POST', padrao: /^\/api\/sessions$/, handler: criarSessao },
  { metodo: 'PATCH', padrao: /^\/api\/sessions\/utterances\/([^/]+)$/, handler: atualizarFala },
  { metodo: 'GET', padrao: /^\/api\/sessions\/([^/]+)$/, handler: obterSessao },
  { metodo: 'PATCH', padrao: /^\/api\/sessions\/([^/]+)$/, handler: atualizarSessao },
  { metodo: 'DELETE', padrao: /^\/api\/sessions\/([^/]+)$/, handler: apagarSessao },
  { metodo: 'PATCH', padrao: /^\/api\/sessions\/([^/]+)\/meta$/, handler: atualizarMeta },
  { metodo: 'PUT', padrao: /^\/api\/sessions\/([^/]+)\/utterances$/, handler: substituirFalas },
  { metodo: 'POST', padrao: /^\/api\/sessions\/([^/]+)\/audio$/, handler: guardarAudio },
  { metodo: 'GET', padrao: /^\/api\/sessions\/([^/]+)\/audio$/, handler: lerAudio },
  { metodo: 'GET', padrao: /^\/api\/vocab$/, handler: listarCartoes },
  { metodo: 'GET', padrao: /^\/api\/vocab\/pagina$/, handler: paginaDeCartoes },
  { metodo: 'GET', padrao: /^\/api\/vocab\/inicio-da-contagem$/, handler: inicioDaContagemLocal },
  { metodo: 'POST', padrao: /^\/api\/vocab\/bulk-add$/, handler: adicionarCartoes },
  { metodo: 'PATCH', padrao: /^\/api\/vocab\/([^/]+)$/, handler: editarCartao },
  { metodo: 'DELETE', padrao: /^\/api\/vocab\/([^/]+)$/, handler: apagarCartao },
  { metodo: 'POST', padrao: /^\/api\/vocab\/([^/]+)\/review$/, handler: revisarCartao },
  { metodo: 'GET', padrao: /^\/api\/metrics\/profile$/, handler: metricas },
  { metodo: 'GET', padrao: /^\/api\/metrics\/xp$/, handler: historicoDeXpLocal },
  { metodo: 'POST', padrao: /^\/api\/metrics\/seeds\/gastar$/, handler: gastarSeeds },
  { metodo: 'POST', padrao: /^\/api\/metrics\/seeds\/creditar$/, handler: creditarSeeds },
  { metodo: 'POST', padrao: /^\/api\/metrics\/presenca$/, handler: registrarPresenca },
  { metodo: 'POST', padrao: /^\/api\/exercises\/rodada$/, handler: gravarRodada },
  { metodo: 'GET', padrao: /^\/api\/exercises\/results$/, handler: listarResultados },
  { metodo: 'GET', padrao: /^\/api\/exercises\/historico$/, handler: historicoPorItem },
  { metodo: 'GET', padrao: /^\/api\/exercises\/recordes$/, handler: recordes },
  { metodo: 'GET', padrao: /^\/api\/settings$/, handler: obterSettings },
  { metodo: 'PUT', padrao: /^\/api\/settings$/, handler: gravarSettings },
  { metodo: 'GET', padrao: /^\/api\/me\/entitlements$/, handler: entitlementsAnonimos },
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
