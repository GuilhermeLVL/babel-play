/**
 * O GESTO QUE DESTRAVA A VOZ TAMBÉM PREPARA A BOCA. `destravarVozDaNuvem` libera o elemento de áudio dentro do toque
 * (iPhone); o `AudioContext` do analisador também só sai de `suspended` dentro de um gesto. Esta função devolve o
 * destravador a usar no lugar do original: roda o original primeiro, SEM MUDAR NADA no som, e então liga o analisador
 * (assíncrono, nunca lança). Sem avatar (`ativo()` falso) é exatamente o destravador original.
 */
import { prepararAnalisadorDaVoz } from './amplitude';

export function destravarComAvatar(destravar: () => void, ativo: () => boolean): () => void {
  return () => {
    destravar();
    if (!ativo()) return;
    try {
      void prepararAnalisadorDaVoz().catch(() => undefined);
    } catch {
      /* sem Web Audio: a boca anda pela cadência */
    }
  };
}
