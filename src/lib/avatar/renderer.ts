/**
 * O MOTOR DE DESENHO DO AVATAR: um renderer WebGL2 próprio (three), um laço de quadros que respeita a aba e o
 * movimento reduzido, e a limpeza completa.
 *
 * Esta é a ÚNICA porta de `three` no app além do carregador, e só é alcançada por `import()` (ver
 * `motor.ts`): o arranque do app não paga o chunk. Padrão do RELATORIO-P4 do protótipo:
 *  · guarda a extensão `WEBGL_lose_context` na criação (depois de perdido, `getExtension` devolve `null`);
 *  · `webglcontextlost` com `preventDefault` pausa o laço; `webglcontextrestored` retoma (o `three` refaz sozinho
 *    os recursos da GPU). Sem restauração em `prazoDeRestauracaoMs`, avisa `aoFalhar('contexto_perdido')` e a UI
 *    cai no 2D;
 *  · `dispose` desfaz TUDO: laço, listeners, geometrias, materiais, texturas, renderer e o contexto.
 *
 * Movimento reduzido: sem suavização e sem laço contínuo — desenha só quando algo muda (estado, emoção,
 * tamanho, restauração do contexto).
 */
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';

import {
  ehEmocaoDoAvatar,
  ehEstadoDoAvatar,
  type EmocaoDoAvatar,
  type EstadoDoAvatar,
} from '../../core/avatar/estados';
import { ORCAMENTOS, type TierDoAvatar } from '../../core/avatar/tiers';
import type { AvatarCarregado } from './carregador';

export type MotivoDeFalha = 'webgl' | 'contexto_perdido';

export interface OpcoesDoMotor {
  canvas: HTMLCanvasElement;
  tier: TierDoAvatar;
  movimentoReduzido?: boolean;
  aoFalhar?: (motivo: MotivoDeFalha) => void;
  prazoDeRestauracaoMs?: number;
}

export interface MotorDeAvatar {
  mostrar(avatar: AvatarCarregado): void;
  definirEstado(estado: EstadoDoAvatar): void;
  definirEmocao(emocao: EmocaoDoAvatar): void;
  redimensionar(largura: number, altura: number): void;
  /** Desenha um quadro agora e conta os pixels do canvas (total e não transparentes). Para teste e diagnóstico. */
  amostrarPixels(): { total: number; naoVazios: number };
  estatisticas(): { quadros: number; perdasDeContexto: number; pausado: boolean; perdido: boolean };
  /** Para teste e diagnóstico: força a perda e a restauração do contexto (`WEBGL_lose_context`). */
  simularPerdaDeContexto(): void;
  simularRestauracaoDeContexto(): void;
  dispose(): void;
}

/** Emoção do Frasy para o nome da expressão do VRM. */
const EXPRESSAO: Record<EmocaoDoAvatar, string> = {
  neutro: 'neutral',
  feliz: 'happy',
  triste: 'sad',
  bravo: 'angry',
  surpreso: 'surprised',
  relaxado: 'relaxed',
};

/** Inclinação da cabeça (rad) por estado: pose simples, sem animação de clipe. */
const CABECA: Record<EstadoDoAvatar, { x: number; z: number }> = {
  parado: { x: 0, z: 0 },
  ouvindo: { x: 0.04, z: 0.1 },
  pensando: { x: -0.1, z: -0.12 },
  falando: { x: 0, z: 0 },
};

export function criarMotor(opcoes: OpcoesDoMotor): MotorDeAvatar {
  const { canvas, tier } = opcoes;
  const orc = ORCAMENTOS[tier];
  const reduzido = opcoes.movimentoReduzido === true;
  const prazo = opcoes.prazoDeRestauracaoMs ?? 3000;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: tier !== 'fraco',
      powerPreference: tier === 'fraco' ? 'low-power' : 'default',
    });
  } catch {
    opcoes.aoFalhar?.('webgl');
    throw new Error('webgl indisponível');
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, orc.pixelRatioMax));

  const gl = renderer.getContext();
  const perdaDeContexto = gl.getExtension('WEBGL_lose_context');

  const cena = new Scene();
  cena.add(new AmbientLight(0xffffff, 1.2));
  const sol = new DirectionalLight(0xffffff, 1.6);
  sol.position.set(0.8, 1.2, 2);
  cena.add(sol);
  const camera = new PerspectiveCamera(24, 1, 0.05, 50);

  let atual: AvatarCarregado | null = null;
  let estado: EstadoDoAvatar = 'parado';
  const pesoDaEmocao = new Map<string, number>();
  let emocaoAlvo: EmocaoDoAvatar = 'neutro';
  const cabeca = { x: 0, z: 0 };

  let disposed = false;
  let perdido = false;
  let quadros = 0;
  let perdas = 0;
  let raf = 0;
  let ultimo = 0;
  let sujo = true;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  const enquadrar = () => {
    if (!atual) return;
    atual.objeto.updateMatrixWorld(true);
    const caixa = new Box3().setFromObject(atual.objeto);
    const tamanho = caixa.getSize(new Vector3());
    const centro = caixa.getCenter(new Vector3());
    // Busto: olha para o terço de cima do corpo e enquadra ~45% da altura.
    const alvoY = caixa.min.y + tamanho.y * 0.82;
    const altura = Math.max(tamanho.y * 0.42, 0.01);
    const dist = altura / 2 / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect) + tamanho.z / 2;
    camera.position.set(centro.x, alvoY, centro.z + dist);
    camera.lookAt(centro.x, alvoY, centro.z);
    camera.updateProjectionMatrix();
  };

  const aplicarPose = (dt: number) => {
    const vrm = atual?.vrm;
    if (!vrm) return;
    const k = reduzido ? 1 : 1 - Math.exp(-dt * 8);
    const alvo = CABECA[estado];
    cabeca.x += (alvo.x - cabeca.x) * k;
    cabeca.z += (alvo.z - cabeca.z) * k;
    const osso = vrm.humanoid?.getNormalizedBoneNode('head');
    if (osso) {
      osso.rotation.x = cabeca.x;
      osso.rotation.z = cabeca.z;
    }
    const gerente = vrm.expressionManager;
    if (gerente) {
      for (const emocao of Object.values(EXPRESSAO)) {
        const alvoPeso = emocao === EXPRESSAO[emocaoAlvo] && emocao !== 'neutral' ? 1 : 0;
        const w = pesoDaEmocao.get(emocao) ?? 0;
        const novo = w + (alvoPeso - w) * k;
        pesoDaEmocao.set(emocao, novo);
        if (emocao !== 'neutral') gerente.setValue(emocao, novo);
      }
    }
    if (orc.molas) vrm.update(dt);
    else {
      vrm.humanoid?.update();
      vrm.expressionManager?.update();
      vrm.nodeConstraintManager?.update();
    }
  };

  const desenhar = (dt: number) => {
    aplicarPose(dt);
    renderer.render(cena, camera);
    quadros += 1;
  };

  const quadro = (agora: number) => {
    raf = requestAnimationFrame(quadro);
    const passo = 1000 / orc.fps;
    if (ultimo && agora - ultimo < passo - 2) return;
    const dt = ultimo ? Math.min((agora - ultimo) / 1000, 0.1) : 1 / orc.fps;
    ultimo = agora;
    if (reduzido && !sujo) return;
    sujo = false;
    desenhar(dt);
  };

  const parar = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    ultimo = 0;
  };
  const retomar = () => {
    if (disposed || perdido || raf || document.hidden) return;
    sujo = true;
    raf = requestAnimationFrame(quadro);
  };

  const aoMudarVisibilidade = () => (document.hidden ? parar() : retomar());
  const aoPerder = (e: Event) => {
    e.preventDefault();
    perdido = true;
    perdas += 1;
    parar();
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (perdido && !disposed) opcoes.aoFalhar?.('contexto_perdido');
    }, prazo);
  };
  const aoRestaurar = () => {
    clearTimeout(temporizador);
    perdido = false;
    sujo = true;
    retomar();
  };
  canvas.addEventListener('webglcontextlost', aoPerder);
  canvas.addEventListener('webglcontextrestored', aoRestaurar);
  document.addEventListener('visibilitychange', aoMudarVisibilidade);

  const motor: MotorDeAvatar = {
    mostrar(avatar) {
      if (disposed) {
        avatar.dispose();
        return;
      }
      if (atual) {
        cena.remove(atual.objeto);
        atual.dispose();
      }
      atual = avatar;
      pesoDaEmocao.clear();
      cena.add(avatar.objeto);
      enquadrar();
      sujo = true;
      retomar();
    },
    definirEstado(e) {
      if (!ehEstadoDoAvatar(e)) return;
      estado = e;
      sujo = true;
    },
    definirEmocao(e) {
      if (!ehEmocaoDoAvatar(e)) return;
      emocaoAlvo = e;
      sujo = true;
    },
    redimensionar(largura, altura) {
      const l = Math.max(1, Math.floor(largura));
      const a = Math.max(1, Math.floor(altura));
      renderer.setSize(l, a, false);
      camera.aspect = l / a;
      enquadrar();
      sujo = true;
    },
    amostrarPixels() {
      if (disposed || perdido) return { total: 0, naoVazios: 0 };
      desenhar(1 / orc.fps);
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let naoVazios = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 0) naoVazios += 1;
      return { total: w * h, naoVazios };
    },
    estatisticas: () => ({ quadros, perdasDeContexto: perdas, pausado: raf === 0, perdido }),
    simularPerdaDeContexto: () => perdaDeContexto?.loseContext(),
    simularRestauracaoDeContexto: () => perdaDeContexto?.restoreContext(),
    dispose() {
      if (disposed) return;
      disposed = true;
      parar();
      clearTimeout(temporizador);
      canvas.removeEventListener('webglcontextlost', aoPerder);
      canvas.removeEventListener('webglcontextrestored', aoRestaurar);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      if (atual) {
        cena.remove(atual.objeto);
        atual.dispose();
        atual = null;
      }
      cena.clear();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  return motor;
}
