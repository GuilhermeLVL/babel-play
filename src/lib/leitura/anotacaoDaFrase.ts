/**
 * ANOTAÇÃO SEMÂNTICA POR FRASE — o modelo do protótipo aprovado (`abaLeitura`, `NOTAS_TIPO`).
 *
 * Na Leitura, clicar numa frase abre "Anotação semântica": Vocabulário, Gramática, Expressão,
 * Dúvida, Áudio ou Apagar. Cada frase tem NO MÁXIMO uma anotação (escolher outro tipo troca; Apagar
 * tira), que pinta a frase (`.frase.nota-<tipo>`) e entra em "Estudos & notas".
 *
 * As anotações POR PALAVRA de antes (grifo, nota escrita, áudio numa palavra) continuam guardadas
 * na mesma lista da sessão e aparecem como antes: nada do que a pessoa já anotou se perde.
 */

export type TipoDeNota = 'vocab' | 'gram' | 'expr' | 'duvida' | 'audio';

/** Rótulo e tom do selo (`badge <tom>`) de cada tipo, como no protótipo. */
export const TIPOS_DE_NOTA: Record<TipoDeNota, { rotulo: string; tom: string }> = {
  vocab: { rotulo: 'Vocabulário', tom: 'acc' },
  gram: { rotulo: 'Gramática', tom: 'rare' },
  expr: { rotulo: 'Expressão', tom: 'good' },
  duvida: { rotulo: 'Dúvida', tom: 'warn' },
  audio: { rotulo: 'Áudio', tom: 'neu' },
};

/** Uma anotação da Leitura: por FRASE (`type: 'frase'`) ou, nas antigas, por palavra. */
export interface Anotacao {
  id: string;
  type: 'highlight' | 'note' | 'audio' | 'frase';
  textIndex: number;
  /** Só nas anotações por palavra (as antigas). */
  wordIndex?: string;
  wordText?: string;
  /** Só nas anotações por frase. */
  tipo?: TipoDeNota;
  content?: string;
  color?: string;
  audioUrl?: string;
  createdAt: number;
}

/** A anotação da frase `i`, se houver. */
export function notaDaFrase(lista: Anotacao[], i: number): Anotacao | undefined {
  return lista.find((a) => a.type === 'frase' && a.textIndex === i);
}

/**
 * Anota a frase `i` com `tipo` (troca a anotação que ela tinha) ou, com `'apagar'`, tira a dela.
 * As anotações por palavra da mesma frase NÃO são tocadas: são outra coisa, de antes.
 */
export function anotarFrase(
  lista: Anotacao[],
  i: number,
  tipo: TipoDeNota | 'apagar',
  extra: { audioUrl?: string; agora?: number } = {},
): Anotacao[] {
  const sem = lista.filter((a) => !(a.type === 'frase' && a.textIndex === i));
  if (tipo === 'apagar') return sem;
  const agora = extra.agora ?? Date.now();
  return [
    ...sem,
    {
      id: `frase-${i}-${agora}`,
      type: 'frase',
      textIndex: i,
      tipo,
      ...(extra.audioUrl ? { audioUrl: extra.audioUrl } : {}),
      createdAt: agora,
    },
  ];
}

/** Lê a lista guardada, aceitando só o que tem forma de anotação (o disco pode ter qualquer coisa). */
export function lerAnotacoes(bruto: string | null): Anotacao[] {
  if (!bruto) return [];
  try {
    const l = JSON.parse(bruto) as unknown;
    if (!Array.isArray(l)) return [];
    return l.filter(
      (a): a is Anotacao =>
        !!a &&
        typeof a === 'object' &&
        typeof (a as Anotacao).id === 'string' &&
        typeof (a as Anotacao).textIndex === 'number',
    );
  } catch {
    return [];
  }
}
