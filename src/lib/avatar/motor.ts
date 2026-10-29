/**
 * A PORTA DO MOTOR: junta carregador + renderer. É o que o componente carrega por `import()`, e por isso é
 * aqui que `three` e `@pixiv/three-vrm` entram no chunk `vendor-avatar` (fora do arranque do app).
 */
import type { CamerasDoModelo, ModoDeCamera } from '../../core/avatar/enquadramento';
import type { EmocaoDoAvatar, EstadoDoAvatar } from '../../core/avatar/estados';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { type AvatarCarregado, carregarAvatar, type FonteDoAvatar } from './carregador';
import { criarMotor, type JanelaDoMotor, type MotivoDeFalha, type MotorDeAvatar } from './renderer';

export interface OpcoesDaSessao {
  canvas: HTMLCanvasElement;
  fonte: FonteDoAvatar;
  tier: TierDoAvatar;
  sinalDeAborto?: AbortSignal;
  movimentoReduzido?: boolean;
  largura: number;
  altura: number;
  estado: EstadoDoAvatar;
  emocao: EmocaoDoAvatar;
  aoFalhar?: (motivo: MotivoDeFalha) => void;
  /** As câmeras calibradas do modelo (catálogo). Sem elas, saem das medidas do arquivo. */
  enquadramento?: CamerasDoModelo | null;
  modo?: ModoDeCamera;
  /** A janela dona do canvas (o Document PiP). Padrão: a página. */
  janela?: JanelaDoMotor;
}

export interface SessaoDeAvatar {
  motor: MotorDeAvatar;
  avatar: AvatarCarregado;
  dispose(): void;
}

export async function abrirSessaoDeAvatar(o: OpcoesDaSessao): Promise<SessaoDeAvatar> {
  const motor = criarMotor({
    canvas: o.canvas,
    tier: o.tier,
    movimentoReduzido: o.movimentoReduzido,
    aoFalhar: o.aoFalhar,
    ...(o.janela ? { janela: o.janela } : {}),
  });
  try {
    const avatar = await carregarAvatar(o.fonte, { tier: o.tier, sinalDeAborto: o.sinalDeAborto });
    motor.redimensionar(o.largura, o.altura);
    motor.definirEstado(o.estado);
    motor.definirEmocao(o.emocao);
    if (o.modo) motor.definirModo(o.modo);
    motor.mostrar(avatar, o.enquadramento ?? null);
    return { motor, avatar, dispose: () => motor.dispose() };
  } catch (e) {
    motor.dispose();
    throw e;
  }
}
