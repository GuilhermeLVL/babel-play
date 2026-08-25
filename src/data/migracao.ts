/**
 * MIGRAÇÃO sem conta → conta (D10): o que ficou no navegador sobe para o servidor, UMA vez.
 *
 * Por SESSÃO, não por etapa global — assim uma falha no meio deixa sessões inteiras ou nada:
 *   1. POST /api/sessions com `origemLocalId` = id local (o servidor é idempotente por ele);
 *   2. áudio (best-effort: 413/507 = quota do plano → `audioPendente`, segue);
 *   3. cartões daquela sessão, com `sessionId` reescrito para o id do servidor (o servidor
 *      deduplica por palavra+idioma, então reenviar é seguro);
 *   4. só então o local é apagado.
 * Falha em 1 ou 3: a sessão fica local, entra em `falhas`, e a próxima entrada tenta de novo —
 * o `origemLocalId` é o que torna a repetição segura.
 *
 * Rodadas, histórico e recordes sem conta NÃO sobem nesta versão (não há chave de idempotência
 * para eles no servidor); o modal diz isso antes de migrar.
 *
 * Precisa rodar com a identidade já em `conta` — senão o `apiFetch` responderia pelo servidor em
 * memória e a "migração" copiaria o local para ele mesmo.
 */
import { apiFetch, bulkAddCards, type NewUtterancePayload } from './api';
import { abrirStore, limparTudo, temDadosLocais, type CartaoLocal, type SessaoLocal } from './efemero/store';
import { estadoDeIdentidade } from '../lib/identidade';

export interface RelatorioDeMigracao {
  sessoes: number;
  jaExistiam: number;
  audios: number;
  audiosPendentes: number;
  cartoes: number;
  falhas: Array<{ id: string; titulo: string; etapa: 'sessao' | 'cartoes'; erro: string }>;
}

export interface ProgressoDaMigracao { feitas: number; total: number; atual: string }

export interface InventarioLocal { sessoes: number; cartoes: number; comAudio: number; rodadas: number }

/** O que há para migrar — é o que o modal mostra antes de pedir confirmação. */
export async function inventarioLocal(): Promise<InventarioLocal> {
  const db = await abrirStore();
  const [sessoes, cartoes, comAudio, rodadas] = await Promise.all([
    db.count('sessoes'), db.count('cartoes'), db.count('audios'), db.count('exercicios'),
  ]);
  return { sessoes, cartoes, comAudio, rodadas };
}

export { temDadosLocais };

async function subirSessao(s: SessaoLocal, falas: NewUtterancePayload[]): Promise<{ id: string; jaExistia: boolean }> {
  const res = await apiFetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: s.title ?? undefined, kind: s.kind ?? undefined, sourceLang: s.sourceLang ?? undefined,
      targetLang: s.targetLang ?? undefined, status: s.status ?? 'done', durationMs: s.durationMs ?? undefined,
      utterances: falas, origemLocalId: s.id,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const corpo = (await res.json()) as { id: string; jaExistia?: boolean };
  return { id: corpo.id, jaExistia: corpo.jaExistia === true };
}

/** `true` subiu; `false` ficou pendente (quota/tamanho) — nunca lança. */
async function subirAudio(idServidor: string, bytes: ArrayBuffer, tipo: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/sessions/${idServidor}/audio`, {
      timeoutMs: 600_000, method: 'POST', headers: { 'Content-Type': tipo || 'audio/webm' }, body: bytes,
    });
    return res.ok;
  } catch { return false; }
}

function cartaoParaPayload(c: CartaoLocal, idServidor: string) {
  return {
    word: c.word, back: c.back ?? undefined, sentence: c.sentence ?? undefined,
    srcLang: c.srcLang ?? undefined, tgtLang: c.tgtLang ?? undefined,
    clozePrompt: c.clozePrompt ?? undefined, clozeAnswer: c.clozeAnswer ?? undefined, sessionId: idServidor,
  };
}

export async function migrarParaConta(aoProgredir?: (p: ProgressoDaMigracao) => void): Promise<RelatorioDeMigracao> {
  if (estadoDeIdentidade() !== 'conta') throw new Error('migração exige identidade `conta`');
  const db = await abrirStore();
  const r: RelatorioDeMigracao = { sessoes: 0, jaExistiam: 0, audios: 0, audiosPendentes: 0, cartoes: 0, falhas: [] };
  const sessoes = (await db.getAllFromIndex('sessoes', 'porCriacao'));
  const cartoesTodos = await db.getAll('cartoes');
  const total = sessoes.length + (cartoesTodos.some((c) => !c.sessionId) ? 1 : 0);
  let feitas = 0;

  for (const s of sessoes) {
    aoProgredir?.({ feitas, total, atual: s.title ?? 'Sessão sem título' });
    const falas = (await db.getAllFromIndex('falas', 'porSessao', s.id))
      .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
      .map((f) => ({
        idx: f.idx ?? undefined, source: f.source ?? undefined, speakerName: f.speakerName ?? undefined,
        sourceLang: f.sourceLang ?? undefined, sourceText: f.sourceText ?? undefined, targetLang: f.targetLang ?? undefined,
        translatedText: f.translatedText ?? undefined, engine: f.engine ?? undefined,
        tStartMs: f.tStartMs ?? undefined, tEndMs: f.tEndMs ?? undefined,
        confidence: f.confidence ?? undefined,
      }));

    let idServidor: string;
    try {
      const up = await subirSessao(s, falas);
      idServidor = up.id;
      if (up.jaExistia) r.jaExistiam += 1; else r.sessoes += 1;
      await db.put('sessoes', { ...s, idServidor, migradaEm: Date.now() });
    } catch (e) {
      r.falhas.push({ id: s.id, titulo: s.title ?? '', etapa: 'sessao', erro: e instanceof Error ? e.message : String(e) });
      feitas += 1;
      continue;
    }

    const audio = await db.get('audios', s.id);
    let audioOk = true;
    if (audio) {
      audioOk = await subirAudio(idServidor, audio.bytes, audio.tipo);
      if (audioOk) r.audios += 1; else { r.audiosPendentes += 1; await db.put('sessoes', { ...s, idServidor, migradaEm: Date.now(), audioPendente: true }); }
    }

    const cartoes = cartoesTodos.filter((c) => c.sessionId === s.id);
    if (cartoes.length) {
      try {
        const res = await bulkAddCards(cartoes.map((c) => cartaoParaPayload(c, idServidor)));
        r.cartoes += res.cards.length;
      } catch (e) {
        r.falhas.push({ id: s.id, titulo: s.title ?? '', etapa: 'cartoes', erro: e instanceof Error ? e.message : String(e) });
        feitas += 1;
        continue;
      }
    }

    // Tudo o que importa subiu (áudio pendente não segura a sessão: o servidor já a tem).
    const tx = db.transaction(['sessoes', 'falas', 'audios', 'cartoes'], 'readwrite');
    for (const k of await tx.objectStore('falas').index('porSessao').getAllKeys(s.id)) await tx.objectStore('falas').delete(k);
    for (const c of cartoes) await tx.objectStore('cartoes').delete(c.id);
    if (audioOk) await tx.objectStore('audios').delete(s.id);
    if (audioOk) await tx.objectStore('sessoes').delete(s.id);
    await tx.done;
    feitas += 1;
  }

  // Cartões sem sessão (adicionados à mão) sobem soltos.
  const soltos = cartoesTodos.filter((c) => !c.sessionId);
  if (soltos.length) {
    aoProgredir?.({ feitas, total, atual: 'Cartões avulsos' });
    const res = await bulkAddCards(soltos.map((c) => ({ ...cartaoParaPayload(c, ''), sessionId: undefined })));
    r.cartoes += res.cards.length;
    const tx = db.transaction('cartoes', 'readwrite');
    for (const c of soltos) await tx.store.delete(c.id);
    await tx.done;
    feitas += 1;
  }
  aoProgredir?.({ feitas, total, atual: '' });

  // Nada ficou para trás (nem falha nem áudio pendente): limpa o resto (rodadas, gastos, revisões).
  if (!r.falhas.length && !r.audiosPendentes) await limparTudo();
  return r;
}
