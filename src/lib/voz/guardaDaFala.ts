/**
 * O KEEP-ALIVE DA FALA DO CHROME.
 *
 * O Chrome corta, depois de uns 15 s, uma fala que usa voz de REDE (as "Google …" e as "… Online"): o `onend` nunca
 * vem e a narração fica presa. O contorno conhecido é `pause()` seguido de `resume()` a cada ~10 s enquanto a fala
 * está em curso. As frases da narração já são partidas em ≤600 caracteres (`core/leitura/narracao.ts`), mas uma
 * frase de 600 caracteres lida devagar passa de 15 s.
 *
 * O guarda NUNCA mexe numa fala que a PESSOA pausou (`paused` verdadeiro: pular o ciclo) nem fala parada. Ele só
 * existe para voz de rede: em voz local o pause/resume é inútil e em alguns sistemas faz a fala gaguejar.
 * O relógio é injetável para o teste.
 */

export interface SinteseDoGuarda {
  speaking: boolean;
  paused: boolean;
  pause(): void;
  resume(): void;
}

export interface RelogioDoGuarda {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export const INTERVALO_DO_KEEP_ALIVE_MS = 10_000;

export interface GuardaDaFala {
  iniciar(): void;
  parar(): void;
  readonly ativo: boolean;
}

export function criarGuardaDaFala(
  sintese: SinteseDoGuarda,
  o: { intervaloMs?: number; relogio?: RelogioDoGuarda } = {},
): GuardaDaFala {
  const relogio: RelogioDoGuarda = o.relogio ?? {
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof setInterval>),
  };
  let id: unknown = null;
  const parar = () => {
    if (id == null) return;
    relogio.clearInterval(id);
    id = null;
  };
  return {
    iniciar() {
      parar();
      id = relogio.setInterval(() => {
        /* Sem fala (acabou sem avisar) o guarda se desliga; pausada pela pessoa, não toca em nada. */
        if (!sintese.speaking) return parar();
        if (sintese.paused) return;
        sintese.pause();
        sintese.resume();
      }, o.intervaloMs ?? INTERVALO_DO_KEEP_ALIVE_MS);
    },
    parar,
    get ativo() {
      return id != null;
    },
  };
}
