/**
 * O CARREGADOR DE AVATAR (GLB e VRM).
 *
 * `three` e `@pixiv/three-vrm` entram por `import()` DENTRO de `carregarAvatar`: este módulo só os cita como
 * tipo, e quem o importa não paga o chunk do motor antes de pedir um avatar. O arquivo é lido por NÓS (fetch ou
 * Blob), com teto de bytes e conferência do cabeçalho `glTF` ANTES de decodificar qualquer coisa.
 *
 * Quem pede é dono do resultado: chame `dispose()` (o renderer também o faz ao trocar de avatar). O sinal de
 * aborto cancela a leitura e, se o modelo já tinha sido montado, descarta o que montou.
 */
import type { VRM } from '@pixiv/three-vrm';
import type { Object3D } from 'three';

import { ORCAMENTOS, TETO_DO_MODELO_BYTES, type TierDoAvatar } from '../../core/avatar/tiers';

export type CodigoDeErroDeAvatar = 'abortado' | 'rede' | 'formato' | 'acima_do_teto' | 'leitura';

export class ErroDeAvatar extends Error {
  constructor(
    readonly codigo: CodigoDeErroDeAvatar,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroDeAvatar';
  }
}

export type FonteDoAvatar = string | Blob | ArrayBuffer;

export interface AvatarCarregado {
  objeto: Object3D;
  /** Presente quando o arquivo é VRM; `null` num GLB comum. */
  vrm: VRM | null;
  /** O `meta` cru do VRM (0.x ou 1.0), para `avaliarLicenca`. `null` em GLB comum ou VRM sem meta. */
  meta: unknown;
  triangulos: number;
  /** O modelo passa do teto de triângulos do tier. O carregador NÃO recusa: quem usa decide. */
  acimaDoTeto: boolean;
  dispose: () => void;
}

export interface OpcoesDeCarga {
  tier: TierDoAvatar;
  sinalDeAborto?: AbortSignal;
  /** Substitui o `fetch` (testes). */
  buscar?: typeof fetch;
}

const MAGIA_GLB = 0x46546c67; // "glTF" em little-endian

const abortou = () => new ErroDeAvatar('abortado', 'carga cancelada');

async function lerBytes(fonte: FonteDoAvatar, sinal: AbortSignal | undefined, buscar: typeof fetch) {
  if (fonte instanceof ArrayBuffer) {
    if (fonte.byteLength > TETO_DO_MODELO_BYTES) throw new ErroDeAvatar('acima_do_teto', 'arquivo grande demais');
    return fonte;
  }
  if (typeof fonte !== 'string') {
    if (fonte.size > TETO_DO_MODELO_BYTES) throw new ErroDeAvatar('acima_do_teto', 'arquivo grande demais');
    return fonte.arrayBuffer();
  }
  let resposta: Response;
  try {
    resposta = await buscar(fonte, { signal: sinal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    if (sinal?.aborted) throw abortou();
    throw new ErroDeAvatar('rede', e instanceof Error ? e.message : 'falha de rede');
  }
  if (!resposta.ok) throw new ErroDeAvatar('rede', `HTTP ${resposta.status}`);
  const declarado = Number(resposta.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > TETO_DO_MODELO_BYTES) {
    void resposta.body?.cancel();
    throw new ErroDeAvatar('acima_do_teto', 'arquivo grande demais');
  }
  try {
    const bytes = await resposta.arrayBuffer();
    if (bytes.byteLength > TETO_DO_MODELO_BYTES) throw new ErroDeAvatar('acima_do_teto', 'arquivo grande demais');
    return bytes;
  } catch (e) {
    if (e instanceof ErroDeAvatar) throw e;
    if (sinal?.aborted) throw abortou();
    throw new ErroDeAvatar('rede', 'a leitura foi interrompida');
  }
}

export function contarTriangulos(objeto: Object3D): number {
  let total = 0;
  objeto.traverse((o) => {
    const malha = o as Object3D & {
      isMesh?: boolean;
      geometry?: { index: { count: number } | null; attributes: Record<string, { count: number } | undefined> };
    };
    if (!malha.isMesh || !malha.geometry) return;
    const n = malha.geometry.index?.count ?? malha.geometry.attributes.position?.count ?? 0;
    total += Math.floor(n / 3);
  });
  return total;
}

export async function carregarAvatar(fonte: FonteDoAvatar, opcoes: OpcoesDeCarga): Promise<AvatarCarregado> {
  const { tier, sinalDeAborto: sinal } = opcoes;
  if (sinal?.aborted) throw abortou();

  const bytes = await lerBytes(fonte, sinal, opcoes.buscar ?? fetch);
  if (sinal?.aborted) throw abortou();
  if (bytes.byteLength < 12 || new DataView(bytes).getUint32(0, true) !== MAGIA_GLB)
    throw new ErroDeAvatar('formato', 'não é um GLB/VRM');

  const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('@pixiv/three-vrm'),
  ]);
  if (sinal?.aborted) throw abortou();

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise<Awaited<ReturnType<typeof loader.parseAsync>>>((resolve, reject) => {
    loader.parse(bytes, '', resolve, (e) =>
      reject(new ErroDeAvatar('leitura', e instanceof Error ? e.message : 'arquivo inválido')),
    );
  });

  const vrm = (gltf.userData.vrm as VRM | undefined) ?? null;
  const objeto: Object3D = vrm ? vrm.scene : gltf.scene;
  const dispose = () => {
    if (vrm) VRMUtils.deepDispose(vrm.scene);
    else deepDisposeGlb(objeto);
  };
  if (sinal?.aborted) {
    dispose();
    throw abortou();
  }

  if (vrm) {
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    VRMUtils.rotateVRM0(vrm); // VRM 0.x olha para -Z; o 1.0 não precisa, a função só gira o 0.x
  }
  const triangulos = contarTriangulos(objeto);
  return {
    objeto,
    vrm,
    meta: vrm?.meta ?? null,
    triangulos,
    acimaDoTeto: triangulos > ORCAMENTOS[tier].triangulos,
    dispose,
  };
}

/** Libera geometria, material e textura de um GLB comum (o VRM usa `VRMUtils.deepDispose`). */
function deepDisposeGlb(raiz: Object3D): void {
  raiz.traverse((o) => {
    const m = o as Object3D & { geometry?: { dispose(): void }; material?: unknown };
    m.geometry?.dispose();
    const materiais = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of materiais as Array<Record<string, unknown> & { dispose(): void }>) {
      for (const v of Object.values(mat) as Array<{ isTexture?: boolean; dispose?: () => void } | null>) {
        if (v?.isTexture) v.dispose?.();
      }
      mat.dispose();
    }
  });
}
