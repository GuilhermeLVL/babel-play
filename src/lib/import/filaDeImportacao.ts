/**
 * A FILA DE IMPORTAÇÃO DA BIBLIOTECA — a seção "Importando" do protótipo aprovado (`E.bib.fila`).
 *
 * Cada importação vira um item com etapa e percentual REAIS: a etapa é o passo em que o código
 * está (enviar, ler, extrair, transcrever), e na transcrição o percentual vem do próprio Whisper
 * (`OfflineProgress.progress`). O item sai da fila quando a sessão existe no servidor.
 *
 * Mora fora do componente de propósito: o protótipo promete que a importação "continua mesmo se
 * você sair da tela". Com o estado dentro da Biblioteca, sair da tela apagaria a fila (a importação
 * seguiria, mas invisível); aqui ela sobrevive à troca de tela e reaparece ao voltar.
 */
import { useSyncExternalStore } from 'react';

import { createSession, importDocument, importWeb, importYoutube, uploadSessionAudio } from '../../data/api';
import type { OfflineProgress } from '../../gateway/offlineTranscribe';
import { fetchLangConfig } from '../langConfig';
import { buildDocumentSession, transcribeImportedAudio } from './buildSession';

export type FonteDeImportacao = 'youtube' | 'doc' | 'web' | 'local' | 'texto';

export type Entrada =
  | { fonte: 'youtube'; url: string }
  | { fonte: 'web'; url: string }
  | { fonte: 'doc'; arquivo: File }
  | { fonte: 'local'; arquivo: File }
  | { fonte: 'texto'; texto: string };

export interface ItemDaFila {
  id: string;
  fonte: FonteDeImportacao;
  titulo: string;
  /** 0–100. */
  p: number;
  etapa: string;
  /** Mensagem real do erro; presente = falhou (o item fica na fila com "Tentar de novo"). */
  erro?: string;
  entrada: Entrada;
}

let fila: ItemDaFila[] = [];
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((o) => o());

function atualizar(id: string, parcial: Partial<ItemDaFila>) {
  fila = fila.map((i) => (i.id === id ? { ...i, ...parcial } : i));
  avisar();
}

export function useFilaDeImportacao(): ItemDaFila[] {
  return useSyncExternalStore(
    (o) => {
      ouvintes.add(o);
      return () => ouvintes.delete(o);
    },
    () => fila,
  );
}

/** Nome do item enquanto a sessão ainda não tem título: o arquivo, o endereço ou "Texto colado". */
function tituloDe(e: Entrada): string {
  if (e.fonte === 'doc' || e.fonte === 'local') return e.arquivo.name;
  if (e.fonte === 'texto') return 'Texto colado';
  try {
    const u = new URL(e.url);
    return e.fonte === 'youtube' ? 'Vídeo do YouTube' : `Artigo: ${u.hostname.replace(/^www\./, '')}`;
  } catch {
    return e.url;
  }
}

/** Progresso do Whisper → percentual da fila: decodificar 10–20, modelo 20–50, falas 50–95. */
function doWhisper(p: OfflineProgress): [number, string] {
  if (p.phase === 'decode') return [10 + Math.round(p.progress * 10), 'Decodificando o áudio…'];
  if (p.phase === 'model')
    return [20 + Math.round(p.progress * 30), `Carregando o modelo local… ${Math.round(p.progress * 100)}%`];
  return [50 + Math.round(p.progress * 45), p.label || 'Transcrevendo com o Whisper local…'];
}

async function executar(item: ItemDaFila): Promise<string> {
  const e = item.entrada;
  const passo = (p: number, etapa: string) => atualizar(item.id, { p, etapa });
  const whisper = (pr: OfflineProgress) => {
    const [p, etapa] = doWhisper(pr);
    passo(p, etapa);
  };

  if (e.fonte === 'youtube') {
    passo(10, 'Buscando o vídeo e a legenda…');
    const r = await importYoutube(e.url);
    if (r.needsClientStt) await transcribeImportedAudio(r.id, r.sourceLang, whisper);
    return r.id;
  }
  if (e.fonte === 'web') {
    passo(25, 'Baixando a página…');
    const art = await importWeb(e.url);
    passo(55, 'Extraindo o texto…');
    const { recording } = await buildDocumentSession({ title: art.title, text: art.text, langHint: art.lang });
    return recording.id;
  }
  if (e.fonte === 'doc') {
    passo(25, 'Lendo o arquivo…');
    const doc = await importDocument(e.arquivo);
    passo(55, 'Extraindo o texto…');
    const { recording } = await buildDocumentSession({ title: doc.title, text: doc.text, langHint: doc.lang });
    return recording.id;
  }
  if (e.fonte === 'texto') {
    passo(40, 'Detectando o idioma…');
    const primeira = e.texto.trim().split(/\r?\n/)[0].slice(0, 60);
    const { recording } = await buildDocumentSession({ title: primeira || 'Texto colado', text: e.texto });
    return recording.id;
  }
  passo(5, 'Enviando…');
  const cfg = await fetchLangConfig();
  const rec = await createSession({
    kind: 'audio',
    title: e.arquivo.name.replace(/\.[^.]+$/, ''),
    sourceLang: cfg.studying,
    targetLang: cfg.mine,
    status: 'ready',
  });
  await uploadSessionAudio(rec.id, e.arquivo);
  passo(10, 'Transcrevendo com o Whisper local…');
  await transcribeImportedAudio(rec.id, cfg.studying, whisper);
  return rec.id;
}

async function rodar(item: ItemDaFila, aoConcluir: (id: string) => void) {
  try {
    const r = await executar(item);
    atualizar(item.id, { p: 100, etapa: 'Pronto' });
    fila = fila.filter((i) => i.id !== item.id);
    avisar();
    aoConcluir(r);
  } catch (err) {
    atualizar(item.id, { erro: String((err as Error)?.message || err) });
  }
}

/** Põe uma importação na fila e a começa. `aoConcluir` recebe o id da sessão criada. */
export function importar(entrada: Entrada, aoConcluir: (id: string) => void): void {
  const item: ItemDaFila = {
    id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fonte: entrada.fonte,
    titulo: tituloDe(entrada),
    p: 0,
    etapa: 'Enviando…',
    entrada,
  };
  fila = [...fila, item];
  avisar();
  void rodar(item, aoConcluir);
}

/** "Tentar de novo": o mesmo item, do zero. */
export function tentarDeNovo(id: string, aoConcluir: (id: string) => void): void {
  const item = fila.find((i) => i.id === id);
  if (!item) return;
  const limpo = { ...item, erro: undefined, p: 0, etapa: 'Enviando…' };
  fila = fila.map((i) => (i.id === id ? limpo : i));
  avisar();
  void rodar(limpo, aoConcluir);
}
