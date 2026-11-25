/**
 * O HISTÓRICO LOCAL DO DIÁRIO (openspec `diario-com-correcao-que-vira-cartao`, tarefa 3.3): as entradas, os retornos e os
 * cartões criados, SÓ NESTE APARELHO, no IndexedDB, no molde de `lib/cartoes/audioDoCartao/armazem.ts`. NADA SOBE AO
 * SERVIDOR: este módulo não fala com a rede (retenção zero; o servidor só guarda o contador de uso).
 *
 * O que vale:
 *  · "Apagar o diário" é `apagarTudo`; o histórico e o rascunho são DA CONTA (`lib/armazemLocalPorConta`): cada entrada
 *    leva o dono, o de outra conta não aparece e sai, a guarda nasce no boot e sair, limpar tudo e excluir a conta apagam. Os cartões já criados ficam: moram no baralho, são da pessoa;
 *  · sem IndexedDB (navegação privada, banco bloqueado) gravar devolve `false` e a tela segue sem histórico, com o aviso;
 *  · teto de `TETO_DE_ENTRADAS`: ao passar, a mais antiga sai;
 *  · o `.txt` do diário é montado aqui, no navegador, sem rede (`diarioEmTxt`).
 */
import type { RetornoDaEscrita } from '../../data/apiDoEstudo';
import {
  criarBancoPorConta,
  criarChaveLocalPorConta,
  iniciarGuardaDosArmazensLocais,
  registrarArmazemPorConta,
} from '../armazemLocalPorConta';

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
  /** A conta (ou `anonimo`/`selfhost`) que escreveu. Sem ele, a entrada é de antes da regra e não é de ninguém. */
  dono?: string;
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

export function criarHistoricoDoDiario(
  o: { fabrica?: IDBFactory | null; teto?: number; dono?: () => string | null } = {},
): HistoricoDoDiario & { purgarDeOutros(): Promise<void>; destruir(): Promise<void> } {
  const teto = o.teto ?? TETO_DE_ENTRADAS;
  const b = criarBancoPorConta<EntradaDoDiario>({
    banco: BANCO,
    loja: LOJA,
    chave: 'id',
    fabrica: o.fabrica,
    dono: o.dono,
  });

  return {
    async gravar(e) {
      try {
        const dono = b.dono();
        if (!dono || !e.id || !e.texto) return false;
        const db = await b.abrir();
        if (!db) return false;
        const outras = (await b.soDoDono(db, dono)).filter((x) => x.id !== e.id).sort((a, c) => a.em - c.em);
        const loja = b.loja(db, 'readwrite');
        for (let i = 0; i < outras.length - (teto - 1); i++) void loja.delete(outras[i].id);
        await pedido(loja.put({ ...e, dono }));
        return true;
      } catch {
        return false;
      }
    },
    async listar() {
      try {
        const dono = b.dono();
        if (!dono) return [];
        const db = await b.abrir();
        if (!db) return [];
        return (await b.soDoDono(db, dono)).sort((x, y) => y.em - x.em);
      } catch {
        return [];
      }
    },
    apagarTudo: b.apagarTudo,
    purgarDeOutros: b.purgarDeOutros,
    destruir: b.destruir,
  };
}

/* ─────────────── o rascunho (localStorage; some junto com o histórico) ─────────────── */

const CHAVE_DO_RASCUNHO = 'frasy.diario.rascunho';
const CHAVE_DO_NIVEL = 'frasy.diario.nivel';

/** O rascunho é texto da pessoa: DA CONTA, com dono (ver `lib/armazemLocalPorConta`). */
const rascunho = criarChaveLocalPorConta<string>(CHAVE_DO_RASCUNHO, { nome: 'diario-rascunho' });

/* O nível é uma preferência do aparelho e passa por `try/catch` (janela privada, armazenamento bloqueado): sem
   armazenamento, a tela funciona sem lembrar. */
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

export const lerRascunhoDoDiario = (): string => rascunho.ler() ?? '';
export const gravarRascunhoDoDiario = (texto: string): void => {
  if (texto) rascunho.gravar(texto);
  else rascunho.apagar();
};
export const apagarRascunhoDoDiario = (): void => rascunho.apagar();

export type NivelDoDiario = 'A1' | 'A2' | 'B1';
export function lerNivelDoDiario(): NivelDoDiario {
  const v = lerLocal(CHAVE_DO_NIVEL);
  return v === 'A1' || v === 'B1' ? v : 'A2';
}
export const gravarNivelDoDiario = (n: NivelDoDiario): void => salvarLocal(CHAVE_DO_NIVEL, n);

let doAparelho: ReturnType<typeof criarHistoricoDoDiario> | null = null;

const doDispositivo = () => (doAparelho ??= criarHistoricoDoDiario());

registrarArmazemPorConta({
  nome: 'diario-historico',
  apagarTudo: () => doDispositivo().apagarTudo(),
  purgarDeOutros: () => doDispositivo().purgarDeOutros(),
  destruir: () => doDispositivo().destruir(),
});

/** O histórico deste aparelho. Trocar de conta apaga tudo (o diário de uma pessoa não espera a próxima conta). */
export function historicoDoDiario(): HistoricoDoDiario {
  iniciarGuardaDosArmazensLocais();
  return doDispositivo();
}

/** Só para testes: esquece o histórico do aparelho. */
export function _reiniciarHistoricoDoDiario(): void {
  doAparelho = null;
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
