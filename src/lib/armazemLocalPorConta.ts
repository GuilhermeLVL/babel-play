/**
 * ARMAZÉM LOCAL POR CONTA — a peça comum de tudo o que a pessoa guarda SÓ NESTE APARELHO (IndexedDB e localStorage)
 * e que é dela, não do aparelho (revisão de segurança: num aparelho compartilhado, a conta B não pode ver o que a
 * conta A deixou). Preferências do aparelho (tema, idioma da interface, flags de dispositivo) NÃO passam por aqui.
 *
 * A regra, em quatro partes:
 *  1. MARCAR: cada registro leva o id do DONO (`donoDaIdentidade`: id da conta, `anonimo` ou `selfhost`);
 *  2. DESCARTAR NA LEITURA: o que é de outro dono (ou de antes desta regra, sem dono) não se mostra e sai na hora;
 *  3. GUARDA CEDO: o ouvinte de troca de identidade/dono nasce no BOOT (`iniciarGuardaDosArmazensLocais`, em `main.tsx`, num chunk à parte),
 *     não no primeiro uso do armazém. Sem dono conhecido (identidade carregando) o armazém não lê nem grava;
 *  4. APAGAR: ao sair/trocar de conta (`apagarTodosOsArmazensDaConta`), em "esquecer este navegador" (`limparTudo`) e
 *     ao excluir a conta com sucesso (`excluirConta`) — os dois últimos destroem (`destruirTodosOsArmazensDaConta`).
 *
 * Cada armazém se REGISTRA aqui ao ser importado (`registrarArmazemPorConta`); a guarda trata o conjunto. Nada aqui fala
 * com a rede.
 */
import { donoDaIdentidade } from './identidade';

export interface ArmazemPorConta {
  /** Nome único (idempotência do registro e diagnóstico). */
  nome: string;
  /** Apaga tudo o que o armazém guarda (o armazém continua usável). */
  /**
   * Apaga tudo o que o armazém guarda (o armazém continua usável). `preservarVisitante`: é a transição visitante -> conta,
   * e quem adota o que o visitante deixou o mantém; em qualquer outra (sair, conta -> conta) o do visitante também sai.
   */
  apagarTudo(o?: { preservarVisitante?: boolean }): Promise<void> | void;
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

/** Os armazéns registrados (a guarda os percorre; vive em `guardaDosArmazensLocais`, num chunk à parte). */
export const armazensRegistrados = (): ArmazemPorConta[] => [...registro.values()];

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
      if (j.dono !== dono) {
        /* Adotou o do visitante: passa a ser desta conta NA HORA (se ficasse `anonimo`, a próxima conta o adotaria). */
        try {
          armazem().setItem(chave, JSON.stringify({ dono, valor: j.valor }));
        } catch {
          apagar();
          return null;
        }
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
      apagarTudo: (op) => {
        if (adota && op?.preservarVisitante && lerBruto()?.dono === 'anonimo') return;
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
