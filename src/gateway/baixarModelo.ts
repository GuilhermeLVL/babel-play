/**
 * BAIXAR UM MODELO EM SEGUNDO PLANO, só quando a pessoa pede (nunca sozinho).
 *
 * Para o Parakeet, usa o MESMO caminho de carga do adapter (`ParakeetLocalStt.preload`): ele lê os
 * pesos com verificação, grava no Cache Storage `transformers-cache`, registra o manifesto
 * (`gravarManifesto` já pede `storage.persist()`) e a sentinela de queda é marcada ao carregar e
 * limpa no `liberar()` — aqui chamado ao terminar, para devolver o heap do WASM.
 *
 * Whisper/Moonshine: o download deles vive dentro do pipeline do worker de cada um, sem ponto de
 * entrada só-de-baixar; por ora devolvem 'falhou' (a captura baixa esses na primeira vez, como sempre).
 */
import { ehParakeet } from './adapters/parakeetModelo';
import { pedirArmazenamentoPersistente, temCopiaNoAparelho } from './modelManifest';

export type ResultadoDoDownload = 'baixado' | 'cancelado' | 'falhou';

async function baixarParakeet(
  id: string,
  aoProgresso: ((fracao: number) => void) | undefined,
  sinal: AbortSignal | undefined,
): Promise<ResultadoDoDownload> {
  if (sinal?.aborted) return 'cancelado';
  if (temCopiaNoAparelho(id)) {
    aoProgresso?.(1);
    return 'baixado';
  }
  const { ParakeetLocalStt } = await import('./adapters/parakeetLocal');
  const stt = new ParakeetLocalStt();
  const aoAbortar = () => stt.liberar(new Error('download cancelado'));
  sinal?.addEventListener('abort', aoAbortar, { once: true });
  try {
    await stt.preload((p) => aoProgresso?.(Math.min(1, Math.max(0, p))));
    if (sinal?.aborted) return 'cancelado';
    aoProgresso?.(1);
    void pedirArmazenamentoPersistente();
    return 'baixado';
  } catch {
    return sinal?.aborted ? 'cancelado' : 'falhou';
  } finally {
    sinal?.removeEventListener('abort', aoAbortar);
    stt.liberar(); // limpa a sentinela e devolve a memória
  }
}

/** Uma aba por vez por modelo (`navigator.locks`), quando existir. */
export async function baixarModelo(
  id: string,
  aoProgresso?: (fracao: number) => void,
  sinal?: AbortSignal,
): Promise<ResultadoDoDownload> {
  if (!ehParakeet(id)) return 'falhou';
  const executar = () => baixarParakeet(id, aoProgresso, sinal);
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks?.request) return executar();
  return locks.request('babel.baixar.' + id, executar);
}
