/**
 * O CACHE DO "AJUSTAR NÍVEL" NO APARELHO (openspec `leitura-assistida`, fatia D, tarefa D7). RETENÇÃO ZERO: o texto do livro e o
 * ajustado ficam SÓ aqui (IndexedDB `frasy-ajustes`); o servidor nunca guarda nada. A chave é `chaveDoAjuste` (hash do texto +
 * idioma + escopo + nível + hash das conhecidas), então repetir o mesmo ajuste não chama a rede nem gasta cota.
 *
 * Sem IndexedDB (navegação privada de alguns navegadores, teste), cai num mapa em memória: o cache é conveniência, nunca
 * requisito, e NADA aqui lança. O teto de `MAX_AJUSTES_GUARDADOS` apaga os mais antigos.
 */
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

import type { AjusteDeNivel } from '../../data/rotas/ajustarNivel';
import { EVENTO_DE_ARMAZENS_LIMPOS } from '../armazensDoAparelhoDaConta';

export const MAX_AJUSTES_GUARDADOS = 300;

interface Guardado {
  chave: string;
  valor: AjusteDeNivel;
  em: number;
}

interface Esquema extends DBSchema {
  ajustes: { key: string; value: Guardado; indexes: { em: number } };
}

const NOME = 'frasy-ajustes';
let conexao: Promise<IDBPDatabase<Esquema> | null> | null = null;
const memoria = new Map<string, Guardado>();

/* A conta saiu ou trocou: o banco foi esvaziado pela guarda (`armazensDoAparelhoDaConta`); a memória também. */
if (typeof window !== 'undefined') window.addEventListener(EVENTO_DE_ARMAZENS_LIMPOS, () => memoria.clear());

function abrir(): Promise<IDBPDatabase<Esquema> | null> {
  conexao ??= (async () => {
    try {
      if (typeof indexedDB === 'undefined') return null;
      return await openDB<Esquema>(NOME, 1, {
        upgrade(db) {
          db.createObjectStore('ajustes', { keyPath: 'chave' }).createIndex('em', 'em');
        },
      });
    } catch {
      return null;
    }
  })();
  return conexao;
}

/** O ajuste já feito para esta chave, ou `null`. */
export async function ajusteGuardado(chave: string): Promise<AjusteDeNivel | null> {
  try {
    const db = await abrir();
    const g = db ? await db.get('ajustes', chave) : memoria.get(chave);
    return g?.valor ?? null;
  } catch {
    return memoria.get(chave)?.valor ?? null;
  }
}

/** Guarda o ajuste e poda os mais antigos acima do teto. Nunca lança. */
export async function guardarAjuste(chave: string, valor: AjusteDeNivel): Promise<void> {
  const g: Guardado = { chave, valor, em: Date.now() };
  try {
    const db = await abrir();
    if (!db) {
      memoria.set(chave, g);
      while (memoria.size > MAX_AJUSTES_GUARDADOS) memoria.delete(memoria.keys().next().value as string);
      return;
    }
    await db.put('ajustes', g);
    const total = await db.count('ajustes');
    if (total > MAX_AJUSTES_GUARDADOS) {
      const tx = db.transaction('ajustes', 'readwrite');
      let sobra = total - MAX_AJUSTES_GUARDADOS;
      for (let c = await tx.store.index('em').openCursor(); c && sobra > 0; c = await c.continue()) {
        await c.delete();
        sobra--;
      }
      await tx.done;
    }
  } catch {
    memoria.set(chave, g);
  }
}

/** Apaga tudo (a pessoa pediu para limpar os dados do leitor) e esquece a conexão — também para os testes. */
export async function limparAjustesDoAparelho(): Promise<void> {
  memoria.clear();
  const c = conexao;
  conexao = null;
  try {
    const db = c ? await c : null;
    if (db) {
      await db.clear('ajustes');
      db.close();
    }
  } catch {
    /* sem banco, nada a limpar */
  }
}
