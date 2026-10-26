/**
 * "MEUS LIVROS": a biblioteca pessoal (CAT11), NESTE aparelho, na v1.
 *
 * POR QUE NÃO NO SERVIDOR. A sessão `kind:'document'` que já existe guarda o TEXTO inteiro no servidor; para
 * livro trazido pela pessoa isso faria do Frasy uma cópia de obra possivelmente protegida, que a spec proíbe
 * ("o arquivo nunca vai ao servidor"). A sincronização entra com a tabela de anotações da L2, que guarda
 * posição e grifos (com `exact` ≤ 500 caracteres), nunca o livro. Até lá:
 *
 *   · a LISTA (título, origem, quando abriu, status, etiquetas) mora no `localStorage`;
 *   · o CONTEÚDO de um livro trazido (o arquivo original e o texto extraído) mora no IndexedDB, que
 *     aguenta dezenas de MB; o `localStorage` não.
 * Sem IndexedDB (navegação privada em alguns navegadores), o livro trazido abre na hora e não fica guardado:
 * a tela avisa.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { useSyncExternalStore } from 'react';

import type { CapituloDeTexto } from '../../core/livros/epub';

export type OrigemDoMeuLivro = 'catalogo' | 'arquivo' | 'link';
export type StatusDeLeitura = 'quero-ler' | 'lendo' | 'lido';

export interface MeuLivro {
  /** Do catálogo: o id dele. Trazido: `meu-<aleatório>`. */
  id: string;
  titulo: string;
  autor?: string;
  origem: OrigemDoMeuLivro;
  formato?: 'epub' | 'pdf' | 'web';
  idioma?: string;
  /** O endereço do artigo, quando veio por link. */
  url?: string;
  adicionadoEm: number;
  abertoEm?: number;
  status: StatusDeLeitura;
  etiquetas: string[];
  /**
   * O progresso de leitura (0..1). Fica `null` na L1: quem mede é o leitor da L2 (posição por CFI). O campo
   * já existe para a lista não mudar de forma quando ele chegar.
   */
  progresso: number | null;
}

export interface ConteudoDoMeuLivro {
  id: string;
  /** O arquivo como veio (o leitor da L2 abre o EPUB/PDF original). */
  arquivo?: Blob;
  capitulos: CapituloDeTexto[];
}

const CHAVE = 'frasy.livros.meus.v1';
const EVENTO = 'frasy:meus-livros';

let cache: MeuLivro[] | null = null;

function lerDoDisco(): MeuLivro[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
    return Array.isArray(bruto)
      ? bruto.filter((l) => l && typeof l.id === 'string' && typeof l.titulo === 'string')
      : [];
  } catch {
    return [];
  }
}

export function lerMeusLivros(): MeuLivro[] {
  cache ??= lerDoDisco();
  return cache;
}

function gravar(lista: MeuLivro[]): void {
  cache = lista;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    /* disco cheio ou bloqueado: vale nesta aba */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** Põe (ou atualiza) um livro na lista; o mais recente fica no topo. */
export function guardarMeuLivro(
  livro: Omit<MeuLivro, 'adicionadoEm' | 'status' | 'etiquetas' | 'progresso'> & Partial<MeuLivro>,
): MeuLivro {
  const lista = lerMeusLivros();
  const antes = lista.find((l) => l.id === livro.id);
  const novo: MeuLivro = {
    status: 'quero-ler',
    etiquetas: [],
    progresso: null,
    ...antes,
    ...livro,
    adicionadoEm: antes?.adicionadoEm ?? livro.adicionadoEm ?? Date.now(),
  };
  gravar([novo, ...lista.filter((l) => l.id !== livro.id)]);
  return novo;
}

export function marcarAberto(id: string): void {
  const lista = lerMeusLivros();
  if (!lista.some((l) => l.id === id)) return;
  gravar(
    lista.map((l) =>
      l.id === id ? { ...l, abertoEm: Date.now(), status: l.status === 'quero-ler' ? 'lendo' : l.status } : l,
    ),
  );
}

export function mudarStatus(id: string, status: StatusDeLeitura): void {
  gravar(lerMeusLivros().map((l) => (l.id === id ? { ...l, status } : l)));
}

export async function removerMeuLivro(id: string): Promise<void> {
  gravar(lerMeusLivros().filter((l) => l.id !== id));
  await apagarConteudo(id).catch(() => undefined);
}

function assinar(f: () => void) {
  const daOutraAba = (e: StorageEvent) => {
    if (e.key !== CHAVE) return;
    cache = null;
    f();
  };
  window.addEventListener(EVENTO, f);
  window.addEventListener('storage', daOutraAba);
  return () => {
    window.removeEventListener(EVENTO, f);
    window.removeEventListener('storage', daOutraAba);
  };
}

const VAZIA: MeuLivro[] = [];
export function useMeusLivros(): MeuLivro[] {
  return useSyncExternalStore(assinar, lerMeusLivros, () => VAZIA);
}

/** Os recentes: abertos primeiro (do mais novo), depois os adicionados. */
export function recentes(lista: readonly MeuLivro[], quantos = 6): MeuLivro[] {
  return [...lista].sort((a, b) => (b.abertoEm ?? b.adicionadoEm) - (a.abertoEm ?? a.adicionadoEm)).slice(0, quantos);
}

export function novoIdDeLivroTrazido(): string {
  const aleatorio =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `meu-${aleatorio}`;
}

/* ── O conteúdo, no IndexedDB ────────────────────────────────────────────────────────────────── */

interface EsquemaDosLivros extends DBSchema {
  conteudo: { key: string; value: ConteudoDoMeuLivro };
}

let banco: Promise<IDBPDatabase<EsquemaDosLivros>> | null = null;
function abrirBanco() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('sem IndexedDB'));
  banco ??= openDB<EsquemaDosLivros>('frasy-livros', 1, {
    upgrade(db) {
      db.createObjectStore('conteudo', { keyPath: 'id' });
    },
  }).catch((e) => {
    banco = null;
    throw e;
  });
  return banco;
}

/** Guarda o conteúdo de um livro trazido. `false` = não deu para guardar (sem IndexedDB, cota cheia). */
export async function guardarConteudo(c: ConteudoDoMeuLivro): Promise<boolean> {
  try {
    await (await abrirBanco()).put('conteudo', c);
    return true;
  } catch {
    return false;
  }
}

export async function lerConteudo(id: string): Promise<ConteudoDoMeuLivro | null> {
  try {
    return (await (await abrirBanco()).get('conteudo', id)) ?? null;
  } catch {
    return null;
  }
}

async function apagarConteudo(id: string): Promise<void> {
  await (await abrirBanco()).delete('conteudo', id);
}

/** O conteúdo que acabou de chegar e ainda não foi (ou não pôde ser) guardado: abre nesta aba mesmo assim. */
const emMemoria = new Map<string, ConteudoDoMeuLivro>();
export const guardarEmMemoria = (c: ConteudoDoMeuLivro) => emMemoria.set(c.id, c);
export const lerDaMemoria = (id: string) => emMemoria.get(id) ?? null;
