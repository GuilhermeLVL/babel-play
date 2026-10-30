/**
 * A PONTE ENTRE A VOZ DA CONVERSA E OS AVATARES. O Intérprete tem UM motor de voz por vez (o do aparelho ou a nuvem,
 * conforme a preferência por lado e idioma, `motorPorPreferencia`). `envolver(motor)` devolve o mesmo motor ligado ao
 * avatar (`ligarAvatarAFala`): mesmos callbacks, mesma ordem, e de quebra a ponte sabe SE a voz está tocando e COMO está
 * a boca. Os dois avatares leem a mesma ponte; só o de quem disse a frase recebe a boca (`pose`).
 *
 * Desligada (`ativar(false)`, o padrão: sem a flag ou no modo economia), `envolver` devolve o motor como veio: o som e o
 * guarda de eco (`isTtsActive`/`marcarFalaExterna`, que vivem DENTRO do motor) não passam por nada novo.
 */
import { useSyncExternalStore } from 'react';

import type { PoseDaBoca } from '../../core/avatar/boca';
import type { TtsEngine } from '../tts';
import { type LigacaoDaFala, ligarAvatarAFala } from './fala';

export interface PonteDaVoz {
  ativar(ligada: boolean): void;
  envolver(motor: TtsEngine): TtsEngine;
  falando(): boolean;
  assinar(cb: () => void): () => void;
  pose(agoraMs?: number): PoseDaBoca | null;
  dispose(): void;
}

export function criarPonteDaVoz(): PonteDaVoz {
  let ligada = false;
  let motor: TtsEngine | null = null;
  let ligacao: LigacaoDaFala | null = null;
  let soltar: (() => void) | null = null;
  const ouvintes = new Set<() => void>();
  const avisar = () => {
    for (const cb of [...ouvintes]) cb();
  };
  const largar = () => {
    soltar?.();
    ligacao?.dispose();
    soltar = null;
    ligacao = null;
    motor = null;
  };
  return {
    ativar(v) {
      if (ligada === v) return;
      ligada = v;
      if (!v) {
        largar();
        avisar();
      }
    },
    envolver(m) {
      if (!ligada) return m;
      if (motor !== m || !ligacao) {
        largar();
        motor = m;
        ligacao = ligarAvatarAFala(m);
        soltar = ligacao.assinar(avisar);
      }
      return ligacao.motor;
    },
    falando: () => ligacao?.falando() ?? false,
    assinar(cb) {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    pose: (t) => ligacao?.pose(t) ?? null,
    dispose() {
      largar();
      ouvintes.clear();
    },
  };
}

/** `true` enquanto o motor de voz ligado diz que fala. */
export function useVozTocando(ponte: PonteDaVoz): boolean {
  return useSyncExternalStore(ponte.assinar, ponte.falando, () => false);
}
