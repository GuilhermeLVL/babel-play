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
import type { StatusDeLeitura } from '../../core/livros/meusLivros';
import { idDoCatalogo } from './abrir';
import { estante } from './armazem';
import { posicoes } from './posicoesDoAparelho';

export type OrigemDoMeuLivro = 'catalogo' | 'arquivo' | 'link';
export type { StatusDeLeitura };

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
   * OBSOLETO, nunca é escrito: o progresso real mora na posição de leitura do aparelho (`posicoes.ler`), e a
   * tela o DERIVA de lá (ver `idNaEstante`). O campo fica só para os registros antigos continuarem válidos.
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

/**
 * O id deste livro NA ESTANTE do leitor (a chave da posição, das anotações e do arquivo). O do catálogo vira
 * `cat:<id>` (`idDoCatalogo`); o trazido (`meu-…`) usa o mesmo id nos dois lados.
 */
export const idNaEstante = (l: Pick<MeuLivro, 'id' | 'origem'>): string =>
  l.origem === 'catalogo' ? idDoCatalogo(l.id) : l.id;

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

/**
 * Remove o livro de "Meus livros" — e também a cópia (ou referência) na estante do leitor (`frasy-leitor`) e a
 * posição de leitura deste aparelho. As anotações ficam (são da pessoa e sincronizam).
 */
export async function removerMeuLivro(id: string): Promise<void> {
  const alvo = lerMeusLivros().find((l) => l.id === id);
  const idDaEstante = alvo ? idNaEstante(alvo) : id;
  gravar(lerMeusLivros().filter((l) => l.id !== id));
  await apagarConteudo(id).catch(() => undefined);
  await estante.apagarLivro(idDaEstante).catch(() => undefined);
  posicoes.esquecer(idDaEstante);
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

/** Só o que o perfil pode ver: os do catálogo passam por `visivel`; os trazidos pela pessoa, sempre. */
export function filtrarMeusLivrosVisiveis(lista: readonly MeuLivro[], visivel: (id: string) => boolean): MeuLivro[] {
  return lista.filter((l) => l.origem !== 'catalogo' || visivel(l.id));
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

/**
 * OS TETOS DO APARELHO. Livro trazido pesa (um PDF pode ter 30 MB), e o navegador apaga TUDO de uma origem
 * que passa da cota. Por isso: no máximo 30 livros e 150 MB de conteúdo guardado; ao passar, sai o conteúdo
 * do livro aberto há mais tempo (LRU), e quem trouxe o novo fica sabendo quais saíram. A entrada na lista
 * continua: abrir um livro que saiu diz que é preciso trazer o arquivo de novo.
 */
export const TETO_DE_LIVROS_GUARDADOS = 30;
export const TETO_DE_BYTES_GUARDADOS = 150 * 1024 * 1024;

interface MetaDoConteudo {
  id: string;
  tamanho: number;
  usadoEm: number;
}

/**
 * O conteúdo NO DISCO: o arquivo vai como bytes (`ArrayBuffer`) e tipo, e não como `Blob` — o WebKit (Safari)
 * recusa `Blob` no IndexedDB ("Error preparing Blob/File data to be stored in object store"). Registro antigo
 * com `arquivo` (Blob) continua sendo lido.
 */
type ConteudoNoDisco = Omit<ConteudoDoMeuLivro, 'arquivo'> & { arquivo?: Blob; bytes?: ArrayBuffer; tipo?: string };

const paraODisco = async ({ arquivo, ...resto }: ConteudoDoMeuLivro): Promise<ConteudoNoDisco> =>
  arquivo ? { ...resto, bytes: await arquivo.arrayBuffer(), tipo: arquivo.type } : resto;

const doDisco = ({ bytes, tipo, ...resto }: ConteudoNoDisco): ConteudoDoMeuLivro =>
  bytes ? { ...resto, arquivo: new Blob([bytes], tipo ? { type: tipo } : undefined) } : resto;

interface EsquemaDosLivros extends DBSchema {
  conteudo: { key: string; value: ConteudoNoDisco };
  meta: { key: string; value: MetaDoConteudo };
}

let banco: Promise<IDBPDatabase<EsquemaDosLivros>> | null = null;
function abrirBanco() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('sem IndexedDB'));
  banco ??= openDB<EsquemaDosLivros>('frasy-livros', 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('conteudo')) db.createObjectStore('conteudo', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
    },
  }).catch((e) => {
    banco = null;
    throw e;
  });
  return banco;
}

/** Quanto um conteúdo ocupa: o arquivo original mais o texto extraído (2 bytes por caractere, por cima). */
export function tamanhoDoConteudo(c: ConteudoDoMeuLivro): number {
  return (c.arquivo?.size ?? 0) + c.capitulos.reduce((s, x) => s + (x.texto.length + x.titulo.length) * 2, 0);
}

/**
 * O que sai para o novo caber: do usado há mais tempo para o mais recente, até a contagem e o total voltarem
 * para baixo dos tetos. Função pura (o teste a exercita sem IndexedDB).
 */
export function quemSaiParaCaber(
  guardados: readonly MetaDoConteudo[],
  novo: MetaDoConteudo,
  tetoDeLivros = TETO_DE_LIVROS_GUARDADOS,
  tetoDeBytes = TETO_DE_BYTES_GUARDADOS,
): string[] {
  const restantes = guardados.filter((g) => g.id !== novo.id).sort((a, b) => a.usadoEm - b.usadoEm);
  let total = restantes.reduce((s, g) => s + g.tamanho, 0) + novo.tamanho;
  let contagem = restantes.length + 1;
  const saem: string[] = [];
  for (const g of restantes) {
    if (contagem <= tetoDeLivros && total <= tetoDeBytes) break;
    saem.push(g.id);
    total -= g.tamanho;
    contagem--;
  }
  return saem;
}

export type ResultadoDaGuarda =
  | { guardado: true; removidos: string[] }
  | { guardado: false; motivo: 'grande-demais' | 'indisponivel' };

/** Guarda o conteúdo de um livro trazido, tirando os mais antigos se precisar. */
export async function guardarConteudo(c: ConteudoDoMeuLivro): Promise<ResultadoDaGuarda> {
  const tamanho = tamanhoDoConteudo(c);
  if (tamanho > TETO_DE_BYTES_GUARDADOS) return { guardado: false, motivo: 'grande-demais' };
  try {
    const registro = await paraODisco(c);
    const db = await abrirBanco();
    const novo = { id: c.id, tamanho, usadoEm: Date.now() };
    const removidos = quemSaiParaCaber(await db.getAll('meta'), novo);
    const tx = db.transaction(['conteudo', 'meta'], 'readwrite');
    for (const id of removidos) {
      void tx.objectStore('conteudo').delete(id);
      void tx.objectStore('meta').delete(id);
    }
    void tx.objectStore('conteudo').put(registro);
    void tx.objectStore('meta').put(novo);
    await tx.done;
    return { guardado: true, removidos };
  } catch {
    return { guardado: false, motivo: 'indisponivel' };
  }
}

export async function lerConteudo(id: string): Promise<ConteudoDoMeuLivro | null> {
  try {
    const db = await abrirBanco();
    const registro = await db.get('conteudo', id);
    if (!registro) return null;
    const meta = await db.get('meta', id);
    if (meta) await db.put('meta', { ...meta, usadoEm: Date.now() });
    return doDisco(registro);
  } catch {
    return null;
  }
}

async function apagarConteudo(id: string): Promise<void> {
  const db = await abrirBanco();
  await db.delete('conteudo', id);
  await db.delete('meta', id);
}

/**
 * O conteúdo que acabou de chegar abre nesta aba mesmo sem IndexedDB. Só os 2 mais recentes ficam na
 * memória: um PDF grande não pode ficar preso nela pela aba inteira.
 */
const TETO_DA_MEMORIA = 2;
const emMemoria = new Map<string, ConteudoDoMeuLivro>();
export function guardarEmMemoria(c: ConteudoDoMeuLivro): void {
  emMemoria.delete(c.id);
  emMemoria.set(c.id, c);
  while (emMemoria.size > TETO_DA_MEMORIA) emMemoria.delete(emMemoria.keys().next().value as string);
}
export const lerDaMemoria = (id: string) => emMemoria.get(id) ?? null;
