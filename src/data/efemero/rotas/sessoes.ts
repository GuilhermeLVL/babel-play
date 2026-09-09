/**
 * ESPELHO SEM CONTA — sessões, falas e áudio.
 *
 * Metade de `src/data/rotas/sessoes.ts`: as MESMAS rotas `/api/sessions/*`, respondidas do
 * IndexedDB em vez do Postgres. O recorte dos dois arquivos é o mesmo de propósito — o contrato
 * mora em duas implementações, e comparar lado a lado só é possível se os dois lados tiverem a
 * mesma forma.
 *
 * Rotas: GET/POST `/api/sessions`, GET/PATCH/DELETE `/api/sessions/:id`,
 * PATCH `/api/sessions/:id/meta`, PUT `/api/sessions/:id/utterances`,
 * POST/GET `/api/sessions/:id/audio`, PATCH `/api/sessions/utterances/:id`,
 * GET `/api/sessions/utterances/all`.
 */
import { estadoDoTeto, motivoDoTeto } from '../../../core/tetoAnonimo';
import {
  contarPalavras,   type Json,
json, lerBytes, lerJson, lerMeta, num, opcional, str, uuid,
} from '../nucleo';
import { abrirStore, type FalaLocal, type SessaoLocal } from '../store';

function falaDePayload(sessionId: string, u: Json, i: number): FalaLocal {
  return {
    id: uuid(), sessionId,
    idx: num(u.idx) ?? i,
    speakerName: str(u.speakerName), source: str(u.source), sourceLang: str(u.sourceLang),
    sourceText: str(u.sourceText), targetLang: str(u.targetLang), translatedText: str(u.translatedText),
    tStartMs: num(u.tStartMs), tEndMs: num(u.tEndMs), engine: str(u.engine), confidence: num(u.confidence),
  };
}

export async function listarSessoes(): Promise<Response> {
  const db = await abrirStore();
  const todas = await db.getAllFromIndex('sessoes', 'porCriacao');
  return json(todas.reverse());
}

export async function criarSessao(_m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
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

export async function obterSessao(m: RegExpMatchArray): Promise<Response> {
  const db = await abrirStore();
  const session = await db.get('sessoes', m[1]);
  if (!session) return json({ error: 'sessão não encontrada' }, 404);
  const utterances = (await db.getAllFromIndex('falas', 'porSessao', m[1])).sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0));
  return json({ session, utterances });
}

export async function atualizarSessao(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
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

export async function atualizarMeta(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
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

export async function substituirFalas(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
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

export async function atualizarFala(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
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

export async function apagarSessao(m: RegExpMatchArray): Promise<Response> {
  const db = await abrirStore();
  const tx = db.transaction(['sessoes', 'falas', 'audios'], 'readwrite');
  const chaves = await tx.objectStore('falas').index('porSessao').getAllKeys(m[1]);
  for (const k of chaves) await tx.objectStore('falas').delete(k);
  await tx.objectStore('audios').delete(m[1]);
  await tx.objectStore('sessoes').delete(m[1]);
  await tx.done;
  return json({ ok: true });
}

export async function guardarAudio(m: RegExpMatchArray, _u: URL, init: RequestInit): Promise<Response> {
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

export async function lerAudio(m: RegExpMatchArray): Promise<Response> {
  const db = await abrirStore();
  const a = await db.get('audios', m[1]);
  if (!a) return json({ error: 'sessão sem áudio' }, 404);
  return new Response(a.bytes, { status: 200, headers: { 'content-type': a.tipo } });
}

/** Todas as falas de todas as sessoes — a lista que a busca do acervo le. */
export async function todasAsFalas(): Promise<Response> {
  const db = await abrirStore();
  return json(await db.getAll('falas'));
}
