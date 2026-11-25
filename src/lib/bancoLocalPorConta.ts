/**
 * O BANCO POR CONTA: um banco IndexedDB com uma loja cujas linhas levam `dono` (peça de `armazemLocalPorConta`, em arquivo
 * à parte para os armazéns que só usam o localStorage não carregarem o IndexedDB no JS inicial).
 */
import { bancoExiste, registrarArmazemPorConta } from './armazemLocalPorConta';
import { donoDaIdentidade } from './identidade';

/* ─────────────── IndexedDB: um banco com uma loja cujas linhas levam `dono` ─────────────── */

const pedido = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

export interface BancoPorConta<L extends { dono?: string }> {
  /** O dono de agora (`null` = ainda não se sabe: não ler nem gravar). */
  dono(): string | null;
  /** Abre (uma vez) o banco; `null` sem IndexedDB, bloqueado ou com erro. */
  abrir(): Promise<IDBDatabase | null>;
  loja(db: IDBDatabase, modo: IDBTransactionMode): IDBObjectStore;
  /** Todas as linhas; as que não são de `dono` saem do banco e não voltam na lista. */
  soDoDono(db: IDBDatabase, dono: string): Promise<L[]>;
  apagarTudo(): Promise<void>;
  purgarDeOutros(): Promise<void>;
  destruir(): Promise<void>;
}

export function criarBancoPorConta<L extends { dono?: string }>(o: {
  banco: string;
  loja: string;
  /** O `keyPath` da loja (para apagar a linha alheia). */
  chave: keyof L & string;
  /** Cria índices (ou o que mais a loja precisar) no `onupgradeneeded`. */
  aoCriar?: (loja: IDBObjectStore) => void;
  fabrica?: IDBFactory | null;
  dono?: () => string | null;
  /** Se informado, registra o armazém na guarda com este nome. */
  registrarComo?: string;
}): BancoPorConta<L> {
  const fabrica = o.fabrica === undefined ? (globalThis.indexedDB ?? null) : o.fabrica;
  const donoAtual = o.dono ?? (() => donoDaIdentidade());
  let aberto: Promise<IDBDatabase | null> | null = null;

  const abrir = (): Promise<IDBDatabase | null> => {
    if (!fabrica) return Promise.resolve(null);
    aberto ??= new Promise<IDBDatabase | null>((ok) => {
      try {
        const r = fabrica.open(o.banco, 1);
        r.onupgradeneeded = () => {
          const loja = r.result.createObjectStore(o.loja, { keyPath: o.chave });
          o.aoCriar?.(loja);
        };
        r.onsuccess = () => {
          /* Outra aba que apague o banco não fica esperando esta conexão. */
          r.result.onversionchange = () => {
            r.result.close();
            aberto = null;
          };
          ok(r.result);
        };
        r.onerror = () => ok(null);
        r.onblocked = () => ok(null);
      } catch {
        ok(null);
      }
    });
    return aberto;
  };

  const loja = (db: IDBDatabase, modo: IDBTransactionMode) => db.transaction(o.loja, modo).objectStore(o.loja);

  const soDoDono = async (db: IDBDatabase, dono: string): Promise<L[]> => {
    const linhas = (await pedido(loja(db, 'readonly').getAll())) as L[];
    const alheias = linhas.filter((l) => l.dono !== dono);
    if (alheias.length) {
      const s = loja(db, 'readwrite');
      for (const l of alheias) void s.delete(l[o.chave] as IDBValidKey);
    }
    return linhas.filter((l) => l.dono === dono);
  };

  const b: BancoPorConta<L> = {
    dono: donoAtual,
    abrir,
    loja,
    soDoDono,
    async apagarTudo() {
      try {
        if (!(await bancoExiste(fabrica, o.banco))) return;
        const db = await abrir();
        if (db) await pedido(loja(db, 'readwrite').clear());
      } catch {
        /* nada guardado, nada a apagar */
      }
    },
    async purgarDeOutros() {
      try {
        const dono = donoAtual();
        if (!dono || !(await bancoExiste(fabrica, o.banco))) return;
        const db = await abrir();
        if (db) await soDoDono(db, dono);
      } catch {
        /* idem */
      }
    },
    async destruir() {
      try {
        const db = await abrir();
        db?.close();
        aberto = null;
        if (!fabrica) return;
        await new Promise<void>((ok) => {
          const r = fabrica.deleteDatabase(o.banco);
          r.onsuccess = () => ok();
          r.onerror = () => ok();
          r.onblocked = () => ok();
        });
      } catch {
        /* idem */
      }
    },
  };
  if (o.registrarComo)
    registrarArmazemPorConta({
      nome: o.registrarComo,
      apagarTudo: b.apagarTudo,
      purgarDeOutros: b.purgarDeOutros,
      destruir: b.destruir,
    });
  return b;
}
