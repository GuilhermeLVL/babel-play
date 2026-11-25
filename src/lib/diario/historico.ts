/**
 * O HISTÓRICO LOCAL DO DIÁRIO (openspec `diario-com-correcao-que-vira-cartao`, tarefa 3.3): as entradas, os retornos e os
 * cartões criados, SÓ NESTE APARELHO, no IndexedDB, no molde de `lib/cartoes/audioDoCartao/armazem.ts`. NADA SOBE AO
 * SERVIDOR: este módulo não fala com a rede (retenção zero; o servidor só guarda o contador de uso).
 *
 * O que vale:
 *  · "Apagar o diário" é `apagarTudo`; trocar de conta neste aparelho apaga tudo (`aoMudarIdentidade`), junto com o
 *    rascunho. Os cartões já criados ficam: moram no baralho, são da pessoa;
 *  · sem IndexedDB (navegação privada, banco bloqueado) gravar devolve `false` e a tela segue sem histórico, com o aviso;
 *  · teto de `TETO_DE_ENTRADAS`: ao passar, a mais antiga sai;
 *  · o `.txt` do diário é montado aqui, no navegador, sem rede (`diarioEmTxt`).
 */
import type { RetornoDaEscrita } from '../../data/apiDoEstudo';
import { aoMudarIdentidade } from '../identidade';

export interface EntradaDoDiario {
  id: string;
  /** Quando foi escrita (ms). */
  em: number;
  idioma: string;
  texto: string;
  /** O retorno da IA, quando houve (o servidor nunca o guarda). */
  retorno: RetornoDaEscrita | null;
  /** Os trechos dos pontos que viraram cartão. */
  cartoes: string[];
  /** Os trechos que a pessoa marcou "Isto estava certo" (o contador local de falso positivo). */
  descartados: string[];
}

/** As últimas 200 entradas (mais do que isso é um livro, não um diário de aprender idioma). */
export const TETO_DE_ENTRADAS = 200;

const BANCO = 'babel-diario';
const LOJA = 'entradas';

export interface HistoricoDoDiario {
  /** Grava (troca a de mesmo `id`). Devolve se gravou. */
  gravar(e: EntradaDoDiario): Promise<boolean>;
  /** Da mais nova à mais antiga. */
  listar(): Promise<EntradaDoDiario[]>;
  apagarTudo(): Promise<void>;
}

const pedido = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, falha) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });

export function criarHistoricoDoDiario(o: { fabrica?: IDBFactory | null; teto?: number } = {}): HistoricoDoDiario {
  const fabrica = o.fabrica === undefined ? (globalThis.indexedDB ?? null) : o.fabrica;
  const teto = o.teto ?? TETO_DE_ENTRADAS;
  let aberto: Promise<IDBDatabase | null> | null = null;

  const abrirBanco = (): Promise<IDBDatabase | null> => {
    if (!fabrica) return Promise.resolve(null);
    aberto ??= new Promise<IDBDatabase | null>((ok) => {
      try {
        const r = fabrica.open(BANCO, 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore(LOJA, { keyPath: 'id' });
        };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ok(null);
        r.onblocked = () => ok(null);
      } catch {
        ok(null);
      }
    });
    return aberto;
  };

  const todas = async (db: IDBDatabase): Promise<EntradaDoDiario[]> =>
    (await pedido(db.transaction(LOJA, 'readonly').objectStore(LOJA).getAll())) as EntradaDoDiario[];

  return {
    async gravar(e) {
      try {
        if (!e.id || !e.texto) return false;
        const db = await abrirBanco();
        if (!db) return false;
        const outras = (await todas(db)).filter((x) => x.id !== e.id).sort((a, b) => a.em - b.em);
        const loja = db.transaction(LOJA, 'readwrite').objectStore(LOJA);
        for (let i = 0; i < outras.length - (teto - 1); i++) void loja.delete(outras[i].id);
        await pedido(loja.put(e));
        return true;
      } catch {
        return false;
      }
    },
    async listar() {
      try {
        const db = await abrirBanco();
        if (!db) return [];
        return (await todas(db)).sort((a, b) => b.em - a.em);
      } catch {
        return [];
      }
    },
    async apagarTudo() {
      try {
        const db = await abrirBanco();
        if (!db) return;
        await pedido(db.transaction(LOJA, 'readwrite').objectStore(LOJA).clear());
      } catch {
        /* nada guardado, nada a apagar */
      }
    },
  };
}

/* ─────────────── o rascunho (localStorage; some junto com o histórico) ─────────────── */

const CHAVE_DO_RASCUNHO = 'frasy.diario.rascunho';
const CHAVE_DO_NIVEL = 'frasy.diario.nivel';

/* Toda leitura e escrita passa por `try/catch` (janela privada, armazenamento bloqueado): sem armazenamento, a tela
   funciona sem lembrar. */
function lerLocal(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function salvarLocal(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}
function removerLocal(chave: string): void {
  try {
    localStorage.removeItem(chave);
  } catch {
    /* idem */
  }
}

export const lerRascunhoDoDiario = (): string => lerLocal(CHAVE_DO_RASCUNHO) ?? '';
export const gravarRascunhoDoDiario = (texto: string): void => {
  if (texto) salvarLocal(CHAVE_DO_RASCUNHO, texto);
  else removerLocal(CHAVE_DO_RASCUNHO);
};
export const apagarRascunhoDoDiario = (): void => removerLocal(CHAVE_DO_RASCUNHO);

export type NivelDoDiario = 'A1' | 'A2' | 'B1';
export function lerNivelDoDiario(): NivelDoDiario {
  const v = lerLocal(CHAVE_DO_NIVEL);
  return v === 'A1' || v === 'B1' ? v : 'A2';
}
export const gravarNivelDoDiario = (n: NivelDoDiario): void => salvarLocal(CHAVE_DO_NIVEL, n);

let doAparelho: HistoricoDoDiario | null = null;

/** O histórico deste aparelho. Trocar de conta apaga tudo (o diário de uma pessoa não espera a próxima conta). */
export function historicoDoDiario(): HistoricoDoDiario {
  if (!doAparelho) {
    const historico = criarHistoricoDoDiario();
    doAparelho = historico;
    if (typeof window !== 'undefined')
      aoMudarIdentidade((_depois, antes) => {
        if (antes !== 'carregando') {
          void historico.apagarTudo();
          apagarRascunhoDoDiario();
        }
      });
  }
  return doAparelho;
}

/** "Apagar o diário": o histórico e o rascunho. Os cartões criados ficam no baralho. */
export async function apagarODiario(): Promise<void> {
  await historicoDoDiario().apagarTudo();
  apagarRascunhoDoDiario();
}

/** O diário em texto simples, montado no navegador (sem rede): data, texto, e as correções do retorno. */
export function diarioEmTxt(entradas: readonly EntradaDoDiario[], formatarData: (ms: number) => string): string {
  return [...entradas]
    .sort((a, b) => a.em - b.em)
    .map((e) => {
      const linhas = [formatarData(e.em), '', e.texto];
      const pontos = e.retorno?.pontos.filter((p) => !e.descartados.includes(p.trecho)) ?? [];
      if (pontos.length) {
        linhas.push('', ...pontos.map((p) => `- ${p.trecho} -> ${p.exemplo}: ${p.dica}`));
      }
      return linhas.join('\n');
    })
    .join('\n\n----\n\n')
    .concat('\n');
}
