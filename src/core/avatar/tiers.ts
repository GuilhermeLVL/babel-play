/**
 * TIERS DE DESEMPENHO DO AVATAR: o orçamento que cada aparelho paga, e a escolha pura do tier.
 *
 * `fraco` é o piso: celular modesto, modo economia e o PiP (sempre `fraco`). `medio` e `forte` são desktop e
 * celular bom. Sem WebGL2 não há tier: a UI cai no fallback 2D (decisão de `src/lib/avatar/`, que sonda o
 * contexto). Núcleo puro: a coleta de `deviceMemory`, núcleos e GPU é da lib.
 */

export type TierDoAvatar = 'forte' | 'medio' | 'fraco';
export const TIERS_DO_AVATAR: readonly TierDoAvatar[] = ['fraco', 'medio', 'forte'];

export interface OrcamentoDoTier {
  /** Teto de triângulos do modelo. Acima disso o modelo é recusado ou simplificado. */
  triangulos: number;
  materiais: number;
  /** Maior lado de textura, em pixels. */
  texturaMax: number;
  /** Quadros por segundo do laço de desenho. */
  fps: number;
  /** Teto do `devicePixelRatio` usado no canvas. */
  pixelRatioMax: number;
  molas: boolean;
}

export const ORCAMENTOS: Record<TierDoAvatar, OrcamentoDoTier> = {
  fraco: { triangulos: 20_000, materiais: 1, texturaMax: 1024, fps: 30, pixelRatioMax: 1, molas: false },
  medio: { triangulos: 32_000, materiais: 8, texturaMax: 1024, fps: 60, pixelRatioMax: 1.5, molas: true },
  forte: { triangulos: 70_000, materiais: 32, texturaMax: 2048, fps: 60, pixelRatioMax: 2, molas: true },
};

/** Teto de bytes do arquivo do modelo (VRM/GLB), lido do cabeçalho/`Content-Length` antes de decodificar. */
export const TETO_DO_MODELO_BYTES = 15 * 1024 * 1024;

/** O PiP é minúsculo e roda em outro documento: sempre o orçamento mais baixo. */
export const TIER_DO_PIP: TierDoAvatar = 'fraco';

export type NivelDeGpu = 'alta' | 'media' | 'baixa' | 'desconhecida';

export interface EntradaDeTier {
  /** `navigator.deviceMemory` (só Chromium; arredondado até 8). Ausente: desconhecida. */
  memoriaGb?: number;
  /** `navigator.hardwareConcurrency`. */
  nucleos?: number;
  gpu?: NivelDeGpu;
  /** `navigator.connection.saveData`. */
  saveData?: boolean;
  /** `prefers-reduced-motion: reduce`. */
  movimentoReduzido?: boolean;
}

const numeroPositivo = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

/**
 * Escolhe o tier. Valor ausente, NaN ou infinito conta como DESCONHECIDO (Safari e Firefox não têm
 * `deviceMemory`): desconhecido nunca leva a `forte`.
 *
 *  · `saveData`, GPU baixa, memória <= 2 GB ou <= 2 núcleos: `fraco`;
 *  · `forte`: memória >= 8 GB conhecida, >= 6 núcleos e GPU alta ou desconhecida;
 *  · `medio`: o resto com >= 4 núcleos; menos que isso: `fraco`;
 *  · movimento reduzido limita a `medio` (o tier mais alto é o das molas e do 60 fps cheio, que é justamente
 *    o movimento que quem pede menos movimento não quer).
 */
export function escolherTier(entrada: EntradaDeTier = {}): TierDoAvatar {
  const memoria = numeroPositivo(entrada.memoriaGb);
  const nucleos = numeroPositivo(entrada.nucleos);
  const gpu = entrada.gpu ?? 'desconhecida';

  if (entrada.saveData === true) return 'fraco';
  if (gpu === 'baixa') return 'fraco';
  if (memoria !== undefined && memoria <= 2) return 'fraco';
  if (nucleos !== undefined && nucleos <= 2) return 'fraco';

  let tier: TierDoAvatar = 'medio';
  if (nucleos !== undefined && nucleos < 4) tier = 'fraco';
  else if (
    memoria !== undefined &&
    memoria >= 8 &&
    nucleos !== undefined &&
    nucleos >= 6 &&
    (gpu === 'alta' || gpu === 'desconhecida')
  )
    tier = 'forte';

  if (entrada.movimentoReduzido === true && tier === 'forte') tier = 'medio';
  return tier;
}

/** O maior dos dois tiers de menor custo: usado para obedecer ao teto de um modelo ou de um contexto. */
export function limitarTier(tier: TierDoAvatar, teto: TierDoAvatar): TierDoAvatar {
  return TIERS_DO_AVATAR.indexOf(tier) <= TIERS_DO_AVATAR.indexOf(teto) ? tier : teto;
}
