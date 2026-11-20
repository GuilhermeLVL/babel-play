/**
 * "CONTINUAR DE ONDE PAREI" (LEI02): a posição de cada livro, por EPUB CFI, gravada a cada virada de
 * página e ao sair. Puro: o armazenamento é injetado (o `localStorage` na tela, um mapa no teste).
 *
 * PDF não tem CFI de texto confiável: guarda a página (`secao`) e a fração. Na volta, o leitor tenta o
 * CFI e, se ele não resolver, cai na seção — nunca no começo do livro por um CFI quebrado.
 */

export interface PosicaoDeLeitura {
  livroId: string;
  /** EPUB CFI da posição (`epubcfi(...)`). */
  cfi: string;
  /** Índice da seção (capítulo no EPUB, página no PDF). */
  secao: number;
  /** Progresso no livro, de 0 a 1. */
  fracao: number;
  /** Rótulo do capítulo, para "Continuar: Capítulo 3". */
  capitulo?: string;
  atualizadaEm: number;
}

export interface ArmazemChaveValor {
  ler(chave: string): string | null;
  gravar(chave: string, valor: string): void;
  apagar(chave: string): void;
}

const PREFIXO = 'leitor:posicao:';
const CHAVE_DOS_RECENTES = 'leitor:recentes';
/** Quantos livros a lista "continuar lendo" lembra. */
export const MAX_RECENTES = 30;

const ehCfi = (x: unknown): x is string => typeof x === 'string' && /^epubcfi\(.+\)$/.test(x) && x.length <= 1_000;

/** Lê uma posição guardada, aceitando só o que tem forma de posição. */
export function lerPosicao(bruto: string | null, livroId: string): PosicaoDeLeitura | null {
  if (!bruto) return null;
  try {
    const p = JSON.parse(bruto) as Partial<PosicaoDeLeitura>;
    if (p.livroId !== livroId) return null;
    const cfi = ehCfi(p.cfi) ? p.cfi : '';
    const secao = Number.isInteger(p.secao) && (p.secao as number) >= 0 ? (p.secao as number) : 0;
    if (!cfi && !secao) return null;
    const fracao = typeof p.fracao === 'number' && p.fracao >= 0 && p.fracao <= 1 ? p.fracao : 0;
    return {
      livroId,
      cfi,
      secao,
      fracao,
      ...(typeof p.capitulo === 'string' && p.capitulo ? { capitulo: p.capitulo.slice(0, 300) } : {}),
      atualizadaEm: typeof p.atualizadaEm === 'number' ? p.atualizadaEm : 0,
    };
  } catch {
    return null;
  }
}

export function criarArmazemDePosicoes(armazem: ArmazemChaveValor) {
  const lerRecentes = (): string[] => {
    try {
      const l = JSON.parse(armazem.ler(CHAVE_DOS_RECENTES) ?? '[]') as unknown;
      return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  return {
    ler(livroId: string): PosicaoDeLeitura | null {
      return lerPosicao(armazem.ler(PREFIXO + livroId), livroId);
    },
    /**
     * Grava a posição. Recusa (devolve `false`) a que não tem CFI nem seção: gravar "lugar nenhum"
     * por cima de uma posição boa é o "voltou para a capa" que esta função existe para impedir.
     */
    gravar(p: PosicaoDeLeitura): boolean {
      const cfi = ehCfi(p.cfi) ? p.cfi : '';
      if (!cfi && !(p.secao > 0)) return false;
      const limpa: PosicaoDeLeitura = {
        livroId: p.livroId,
        cfi,
        secao: Math.max(0, Math.floor(p.secao)),
        fracao: Math.min(1, Math.max(0, p.fracao || 0)),
        ...(p.capitulo ? { capitulo: p.capitulo.slice(0, 300) } : {}),
        atualizadaEm: p.atualizadaEm,
      };
      armazem.gravar(PREFIXO + p.livroId, JSON.stringify(limpa));
      const recentes = [p.livroId, ...lerRecentes().filter((id) => id !== p.livroId)];
      for (const fora of recentes.slice(MAX_RECENTES)) armazem.apagar(PREFIXO + fora);
      armazem.gravar(CHAVE_DOS_RECENTES, JSON.stringify(recentes.slice(0, MAX_RECENTES)));
      return true;
    },
    esquecer(livroId: string): void {
      armazem.apagar(PREFIXO + livroId);
      armazem.gravar(CHAVE_DOS_RECENTES, JSON.stringify(lerRecentes().filter((id) => id !== livroId)));
    },
    /** Os livros lidos por último, do mais recente ao mais antigo. */
    recentes(): string[] {
      return lerRecentes();
    },
  };
}

export type ArmazemDePosicoes = ReturnType<typeof criarArmazemDePosicoes>;
