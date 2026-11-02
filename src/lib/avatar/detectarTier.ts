/**
 * DETECÇÃO DE TIER E DE WEBGL2: coleta os sinais do aparelho e entrega ao `escolherTier` (puro, no core).
 *
 * Sinais LOCAIS apenas: `navigator.deviceMemory`, `hardwareConcurrency`, `connection.saveData` e
 * `prefers-reduced-motion`.
 *
 * PONTO DE EXTENSÃO (desligado de propósito): o `@pmndrs/detect-gpu` mede a GPU com um benchmark cujos dados
 * ele BUSCA numa CDN (terceiro, com IP da pessoa, e o app de menores não faz isso sem decisão do dono). Se um
 * dia for ligado: `const { getGPUTier } = await import('@pmndrs/detect-gpu')`, servindo os dados do benchmark
 * do PRÓPRIO domínio (`benchmarksURL`), e traduzir `tier` 0-3 para `NivelDeGpu` em `gpuDoAparelho`. Hoje
 * `gpuDoAparelho` devolve `'desconhecida'`, e a heurística de núcleos e memória decide.
 */
import { type EntradaDeTier, escolherTier, type NivelDeGpu, type TierDoAvatar } from '../../core/avatar/tiers';

interface NavegadorComSinais {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  connection?: { saveData?: boolean };
}

/** O que o aparelho informa, sem decidir nada. */
export function sinaisDoAparelho(): EntradaDeTier {
  const nav = (typeof navigator === 'undefined' ? {} : navigator) as NavegadorComSinais;
  let movimentoReduzido = false;
  try {
    movimentoReduzido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    /* sem matchMedia */
  }
  return {
    memoriaGb: nav.deviceMemory,
    nucleos: nav.hardwareConcurrency,
    saveData: nav.connection?.saveData === true,
    movimentoReduzido,
    gpu: gpuDoAparelho(),
  };
}

/** Ver o ponto de extensão acima. Sem o benchmark remoto, a GPU é desconhecida. */
export function gpuDoAparelho(): NivelDeGpu {
  return 'desconhecida';
}

export function detectarTier(sobrescrever: Partial<EntradaDeTier> = {}): TierDoAvatar {
  return escolherTier({ ...sinaisDoAparelho(), ...sobrescrever });
}

let webgl2: boolean | null = null;

/** O aparelho cria um contexto WebGL2? Sonda uma vez, num canvas descartável, e devolve o contexto ao sistema. */
export function temWebGL2(): boolean {
  if (webgl2 !== null) return webgl2;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    webgl2 = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

/** Só para os testes. */
export function esquecerSondaDeWebGL2(): void {
  webgl2 = null;
}
