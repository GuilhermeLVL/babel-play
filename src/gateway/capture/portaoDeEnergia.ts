import type { ModeloDoVad } from './vadEmWorker';

/** ~ -56 dBFS: abaixo disso é silêncio de sala, não fala (nem fala baixa). */
export const PISO_RMS = 0.0015;
/** Quadros quietos que ainda vão ao modelo antes de pular (~770 ms com quadros de 96 ms): deixa a redenção fechar a fala. */
export const QUADROS_QUIETOS = 8;

type ModeloMinimo = Pick<ModeloDoVad, 'process' | 'reset'>;

const SILENCIO = { isSpeech: 0, notSpeech: 1 } as const;

function rms(quadro: Float32Array): number {
  let soma = 0;
  for (let i = 0; i < quadro.length; i++) soma += quadro[i]! * quadro[i]!;
  return Math.sqrt(soma / (quadro.length || 1));
}

/**
 * Poupa CPU em silêncio claro: depois de `quadrosQuietos` quadros seguidos abaixo do piso, o Silero deixa de
 * rodar e a resposta é "não é fala". O primeiro quadro acima do piso depois de pulos reinicia o estado do
 * modelo (ficou velho) e é processado normalmente; o pré-pad do `FrameProcessor` guarda o começo da fala.
 */
export function comPortaoDeEnergia(
  modelo: ModeloMinimo,
  opcoes: { pisoRms?: number; quadrosQuietos?: number } = {},
): ModeloMinimo & { quadrosPulados(): number } {
  const piso = opcoes.pisoRms ?? PISO_RMS;
  const quietos = opcoes.quadrosQuietos ?? QUADROS_QUIETOS;
  let seguidosAbaixo = 0;
  let pulados = 0;
  let houvePulo = false;
  return {
    async process(quadro) {
      if (rms(quadro) >= piso) {
        seguidosAbaixo = 0;
        if (houvePulo) {
          houvePulo = false;
          modelo.reset();
        }
        return modelo.process(quadro);
      }
      seguidosAbaixo++;
      if (seguidosAbaixo > quietos) {
        houvePulo = true;
        pulados++;
        return { ...SILENCIO };
      }
      return modelo.process(quadro);
    },
    reset: () => modelo.reset(),
    quadrosPulados: () => pulados,
  };
}
