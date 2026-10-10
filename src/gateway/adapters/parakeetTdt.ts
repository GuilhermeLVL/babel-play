/**
 * PARAKEET TDT — a parte que não depende do runtime: vocabulário, o laço de decodificação e o corte
 * de trechos longos. Puro, para o worker (`parakeetWorker.ts`) e os testes verem a MESMA conta.
 *
 * O laço é o de `scripts/eval-fala/bancada/navegador/pagina.html` (`rodarParakeet`), o que produziu os
 * números de `docs/auditoria/2026-10-09-medicoes-no-aparelho.md`. Mexer aqui é trocar o que foi medido.
 *
 * TDT (Token-and-Duration Transducer): a cada quadro do encoder, o joint devolve DUAS distribuições
 * numa saída só: os `nVocab` primeiros valores são o token (o último é o branco) e os restantes, a
 * duração (quantos quadros pular). Guloso: o maior de cada uma. Token que não é branco entra no texto
 * e atualiza o estado do decoder; duração 0 repete o quadro (até `MAX_TOKENS_POR_QUADRO`, a trava
 * contra laço infinito no mesmo quadro).
 */

/** Quantos tokens o mesmo quadro pode emitir antes de o laço avançar à força. */
export const MAX_TOKENS_POR_QUADRO = 10;

export interface VocabularioDoParakeet {
  /** A peça de cada id, com `▁` já trocado por espaço. */
  pecas: string[];
  /** Id do branco (`<blk>`), o último do vocabulário. */
  branco: number;
}

/** Lê o `vocab.txt` do export (`<peça> <id>` por linha). Sem `<blk>` o arquivo não é o esperado. */
export function lerVocabulario(texto: string): VocabularioDoParakeet {
  const pecas: string[] = [];
  for (const linha of texto.split('\n')) {
    if (!linha.trim()) continue;
    const i = linha.lastIndexOf(' ');
    const id = Number(linha.slice(i + 1));
    if (i < 0 || !Number.isInteger(id) || id < 0) continue;
    pecas[id] = linha.slice(0, i).replaceAll('▁', ' ');
  }
  const branco = pecas.indexOf('<blk>');
  if (branco < 0) throw new Error('vocabulário do Parakeet sem <blk>');
  return { pecas, branco };
}

/** Junta as peças e tira o espaço que o tokenizador põe antes da pontuação. */
export function destokenizar(pecas: string[]): string {
  return pecas
    .join('')
    .replace(/\s(?![\p{L}\p{N}_])/gu, '')
    .replace(/^\s+/, '');
}

/** A saída do encoder: `[1, dim, quadros]` em ordem de linha (o quadro `t` da dimensão `d` em `d * quadros + t`). */
export interface SaidaDoEncoder {
  dados: Float32Array;
  dim: number;
  quadros: number;
  /** Quadros com áudio de verdade (`encoded_lengths`); o resto é enchimento. */
  validos: number;
}

/**
 * Um passo do joint: a coluna do encoder e o último token emitido entram; saem os logits (token +
 * duração) e o estado NOVO do decoder. `E` é o estado, opaco para o laço (no worker, dois tensores).
 */
export type PassoDoJoint<E> = (
  coluna: Float32Array,
  tokenAnterior: number,
  estado: E,
) => Promise<{ logits: ArrayLike<number>; estado: E }>;

/**
 * Decodificação gulosa TDT. Devolve os ids dos tokens. `cancelado` é consultado a cada quadro: quem
 * pediu desistiu, o laço para e devolve `null`.
 */
export async function decodificarTdt<E>(
  enc: SaidaDoEncoder,
  passo: PassoDoJoint<E>,
  estadoInicial: E,
  vocab: { tamanho: number; branco: number },
  cancelado: () => boolean = () => false,
): Promise<number[] | null> {
  const { dados, dim, quadros } = enc;
  const nQuadros = Math.min(quadros, enc.validos);
  const nVocab = vocab.tamanho;
  const coluna = new Float32Array(dim);
  const tokens: number[] = [];
  let estado = estadoInicial;
  let t = 0;
  let emitidos = 0;
  while (t < nQuadros) {
    if (cancelado()) return null;
    for (let d = 0; d < dim; d++) coluna[d] = dados[d * quadros + t];
    const r = await passo(coluna, tokens.length ? tokens[tokens.length - 1] : vocab.branco, estado);
    const o = r.logits;
    let token = 0;
    for (let i = 1; i < nVocab; i++) if (o[i] > o[token]) token = i;
    let duracao = 0;
    for (let i = nVocab + 1; i < o.length; i++) if (o[i] > o[nVocab + duracao]) duracao = i - nVocab;
    if (token !== vocab.branco) {
      estado = r.estado;
      tokens.push(token);
      emitidos++;
    }
    if (duracao > 0) {
      t += duracao;
      emitidos = 0;
    } else if (token === vocab.branco || emitidos === MAX_TOKENS_POR_QUADRO) {
      t++;
      emitidos = 0;
    }
  }
  return tokens;
}

/** Quadro da busca do ponto de corte: 100 ms a 16 kHz. */
const QUADRO_DO_CORTE = 1600;

/**
 * Divide um trecho MAIOR que a janela do encoder em pedaços de até `maxAmostras`, cortando no quadro
 * de 100 ms mais SILENCIOSO dos últimos `buscaAmostras` de cada janela — nunca no meio do pedaço, e
 * quase sempre numa pausa, para não partir palavra. Trecho que já cabe volta inteiro (sem cópia).
 * Nenhuma amostra se perde nem se repete: a soma dos pedaços é o trecho.
 */
export function dividirEmJanelas(pcm: Float32Array, maxAmostras: number, buscaAmostras: number): Float32Array[] {
  if (pcm.length <= maxAmostras) return [pcm];
  const pedacos: Float32Array[] = [];
  let inicio = 0;
  while (pcm.length - inicio > maxAmostras) {
    const fim = inicio + maxAmostras;
    const de = Math.max(inicio + QUADRO_DO_CORTE, fim - buscaAmostras);
    let corte = fim;
    let menor = Infinity;
    for (let q = de; q + QUADRO_DO_CORTE <= fim; q += QUADRO_DO_CORTE) {
      let energia = 0;
      for (let i = q; i < q + QUADRO_DO_CORTE; i++) energia += pcm[i] * pcm[i];
      if (energia < menor) {
        menor = energia;
        corte = q + QUADRO_DO_CORTE / 2;
      }
    }
    pedacos.push(pcm.subarray(inicio, corte));
    inicio = corte;
  }
  pedacos.push(pcm.subarray(inicio));
  return pedacos;
}

/**
 * O trecho é silêncio DIGITAL (todas as amostras praticamente zero)? Aí nem vale rodar o modelo: não
 * há fala a transcrever, e modelo nenhum deve ter a chance de inventar texto sobre zeros. O silêncio
 * de verdade (ruído de sala, música) é do VAD, antes, e do filtro de alucinação, depois.
 */
export function ehSilencioDigital(pcm: Float32Array): boolean {
  for (let i = 0; i < pcm.length; i++) if (Math.abs(pcm[i]) > 1e-4) return false;
  return true;
}
