/**
 * A PORTA DO MOTOR: junta carregador + renderer. É o que o componente carrega por `import()`, e por isso é
 * aqui que `three` e `@pixiv/three-vrm` entram no chunk `vendor-avatar` (fora do arranque do app).
 */
import type { EmocaoDoAvatar, EstadoDoAvatar } from '../../core/avatar/estados';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { type AvatarCarregado, carregarAvatar, type FonteDoAvatar } from './carregador';
import { criarMotor, type MotivoDeFalha, type MotorDeAvatar } from './renderer';

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
  });
  try {
    const avatar = await carregarAvatar(o.fonte, { tier: o.tier, sinalDeAborto: o.sinalDeAborto });
    motor.redimensionar(o.largura, o.altura);
    motor.definirEstado(o.estado);
    motor.definirEmocao(o.emocao);
    motor.mostrar(avatar);
    return { motor, avatar, dispose: () => motor.dispose() };
  } catch (e) {
    motor.dispose();
    throw e;
  }
}
