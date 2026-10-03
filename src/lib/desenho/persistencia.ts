/**
 * O DESENHO DE CADA SESSÃO, GUARDADO NO NAVEGADOR.
 *
 * IndexedDB quando há; `localStorage` (só os traços, sem o PNG) quando não há ou quando ele falha;
 * memória como último recurso. Cota cheia NÃO derruba nada: a gravação devolve `'cheio'` e a tela
 * avisa uma vez. O armazém é injetável (`fabrica`, `storage`) para os testes não dependerem do navegador.
 */
import type { Traco } from './tracos';

/** Um "quadro" de desenho: a camada transparente de uma página/tela. */
export interface Quadro {
  largura: number;
  altura: number;
  tracos: Traco[];
  /** `data:image/png;base64,…` — pode faltar no `localStorage` (a leitura refaz a partir dos traços). */
  png?: string;
}

export interface DesenhoGuardado {
  v: 1;
  quadros: Quadro[];
  atualizadoEm: number;
}

export type ResultadoDaGravacao = 'ok' | 'cheio' | 'indisponivel';

export interface ArmazemDeDesenhos {
  ler(sessaoId: string): Promise<DesenhoGuardado | undefined>;
  gravar(sessaoId: string, desenho: DesenhoGuardado): Promise<ResultadoDaGravacao>;
  apagar(sessaoId: string): Promise<void>;
}

const NOME_DO_BANCO = 'babel-desenhos';
const LOJA = 'sessoes';
export const PREFIXO_LS = 'babel.desenho.sessao:';

const ehCota = (e: unknown) =>
  !!e &&
  typeof e === 'object' &&
  ((e as { name?: string }).name === 'QuotaExceededError' || (e as { code?: number }).code === 22);

function pedido<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB: pedido falhou'));
  });
}

/** Termina quando a transação termina (é aí que a cota cheia aparece de verdade). */
function transacao(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB: transação falhou'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB: transação cancelada'));
  });
}

function validar(o: unknown): DesenhoGuardado | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const d = o as Partial<DesenhoGuardado>;
  if (!Array.isArray(d.quadros)) return undefined;
  return {
    v: 1,
    atualizadoEm: typeof d.atualizadoEm === 'number' ? d.atualizadoEm : 0,
    quadros: d.quadros.filter(Boolean),
  };
}

export function criarArmazemDeDesenhos(opts: {
  fabrica?: IDBFactory;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}): ArmazemDeDesenhos {
  const memoria = new Map<string, DesenhoGuardado>();
  let banco: Promise<IDBDatabase> | null = null;
  let degradado = !opts.fabrica;

  const abrir = (): Promise<IDBDatabase> => {
    if (!banco) {
      banco = new Promise<IDBDatabase>((resolve, reject) => {
        const r = opts.fabrica!.open(NOME_DO_BANCO, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error ?? new Error('IndexedDB: open falhou'));
        r.onblocked = () => reject(new Error('IndexedDB: open bloqueado por outra aba'));
      });
    }
    return banco;
  };

  const lerReserva = (id: string): DesenhoGuardado | undefined => {
    try {
      const texto = opts.storage?.getItem(PREFIXO_LS + id);
      if (texto) return validar(JSON.parse(texto));
    } catch {
      /* sem armazenamento */
    }
    return memoria.get(id);
  };

  const gravarReserva = (id: string, d: DesenhoGuardado): ResultadoDaGravacao => {
    memoria.set(id, d);
    if (!opts.storage) return 'indisponivel';
    try {
      // Sem o PNG: ele é refeito a partir dos traços, e o `localStorage` é pequeno.
      const leve: DesenhoGuardado = { ...d, quadros: d.quadros.map(({ png: _png, ...q }) => q) };
      opts.storage.setItem(PREFIXO_LS + id, JSON.stringify(leve));
      return 'ok';
    } catch (e) {
      return ehCota(e) ? 'cheio' : 'indisponivel';
    }
  };

  return {
    async ler(id) {
      if (!degradado) {
        try {
          const db = await abrir();
          const v = await pedido(db.transaction(LOJA, 'readonly').objectStore(LOJA).get(id));
          return validar(v) ?? lerReserva(id);
        } catch {
          degradado = true;
        }
      }
      return lerReserva(id);
    },
    async gravar(id, d) {
      if (!degradado) {
        try {
          const db = await abrir();
          const tx = db.transaction(LOJA, 'readwrite');
          tx.objectStore(LOJA).put(d, id);
          await transacao(tx);
          return 'ok';
        } catch (e) {
          if (ehCota(e)) return 'cheio';
          degradado = true;
        }
      }
      return gravarReserva(id, d);
    },
    async apagar(id) {
      memoria.delete(id);
      try {
        opts.storage?.removeItem(PREFIXO_LS + id);
      } catch {
        /* nada a fazer */
      }
      if (!degradado) {
        try {
          const db = await abrir();
          const tx = db.transaction(LOJA, 'readwrite');
          tx.objectStore(LOJA).delete(id);
          await transacao(tx);
        } catch {
          degradado = true;
        }
      }
    },
  };
}

let padrao: ArmazemDeDesenhos | null = null;

/** O armazém da página: IndexedDB quando há, `localStorage` e memória como reserva. */
export function armazemDeDesenhos(): ArmazemDeDesenhos {
  if (!padrao) {
    const storage = (() => {
      try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
      } catch {
        return null;
      }
    })();
    padrao = criarArmazemDeDesenhos({
      fabrica: typeof indexedDB !== 'undefined' ? indexedDB : undefined,
      storage,
    });
  }
  return padrao;
}

/** Só para os testes: troca (ou zera) o armazém da página. */
export function trocarArmazemDeDesenhos(a: ArmazemDeDesenhos | null): void {
  padrao = a;
}

/* ───────────────────────── o que ainda não foi salvo ───────────────────────── */

const salvadores = new Map<string, Set<() => Promise<void>>>();

/**
 * A tela de desenho registra aqui o jeito de salvar o traço recente. Quem vai ler os desenhos
 * (a exportação) chama `salvarPendentes` antes, para não perder o que está no debounce.
 */
export function registrarSalvador(sessaoId: string, salvar: () => Promise<void>): () => void {
  let s = salvadores.get(sessaoId);
  if (!s) salvadores.set(sessaoId, (s = new Set()));
  s.add(salvar);
  return () => {
    s.delete(salvar);
    if (s.size === 0) salvadores.delete(sessaoId);
  };
}

export async function salvarPendentes(sessaoId: string): Promise<void> {
  const s = salvadores.get(sessaoId);
  if (!s) return;
  await Promise.all([...s].map((f) => f().catch(() => undefined)));
}
