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
  return json({ error: 'conta necessária', codigo: CODIGO_EXIGE_CONTA, rota }, 501);
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

/** Mesma chave do servidor: palavra sem acento/caixa + idioma. */
export function chaveDedup(word: string, srcLang: string | null): string {
  const w = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return `${w}|${(srcLang ?? '').toLowerCase()}`;
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
  const agora = Date.now();
  const id = uuid();
  const brutas = Array.isArray(p.utterances) ? (p.utterances as Json[]) : [];
  const falas = brutas.map((u, i) => falaDePayload(id, u, i));
  const sessao: SessaoLocal = {
    id, createdAt: agora, updatedAt: agora,
    title: str(p.title), kind: str(p.kind), sourceLang: str(p.sourceLang), targetLang: str(p.targetLang),
    status: str(p.status) ?? 'draft', durationMs: num(p.durationMs),
    wordCount: num(p.wordCount) ?? contarPalavras(falas), meta: null,
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
  const agora = Date.now();
  const skipped: Array<{ word: string; motivo: string }> = [];
  const resultado = new Map<string, CartaoLocal>();
  const tx = db.transaction('cartoes', 'readwrite');
  for (const c of entrada) {
    const word = str(c.word)?.trim() ?? '';
    if (!word) { skipped.push({ word: String(c.word ?? ''), motivo: 'palavra vazia' }); continue; }
    const srcLang = str(c.srcLang);
    const normKey = chaveDedup(word, srcLang);
    const existente = resultado.get(normKey) ?? (await tx.store.index('porNormKey').get(normKey));
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

async function gravarResultado(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const db = await abrirStore();
  const linha = exercicioDe(p, p, Date.now());
  await db.put('exercicios', linha);
  return json(linha);
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
  const agregado = new Map<string, { itemRef: string; vezes: number; erros: number; ultimaEm: number; ultimoAcerto: boolean }>();
  for (const l of linhas) {
    const h = agregado.get(l.itemRef!) ?? { itemRef: l.itemRef!, vezes: 0, erros: 0, ultimaEm: 0, ultimoAcerto: false };
    h.vezes += 1;
    if (l.correct !== 1) h.erros += 1;
    h.ultimaEm = l.createdAt;
    h.ultimoAcerto = l.correct === 1;
    agregado.set(l.itemRef!, h);
  }
  return json([...agregado.values()]);
}

async function recordes(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const origem = url.searchParams.get('origem');
  const linhas = (await db.getAll('exercicios')).filter((l) => l.exerciseKind && (!origem || l.origem === origem));
  const porJogo = new Map<string, { exerciseKind: string; melhorPontos: number; melhorEm: number; rodadas: Set<string> }>();
  for (const l of linhas) {
    const r = porJogo.get(l.exerciseKind!) ?? { exerciseKind: l.exerciseKind!, melhorPontos: 0, melhorEm: 0, rodadas: new Set<string>() };
    if ((l.score ?? 0) > r.melhorPontos) { r.melhorPontos = l.score ?? 0; r.melhorEm = l.createdAt; }
    r.rodadas.add(l.roundId ?? l.id);
    porJogo.set(l.exerciseKind!, r);
  }
  return json([...porJogo.values()].map((r) => ({ exerciseKind: r.exerciseKind, melhorPontos: r.melhorPontos, melhorEm: r.melhorEm, rodadas: r.rodadas.size })));
}

async function gastarSeeds(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
  const p = lerJson(init);
  const spendId = str(p.spendId);
  const amount = num(p.amount);
  if (!spendId || amount === null || amount <= 0) return json({ error: 'spendId e amount são obrigatórios' }, 400);
  const db = await abrirStore();
  const existente = await db.get('gastos', spendId);
  const jaExistia = !!existente;
  if (!jaExistia) await db.put('gastos', { spendId, amount, reason: str(p.reason) ?? '', ref: str(p.ref), createdAt: Date.now() });
  const total = (await db.getAll('gastos')).reduce((n, g) => n + g.amount, 0);
  return json({ jaExistia, gasto: existente?.amount ?? amount, seedsGastas: total });
}

// ───────────────────────────── Métricas ─────────────────────────────

async function metricas(_m: RegExpMatchArray, url: URL): Promise<Response> {
  const db = await abrirStore();
  const agora = Date.now();
  const sessionId = url.searchParams.get('sessao');
  const [sessoesTodas, cartoesTodos, revisoes, falasTodas, exercicios, gastos] = await Promise.all([
    db.getAll('sessoes'), db.getAll('cartoes'), db.getAll('revisoes'), db.getAll('falas'), db.getAll('exercicios'), db.getAll('gastos'),
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
  return json(m);
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
  { metodo: 'POST', padrao: /^\/api\/vocab\/bulk-add$/, handler: adicionarCartoes },
  { metodo: 'PATCH', padrao: /^\/api\/vocab\/([^/]+)$/, handler: editarCartao },
  { metodo: 'POST', padrao: /^\/api\/vocab\/([^/]+)\/review$/, handler: revisarCartao },
  { metodo: 'GET', padrao: /^\/api\/metrics\/profile$/, handler: metricas },
  { metodo: 'POST', padrao: /^\/api\/metrics\/seeds\/gastar$/, handler: gastarSeeds },
  { metodo: 'POST', padrao: /^\/api\/exercises\/rodada$/, handler: gravarRodada },
  { metodo: 'POST', padrao: /^\/api\/exercises\/results$/, handler: gravarResultado },
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
