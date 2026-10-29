/**
 * A ESTANTE DO APARELHO (IndexedDB `frasy-leitor`): os arquivos dos livros e as anotações locais. Banco
 * PRÓPRIO: o `frasy-livros` é o de "Meus livros" da L1 (`meusLivros.ts`), com outro esquema e outra versão —
 * dividir o nome fazia um dos dois falhar com `VersionError`.
 *
 *  · `livros`: o EPUB/PDF/TXT trazido pela pessoa (o arquivo NUNCA vai ao servidor) e a cópia do livro do
 *    catálogo baixada do navegador (Standard Ebooks, Wikisource, cópia curada no R2) — para reabrir sem rede
 *    e para "continuar de onde parei" depois de recarregar a página;
 *  · `anotacoes`: as anotações do leitor, todas, com a marca `pendente` das que ainda não subiram. Sem conta
 *    elas só existem aqui (a tela avisa e oferece o backup por arquivo); com conta, `sincronizar.ts` as leva.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { AnotacaoDeLeitura } from '../../core/leitura/anotacao';
import type { FormatoDoMotor } from '../../core/livros/formatos';

export type FormatoDoLivro = FormatoDoMotor | 'txt';
export type OrigemDoLivro = 'usuario' | 'catalogo' | 'sessao';

export interface LivroGuardado {
  livroId: string;
  titulo: string;
  autor?: string;
  idioma?: string;
  formato: FormatoDoLivro;
  origem: OrigemDoLivro;
  /** Crédito da fonte ("Standard Ebooks", "Wikisource", "Texto de domínio público obtido do Project Gutenberg"). */
  credito?: string;
  /** Domínio público? Só os do catálogo (o filtro legal da L1 decide) — é o que libera baixar o texto. */
  dominioPublico?: boolean;
  arquivo: Blob;
  nomeDoArquivo: string;
  adicionadoEm: number;
  abertoEm: number;
  /**
   * O arquivo NÃO está aqui: é o de "Meus livros" (L1, banco `frasy-livros`) com este id. Cada arquivo da pessoa
   * fica guardado UMA vez; quem lê resolve a referência (`fontesDoLivro.ts`). `arquivo` vem vazio.
   */
  refMeuLivro?: string;
}

/**
 * O TETO DA ESTANTE: livros e bytes guardados neste aparelho. Passou, sai o aberto há mais tempo (LRU) — e a
 * tela diz quais saíram (`consumirRemovidosDaEstante`). As anotações ficam (são pequenas e sincronizam).
 */
export const TETO_DA_ESTANTE = { livros: 20, bytes: 300 * 1024 * 1024 } as const;

export interface AnotacaoLocal extends AnotacaoDeLeitura {
  /** 1 = ainda não subiu para o servidor (número, e não booleano, para virar índice do IndexedDB). */
  pendente: 0 | 1;
}

/**
 * COMO O LIVRO VAI PARA O DISCO: os bytes (`ArrayBuffer`) e o tipo, e não o `Blob`. O WebKit (Safari) recusa
 * `Blob` no IndexedDB em vários cenários ("Error preparing Blob/File data to be stored in object store") —
 * e o dono lê no Safari. A estante devolve sempre um `Blob` para quem lê.
 */
type LivroNoDisco = Omit<LivroGuardado, 'arquivo'> & { bytes: ArrayBuffer; tipo: string; tamanho?: number };

const paraODisco = async ({ arquivo, ...resto }: LivroGuardado): Promise<LivroNoDisco> => {
  const bytes = resto.refMeuLivro ? new ArrayBuffer(0) : await arquivo.arrayBuffer();
  return { ...resto, bytes, tipo: arquivo.type, tamanho: bytes.byteLength };
};

let removidos: string[] = [];
/** Os títulos que o teto tirou da estante desde a última consulta (para a tela dizer, uma vez). */
export function consumirRemovidosDaEstante(): string[] {
  const r = removidos;
  removidos = [];
  return r;
}
const doDisco = (l: LivroNoDisco | undefined): LivroGuardado | undefined => {
  if (!l) return undefined;
  const { bytes, tipo, ...resto } = l;
  return { ...resto, arquivo: new Blob([bytes], tipo ? { type: tipo } : undefined) };
};

interface EsquemaDaEstante extends DBSchema {
  livros: { key: string; value: LivroNoDisco; indexes: { abertoEm: number } };
  anotacoes: { key: string; value: AnotacaoLocal; indexes: { livroId: string; pendente: number } };
  estado: { key: string; value: { chave: string; valor: number | string } };
}

const NOME = 'frasy-leitor';
let conexao: Promise<IDBPDatabase<EsquemaDaEstante>> | null = null;

function abrir() {
  return (conexao ??= openDB<EsquemaDaEstante>(NOME, 1, {
    upgrade(db) {
      const livros = db.createObjectStore('livros', { keyPath: 'livroId' });
      livros.createIndex('abertoEm', 'abertoEm');
      const anot = db.createObjectStore('anotacoes', { keyPath: 'id' });
      anot.createIndex('livroId', 'livroId');
      anot.createIndex('pendente', 'pendente');
      db.createObjectStore('estado', { keyPath: 'chave' });
    },
  }));
}

/** Para os testes: fecha e esquece a conexão (para o banco poder ser apagado entre casos). */
export async function esquecerConexaoDaEstante(): Promise<void> {
  const c = conexao;
  conexao = null;
  if (c) (await c).close();
}

export const estante = {
  /**
   * Guarda o livro e, se passar do teto (`TETO_DA_ESTANTE`), tira os abertos há mais tempo. Devolve os títulos
   * que saíram (também em `consumirRemovidosDaEstante`). `teto` é injetável só para o teste.
   */
  async guardarLivro(l: LivroGuardado, teto: { livros: number; bytes: number } = TETO_DA_ESTANTE): Promise<string[]> {
    const registro = await paraODisco(l);
    const db = await abrir();
    const tx = db.transaction('livros', 'readwrite');
    const outros: Array<{ livroId: string; titulo: string; abertoEm: number; tamanho: number }> = [];
    for (let c = await tx.store.index('abertoEm').openCursor(); c; c = await c.continue()) {
      const v = c.value;
      if (v.livroId === l.livroId) continue;
      outros.push({
        livroId: v.livroId,
        titulo: v.titulo,
        abertoEm: v.abertoEm,
        tamanho: v.tamanho ?? v.bytes?.byteLength ?? 0,
      });
    }
    let livros = outros.length + 1;
    let bytes = outros.reduce((s, o) => s + o.tamanho, 0) + (registro.tamanho ?? 0);
    const sairam: string[] = [];
    for (const o of outros) {
      if (livros <= teto.livros && bytes <= teto.bytes) break;
      await tx.store.delete(o.livroId);
      sairam.push(o.titulo);
      livros--;
      bytes -= o.tamanho;
    }
    await tx.store.put(registro);
    await tx.done;
    removidos.push(...sairam);
    return sairam;
  },
  async livro(livroId: string): Promise<LivroGuardado | undefined> {
    return doDisco(await (await abrir()).get('livros', livroId));
  },
  async marcarAberto(livroId: string, agora = Date.now()): Promise<void> {
    const db = await abrir();
    const l = await db.get('livros', livroId);
    if (l) await db.put('livros', { ...l, abertoEm: agora });
  },
  /** Os livros do aparelho, do aberto por último ao mais antigo. */
  async livros(): Promise<LivroGuardado[]> {
    return (await (await abrir()).getAllFromIndex('livros', 'abertoEm')).reverse().map((l) => doDisco(l)!);
  },
  async apagarLivro(livroId: string): Promise<void> {
    await (await abrir()).delete('livros', livroId);
  },

  async anotacoes(livroId: string): Promise<AnotacaoLocal[]> {
    return (await abrir()).getAllFromIndex('anotacoes', 'livroId', livroId);
  },
  async gravarAnotacoes(lista: readonly AnotacaoLocal[]): Promise<void> {
    const tx = (await abrir()).transaction('anotacoes', 'readwrite');
    for (const a of lista) await tx.store.put(a);
    await tx.done;
  },
  async pendentes(): Promise<AnotacaoLocal[]> {
    return (await abrir()).getAllFromIndex('anotacoes', 'pendente', 1);
  },

  /** Marcas de sincronização (o cursor do servidor, `<sincronizado_em>:<id>`, da última leitura de cada livro). */
  async marca(chave: string): Promise<number | string | undefined> {
    return (await (await abrir()).get('estado', chave))?.valor;
  },
  async gravarMarca(chave: string, valor: number | string): Promise<void> {
    await (await abrir()).put('estado', { chave, valor });
  },
};
