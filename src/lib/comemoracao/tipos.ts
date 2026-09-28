/** A receita de uma rajada. Fora de `pacotes.ts` para `efeitos.ts` tipar sem fechar ciclo com ele. */
import type { BurstKind, FormaParticula, OrigemRajada, ParticlePreset } from '../effects';
import type { SoundEvent } from '../soundFx';

export interface PacoteDeEfeito {
  kind: BurstKind;
  forma?: FormaParticula;
  /** De onde a rajada nasce (padrão: o da spec do `kind`). */
  origem?: OrigemRajada;
  /** Cor por TOKEN do tema — nunca hex. */
  cor?: ParticlePreset['colorToken'];
  /** Partículas por rajada (padrão: o da spec do `kind`). */
  contagem?: number;
  gravidade?: number;
  /** O som do efeito, no lugar do som padrão do evento. */
  som?: SoundEvent;
}
