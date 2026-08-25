import type { MinigameItem } from './types';

/**
 * CAÇA-PALAVRAS — a grade e onde cada palavra ficou.
 *
 * A INVERSÃO QUE FAZ ISTO ENSINAR: no caça-palavras clássico a lista mostra as palavras e a
 * pessoa só as localiza — é varredura visual, e a pesquisa mostra que rende pouco (num estudo,
 * menos que simplesmente reler). Aqui a lista mostra a TRADUÇÃO: para procurar, é preciso antes
 * lembrar qual é a palavra. A casca é a mesma; o miolo vira recuperação de memória.
 *
 * Geração determinística por semente, para o teste poder afirmar coisas sobre a grade — e para
 * um "tentar de novo" produzir a mesma grade se quisermos.
 */

export type Direcao = 'horizontal' | 'vertical' | 'diagonal';

export interface PalavraColocada {
  /** Índice do item na rodada. */
  itemIndex: number;
  palavra: string;
  linha: number;
  coluna: number;
  direcao: Direcao;
  /** Células ocupadas, em ordem — é o que a interface compara com o traço do usuário. */
  celulas: Array<{ linha: number; coluna: number }>;
}

export interface Tabuleiro {
  tamanho: number;
  /** letras[linha][coluna] */
  letras: string[][];
  colocadas: PalavraColocada[];
  /** Itens que não couberam na grade (a rodada segue sem eles, sem mentir sobre isso). */
  naoCouberam: number[];
}

/** Gerador determinístico simples (mulberry32) — mesma semente, mesma grade. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DELTAS: Record<Direcao, { dl: number; dc: number }> = {
  horizontal: { dl: 0, dc: 1 },
  vertical: { dl: 1, dc: 0 },
  diagonal: { dl: 1, dc: 1 },
};

/** Só letras, sem acento e em maiúsculas — a grade não pode pedir acentuação para "achar". */
export function normalizarPalavra(p: string): string {
  return p.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
}

/**
 * Monta a grade. Palavras longas primeiro (as difíceis de encaixar entram enquanto há espaço);
 * o que não couber sai da rodada em vez de ser truncado.
 */
export function buildGrid(items: MinigameItem[], opts: { tamanho?: number; seed?: number } = {}): Tabuleiro {
  const palavras = items.map((it, i) => ({ i, texto: normalizarPalavra(it.answer) })).filter(p => p.texto.length >= 2);
  const maior = palavras.reduce((m, p) => Math.max(m, p.texto.length), 0);
  // A grade precisa caber a maior palavra com folga; nunca menor que 8.
  const tamanho = opts.tamanho ?? Math.max(8, Math.min(14, maior + 2));
  const rand = rng(opts.seed ?? 1);

  const letras: string[][] = Array.from({ length: tamanho }, () => Array<string>(tamanho).fill(''));
  const colocadas: PalavraColocada[] = [];
  const naoCouberam: number[] = [];

  const cabe = (texto: string, linha: number, coluna: number, dir: Direcao): boolean => {
    const { dl, dc } = DELTAS[dir];
    for (let k = 0; k < texto.length; k++) {
      const l = linha + dl * k;
      const c = coluna + dc * k;
      if (l < 0 || l >= tamanho || c < 0 || c >= tamanho) return false;
      const atual = letras[l][c];
      if (atual && atual !== texto[k]) return false; // cruzamento só com letra igual
    }
    return true;
  };

  const ordenadas = [...palavras].sort((a, b) => b.texto.length - a.texto.length);
  for (const { i, texto } of ordenadas) {
    const direcoes: Direcao[] = ['horizontal', 'vertical', 'diagonal'];
    let colocou = false;
    // Tentativas aleatórias, mas limitadas: se não coube, a palavra sai da rodada.
    for (let tentativa = 0; tentativa < 220 && !colocou; tentativa++) {
      const dir = direcoes[Math.floor(rand() * direcoes.length)];
      const linha = Math.floor(rand() * tamanho);
      const coluna = Math.floor(rand() * tamanho);
      if (!cabe(texto, linha, coluna, dir)) continue;
      const { dl, dc } = DELTAS[dir];
      const celulas: Array<{ linha: number; coluna: number }> = [];
      for (let k = 0; k < texto.length; k++) {
        const l = linha + dl * k;
        const c = coluna + dc * k;
        letras[l][c] = texto[k];
        celulas.push({ linha: l, coluna: c });
      }
      colocadas.push({ itemIndex: i, palavra: texto, linha, coluna, direcao: dir, celulas });
      colocou = true;
    }
    if (!colocou) naoCouberam.push(i);
  }

  // Preenche o resto com letras aleatórias — só depois de todas as palavras estarem no lugar.
  const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let l = 0; l < tamanho; l++) {
    for (let c = 0; c < tamanho; c++) {
      if (!letras[l][c]) letras[l][c] = ALFABETO[Math.floor(rand() * ALFABETO.length)];
    }
  }

  return { tamanho, letras, colocadas, naoCouberam };
}

/**
 * O traço do usuário (célula inicial → final) casa com alguma palavra? Aceita o traço em
 * qualquer sentido: arrastar de trás para a frente é a mesma palavra para quem joga.
 */
export function matchSelection(
  grade: Tabuleiro,
  inicio: { linha: number; coluna: number },
  fim: { linha: number; coluna: number },
): PalavraColocada | null {
  const mesma = (a: { linha: number; coluna: number }, b: { linha: number; coluna: number }) =>
    a.linha === b.linha && a.coluna === b.coluna;
  for (const p of grade.colocadas) {
    const primeira = p.celulas[0];
    const ultima = p.celulas[p.celulas.length - 1];
    if ((mesma(primeira, inicio) && mesma(ultima, fim)) || (mesma(ultima, inicio) && mesma(primeira, fim))) {
      return p;
    }
  }
  return null;
}

/** As células entre duas pontas, quando alinhadas (reta ou diagonal perfeita). `null` se não. */
export function cellsBetween(
  inicio: { linha: number; coluna: number },
  fim: { linha: number; coluna: number },
): Array<{ linha: number; coluna: number }> | null {
  const dl = Math.sign(fim.linha - inicio.linha);
  const dc = Math.sign(fim.coluna - inicio.coluna);
  const passosL = Math.abs(fim.linha - inicio.linha);
  const passosC = Math.abs(fim.coluna - inicio.coluna);
  if (passosL !== 0 && passosC !== 0 && passosL !== passosC) return null; // nem reta nem diagonal
  const n = Math.max(passosL, passosC);
  const celulas = [];
  for (let k = 0; k <= n; k++) celulas.push({ linha: inicio.linha + dl * k, coluna: inicio.coluna + dc * k });
  return celulas;
}
