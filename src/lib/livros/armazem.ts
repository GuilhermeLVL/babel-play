/**
 * A ESTANTE DO APARELHO (IndexedDB `frasy-livros`): os arquivos dos livros e as anotações locais.
 *
 *  · `livros`: o EPUB/PDF/TXT trazido pela pessoa (o arquivo NUNCA vai ao servidor) e a cópia do livro do
 *    catálogo baixada do navegador (Standard Ebooks, Wikisource, cópia curada no R2) — para reabrir sem rede
 *    e para "continuar de onde parei" depois de recarregar a página;
 *  · `anotacoes`: as anotações do leitor, todas, com a marca `pendente` das que ainda não subiram. Sem conta
 *    elas só existem aqui (a tela avisa e oferece o backup por arquivo); com conta, `sincronizar.ts` as leva.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { AnotacaoDeLeitura } from '../../core/leitura/anotacao';

export type FormatoDoLivro = 'epub' | 'pdf' | 'txt';
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
}

export interface AnotacaoLocal extends AnotacaoDeLeitura {
  /** 1 = ainda não subiu para o servidor (número, e não booleano, para virar índice do IndexedDB). */
  pendente: 0 | 1;
}

/**
 * COMO O LIVRO VAI PARA O DISCO: os bytes (`ArrayBuffer`) e o tipo, e não o `Blob`. O WebKit (Safari) recusa
 * `Blob` no IndexedDB em vários cenários ("Error preparing Blob/File data to be stored in object store") —
 * e o dono lê no Safari. A estante devolve sempre um `Blob` para quem lê.
 */
type LivroNoDisco = Omit<LivroGuardado, 'arquivo'> & { bytes: ArrayBuffer; tipo: string };

const paraODisco = async ({ arquivo, ...resto }: LivroGuardado): Promise<LivroNoDisco> => ({
  ...resto,
  bytes: await arquivo.arrayBuffer(),
  tipo: arquivo.type,
});
const doDisco = (l: LivroNoDisco | undefined): LivroGuardado | undefined => {
  if (!l) return undefined;
  const { bytes, tipo, ...resto } = l;
  return { ...resto, arquivo: new Blob([bytes], tipo ? { type: tipo } : undefined) };
};

interface EsquemaDaEstante extends DBSchema {
  livros: { key: string; value: LivroNoDisco; indexes: { abertoEm: number } };
  anotacoes: { key: string; value: AnotacaoLocal; indexes: { livroId: string; pendente: number } };
  estado: { key: string; value: { chave: string; valor: number } };
}

const NOME = 'frasy-livros';
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
  async guardarLivro(l: LivroGuardado): Promise<void> {
    const registro = await paraODisco(l);
    await (await abrir()).put('livros', registro);
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

  /** Marcas de sincronização (o `agora` do servidor na última leitura de cada livro). */
  async marca(chave: string): Promise<number | undefined> {
    return (await (await abrir()).get('estado', chave))?.valor;
  },
  async gravarMarca(chave: string, valor: number): Promise<void> {
    await (await abrir()).put('estado', { chave, valor });
  },
};
