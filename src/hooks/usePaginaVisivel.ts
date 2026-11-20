import { useSyncExternalStore } from 'react';

const assinar = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
};
const visivel = () => document.visibilityState !== 'hidden';

/** A aba está à vista (`visibilitychange`)? Escondida (outra aba, app minimizado), quem gasta pode esperar. */
export function usePaginaVisivel(): boolean {
  return useSyncExternalStore(assinar, visivel, () => true);
}
