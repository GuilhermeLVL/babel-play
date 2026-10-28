/**
 * O ENQUADRAMENTO DA CÂMERA DO AVATAR, em decisões puras (sem `three`, sem DOM).
 *
 * Cada modelo da coleção traz duas câmeras calibradas por ele: `corpo` (o corpo inteiro, T-pose com os braços
 * abertos, sem corte) e `rosto` (o busto, para a miniatura). A câmera olha sempre em linha reta para `-Z`, de
 * `alvo + (0, 0, distancia)`, sem inclinação: é o que o motor faz e o que este módulo projeta.
 *
 * As medidas (`caixa`, `caixaDoRosto`) são do modelo em posição neutra, escala 1, em metros, já com a rotação do
 * VRM 0.x aplicada, lidas do próprio arquivo (`motor.medirModelo()`); a câmera sai delas por `enquadrarCaixa` e
 * o teste `tests/avatar-enquadramento.test.ts` garante que a caixa cabe no quadro, com margem.
 */

export type Vec3 = readonly [number, number, number];
export interface CaixaDoModelo {
  min: Vec3;
  max: Vec3;
}
export interface CameraDoModelo {
  alvo: Vec3;
  distancia: number;
  /** Campo de visão vertical em graus. Ausente: `FOV_PADRAO`. */
  fov?: number;
}
export type ModoDeCamera = 'corpo' | 'rosto';
export interface CamerasDoModelo {
  corpo: CameraDoModelo;
  rosto: CameraDoModelo;
}
/** O que se mede do modelo para calibrar (e para o teste conferir). */
export interface MedidasDoModelo {
  /** Caixa do corpo inteiro (braços abertos). */
  caixa: CaixaDoModelo;
  /** Caixa da região do rosto (cabeça e o que a cerca). */
  caixaDoRosto: CaixaDoModelo;
}

export const FOV_PADRAO = 24;
/** Fração livre em cada lado do quadro (o corpo nunca encosta na borda). */
export const MARGEM_DO_QUADRO = 0.04;
/** Distância mínima à frente da câmera para um canto contar como visível (m). */
const PROFUNDIDADE_MINIMA = 0.05;

const cantos = (c: CaixaDoModelo): Vec3[] => {
  const r: Vec3[] = [];
  for (const x of [c.min[0], c.max[0]])
    for (const y of [c.min[1], c.max[1]]) for (const z of [c.min[2], c.max[2]]) r.push([x, y, z]);
  return r;
};

export const fovDe = (c: CameraDoModelo): number => c.fov ?? FOV_PADRAO;

/** A caixa projetada no quadro (-1..1 em x e y). `null` se algum canto fica atrás da câmera. */
export function projetarCaixa(
  caixa: CaixaDoModelo,
  camera: CameraDoModelo,
  aspecto = 1,
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  const t = Math.tan((fovDe(camera) * Math.PI) / 360);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y, z] of cantos(caixa)) {
    const profundidade = camera.distancia - (z - camera.alvo[2]);
    if (profundidade < PROFUNDIDADE_MINIMA) return null;
    const nx = (x - camera.alvo[0]) / (profundidade * t * aspecto);
    const ny = (y - camera.alvo[1]) / (profundidade * t);
    minX = Math.min(minX, nx);
    maxX = Math.max(maxX, nx);
    minY = Math.min(minY, ny);
    maxY = Math.max(maxY, ny);
  }
  return { minX, maxX, minY, maxY };
}

/** A caixa cabe no quadro, com `margem` livre em cada lado? */
export function caixaCabeNoQuadro(
  caixa: CaixaDoModelo,
  camera: CameraDoModelo,
  aspecto = 1,
  margem = MARGEM_DO_QUADRO,
): boolean {
  const p = projetarCaixa(caixa, camera, aspecto);
  if (!p) return false;
  const lim = 1 - margem;
  return p.minX >= -lim && p.maxX <= lim && p.minY >= -lim && p.maxY <= lim;
}

/** Quanto do quadro (0..1, a maior dimensão) a caixa ocupa. Serve para dizer "pequena demais". */
export function ocupacaoDoQuadro(caixa: CaixaDoModelo, camera: CameraDoModelo, aspecto = 1): number {
  const p = projetarCaixa(caixa, camera, aspecto);
  if (!p) return 0;
  return Math.max(p.maxX - p.minX, p.maxY - p.minY) / 2;
}

const arredondar = (v: number) => Math.round(v * 1000) / 1000;

/**
 * A câmera que enquadra uma caixa: alvo no centro (em x e y) e a menor distância em que todos os cantos cabem
 * com a margem. Usada para calibrar o catálogo e como plano B de um modelo trazido pela pessoa.
 */
export function enquadrarCaixa(
  caixa: CaixaDoModelo,
  opcoes: { aspecto?: number; fov?: number; margem?: number } = {},
): CameraDoModelo {
  const aspecto = opcoes.aspecto ?? 1;
  const fov = opcoes.fov ?? FOV_PADRAO;
  const lim = 1 - (opcoes.margem ?? MARGEM_DO_QUADRO);
  const t = Math.tan((fov * Math.PI) / 360);
  const alvo: Vec3 = [
    (caixa.min[0] + caixa.max[0]) / 2,
    (caixa.min[1] + caixa.max[1]) / 2,
    (caixa.min[2] + caixa.max[2]) / 2,
  ];
  let distancia = 0.1;
  for (const [x, y, z] of cantos(caixa)) {
    const dz = z - alvo[2];
    distancia = Math.max(
      distancia,
      dz + Math.abs(x - alvo[0]) / (lim * t * aspecto),
      dz + Math.abs(y - alvo[1]) / (lim * t),
    );
  }
  return {
    alvo: [arredondar(alvo[0]), arredondar(alvo[1]), arredondar(alvo[2])],
    // 0,5% de folga: o arredondamento do alvo e da distância (3 casas) não pode empurrar um canto para fora da margem.
    distancia: arredondar(distancia * 1.005),
    ...(fov !== FOV_PADRAO ? { fov } : {}),
  };
}

/** A caixa do rosto a partir da altura da cabeça medida no modelo: da base da cabeça (com folga) ao topo. */
export function caixaDoRostoPorCabeca(caixa: CaixaDoModelo, alturaDaCabeca: number): CaixaDoModelo {
  const topo = caixa.max[1];
  const base = Math.max(caixa.min[1], alturaDaCabeca - (topo - alturaDaCabeca) * 0.35);
  const meia = Math.max((topo - base) * 0.62, 0.02);
  const cx = (caixa.min[0] + caixa.max[0]) / 2;
  return { min: [cx - meia, base, caixa.min[2]], max: [cx + meia, topo, caixa.max[2]] };
}

/** As câmeras de um modelo SEM calibração própria (trazido pela pessoa): saem das medidas na hora. */
export function camerasAutomaticas(medidas: MedidasDoModelo, aspecto = 1): CamerasDoModelo {
  return {
    corpo: enquadrarCaixa(medidas.caixa, { aspecto }),
    rosto: enquadrarCaixa(medidas.caixaDoRosto, { aspecto }),
  };
}

/** O modelo passa no teste de enquadramento: corpo inteiro cabe, rosto cabe, e nenhum fica minúsculo. */
export function passaNoEnquadramento(
  medidas: MedidasDoModelo,
  cameras: CamerasDoModelo,
  aspecto = 1,
): { passa: boolean; motivo?: string } {
  if (!caixaCabeNoQuadro(medidas.caixa, cameras.corpo, aspecto)) return { passa: false, motivo: 'corpo cortado' };
  if (ocupacaoDoQuadro(medidas.caixa, cameras.corpo, aspecto) < 0.6)
    return { passa: false, motivo: 'corpo pequeno demais' };
  if (!caixaCabeNoQuadro(medidas.caixaDoRosto, cameras.rosto, aspecto))
    return { passa: false, motivo: 'rosto cortado' };
  if (ocupacaoDoQuadro(medidas.caixaDoRosto, cameras.rosto, aspecto) < 0.6)
    return { passa: false, motivo: 'rosto pequeno demais' };
  return { passa: true };
}
