/**
 * ARMAZÉM LOCAL POR CONTA — a peça comum de tudo o que a pessoa guarda SÓ NESTE APARELHO (IndexedDB e localStorage)
 * e que é dela, não do aparelho (revisão de segurança: num aparelho compartilhado, a conta B não pode ver o que a
 * conta A deixou). Preferências do aparelho (tema, idioma da interface, flags de dispositivo) NÃO passam por aqui.
 *
 * A regra, em quatro partes:
 *  1. MARCAR: cada registro leva o id do DONO (`donoDaIdentidade`: id da conta, `anonimo` ou `selfhost`);
 *  2. DESCARTAR NA LEITURA: o que é de outro dono (ou de antes desta regra, sem dono) não se mostra e sai na hora;
 *  3. GUARDA CEDO: o ouvinte de troca de identidade/dono nasce no BOOT (`iniciarGuardaDosArmazensLocais`, em `main.tsx`),
 *     não no primeiro uso do armazém. Sem dono conhecido (identidade carregando) o armazém não lê nem grava;
 *  4. APAGAR: ao sair/trocar de conta (`apagarTodosOsArmazensDaConta`), em "esquecer este navegador" (`limparTudo`) e
 *     ao excluir a conta com sucesso (`excluirConta`) — os dois últimos destroem (`destruirTodosOsArmazensDaConta`).
 *
 * Cada armazém se REGISTRA aqui ao ser importado (`registrarArmazemPorConta`); a guarda trata o conjunto. Nada aqui fala
 * com a rede.
 */
import { aoMudarDono, aoMudarIdentidade, donoDaIdentidade } from './identidade';

export interface ArmazemPorConta {
  /** Nome único (idempotência do registro e diagnóstico). */
  nome: string;
  /** Apaga tudo o que o armazém guarda (o armazém continua usável). */
  apagarTudo(): Promise<void> | void;
  /** Apaga só o que não é do dono atual (ou não tem dono). Sem dono conhecido, não mexe em nada. */
  purgarDeOutros(): Promise<void> | void;
  /** Apaga o banco/a chave inteira (esquecer o navegador, excluir a conta). */
  destruir(): Promise<void> | void;
}

const registro = new Map<string, ArmazemPorConta>();

export function registrarArmazemPorConta(a: ArmazemPorConta): void {
  registro.set(a.nome, a);
}

/** Os nomes registrados (para testes e diagnóstico). */
export function armazensPorContaRegistrados(): string[] {
  return [...registro.keys()];
}

const seguro = async (f: () => Promise<void> | void): Promise<void> => {
  try {
    await f();
  } catch {
    /* um armazém com defeito não impede os outros de apagar */
  }
};

export async function apagarTodosOsArmazensDaConta(): Promise<void> {
  await Promise.all([...registro.values()].map((a) => seguro(() => a.apagarTudo())));
}

export async function purgarTodosOsArmazensDeOutros(): Promise<void> {
  await Promise.all([...registro.values()].map((a) => seguro(() => a.purgarDeOutros())));
}

export async function destruirTodosOsArmazensDaConta(): Promise<void> {
  await Promise.all([...registro.values()].map((a) => seguro(() => a.destruir())));
}

let desfazer: Array<() => void> = [];

/**
 * Registra cedo (idempotente) o que apaga os armazéns quando a identidade ou a conta muda. Não abre nenhum banco.
 * Chamada em `main.tsx`; também é chamada pelos armazéns ao serem criados (rede de segurança).
 */
export function iniciarGuardaDosArmazensLocais(): void {
  if (desfazer.length || typeof window === 'undefined') return;
  /* Conta -> sem conta (sair) e qualquer troca de estado depois de carregado. */
  desfazer.push(
    aoMudarIdentidade((depois, antes) => {
      if (antes !== 'carregando' && antes !== depois) void apagarTodosOsArmazensDaConta();
      else void purgarTodosOsArmazensDeOutros();
    }),
  );
  /* Conta -> conta, sair, e a primeira conta conhecida depois de uma recarga (aí só sai o que não é dela). */
  desfazer.push(
    aoMudarDono((_depois, antes) => {
      if (antes !== null) void apagarTodosOsArmazensDaConta();
      else void purgarTodosOsArmazensDeOutros();
    }),
  );
}

/** Só para testes: tira os ouvintes (o registro dos armazéns fica). */
export function _reiniciarGuardaDosArmazensLocais(): void {
  for (const d of desfazer) d();
  desfazer = [];
}

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
        const db = await abrir();
        if (db) await pedido(loja(db, 'readwrite').clear());
      } catch {
        /* nada guardado, nada a apagar */
      }
    },
    async purgarDeOutros() {
      try {
        const dono = donoAtual();
        if (!dono) return;
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

/* ─────────────── localStorage: uma chave cujo valor leva o dono ─────────────── */

export interface ChaveLocalPorConta<T> {
  /** O valor do dono atual; `null` se não há, se é de outro dono (some na hora) ou se é de antes da regra. */
  ler(): T | null;
  /** Guarda para o dono atual. `false` sem dono conhecido ou sem armazenamento. */
  gravar(valor: T): boolean;
  apagar(): void;
}

/**
 * Uma chave do `localStorage` (ou do `Storage` dado) que é DA CONTA. O valor guardado é `{ dono, valor }`; um valor
 * antigo (sem esse formato) não é de ninguém e sai na primeira leitura. `extras` são outras chaves do mesmo conjunto,
 * apagadas junto. `nome` registra a chave na guarda.
 */
export function criarChaveLocalPorConta<T>(
  chave: string,
  o: {
    nome?: string;
    storage?: () => Storage;
    dono?: () => string | null;
    extras?: string[];
    /**
     * O que o visitante SEM conta (`anonimo`) deixou passa para a conta que entra (a captura que a tela de login
     * interrompeu volta depois do login). O que é de uma CONTA nunca passa para outra, e sair apaga.
     */
    adotarDoAnonimo?: boolean;
  } = {},
): ChaveLocalPorConta<T> {
  const armazem = o.storage ?? (() => localStorage);
  const donoAtual = o.dono ?? (() => donoDaIdentidade());
  const extras = o.extras ?? [];
  const adota = o.adotarDoAnonimo ?? false;
  const doVisitante = (j: { dono?: unknown } | null, dono: string) =>
    adota && j?.dono === 'anonimo' && dono !== 'anonimo' && dono !== 'selfhost';

  const apagar = () => {
    try {
      const s = armazem();
      s.removeItem(chave);
      for (const e of extras) s.removeItem(e);
    } catch {
      /* sem armazenamento: não há o que apagar */
    }
  };
  const lerBruto = (): { dono?: unknown; valor?: unknown } | null => {
    try {
      const bruto = armazem().getItem(chave);
      if (bruto === null) return null;
      const j = JSON.parse(bruto) as unknown;
      return j && typeof j === 'object' && !Array.isArray(j) ? (j as { dono?: unknown; valor?: unknown }) : {};
    } catch {
      return {};
    }
  };

  const c: ChaveLocalPorConta<T> = {
    ler() {
      const dono = donoAtual();
      if (!dono) return null;
      const j = lerBruto();
      if (j === null) return null;
      if ((j.dono !== dono && !doVisitante(j, dono)) || !('valor' in j)) {
        apagar();
        return null;
      }
      return j.valor as T;
    },
    gravar(valor) {
      const dono = donoAtual();
      if (!dono) return false;
      try {
        armazem().setItem(chave, JSON.stringify({ dono, valor }));
        return true;
      } catch {
        return false;
      }
    },
    apagar,
  };
  if (o.nome)
    registrarArmazemPorConta({
      nome: o.nome,
      /* Quem adota o visitante guarda o que é dele ao entrar numa conta: só sai o que é de uma conta. */
      apagarTudo: () => {
        if (adota && lerBruto()?.dono === 'anonimo') return;
        apagar();
      },
      purgarDeOutros: () => {
        const dono = donoAtual();
        if (!dono) return;
        const j = lerBruto();
        if (j !== null && j.dono !== dono && !doVisitante(j, dono)) apagar();
      },
      destruir: apagar,
    });
  return c;
}
