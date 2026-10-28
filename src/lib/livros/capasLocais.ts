/**
 * AS CAPAS DESTE APARELHO (spec `docs/specs/2026-10-28-livros-capas.md`): a que veio dentro do arquivo do livro
 * da pessoa e a que ela escolheu ("Trocar capa"), para o livro dela OU para um livro do catálogo. Moram no
 * IndexedDB `frasy-capas`, NUNCA no servidor e nunca na sincronização; saem junto com o livro.
 *
 *   · `extraida`: a capa do arquivo (EPUB: `getCover` do foliate; PDF: a 1ª página), reduzida a 300 x 450;
 *   · `usuario`: a imagem que a pessoa escolheu, validada pelo conteúdo e reduzida a 300 x 450.
 * Vale `usuario`, senão `extraida`. "Voltar à capa original" apaga só a `usuario`.
 *
 * Os bytes vão como `ArrayBuffer`, e não `Blob`: o WebKit recusa `Blob` no IndexedDB (ver `armazem.ts`).
 * Teto: 200 capas e 20 MB; passou, sai a usada há mais tempo (LRU).
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { useEffect, useState } from 'react';

import type { MotivoDaRecusaDaImagem } from '../../core/livros/imagemDeCapa';
import {
  CAPA_ALTURA,
  CAPA_LARGURA,
  capasQueSaem,
  type MetaDeCapa,
  type ModoDoAjuste,
  planoDeDesenho,
  TETO_DA_CAPA_REDUZIDA,
  TETO_DE_PIXELS,
  validarImagemDeOrigem,
} from '../../core/livros/imagemDeCapa';

export class ErroDaCapa extends Error {
  constructor(readonly motivo: MotivoDaRecusaDaImagem) {
    super(`capa recusada: ${motivo}`);
  }
}

export type OrigemDaCapa = 'usuario' | 'arquivo';

interface Imagem {
  bytes: ArrayBuffer;
  tipo: string;
}

interface RegistroDeCapa {
  livroId: string;
  extraida?: Imagem;
  usuario?: Imagem;
  /** Já tentamos tirar a capa do arquivo (deu ou não): não repete a cada abertura da estante. */
  tentouExtrair?: boolean;
  tamanho: number;
  usadoEm: number;
}

interface EsquemaDasCapas extends DBSchema {
  capas: { key: string; value: RegistroDeCapa };
}

const EVENTO = 'frasy:capas';
let banco: Promise<IDBPDatabase<EsquemaDasCapas>> | null = null;

function abrirBanco() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('sem IndexedDB'));
  banco ??= openDB<EsquemaDasCapas>('frasy-capas', 1, {
    upgrade(db) {
      db.createObjectStore('capas', { keyPath: 'livroId' });
    },
  }).catch((e) => {
    banco = null;
    throw e;
  });
  return banco;
}

/** Os ids que têm registro (uma leitura só; `useCapaLocal` não abre o banco para quem não tem). */
let indice: Promise<Set<string>> | null = null;
const carregarIndice = (): Promise<Set<string>> => {
  indice ??= abrirBanco()
    .then(async (db) => new Set(await db.getAllKeys('capas')))
    .catch((e) => {
      indice = null;
      throw e;
    });
  return indice;
};

/** As URLs de objeto já criadas, por livro: revogadas quando a capa muda ou some. */
const urls = new Map<string, { url: string; origem: OrigemDaCapa } | null>();

function avisar(livroId: string) {
  const antiga = urls.get(livroId);
  if (antiga) URL.revokeObjectURL(antiga.url);
  urls.delete(livroId);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO, { detail: livroId }));
}

const tamanhoDe = (r: Pick<RegistroDeCapa, 'extraida' | 'usuario'>) =>
  (r.extraida?.bytes.byteLength ?? 0) + (r.usuario?.bytes.byteLength ?? 0);

async function gravar(registro: Omit<RegistroDeCapa, 'tamanho' | 'usadoEm'>): Promise<void> {
  const db = await abrirBanco();
  const completo: RegistroDeCapa = { ...registro, tamanho: tamanhoDe(registro), usadoEm: Date.now() };
  const metas: MetaDeCapa[] = (await db.getAll('capas')).map((r) => ({
    id: r.livroId,
    tamanho: r.tamanho,
    usadoEm: r.usadoEm,
  }));
  const saem = capasQueSaem(metas, { id: completo.livroId, tamanho: completo.tamanho, usadoEm: completo.usadoEm });
  const tx = db.transaction('capas', 'readwrite');
  for (const id of saem) void tx.store.delete(id);
  void tx.store.put(completo);
  await tx.done;
  const ids = await carregarIndice();
  for (const id of saem) {
    ids.delete(id);
    avisar(id);
  }
  ids.add(completo.livroId);
  avisar(completo.livroId);
}

async function ler(livroId: string): Promise<RegistroDeCapa | undefined> {
  try {
    return await (await abrirBanco()).get('capas', livroId);
  } catch {
    return undefined;
  }
}

const emBlob = (i: Imagem) => new Blob([i.bytes], { type: i.tipo });

/* ── Reduzir ─────────────────────────────────────────────────────────────────────────────────── */

function canvasParaBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}

/**
 * Valida a imagem pelo CONTEÚDO (assinatura, tamanho, pixels, decodificação) e a reduz para 300 x 450 em
 * WebP (ou JPEG, onde o navegador não codifica WebP). `ErroDaCapa` com o motivo quando recusa.
 */
export async function reduzirParaCapa(origem: Blob, modo: ModoDoAjuste = 'preencher'): Promise<Blob> {
  const cabeca = new Uint8Array(await origem.slice(0, 16).arrayBuffer());
  const v = validarImagemDeOrigem(origem.size, cabeca);
  if (v.ok === false) throw new ErroDaCapa(v.motivo);
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(new Blob([origem], { type: v.tipo }));
  } catch {
    throw new ErroDaCapa('ilegivel');
  }
  try {
    if (!imagem.width || !imagem.height) throw new ErroDaCapa('ilegivel');
    if (imagem.width * imagem.height > TETO_DE_PIXELS) throw new ErroDaCapa('pixels');
    const canvas = document.createElement('canvas');
    canvas.width = CAPA_LARGURA;
    canvas.height = CAPA_ALTURA;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ErroDaCapa('ilegivel');
    const p = planoDeDesenho(imagem.width, imagem.height, modo);
    ctx.fillStyle = '#ece8df';
    ctx.fillRect(0, 0, CAPA_LARGURA, CAPA_ALTURA);
    ctx.drawImage(imagem, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
    let saida: Blob | null = null;
    for (const q of [0.8, 0.65, 0.5]) {
      saida = await canvasParaBlob(canvas, 'image/webp', q);
      if (saida?.type !== 'image/webp') saida = await canvasParaBlob(canvas, 'image/jpeg', q);
      if (saida && saida.size <= TETO_DA_CAPA_REDUZIDA) break;
    }
    if (!saida) throw new ErroDaCapa('ilegivel');
    return saida;
  } finally {
    imagem.close?.();
  }
}

/* ── Gravar e ler ────────────────────────────────────────────────────────────────────────────── */

async function imagemDe(blob: Blob): Promise<Imagem> {
  return { bytes: await blob.arrayBuffer(), tipo: blob.type };
}

/** "Trocar capa": a imagem JÁ reduzida (`reduzirParaCapa`) vira a capa deste livro neste aparelho. */
export async function guardarCapaDoUsuario(livroId: string, reduzida: Blob): Promise<boolean> {
  try {
    const antes = await ler(livroId);
    await gravar({ ...antes, livroId, usuario: await imagemDe(reduzida) });
    return true;
  } catch {
    return false;
  }
}

/** "Voltar à capa original": apaga só a escolhida pela pessoa. */
export async function voltarAoOriginal(livroId: string): Promise<void> {
  try {
    const antes = await ler(livroId);
    if (!antes?.usuario) return;
    const { usuario: _fora, ...resto } = antes;
    if (resto.extraida || resto.tentouExtrair) await gravar(resto);
    else await removerCapa(livroId);
  } catch {
    /* sem banco: não há o que voltar */
  }
}

/** Tira tudo deste livro (ele saiu de "Meus livros"). */
export async function removerCapa(livroId: string): Promise<void> {
  try {
    await (await abrirBanco()).delete('capas', livroId);
    (await carregarIndice()).delete(livroId);
    avisar(livroId);
  } catch {
    /* nada guardado */
  }
}

/** Guarda a capa tirada do arquivo (ou só marca que já tentou, se não havia). */
async function guardarExtraida(livroId: string, reduzida: Blob | null): Promise<void> {
  const antes = await ler(livroId);
  await gravar({
    ...antes,
    livroId,
    tentouExtrair: true,
    ...(reduzida ? { extraida: await imagemDe(reduzida) } : {}),
  });
}

/** Tira a capa de dentro do EPUB/PDF com o foliate. `null` = o livro não tem capa (ou o arquivo não abre). */
export async function extrairCapaDoArquivo(arquivo: Blob): Promise<Blob | null> {
  try {
    const { makeBook } = await import('../leitor/foliate/view.js');
    const livro = await makeBook(arquivo);
    try {
      const bruta = await livro.getCover?.();
      return bruta ? await reduzirParaCapa(bruta) : null;
    } finally {
      livro.destroy?.();
    }
  } catch {
    return null;
  }
}

/** Ainda falta tentar tirar a capa do arquivo? (Barato: não lê o livro.) */
export async function faltaTentarCapa(livroId: string): Promise<boolean> {
  return !(await ler(livroId))?.tentouExtrair;
}

const emAndamento = new Set<string>();

/**
 * Tira a capa do arquivo do livro trazido, UMA vez (guarda a tentativa). Silencioso: qualquer falha deixa o
 * livro com a capa tipográfica. Nunca sobrescreve a escolhida pela pessoa.
 */
export async function garantirCapaDoArquivo(livroId: string, arquivo: Blob | undefined): Promise<void> {
  if (!arquivo || emAndamento.has(livroId)) return;
  emAndamento.add(livroId);
  try {
    if ((await ler(livroId))?.tentouExtrair) return;
    await guardarExtraida(livroId, await extrairCapaDoArquivo(arquivo));
  } catch {
    /* sem banco ou sem capa: fica a tipográfica */
  } finally {
    emAndamento.delete(livroId);
  }
}

export interface CapaLocal {
  url: string;
  origem: OrigemDaCapa;
}

/** A capa deste livro neste aparelho (URL de objeto), ou `null`. */
export async function capaLocalDe(livroId: string): Promise<CapaLocal | null> {
  if (urls.has(livroId)) return urls.get(livroId) ?? null;
  try {
    if (!(await carregarIndice()).has(livroId)) {
      return null;
    }
  } catch {
    return null;
  }
  const r = await ler(livroId);
  const imagem = r?.usuario ?? r?.extraida;
  const achada = imagem
    ? { url: URL.createObjectURL(emBlob(imagem)), origem: r?.usuario ? ('usuario' as const) : ('arquivo' as const) }
    : null;
  const ja = urls.get(livroId);
  if (ja !== undefined) {
    /* Outra leitura chegou antes: usa a dela e descarta esta. */
    if (achada) URL.revokeObjectURL(achada.url);
    return ja;
  }
  urls.set(livroId, achada);
  if (r) {
    /* LRU: abrir conta como uso. Fora do caminho crítico e sem avisar ninguém. */
    void abrirBanco()
      .then((db) => db.put('capas', { ...r, usadoEm: Date.now() }))
      .catch(() => undefined);
  }
  return achada;
}

/** A capa local de um livro (se houver) e se a pessoa a escolheu. Atualiza quando ela é trocada ou removida. */
export function useCapaLocal(livroId: string | undefined): CapaLocal | null {
  const [capa, setCapa] = useState<CapaLocal | null>(null);
  useEffect(() => {
    if (!livroId) {
      setCapa(null);
      return;
    }
    let vivo = true;
    const carregar = () => void capaLocalDe(livroId).then((c) => vivo && setCapa(c));
    carregar();
    const aoMudar = (e: Event) => {
      if ((e as CustomEvent<string>).detail === livroId) carregar();
    };
    window.addEventListener(EVENTO, aoMudar);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO, aoMudar);
    };
  }, [livroId]);
  return capa;
}
