/**
 * A MINIATURA DE CADA VOZ do modelo no aparelho: uma ilustração (nunca foto de pessoa real), gerada uma vez por
 * `scripts/voz/gerar-avatares.mjs` (DiceBear Lorelei, arte CC0) e versionada em `src/assets/voz-avatares/`.
 */
import type { VozDoSupertonic } from '../../core/voz/supertonic';

const arquivos = import.meta.glob<string>('../../assets/voz-avatares/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function avatarDaVoz(voz: VozDoSupertonic): string | undefined {
  return arquivos[`../../assets/voz-avatares/${voz}.svg`];
}
